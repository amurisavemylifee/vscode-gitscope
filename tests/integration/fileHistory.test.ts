import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import type { HistoryEntry } from '@shared/historyModel';
import { FileHistoryService } from '../../src/services/FileHistoryService';
import { TestRepo } from '../fixtures/testRepo';

/**
 * Сервис истории на настоящем репозитории:
 *
 *   c1  создан notes/draft.md
 *   c2  правка
 *   c3  переименован в notes/final.md
 *   c4  правка после переименования
 *
 * Отдельно от git-слоя проверяется то, что появляется только здесь: склейка
 * страниц через курсор, рабочая копия рядом с коммитами и патч конкретной
 * версии — включая первый коммит, которому не с чем сравниваться.
 */
describe('FileHistoryService', () => {
  let repo: TestRepo;
  let service: FileHistoryService;
  const oldPath = 'notes/draft.md';
  const path = 'notes/final.md';

  const entry = (entries: readonly HistoryEntry[], subject: string) =>
    entries.find((candidate) => candidate.subject === subject);

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write(oldPath, 'первая\nвторая\n');
    repo.commit('создание');

    repo.write(oldPath, 'первая\nвторая\nтретья\n');
    repo.commit('правка');

    repo.git('mv', oldPath, path);
    repo.commit('переименование');

    repo.write(path, 'первая\nвторая правка\nтретья\n');
    repo.commit('замена строки');

    service = new FileHistoryService(await GitRepository.open(repo.root, new GitExecutor()), path);
  });

  afterAll(() => repo.dispose());

  describe('page', () => {
    it('без курсора отдаёт историю от свежих версий к старым', async () => {
      const { entries, hasMore } = await service.page('HEAD', undefined);

      expect(entries.map((item) => item.subject)).toEqual(['замена строки', 'переименование', 'правка', 'создание']);
      expect(entries.every((item) => item.kind === 'commit')).toBe(true);
      expect(hasMore).toBe(false);
    });

    it('заполняет данные карточки: автора, время, числа строк и ссылки', async () => {
      const { entries } = await service.page('HEAD', undefined);
      const latest = entries[0];

      expect(latest).toMatchObject({
        kind: 'commit',
        path,
        status: 'modified',
        authorName: 'GitScope Test',
        insertions: 1,
        deletions: 1,
        binary: false,
      });
      expect(latest?.id).toBe(latest?.sha);
      expect(latest?.shortSha).toHaveLength(7);
      expect(latest?.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(latest?.refs).toEqual(expect.arrayContaining([{ kind: 'head', name: 'main' }]));
    });

    it('помнит прежнее имя файла на коммите переименования', async () => {
      const { entries } = await service.page('HEAD', undefined);

      expect(entry(entries, 'переименование')).toMatchObject({
        status: 'renamed',
        path,
        previousPath: oldPath,
        similarity: 100,
      });
      expect(entry(entries, 'правка')?.path).toBe(oldPath);
    });

    it('продолжает историю от курсора, не теряя её за переименованием', async () => {
      const { entries } = await service.page('HEAD', undefined);
      const renamed = entry(entries, 'переименование');

      // Курсор на коммите переименования: ниже него файл назывался иначе, и
      // именно на этом месте история обрывалась бы при листании через --skip.
      const next = await service.page('HEAD', { sha: renamed?.sha ?? '', path: renamed?.previousPath ?? path });

      expect(next.entries.map((item) => item.subject)).toEqual(['правка', 'создание']);
      expect(next.entries.every((item) => item.path === oldPath)).toBe(true);
    });

    it('от выбранной точки показывает только то, что было до неё', async () => {
      const { entries } = await service.page('HEAD', undefined);
      const renamed = entry(entries, 'переименование');

      const fromRename = await service.page(renamed?.sha ?? '', undefined);

      // «Замены строки» здесь быть не может: она случилась позже выбранной точки.
      expect(fromRename.entries.map((item) => item.subject)).toEqual(['переименование', 'правка', 'создание']);
    });

    it('под корневым коммитом истории больше нет', async () => {
      const { entries } = await service.page('HEAD', undefined);
      const root = entry(entries, 'создание');

      await expect(service.page('HEAD', { sha: root?.sha ?? '', path: oldPath })).resolves.toEqual({
        entries: [],
        hasMore: false,
      });
    });
  });

  describe('version', () => {
    it('отдаёт содержимое файла на выбранном коммите', async () => {
      const { entries } = await service.page('HEAD', undefined);

      const version = await service.version(entries[0] as HistoryEntry);

      expect(version.lines).toEqual(['первая', 'вторая правка', 'третья']);
      expect(version).toMatchObject({ binary: false, truncated: false, missing: false });
    });

    it('на старой версии читает файл под прежним именем', async () => {
      const { entries } = await service.page('HEAD', undefined);

      const version = await service.version(entry(entries, 'правка') as HistoryEntry);

      expect(version.path).toBe(oldPath);
      expect(version.lines).toEqual(['первая', 'вторая', 'третья']);
    });

    it('у версии, которая файл удалила, содержимого нет', async () => {
      const deleted: HistoryEntry = {
        id: 'x',
        kind: 'commit',
        path,
        status: 'deleted',
        insertions: 0,
        deletions: 3,
        binary: false,
        sha: 'x',
      };

      await expect(service.version(deleted)).resolves.toMatchObject({ missing: true, lines: [] });
    });
  });

  describe('patch', () => {
    it('показывает, что версия изменила по сравнению с предыдущей', async () => {
      const { entries } = await service.page('HEAD', undefined);

      const patch = await service.patch(entries[0] as HistoryEntry, 3);
      const lines = patch.hunks.flatMap((hunk) => hunk.lines);

      expect(lines.some((line) => line.kind === 'delete' && line.text === 'вторая')).toBe(true);
      expect(lines.some((line) => line.kind === 'insert' && line.text === 'вторая правка')).toBe(true);
      // Словный diff размечает изменившийся кусок внутри строки, а не строку целиком.
      expect(lines.find((line) => line.kind === 'insert')?.inlineRanges?.length).toBeGreaterThan(0);
    });

    it('первый коммит сравнивается с пустотой, а не падает без родителя', async () => {
      const { entries } = await service.page('HEAD', undefined);

      const patch = await service.patch(entry(entries, 'создание') as HistoryEntry, 3);

      expect(patch.hunks.flatMap((hunk) => hunk.lines).every((line) => line.kind === 'insert')).toBe(true);
    });

    it('у переименования видно оба имени и отсутствие правок', async () => {
      const { entries } = await service.page('HEAD', undefined);

      const patch = await service.patch(entry(entries, 'переименование') as HistoryEntry, 3);

      expect(patch.hunks).toEqual([]);
      expect(patch.status).toBe('renamed');
    });
  });

  describe('рабочая копия', () => {
    it('у нетронутого файла отдельной версии нет', async () => {
      await expect(service.workingEntry()).resolves.toBeUndefined();
    });

    it('несохранённая правка становится первой версией списка', async () => {
      repo.write(path, 'первая\nвторая правка\nтретья\nчетвёртая\n');

      const working = await service.workingEntry();

      expect(working).toMatchObject({ id: 'working', kind: 'working', status: 'modified', insertions: 1 });

      const version = await service.version(working as HistoryEntry);
      expect(version.lines).toEqual(['первая', 'вторая правка', 'третья', 'четвёртая']);

      const patch = await service.patch(working as HistoryEntry, 3);
      expect(patch.hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === 'четвёртая')).toBe(true);

      repo.git('checkout', '--', path);
    });

    it('файл вне git показывает свои строки и не пытается искать разницу', async () => {
      repo.write('notes/scratch.md', 'раз\nдва\n');
      const scratch = new FileHistoryService(
        await GitRepository.open(repo.root, new GitExecutor()),
        'notes/scratch.md',
      );

      const working = await scratch.workingEntry();
      expect(working).toMatchObject({ untracked: true, status: 'added', insertions: 2, deletions: 0 });

      await expect(scratch.patch(working as HistoryEntry, 3)).resolves.toMatchObject({ hunks: [] });
      await expect(scratch.page('HEAD', undefined)).resolves.toEqual({ entries: [], hasMore: false });

      repo.remove('notes/scratch.md');
    });
  });
});

/**
 * Сценарий из отчёта об ошибке:
 *
 *   main:     c1 создание some-file.ts ── c2 правка ──────────────── c7 правка ── c8 слияние
 *                                    └─ feature: c3 удаление ── c4 восстановление ──┘
 *                                                c5 переименование в some-file-haha.ts
 *                                                c6 правка после переименования
 *
 * Здесь проверяется то, что раньше терялось: история от ревизии, где файл
 * называется иначе, переход через пару «удаление — восстановление» и
 * merge-коммит, в котором правку принесло разрешение конфликта.
 */
describe('FileHistoryService: удаление, восстановление, переименование', () => {
  let repo: TestRepo;
  const oldPath = 'some-folder/some-file.ts';
  const newPath = 'some-folder/some-file-haha.ts';
  let featureSha: string;
  let mergeSha: string;

  const subjects = (entries: readonly HistoryEntry[]) => entries.map((entry) => entry.subject);

  const serviceFor = async (path: string) =>
    new FileHistoryService(await GitRepository.open(repo.root, new GitExecutor()), path);

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write(oldPath, 'строка1\n');
    repo.commit('создание файла');
    repo.write(oldPath, 'строка1\nстрока2\n');
    repo.commit('правка на main');

    repo.checkout('feature', true);
    repo.remove(oldPath);
    repo.commit('удаление файла');
    repo.write(oldPath, 'строка1\nстрока2\n');
    repo.commit('восстановление файла');
    repo.git('mv', oldPath, newPath);
    repo.commit('переименование');
    repo.write(newPath, 'строка1\nстрока2\nстрока3\n');
    featureSha = repo.commit('правка после переименования');

    repo.checkout('main');
    repo.write(oldPath, 'строка1\nстрока2\nправка на main\n');
    repo.commit('ещё правка на main');
    try {
      repo.git('merge', '--no-edit', 'feature');
    } catch {
      // Конфликт здесь и нужен: разрешение живёт в самом merge-коммите.
    }
    repo.write(newPath, 'строка1\nстрока2\nстрока3\nправка на main\n');
    mergeSha = repo.commit('слияние feature');
  });

  afterAll(() => repo.dispose());

  it('от ревизии, где файл переименован, показывает и то, что было после переименования', async () => {
    // Панель открыли на файле рабочей копии — там он ещё под прежним именем.
    const service = await serviceFor(oldPath);

    const { entries } = await service.page(featureSha, undefined);

    expect(subjects(entries)).toContain('правка после переименования');
    expect(entries[0]?.path).toBe(newPath);
  });

  it('переходит через удаление и восстановление файла', async () => {
    const service = await serviceFor(newPath);

    const { entries } = await service.page(featureSha, undefined);

    expect(subjects(entries)).toEqual([
      'правка после переименования',
      'переименование',
      'восстановление файла',
      'удаление файла',
      'правка на main',
      'создание файла',
    ]);
  });

  it('помечает коммит переименования переименованием, а не рождением файла', async () => {
    const service = await serviceFor(newPath);

    const { entries } = await service.page(featureSha, undefined);
    const renamed = entries.find((entry) => entry.subject === 'переименование');

    expect(renamed).toMatchObject({ status: 'renamed', path: newPath, previousPath: oldPath });
  });

  it('показывает слияние, в котором конфликт разрешили правкой файла', async () => {
    const service = await serviceFor(newPath);

    const { entries } = await service.page(mergeSha, undefined);
    const merge = entries.find((entry) => entry.subject === 'слияние feature');

    expect(merge).toMatchObject({ merge: true });
    // Что слияние сделало с файлом, видно не по числам в карточке, а по патчу.
    const patch = await service.patch(merge as HistoryEntry, 3);
    expect(patch.hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === 'правка на main')).toBe(true);
  });

  it('история не теряется и при переезде файла в другую папку', async () => {
    const movedPath = 'другая-папка/some-file-haha.ts';
    repo.checkout('main');
    // Переезд руками, без `git mv`: пару всё равно находит определение
    // переименований по содержимому — как это обычно и происходит в жизни.
    repo.write(movedPath, 'строка1\nстрока2\nстрока3\nправка на main\n');
    repo.remove(newPath);
    const movedSha = repo.commit('переезд в другую папку');
    const service = await serviceFor(movedPath);

    const { entries } = await service.page(movedSha, undefined);

    expect(subjects(entries)).toContain('создание файла');
    expect(entries[0]).toMatchObject({ status: 'renamed', previousPath: newPath });
  });
});

/**
 * Второй сценарий из отчёта: смотрим с ветки, где файл уже переименован, на
 * старый коммит основной ветки — тот, который старше и удаления, и переезда.
 *
 *   main:    c1 ── c2 ── c3
 *                         └─ feature: удаление ── восстановление ──
 *                                     переименование ── правка 1 ── правка 2
 *
 * Раньше панель спрашивала git про сегодняшнее имя файла, которого на старом
 * коммите никогда не было, и показывала «файл ни разу не попадал в коммиты».
 */
describe('FileHistoryService: взгляд с ветки на старый коммит основной', () => {
  let repo: TestRepo;
  const oldPath = 'some-folder/some-file.ts';
  const newPath = 'some-folder/some-file-haha.ts';
  let secondSha: string;
  let firstSha: string;

  beforeAll(() => {
    repo = TestRepo.create();

    repo.write(oldPath, 'строка1\n');
    firstSha = repo.commit('коммит 1 на main');
    repo.write(oldPath, 'строка1\nстрока2\n');
    secondSha = repo.commit('коммит 2 на main');
    repo.write(oldPath, 'строка1\nстрока2\nстрока3\n');
    repo.commit('коммит 3 на main');

    repo.checkout('feature', true);
    repo.remove(oldPath);
    repo.commit('удаление');
    repo.write(oldPath, 'строка1\nстрока2\nстрока3\n');
    repo.commit('восстановление');
    repo.git('mv', oldPath, newPath);
    repo.commit('переименование');
    repo.write(newPath, 'строка1\nстрока2\nстрока3\nстрока4\n');
    repo.commit('правка 1 после переименования');
    repo.write(newPath, 'строка1\nстрока2\nстрока3\nстрока4\nстрока5\n');
    repo.commit('правка 2 после переименования');
  });

  afterAll(() => repo.dispose());

  /** Панель открыта на файле рабочей копии — на ветке он под новым именем. */
  const service = async () =>
    new FileHistoryService(await GitRepository.open(repo.root, new GitExecutor()), newPath);

  it('на старом коммите основной ветки находит файл под прежним именем', async () => {
    const { entries } = await (await service()).page(secondSha, undefined);

    expect(entries.map((entry) => entry.subject)).toEqual(['коммит 2 на main', 'коммит 1 на main']);
    expect(entries.every((entry) => entry.path === oldPath)).toBe(true);
  });

  it('содержимое старой версии читается под тем же прежним именем', async () => {
    const instance = await service();
    const { entries } = await instance.page(secondSha, undefined);

    const version = await instance.version(entries[0] as HistoryEntry);

    expect(version.path).toBe(oldPath);
    expect(version.lines).toEqual(['строка1', 'строка2']);
  });

  it('на самом первом коммите история тоже не пропадает', async () => {
    const { entries } = await (await service()).page(firstSha, undefined);

    expect(entries.map((entry) => entry.subject)).toEqual(['коммит 1 на main']);
  });

  it('с вершины ветки история по-прежнему видна целиком', async () => {
    const { entries } = await (await service()).page('feature', undefined);

    expect(entries.map((entry) => entry.subject)).toEqual([
      'правка 2 после переименования',
      'правка 1 после переименования',
      'переименование',
      'восстановление',
      'удаление',
      'коммит 3 на main',
      'коммит 2 на main',
      'коммит 1 на main',
    ]);
  });
});
