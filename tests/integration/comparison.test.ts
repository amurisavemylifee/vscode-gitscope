import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import { RevisionNotFoundError } from '@core/git/errors';
import { ComparisonService } from '../../src/services/ComparisonService';
import { RevisionService } from '../../src/services/RevisionService';
import type { Revision } from '@shared/model';
import { TestRepo } from '../fixtures/testRepo';

describe('RevisionService и ComparisonService', () => {
  let repo: TestRepo;
  let revisions: RevisionService;
  let comparison: ComparisonService;
  let base: Revision;
  let compare: Revision;

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write('src/app.ts', ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'].join('\n') + '\n');
    repo.write('src/util.ts', ['один', 'два', 'три', 'четыре', 'пять', 'шесть'].join('\n') + '\n');
    repo.write('docs/заметки.md', '# Заметки\n');
    repo.writeBinary('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]));
    repo.commit('первый коммит');
    repo.branch('feature');

    repo.write('only-on-main.txt', 'только на main\n');
    repo.commit('коммит только на main');

    repo.checkout('feature');
    repo.write('src/app.ts', ['первая', 'ИЗМЕНЕНА', 'третья', 'четвёртая', 'пятая'].join('\n') + '\n');
    repo.git('mv', 'src/util.ts', 'src/helpers.ts');
    repo.write('src/added.ts', 'новый файл\n');
    repo.writeBinary('assets/logo.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
    repo.remove('docs/заметки.md');
    repo.commit('коммит в ветке');

    const repository = await GitRepository.open(repo.root, new GitExecutor());
    revisions = new RevisionService(repository);
    comparison = new ComparisonService(repository);
    base = await revisions.resolve('main');
    compare = await revisions.resolve('feature');
  });

  afterAll(() => repo.dispose());

  describe('RevisionService', () => {
    it('строит ревизию с подписью и темой коммита', async () => {
      expect(base).toMatchObject({ spec: 'main', label: 'main', subject: 'коммит только на main' });
      expect(base.sha).toMatch(/^[0-9a-f]{40}$/);
    });

    it('сокращает подпись, если пользователь ввёл полный SHA', async () => {
      const revision = await revisions.resolve(compare.sha);

      expect(revision.label).toHaveLength(7);
      expect(revision.sha).toBe(compare.sha);
    });

    it('разрешает относительные выражения', async () => {
      await expect(revisions.resolve('main~1')).resolves.toMatchObject({ subject: 'первый коммит' });
    });

    it('сообщает о несуществующей ревизии', async () => {
      await expect(revisions.resolve('нет-такой-ветки')).rejects.toBeInstanceOf(RevisionNotFoundError);
    });

    it('предлагает по умолчанию основную ветку и текущую', async () => {
      await expect(revisions.suggestDefaults()).resolves.toEqual({ base: 'main', compare: 'feature' });
    });

    it('распознаёт строки, похожие на SHA', () => {
      expect(RevisionService.looksLikeSha('a1b2c3d')).toBe(true);
      expect(RevisionService.looksLikeSha('main')).toBe(false);
    });
  });

  describe('buildSummary', () => {
    it('собирает список файлов со статусами и счётчиками', async () => {
      const summary = await comparison.buildSummary(base, compare);
      const byPath = new Map(summary.files.map((file) => [file.path, file]));

      expect(byPath.get('src/app.ts')).toMatchObject({ status: 'modified', insertions: 1, deletions: 1 });
      expect(byPath.get('src/added.ts')).toMatchObject({ status: 'added' });
      expect(byPath.get('docs/заметки.md')).toMatchObject({ status: 'deleted' });
      expect(byPath.get('src/helpers.ts')).toMatchObject({ status: 'renamed', previousPath: 'src/util.ts' });
      expect(byPath.get('assets/logo.png')).toMatchObject({ binary: true, insertions: 0, deletions: 0 });
    });

    it('показывает как удалённое то, что появилось в базе после ветвления', async () => {
      const summary = await comparison.buildSummary(base, compare);

      // Двухточечная семантика: в состоянии feature этого файла нет.
      expect(summary.files.find((file) => file.path === 'only-on-main.txt')?.status).toBe('deleted');
    });

    it('суммирует добавленные и удалённые строки по всему сравнению', async () => {
      const summary = await comparison.buildSummary(base, compare);
      const expectedInsertions = summary.files.reduce((total, file) => total + file.insertions, 0);

      expect(summary.insertions).toBe(expectedInsertions);
      expect(summary.deletions).toBeGreaterThan(0);
    });

    it('на одинаковых ревизиях отдаёт пустое сравнение', async () => {
      const summary = await comparison.buildSummary(base, base);

      expect(summary.files).toEqual([]);
      expect(summary.insertions).toBe(0);
    });
  });

  describe('buildPatch', () => {
    const fileFrom = async (path: string) => {
      const summary = await comparison.buildSummary(base, compare);
      const file = summary.files.find((candidate) => candidate.path === path);
      if (!file) {
        throw new Error(`В сравнении нет файла ${path}`);
      }
      return file;
    };

    it('отдаёт хунки и общее число строк по обеим сторонам', async () => {
      const patch = await comparison.buildPatch(base, compare, await fileFrom('src/app.ts'), 3);

      expect(patch.hunks).toHaveLength(1);
      expect(patch.hunks[0]?.lines).toContainEqual({ kind: 'insert', text: 'ИЗМЕНЕНА', compareLine: 2 });
      expect(patch.baseTotalLines).toBe(5);
      expect(patch.compareTotalLines).toBe(5);
    });

    it('для бинарного файла не выдумывает хунки, но отдаёт размеры', async () => {
      const patch = await comparison.buildPatch(base, compare, await fileFrom('assets/logo.png'), 3);

      expect(patch).toMatchObject({ binary: true, hunks: [], baseSize: 5, compareSize: 6 });
    });

    it('распознаёт переименование, подставляя прежний путь', async () => {
      const patch = await comparison.buildPatch(base, compare, await fileFrom('src/helpers.ts'), 3);

      expect(patch.status).toBe('renamed');
      expect(patch.baseTotalLines).toBe(6);
    });

    it('у добавленного файла базовая сторона пуста', async () => {
      const patch = await comparison.buildPatch(base, compare, await fileFrom('src/added.ts'), 3);

      expect(patch.baseTotalLines).toBe(0);
      expect(patch.compareTotalLines).toBe(1);
    });
  });

  describe('readLines', () => {
    it('отдаёт запрошенный диапазон строк, нумерация с единицы', async () => {
      await expect(comparison.readLines(base.sha, 'src/util.ts', 2, 4)).resolves.toEqual(['два', 'три', 'четыре']);
    });

    it('не падает на файле, которого на ревизии нет', async () => {
      await expect(comparison.readLines(base.sha, 'src/added.ts', 1, 10)).resolves.toEqual([]);
    });

    it('обрезает диапазон по границам файла', async () => {
      await expect(comparison.readLines(base.sha, 'src/app.ts', 4, 999)).resolves.toEqual(['четвёртая', 'пятая']);
    });
  });
});
