import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import type { StashEntry } from '@shared/stashModel';
import { StashService } from '../../src/services/StashService';
import { TestRepo } from '../fixtures/testRepo';

/**
 * Сервис стешей на настоящем репозитории. В нём три стеша, и каждый проверяет
 * своё:
 *
 *   stash@{2}  обычный, сделан без сообщения — карточка называет его по ветке;
 *   stash@{1}  со своим сообщением и с изменением, лежавшим в индексе;
 *   stash@{0}  с файлом, которого в git ещё не было (`-u`).
 *
 * Мокать здесь нечего: почти все ошибки этого слоя — про то, что именно git
 * складывает в родителей коммита стеша.
 */
describe('StashService', () => {
  let repo: TestRepo;
  let service: StashService;
  let baseSha: string;

  const stash = (entries: readonly StashEntry[], ref: string) => entries.find((entry) => entry.ref === ref);

  beforeAll(async () => {
    repo = TestRepo.create();

    repo.write('src/app.ts', 'export const answer = 1;\n');
    repo.write('README.md', '# Проект\n');
    baseSha = repo.commit('первый коммит');

    // stash@{2}: обычный стеш без сообщения.
    repo.write('src/app.ts', 'export const answer = 42;\n');
    repo.git('stash', 'push', '--quiet');

    // stash@{1}: своё сообщение, часть изменений в индексе.
    repo.write('README.md', '# Проект\n\nописание\n');
    repo.git('add', 'README.md');
    repo.write('src/app.ts', 'export const answer = 7;\n');
    repo.git('stash', 'push', '--quiet', '--message', 'правки описания');

    // stash@{0}: файл, которого в git не было.
    repo.write('notes.md', 'черновик\nвторая строка\n');
    repo.git('stash', 'push', '--quiet', '--include-untracked', '--message', 'черновик заметок');

    service = new StashService(await GitRepository.open(repo.root, new GitExecutor()));
  });

  afterAll(() => repo.dispose());

  describe('list', () => {
    it('отдаёт стеши свежими вперёд и заполняет карточку', async () => {
      const entries = await service.list();

      expect(entries.map((entry) => entry.ref)).toEqual(['stash@{0}', 'stash@{1}', 'stash@{2}']);
      expect(entries[0]).toMatchObject({
        ref: 'stash@{0}',
        message: 'черновик заметок',
        automatic: false,
        branch: 'main',
        authorName: 'GitScope Test',
      });
      expect(entries[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entries[0]?.shortSha).toHaveLength(7);
    });

    it('показывает коммит, поверх которого сделан стеш', async () => {
      const entries = await service.list();

      expect(entries[0]?.base).toMatchObject({ sha: baseSha, subject: 'первый коммит' });
      expect(entries[0]?.base.shortSha).toBe(baseSha.slice(0, 7));
    });

    it('у стеша без сообщения оставляет его пустым: в reflog там тема базового коммита', async () => {
      const entries = await service.list();

      expect(stash(entries, 'stash@{2}')).toMatchObject({ message: '', automatic: true, branch: 'main' });
    });

    it('коммит с новыми файлами есть только у стеша, сделанного с -u', async () => {
      const entries = await service.list();

      expect(stash(entries, 'stash@{0}')?.untrackedSha).toBeDefined();
      expect(stash(entries, 'stash@{1}')?.untrackedSha).toBeUndefined();
      // Состояние индекса git сохраняет всегда, даже когда в нём ничего нет.
      expect(entries.every((entry) => entry.indexSha !== undefined)).toBe(true);
    });
  });

  describe('summary', () => {
    it('считает изменения относительно базы стеша', async () => {
      const entries = await service.list();
      const summary = await service.summary(stash(entries, 'stash@{2}') as StashEntry);

      expect(summary.files.map((file) => [file.path, file.status])).toEqual([['src/app.ts', 'modified']]);
      expect(summary).toMatchObject({ insertions: 1, deletions: 1 });
    });

    it('помечает изменения, лежавшие в индексе', async () => {
      const entries = await service.list();
      const summary = await service.summary(stash(entries, 'stash@{1}') as StashEntry);

      const staged = summary.files.find((file) => file.path === 'README.md');
      const unstaged = summary.files.find((file) => file.path === 'src/app.ts');
      expect(staged?.staged).toBe(true);
      expect(unstaged?.staged).toBeUndefined();
    });

    it('добавляет в список файлы, которых не было в git', async () => {
      const entries = await service.list();
      const summary = await service.summary(stash(entries, 'stash@{0}') as StashEntry);

      const untracked = summary.files.find((file) => file.path === 'notes.md');
      expect(untracked).toMatchObject({ status: 'added', untracked: true, insertions: 2, deletions: 0 });
      // Их строки входят в итог: иначе числа в карточке расходились бы со списком.
      expect(summary.insertions).toBe(2);
    });
  });

  describe('patch', () => {
    it('показывает разницу с базой стеша', async () => {
      const entries = await service.list();
      const entry = stash(entries, 'stash@{2}') as StashEntry;
      const summary = await service.summary(entry);
      const file = summary.files[0];

      const patch = await service.patch(entry, file!, 3);

      expect(patch.path).toBe('src/app.ts');
      expect(patch.hunks[0]?.lines.map((line) => [line.kind, line.text])).toEqual([
        ['delete', 'export const answer = 1;'],
        ['insert', 'export const answer = 42;'],
      ]);
    });

    it('файл вне git показывает добавленным целиком', async () => {
      const entries = await service.list();
      const entry = stash(entries, 'stash@{0}') as StashEntry;
      const summary = await service.summary(entry);
      const file = summary.files.find((candidate) => candidate.path === 'notes.md');

      const patch = await service.patch(entry, file!, 3);

      expect(patch.hunks[0]?.lines.map((line) => line.kind)).toEqual(['insert', 'insert']);
      expect(patch.baseTotalLines).toBe(0);
    });
  });

  describe('readLines', () => {
    it('отдаёт строки файла в том виде, в каком он лежит в стеше', async () => {
      const entries = await service.list();
      const entry = stash(entries, 'stash@{0}') as StashEntry;
      const summary = await service.summary(entry);
      const file = summary.files.find((candidate) => candidate.path === 'notes.md');

      expect(await service.readLines(entry, file!, 1, 2)).toEqual(['черновик', 'вторая строка']);
    });
  });

  it('в репозитории без стешей отдаёт пустой список', async () => {
    const empty = TestRepo.create();
    try {
      empty.write('a.txt', 'текст\n');
      empty.commit('первый коммит');
      const service = new StashService(await GitRepository.open(empty.root, new GitExecutor()));

      expect(await service.list()).toEqual([]);
    } finally {
      empty.dispose();
    }
  });
});
