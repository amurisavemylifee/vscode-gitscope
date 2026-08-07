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
    context: new Map(),
    viewMode: 'unified',
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

describe('промежутки между хунками', () => {
  const hunkAt = (compareStart: number, count: number): Hunk => ({
    baseStart: compareStart,
    baseCount: count,
    compareStart,
    compareCount: count,
    header: '',
    lines: Array.from({ length: count }, (_, index) => ({
      kind: 'context' as const,
      text: `строка ${compareStart + index}`,
      baseLine: compareStart + index,
      compareLine: compareStart + index,
    })),
  });

  const withGaps = (params: Partial<Parameters<typeof buildDiffRows>[0]> = {}) =>
    build({
      patches: new Map([
        ['src/a.ts', ready({ hunks: [hunkAt(10, 2)], compareTotalLines: 20, baseTotalLines: 20 })],
      ]),
      ...params,
    });

  it('предлагает развернуть строки до первого и после последнего хунка', () => {
    const rows = withGaps().rows;

    expect(kinds(rows)).toEqual(['file', 'expander', 'hunk', 'line', 'line', 'expander']);
    expect(rows[1]).toMatchObject({ compareStart: 1, compareEnd: 9, baseOffset: 0 });
    expect(rows[5]).toMatchObject({ compareStart: 12, compareEnd: 20 });
  });

  it('подгруженные строки показывает как контекст, на остаток оставляет кнопку', () => {
    const rows = withGaps({
      context: new Map([['src/a.ts', new Map([[8, { text: 'восьмая' }], [9, { text: 'девятая' }]])]]),
    }).rows;

    expect(kinds(rows)).toEqual(['file', 'expander', 'line', 'line', 'hunk', 'line', 'line', 'expander']);
    expect(rows[1]).toMatchObject({ compareStart: 1, compareEnd: 7 });
    expect(rows[2]).toMatchObject({ kind: 'line', line: { text: 'восьмая', compareLine: 8, baseLine: 8 } });
  });

  it('переносит подсветку подгруженной строки в саму строку', () => {
    const tokens = [{ content: 'восьмая', color: '#fff', offset: 0 }];
    const rows = withGaps({
      context: new Map([['src/a.ts', new Map([[8, { text: 'восьмая', tokens }]])]]),
    }).rows;
    const line = rows.find((row) => row.kind === 'line' && row.hunkIndex === -1);

    expect(line).toMatchObject({ tokens });
  });

  it('у обрезанного патча кнопок разворота нет — промежутки посчитались бы неверно', () => {
    const rows = build({
      patches: new Map([
        ['src/a.ts', ready({ hunks: [hunkAt(10, 2)], compareTotalLines: 20, truncated: true })],
      ]),
    }).rows;

    expect(kinds(rows).filter((kind) => kind === 'expander')).toEqual([]);
  });

  it('без сведений о размере файла хвостовой промежуток не выдумывается', () => {
    const rows = build({
      patches: new Map([['src/a.ts', ready({ hunks: [hunkAt(1, 2)] })]]),
    }).rows;

    expect(kinds(rows)).toEqual(['file', 'hunk', 'line', 'line']);
  });
});

describe('режим двух колонок', () => {
  it('строит выровненные пары вместо одиночных строк', () => {
    const rows = build({
      viewMode: 'split',
      patches: new Map([
        [
          'src/a.ts',
          ready({
            hunks: [
              {
                baseStart: 1,
                baseCount: 1,
                compareStart: 1,
                compareCount: 1,
                header: '',
                lines: [
                  { kind: 'delete', text: 'было', baseLine: 1 },
                  { kind: 'insert', text: 'стало', compareLine: 1 },
                ],
              },
            ],
          }),
        ],
      ]),
    }).rows;

    expect(kinds(rows)).toEqual(['file', 'hunk', 'split']);
    expect(rows[2]).toMatchObject({
      row: { left: { line: { text: 'было' } }, right: { line: { text: 'стало' } } },
    });
  });

  it('строку подгруженного контекста ставит на обе стороны', () => {
    const rows = build({
      viewMode: 'split',
      patches: new Map([
        [
          'src/a.ts',
          ready({
            hunks: [
              {
                baseStart: 5,
                baseCount: 1,
                compareStart: 5,
                compareCount: 1,
                header: '',
                lines: [{ kind: 'context', text: 'пятая', baseLine: 5, compareLine: 5 }],
              },
            ],
            compareTotalLines: 5,
          }),
        ],
      ]),
      context: new Map([['src/a.ts', new Map([[4, { text: 'четвёртая' }]])]]),
    }).rows;
    const contextRow = rows.find((row) => row.kind === 'split' && row.hunkIndex === -1);

    expect(contextRow).toMatchObject({
      row: { left: { line: { text: 'четвёртая' } }, right: { line: { text: 'четвёртая' } } },
    });
  });
});
