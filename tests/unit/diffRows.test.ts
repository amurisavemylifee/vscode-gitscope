import { describe, expect, it } from 'vitest';
import type { FileChange, FilePatch, Hunk } from '@shared/model';
import { buildDiffRows, rowHeight, type DiffRow } from '../../webview/diff/rows';
import type { PatchState } from '../../webview/hooks/usePatches';

const file = (overrides: Partial<FileChange> = {}): FileChange => ({
  path: 'src/a.ts',
  status: 'modified',
  insertions: 1,
  deletions: 1,
  binary: false,
  ...overrides,
});

const hunk = (lineCount: number): Hunk => ({
  baseStart: 1,
  baseCount: lineCount,
  compareStart: 1,
  compareCount: lineCount,
  header: '',
  lines: Array.from({ length: lineCount }, (_, index) => ({
    kind: 'context' as const,
    text: `строка ${index}`,
    baseLine: index + 1,
    compareLine: index + 1,
  })),
});

const ready = (patch: Partial<FilePatch> = {}): PatchState => ({
  status: 'ready',
  patch: {
    path: 'src/a.ts',
    status: 'modified',
    binary: false,
    hunks: [hunk(3)],
    truncated: false,
    ...patch,
  },
});

const build = (params: Partial<Parameters<typeof buildDiffRows>[0]> = {}) =>
  buildDiffRows({
    files: [file()],
    patches: new Map([['src/a.ts', ready()]]),
    collapsed: new Set(),
    expanded: new Set(),
    collapseOverLines: 1500,
    ...params,
  });

const kinds = (rows: readonly DiffRow[]) => rows.map((row) => row.kind);

describe('buildDiffRows', () => {
  it('раскладывает файл в заголовок, хунк и строки', () => {
    expect(kinds(build().rows)).toEqual(['file', 'hunk', 'line', 'line', 'line']);
  });

  it('запоминает, где начинается каждый файл', () => {
    const { fileRowIndex } = build({
      files: [file({ path: 'a.ts' }), file({ path: 'b.ts' })],
      patches: new Map([
        ['a.ts', ready()],
        ['b.ts', ready()],
      ]),
    });

    expect(fileRowIndex).toEqual([0, 5]);
  });

  it('у свёрнутого файла оставляет только заголовок', () => {
    expect(kinds(build({ collapsed: new Set(['src/a.ts']) }).rows)).toEqual(['file']);
  });

  it('пока патч не пришёл, показывает строку загрузки', () => {
    expect(kinds(build({ patches: new Map() }).rows)).toEqual(['file', 'notice']);
  });

  it('на ошибке предлагает повторить', () => {
    const rows = build({
      patches: new Map([['src/a.ts', { status: 'failed', message: 'git сломался' } as PatchState]]),
    }).rows;

    expect(rows[1]).toMatchObject({ kind: 'notice', tone: 'error', action: { type: 'retry' } });
  });

  it('для двоичного файла показывает размеры вместо диффа', () => {
    const rows = build({
      files: [file({ binary: true })],
      patches: new Map([['src/a.ts', ready({ binary: true, hunks: [], baseSize: 1024, compareSize: 2048 })]]),
    }).rows;

    expect(kinds(rows)).toEqual(['file', 'notice']);
    expect(rows[1]).toMatchObject({ text: 'Двоичный файл: 1.0 КБ → 2.0 КБ' });
  });

  it('переименование без изменений содержимого объясняет само себя', () => {
    const rows = build({
      files: [file({ status: 'renamed', previousPath: 'src/b.ts' })],
      patches: new Map([['src/a.ts', ready({ hunks: [] })]]),
    }).rows;

    expect(rows[1]).toMatchObject({ text: 'Содержимое не изменилось — поменялся только путь.' });
  });

  it('сворачивает большой файл и предлагает раскрыть', () => {
    const rows = build({
      patches: new Map([['src/a.ts', ready({ hunks: [hunk(50)] })]]),
      collapseOverLines: 10,
    }).rows;

    expect(kinds(rows)).toEqual(['file', 'notice']);
    expect(rows[1]).toMatchObject({ text: '50 строк изменений', action: { type: 'expand' } });
  });

  it('раскрывает большой файл, если пользователь так решил', () => {
    const rows = build({
      patches: new Map([['src/a.ts', ready({ hunks: [hunk(50)] })]]),
      collapseOverLines: 10,
      expanded: new Set(['src/a.ts']),
    }).rows;

    expect(rows).toHaveLength(52);
  });

  it('не сворачивает ничего при нулевом пороге', () => {
    const rows = build({
      patches: new Map([['src/a.ts', ready({ hunks: [hunk(5000)] })]]),
      collapseOverLines: 0,
    }).rows;

    expect(rows).toHaveLength(5002);
  });

  it('предупреждает об обрезанном патче, но всё равно показывает строки', () => {
    const rows = build({ patches: new Map([['src/a.ts', ready({ truncated: true })]]) }).rows;

    expect(kinds(rows)).toEqual(['file', 'notice', 'hunk', 'line', 'line', 'line']);
    expect(rows[1]).toMatchObject({ tone: 'warning' });
  });

  it('даёт строкам уникальные ключи', () => {
    const rows = build({
      files: [file({ path: 'a.ts' }), file({ path: 'b.ts' })],
      patches: new Map([
        ['a.ts', ready()],
        ['b.ts', ready()],
      ]),
    }).rows;

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe('rowHeight', () => {
  const rows = build({ patches: new Map([['src/a.ts', ready()]]) }).rows;

  it('строка кода занимает высоту строки', () => {
    const line = rows.find((row) => row.kind === 'line');

    expect(line && rowHeight(line, 22)).toBe(22);
  });

  it('строка без перевода в конце файла занимает две высоты', () => {
    const withNote: DiffRow = {
      kind: 'line',
      key: 'x',
      fileIndex: 0,
      hunkIndex: 0,
      lineIndex: 0,
      line: { kind: 'delete', text: 'a', baseLine: 1, noNewlineAtEof: true },
    };

    expect(rowHeight(withNote, 20)).toBe(40);
  });

  it('служебные строки имеют фиксированную высоту', () => {
    const file = rows.find((row) => row.kind === 'file');
    const hunkRow = rows.find((row) => row.kind === 'hunk');

    expect(file && rowHeight(file, 19)).toBe(34);
    expect(hunkRow && rowHeight(hunkRow, 19)).toBe(24);
  });
});
