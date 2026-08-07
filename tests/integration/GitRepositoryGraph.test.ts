import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import { TestRepo } from '../fixtures/testRepo';

/**
 * История для графа:
 *
 *   root ──── main (коммит на main)  ─┐
 *        └─── feature (коммит на feature) ─┴─ merge (main)
 *        └─── old-feature (старый коммит, отдельная ветка)
 *
 * Датам на main/feature/old-feature заданы явно (GIT_COMMITTER_DATE) — сортировка
 * веток по свежести иначе зависела бы от реального времени прогона теста.
 * У merge-коммита дата не задаётся: он обязан быть «свежее» всех остальных, чтобы
 * доказать, что сортировка действительно смотрит на дату коммита, а не на порядок веток.
 */
describe('GitRepository — граф', () => {
  let repo: TestRepo;
  let git: GitRepository;
  let rootSha: string;
  let mainSha: string;
  let featureSha: string;
  let mergeSha: string;

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write('base.txt', 'основа\n');
    rootSha = repo.commit('корневой коммит', '2024-01-01T10:00:00+03:00');

    repo.branch('old-feature');
    repo.checkout('old-feature');
    repo.write('old.txt', 'старая ветка\n');
    repo.commit('коммит в старой ветке', '2024-01-02T10:00:00+03:00');

    repo.checkout('main');
    repo.branch('feature');
    repo.write('main.txt', 'на main\n');
    mainSha = repo.commit('коммит на main', '2024-01-03T10:00:00+03:00');

    repo.checkout('feature');
    repo.write('feature.txt', 'на feature\n');
    featureSha = repo.commit('коммит на feature', '2024-01-05T10:00:00+03:00');

    repo.checkout('main');
    mergeSha = repo.merge('feature', 'мердж feature в main');

    repo.write('base.txt', 'основа, изменено\n');
    repo.stash('незакоммиченные правки');

    git = await GitRepository.open(repo.root, new GitExecutor());
  });

  afterAll(() => repo.dispose());

  describe('listGraphCommits', () => {
    it('отдаёт родителей merge-коммита в порядке main → feature', async () => {
      const commits = await git.listGraphCommits({ refs: ['main'] });
      const merge = commits.find((commit) => commit.sha === mergeSha);

      expect(merge?.parents).toEqual([mainSha, featureSha]);
    });

    it('у корневого коммита родителей нет', async () => {
      const commits = await git.listGraphCommits({ refs: ['main'] });
      const root = commits.find((commit) => commit.sha === rootSha);

      expect(root?.parents).toEqual([]);
    });

    it('ограничивает историю через limit', async () => {
      const commits = await git.listGraphCommits({ refs: ['main'], limit: 1 });

      expect(commits).toHaveLength(1);
    });

    it('без refs ходит от HEAD, как обычный git log', async () => {
      const commits = await git.listGraphCommits({});

      expect(commits.map((commit) => commit.sha)).toContain(mergeSha);
    });
  });

  describe('listBranchesByRecency', () => {
    it('сортирует ветки по дате последнего коммита, сначала свежие', async () => {
      const branches = await git.listBranchesByRecency(10);

      // main = mergeSha, коммит без явной даты — заведомо свежее 2024-х дат остальных веток.
      expect(branches.map((ref) => ref.name)).toEqual(['main', 'feature', 'old-feature']);
    });

    it('ограничивает количество веток', async () => {
      const branches = await git.listBranchesByRecency(1);

      expect(branches).toHaveLength(1);
      expect(branches[0]?.name).toBe('main');
    });
  });

  describe('listStashes', () => {
    it('отдаёт стеш с базовым коммитом первым родителем', async () => {
      const stashes = await git.listStashes();

      expect(stashes).toHaveLength(1);
      expect(stashes[0]?.index).toBe(0);
      expect(stashes[0]?.ref).toBe('stash@{0}');
      expect(stashes[0]?.parents[0]).toBe(mergeSha);
      expect(stashes[0]?.message).toContain('незакоммиченные правки');
    });

    it('в репозитории без стешей отдаёт пустой список', async () => {
      const clean = TestRepo.create();
      clean.write('a.txt', 'файл\n');
      clean.commit('коммит');
      const cleanGit = await GitRepository.open(clean.root, new GitExecutor());

      await expect(cleanGit.listStashes()).resolves.toEqual([]);
      clean.dispose();
    });
  });
});
