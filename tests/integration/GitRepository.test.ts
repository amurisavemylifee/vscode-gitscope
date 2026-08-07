import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import { RevisionNotFoundError } from '@core/git/errors';
import { TestRepo } from '../fixtures/testRepo';

/**
 * История, на которой проверяется весь git-слой:
 *
 *   c1 ──── c2 (main)      только на main: only-on-main.txt
 *    └───── c3 (feature)   изменения ветки
 *
 * Такая форма нужна, чтобы доказать двухточечную семантику: сравнение c2 и c3
 * обязано показать удаление only-on-main.txt, потому что в состоянии c3 этого
 * файла нет. Трёхточечное сравнение его бы спрятало.
 */
describe('GitRepository', () => {
  let repo: TestRepo;
  let git: GitRepository;
  let mainSha: string;
  let featureSha: string;
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]);
  const unicodePath = 'docs/мой файл.md';

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write('src/a.txt', 'первая\nвторая\nтретья\n');
    repo.write('src/b.txt', 'один\nдва\nтри\nчетыре\nпять\n');
    repo.write(unicodePath, '# Заголовок\n');
    repo.writeBinary('assets/logo.png', binary);
    repo.commit('первый коммит');
    repo.tag('v1.0.0');
    repo.branch('feature');

    repo.write('only-on-main.txt', 'этот файл есть только на main\n');
    mainSha = repo.commit('коммит только на main');

    repo.checkout('feature');
    repo.write('src/a.txt', 'первая\nизменённая\nтретья\n');
    repo.git('mv', 'src/b.txt', 'src/renamed.txt');
    repo.write('src/new.txt', 'совсем новый файл\n');
    repo.remove(unicodePath);
    featureSha = repo.commit('коммит в ветке');

    git = await GitRepository.open(repo.root, new GitExecutor());
  });

  afterAll(() => repo.dispose());

  it('находит корень репозитория', () => {
    // На macOS путь во временной папке — симлинк, поэтому сверяем по basename.
    expect(git.root.endsWith(repo.root.split('/').pop() ?? '')).toBe(true);
  });

  describe('resolveCommit', () => {
    it('разрешает имя ветки', async () => {
      await expect(git.resolveCommit('feature')).resolves.toMatchObject({ sha: featureSha });
    });

    it('разрешает тег', async () => {
      await expect(git.resolveCommit('v1.0.0')).resolves.toMatchObject({ subject: 'первый коммит' });
    });

    it('разрешает сырой SHA и относительную ссылку', async () => {
      await expect(git.resolveCommit(mainSha)).resolves.toMatchObject({ sha: mainSha });
      await expect(git.resolveCommit('main~1')).resolves.toMatchObject({ subject: 'первый коммит' });
    });

    it('отдаёт понятную ошибку на несуществующей ревизии', async () => {
      await expect(git.resolveCommit('такой-ветки-нет')).rejects.toBeInstanceOf(RevisionNotFoundError);
    });
  });

  describe('diffNameStatus', () => {
    it('показывает разницу состояний, а не изменения ветки', async () => {
      const entries = await git.diffNameStatus(mainSha, featureSha);
      const byPath = new Map(entries.map((entry) => [entry.path, entry]));

      // Ключевая проверка семантики: файл, появившийся в base после ветвления,
      // отсутствует в compare — значит, это удаление.
      expect(byPath.get('only-on-main.txt')?.status).toBe('deleted');
      expect(byPath.get('src/a.txt')?.status).toBe('modified');
      expect(byPath.get('src/new.txt')?.status).toBe('added');
      expect(byPath.get(unicodePath)?.status).toBe('deleted');
    });

    it('видит переименование как переименование', async () => {
      const entries = await git.diffNameStatus(mainSha, featureSha);
      const renamed = entries.find((entry) => entry.status === 'renamed');

      expect(renamed).toMatchObject({ path: 'src/renamed.txt', previousPath: 'src/b.txt' });
      expect(renamed?.similarity).toBeGreaterThan(50);
    });

    it('переживает путь с пробелом и кириллицей', async () => {
      const entries = await git.diffNameStatus(mainSha, featureSha);

      expect(entries.map((entry) => entry.path)).toContain(unicodePath);
    });

    it('на одинаковых ревизиях отдаёт пустой список', async () => {
      await expect(git.diffNameStatus(mainSha, mainSha)).resolves.toEqual([]);
    });
  });

  describe('diffNumstat', () => {
    it('считает строки и помечает бинарные файлы', async () => {
      const entries = await git.diffNumstat(mainSha, featureSha);
      const a = entries.find((entry) => entry.path === 'src/a.txt');

      expect(a).toMatchObject({ insertions: 1, deletions: 1, binary: false });

      // Бинарник между этими ревизиями не менялся, поэтому проверяем на
      // отдельной паре ревизий.
      repo.checkout('feature');
      repo.writeBinary('assets/logo.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      const withBinary = repo.commit('заменил бинарник');
      const binaryEntry = (await git.diffNumstat(featureSha, withBinary)).find(
        (entry) => entry.path === 'assets/logo.png',
      );

      expect(binaryEntry).toMatchObject({ binary: true, insertions: 0, deletions: 0 });
    });
  });

  describe('diffPatch', () => {
    it('отдаёт хунки с корректной нумерацией строк', async () => {
      const { files, truncated } = await git.diffPatch(mainSha, featureSha, ['src/a.txt']);
      const hunk = files[0]?.hunks[0];

      expect(truncated).toBe(false);
      expect(files[0]?.path).toBe('src/a.txt');
      expect(hunk?.lines).toContainEqual({ kind: 'delete', text: 'вторая', baseLine: 2 });
      expect(hunk?.lines).toContainEqual({ kind: 'insert', text: 'изменённая', compareLine: 2 });
    });

    it('распознаёт переименование, когда переданы оба пути', async () => {
      const { files } = await git.diffPatch(mainSha, featureSha, ['src/renamed.txt', 'src/b.txt']);

      expect(files[0]).toMatchObject({ status: 'renamed', path: 'src/renamed.txt', previousPath: 'src/b.txt' });
    });

    it('помечает вывод как обрезанный при превышении лимита', async () => {
      repo.checkout('feature');
      repo.write('big.txt', Array.from({ length: 5000 }, (_, index) => `строка ${index}`).join('\n'));
      const bigSha = repo.commit('большой файл');

      const { truncated } = await git.diffPatch(featureSha, bigSha, ['big.txt'], { maxBytes: 1024 });

      expect(truncated).toBe(true);
    });

    it('уважает запрошенное количество строк контекста', async () => {
      const narrow = await git.diffPatch(mainSha, featureSha, ['src/a.txt'], { contextLines: 0 });
      const wide = await git.diffPatch(mainSha, featureSha, ['src/a.txt'], { contextLines: 3 });

      const count = (result: typeof narrow) =>
        result.files[0]?.hunks[0]?.lines.filter((line) => line.kind === 'context').length ?? 0;

      expect(count(narrow)).toBe(0);
      expect(count(wide)).toBeGreaterThan(0);
    });
  });

  describe('чтение содержимого', () => {
    it('отдаёт строки файла на ревизии без лишней пустой строки в конце', async () => {
      await expect(git.showFileLines(mainSha, 'src/a.txt')).resolves.toEqual(['первая', 'вторая', 'третья']);
    });

    it('читает файл с кириллицей в имени', async () => {
      await expect(git.showFileLines(mainSha, unicodePath)).resolves.toEqual(['# Заголовок']);
    });

    it('отдаёт размер файла и undefined для отсутствующего', async () => {
      await expect(git.fileSize(mainSha, 'assets/logo.png')).resolves.toBe(binary.length);
      await expect(git.fileSize(mainSha, 'src/new.txt')).resolves.toBeUndefined();
    });
  });

  describe('ссылки и история', () => {
    it('перечисляет ветки и теги', async () => {
      const refs = await git.listRefs();

      expect(refs.filter((ref) => ref.kind === 'head').map((ref) => ref.name).sort()).toEqual(['feature', 'main']);
      expect(refs.find((ref) => ref.kind === 'tag')?.name).toBe('v1.0.0');
    });

    it('отдаёт историю коммитов', async () => {
      const commits = await git.listCommits({ limit: 10 });

      expect(commits.length).toBeGreaterThanOrEqual(3);
      expect(commits.map((commit) => commit.subject)).toContain('первый коммит');
    });

    it('фильтрует историю по подстроке', async () => {
      const commits = await git.listCommits({ query: 'только на main' });

      expect(commits.map((commit) => commit.subject)).toEqual(['коммит только на main']);
    });

    it('в репозитории без remote говорит, что remote нет', async () => {
      await expect(git.hasRemote()).resolves.toBe(false);
      await expect(git.lastFetchAt()).resolves.toBeUndefined();
    });
  });
});
