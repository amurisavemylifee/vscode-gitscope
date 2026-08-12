import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import { TestRepo } from '../fixtures/testRepo';

/**
 * История одного файла на настоящем git:
 *
 *   c1  создан docs/старое имя.md   ← имя с пробелом и кириллицей
 *   c2  правка
 *   c3  переименован в docs/note.md
 *   c4  правка после переименования (тег v2)
 *
 * Проверять разбор `git log --follow --raw --numstat -z` на подделанном выводе
 * бессмысленно: ошибки этого слоя — ровно про то, как git на самом деле
 * форматирует вывод, и мок повторил бы их слово в слово.
 */
describe('GitRepository: история файла', () => {
  let repo: TestRepo;
  let git: GitRepository;
  const oldPath = 'docs/старое имя.md';
  const path = 'docs/note.md';
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]);

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write(oldPath, 'первая\nвторая\n');
    repo.writeBinary('assets/logo.png', binary);
    repo.commit('создание заметки');

    repo.write(oldPath, 'первая\nизменённая\nтретья\n');
    repo.commit('правка заметки');

    repo.git('mv', oldPath, path);
    repo.commit('переименование заметки');

    repo.write(path, 'первая\nизменённая\nтретья\nчетвёртая\n');
    repo.commit('дописали строку');
    repo.tag('v2');

    git = await GitRepository.open(repo.root, new GitExecutor());
  });

  afterAll(() => repo.dispose());

  describe('listFileHistory', () => {
    it('отдаёт коммиты этого пути, от свежих к старым', async () => {
      const commits = await git.listFileHistory(path);

      // Под коммитом переименования файла с таким именем ещё не было: пройти
      // туда — задача слоя выше, здесь история честно кончается.
      expect(commits.map((commit) => commit.subject)).toEqual(['дописали строку', 'переименование заметки']);
    });

    it('переименование выглядит добавлением: пару имён видно только в коммите целиком', async () => {
      const commits = await git.listFileHistory(path);
      const renamed = commits[1];

      expect(renamed?.change).toMatchObject({ status: 'added', path });
      expect(renamed?.change?.previousPath).toBeUndefined();

      // А вот если посмотреть тот же коммит без фильтра по пути, пара находится.
      const changes = await git.changesIn(renamed?.sha ?? '');
      expect(changes).toContainEqual(expect.objectContaining({ status: 'renamed', path, previousPath: oldPath }));
    });

    it('под прежним именем видна история до переименования', async () => {
      const commits = await git.listFileHistory(oldPath);

      expect(commits.map((commit) => commit.subject)).toEqual([
        'переименование заметки',
        'правка заметки',
        'создание заметки',
      ]);
      expect(commits[0]?.change?.status).toBe('deleted');
      expect(commits[2]?.change?.status).toBe('added');
    });

    it('считает добавленные и удалённые строки по каждому коммиту', async () => {
      const commits = await git.listFileHistory(path);
      const older = await git.listFileHistory(oldPath);

      expect(commits[0]?.change).toMatchObject({ insertions: 1, deletions: 0, binary: false });
      expect(older[1]?.change).toMatchObject({ insertions: 2, deletions: 1 });
    });

    it('отмечает слияния: git не печатает для них diff', async () => {
      const commits = await git.listFileHistory(path);

      expect(commits.every((commit) => commit.merge === false)).toBe(true);
    });

    it('показывает ссылки, указывающие на коммит', async () => {
      const commits = await git.listFileHistory(path);

      expect(commits[0]?.refs).toEqual(
        expect.arrayContaining([
          { kind: 'head', name: 'main' },
          { kind: 'tag', name: 'v2' },
        ]),
      );
      expect(commits[1]?.refs).toEqual([]);
    });

    it('листается сдвигом ревизии к родителю последнего коммита', async () => {
      const [first] = await git.listFileHistory(path, { limit: 1 });
      const parent = await git.firstParent(first?.sha ?? '');
      const [second] = await git.listFileHistory(path, { limit: 1, revision: parent ?? 'HEAD' });

      expect(first?.subject).toBe('дописали строку');
      expect(second?.subject).toBe('переименование заметки');
    });

    it('у файла вне истории список пуст', async () => {
      await expect(git.listFileHistory('нет-такого.txt')).resolves.toEqual([]);
    });

    it('видит двоичный файл и не пытается считать в нём строки', async () => {
      const [commit] = await git.listFileHistory('assets/logo.png');

      expect(commit?.change).toMatchObject({ binary: true, insertions: 0, deletions: 0 });
    });
  });

  describe('поиск переименований', () => {
    it('changesIn показывает, что коммит сделал с деревом целиком', async () => {
      const [renamed] = await git.listFileHistory(path, { limit: 2 });
      const changes = await git.changesIn((await git.firstParent(renamed?.sha ?? '')) ?? '');

      expect(changes).toContainEqual(expect.objectContaining({ status: 'renamed', path, previousPath: oldPath }));
    });

    it('changesIn у первого коммита сравнивает его с пустотой', async () => {
      const root = await git.resolveCommit('HEAD~3');

      const changes = await git.changesIn(root.sha);

      expect(changes).toContainEqual(expect.objectContaining({ status: 'added', path: oldPath }));
    });

    it('lastCommitRemoving находит коммит, где путь исчез', async () => {
      const removed = await git.lastCommitRemoving('HEAD', oldPath);
      const renamedAt = (await git.listFileHistory(path, { limit: 2 }))[1];

      expect(removed).toBe(renamedAt?.sha);
    });

    it('lastCommitRemoving молчит про путь, который никуда не девался', async () => {
      await expect(git.lastCommitRemoving('HEAD', path)).resolves.toBeUndefined();
    });

    it('hasPath отвечает, существует ли файл на ревизии', async () => {
      await expect(git.hasPath('HEAD', path)).resolves.toBe(true);
      await expect(git.hasPath('HEAD', oldPath)).resolves.toBe(false);
      await expect(git.hasPath('HEAD~2', oldPath)).resolves.toBe(true);
    });
  });

  describe('readFile', () => {
    it('читает содержимое на ревизии', async () => {
      const content = await git.readFile('HEAD', path);

      expect(content.text).toBe('первая\nизменённая\nтретья\nчетвёртая\n');
      expect(content).toMatchObject({ binary: false, truncated: false });
    });

    it('на прежней ревизии файл лежит под прежним именем', async () => {
      const content = await git.readFile('HEAD~2', oldPath);

      expect(content.text).toBe('первая\nизменённая\nтретья\n');
    });

    it('распознаёт двоичный файл и не отдаёт его текстом', async () => {
      const content = await git.readFile('HEAD', 'assets/logo.png');

      expect(content).toMatchObject({ binary: true, text: '', bytes: binary.length });
    });

    it('обрезает слишком большой файл и честно об этом говорит', async () => {
      const content = await git.readFile('HEAD', path, { maxBytes: 8 });

      expect(content.truncated).toBe(true);
      expect(content.bytes).toBeLessThanOrEqual(8);
    });
  });

  describe('firstParent', () => {
    it('находит родителя обычного коммита', async () => {
      const head = await git.resolveCommit('HEAD');
      const parent = await git.resolveCommit('HEAD~1');

      await expect(git.firstParent(head.sha)).resolves.toBe(parent.sha);
    });

    it('у самого первого коммита родителя нет', async () => {
      const root = await git.resolveCommit('HEAD~3');

      await expect(git.firstParent(root.sha)).resolves.toBeUndefined();
    });
  });

  describe('рабочее дерево', () => {
    it('у нетронутого файла изменений нет', async () => {
      await expect(git.worktreeChange(path)).resolves.toBeUndefined();
    });

    it('видит правку на диске вместе с числами строк и патчем', async () => {
      repo.write(path, 'первая\nизменённая\nтретья\nчетвёртая\nпятая\n');

      await expect(git.worktreeChange(path)).resolves.toEqual({ status: 'modified', untracked: false });

      const [numbers] = await git.diffWorktreeNumstat(path);
      expect(numbers).toMatchObject({ insertions: 1, deletions: 0 });

      const { files } = await git.diffWorktreePatch(path);
      expect(files[0]?.hunks[0]?.lines.some((line) => line.kind === 'insert' && line.text === 'пятая')).toBe(true);

      repo.git('checkout', '--', path);
    });

    it('файл, которого ещё нет в git, помечается как неотслеживаемый', async () => {
      repo.write('docs/черновик.md', 'черновик\n');

      await expect(git.worktreeChange('docs/черновик.md')).resolves.toEqual({ status: 'added', untracked: true });

      repo.remove('docs/черновик.md');
    });

    it('удалённый с диска файл виден как удаление', async () => {
      repo.remove(path);

      await expect(git.worktreeChange(path)).resolves.toEqual({ status: 'deleted', untracked: false });

      repo.git('checkout', '--', path);
    });
  });
});
