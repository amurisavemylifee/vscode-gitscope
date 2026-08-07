import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '@core/git/parsers/parseUnifiedDiff';

describe('parseUnifiedDiff', () => {
  it('разбирает изменение файла с нумерацией строк по обеим сторонам', () => {
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,3 +10,4 @@ export function run() {',
      ' const before = 1;',
      '-const removed = 2;',
      '+const added = 2;',
      '+const extra = 3;',
      ' const after = 4;',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);

    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.hunks).toHaveLength(1);

    const hunk = file?.hunks[0];
    expect(hunk?.header).toBe('export function run() {');
    expect(hunk?.lines).toEqual([
      { kind: 'context', text: 'const before = 1;', baseLine: 10, compareLine: 10 },
      { kind: 'delete', text: 'const removed = 2;', baseLine: 11 },
      { kind: 'insert', text: 'const added = 2;', compareLine: 11 },
      { kind: 'insert', text: 'const extra = 3;', compareLine: 12 },
      { kind: 'context', text: 'const after = 4;', baseLine: 12, compareLine: 13 },
    ]);
  });

  it('распознаёт добавленный файл по /dev/null на базовой стороне', () => {
    const patch = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,2 @@',
      '+первая',
      '+вторая',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);

    expect(file?.status).toBe('added');
    expect(file?.path).toBe('src/new.ts');
    expect(file?.hunks[0]?.lines.map((line) => line.kind)).toEqual(['insert', 'insert']);
  });

  it('распознаёт удалённый файл и берёт путь с базовой стороны', () => {
    const patch = [
      'diff --git a/src/gone.ts b/src/gone.ts',
      'deleted file mode 100644',
      'index 4444444..0000000',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-первая',
      '-вторая',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);

    expect(file?.status).toBe('deleted');
    expect(file?.path).toBe('src/gone.ts');
  });

  it('распознаёт переименование и запоминает прежний путь', () => {
    const patch = [
      'diff --git a/src/before.ts b/src/after.ts',
      'similarity index 92%',
      'rename from src/before.ts',
      'rename to src/after.ts',
      '--- a/src/before.ts',
      '+++ b/src/after.ts',
      '@@ -1 +1 @@',
      '-старое',
      '+новое',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);

    expect(file?.status).toBe('renamed');
    expect(file?.path).toBe('src/after.ts');
    expect(file?.previousPath).toBe('src/before.ts');
  });

  it('помечает бинарный файл и не выдумывает ему хунки', () => {
    const patch = [
      'diff --git a/logo.png b/logo.png',
      'index 5555555..6666666 100644',
      'Binary files a/logo.png and b/logo.png differ',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);

    expect(file?.binary).toBe(true);
    expect(file?.hunks).toEqual([]);
  });

  it('переносит маркер отсутствующего перевода строки на предыдущую строку', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-без перевода строки',
      '\\ No newline at end of file',
      '+с переводом строки',
      '',
    ].join('\n');

    const [file] = parseUnifiedDiff(patch);
    const lines = file?.hunks[0]?.lines ?? [];

    expect(lines[0]).toMatchObject({ kind: 'delete', noNewlineAtEof: true });
    expect(lines[1]).toMatchObject({ kind: 'insert' });
    expect(lines[1]).not.toHaveProperty('noNewlineAtEof');
  });

  it('читает несколько хунков и несколько файлов из одного патча', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-один',
      '+ОДИН',
      '@@ -10,1 +10,1 @@',
      '-десять',
      '+ДЕСЯТЬ',
      'diff --git a/b.txt b/b.txt',
      '--- a/b.txt',
      '+++ b/b.txt',
      '@@ -1,1 +1,1 @@',
      '-два',
      '+ДВА',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(patch);

    expect(files.map((file) => file.path)).toEqual(['a.txt', 'b.txt']);
    expect(files[0]?.hunks).toHaveLength(2);
    expect(files[0]?.hunks[1]?.baseStart).toBe(10);
  });

  it('понимает заголовок хунка без явного количества строк', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -5 +5 @@',
      '-было',
      '+стало',
      '',
    ].join('\n');

    const hunk = parseUnifiedDiff(patch)[0]?.hunks[0];

    expect(hunk).toMatchObject({ baseStart: 5, baseCount: 1, compareStart: 5, compareCount: 1 });
  });

  it('не падает на выводе, обрезанном посреди хунка', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,100 +1,100 @@',
      ' первая',
      ' вторая',
    ].join('\n');

    const hunk = parseUnifiedDiff(patch)[0]?.hunks[0];

    expect(hunk?.lines).toHaveLength(2);
    expect(hunk?.baseCount).toBe(100);
  });

  it('сохраняет пустые строки контекста', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' первая',
      ' ',
      '-третья',
      '+ТРЕТЬЯ',
      '',
    ].join('\n');

    const lines = parseUnifiedDiff(patch)[0]?.hunks[0]?.lines ?? [];

    expect(lines[1]).toEqual({ kind: 'context', text: '', baseLine: 2, compareLine: 2 });
  });

  it('возвращает пустой список, если файл не изменился', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
