import { describe, expect, it } from 'vitest';
import type { FileVersion, HistoryEntry } from '@shared/historyModel';
import type { FilePatch, Hunk } from '@shared/model';
import { EXPANDER_ROW_HEIGHT, HUNK_ROW_HEIGHT, NOTICE_ROW_HEIGHT } from '../../webview/diff/rows';
import { buildContentRows, buildPatchRows, noticeRows, versionRowHeight } from '../../webview/history/rows';

const version = (overrides: Partial<FileVersion> = {}): FileVersion => ({
  entryId: 'a',
  path: 'src/app.ts',
  lines: ['первая', 'вторая'],
  truncated: false,
  binary: false,
  missing: false,
  bytes: 14,
  ...overrides,
});

const hunk = (): Hunk => ({
  baseStart: 1,
  baseCount: 1,
  compareStart: 1,
  compareCount: 2,
  header: '',
  lines: [
    { kind: 'context', text: 'первая', baseLine: 1, compareLine: 1 },
    { kind: 'insert', text: 'вторая', compareLine: 2 },
  ],
});

const patch = (overrides: Partial<FilePatch> = {}): FilePatch => ({
  path: 'src/app.ts',
  status: 'modified',
  binary: false,
  hunks: [hunk()],
  truncated: false,
  ...overrides,
});

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'a',
  kind: 'commit',
  path: 'src/app.ts',
  status: 'modified',
  insertions: 1,
  deletions: 0,
  binary: false,
  ...overrides,
});

describe('buildContentRows', () => {
  it('делает по строке на каждую строку файла с нумерацией с единицы', () => {
    const rows = buildContentRows(version(), undefined);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'code', number: 1, text: 'первая' });
    expect(rows[1]).toMatchObject({ kind: 'code', number: 2, text: 'вторая' });
  });

  it('раскладывает подсветку по строкам', () => {
    const tokens = [[{ content: 'первая', color: '#fff', offset: 0 }], []];

    const rows = buildContentRows(version(), tokens);

    expect((rows[0] as { tokens?: unknown }).tokens).toBe(tokens[0]);
    expect((rows[1] as { tokens?: unknown }).tokens).toBe(tokens[1]);
    // Пока подсветка не досчиталась, строки идут вовсе без токенов.
    expect(buildContentRows(version(), undefined)[0]).not.toHaveProperty('tokens');
  });

  it('удалённый файл объясняет словами, а не пустым экраном', () => {
    const rows = buildContentRows(version({ missing: true, lines: [] }), undefined);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'notice', tone: 'muted' });
    expect(rows[0]).toHaveProperty('text', expect.stringContaining('удалил'));
  });

  it('двоичный файл показывает размером, а не содержимым', () => {
    const rows = buildContentRows(version({ binary: true, lines: [], bytes: 2048 }), undefined);

    expect(rows[0]).toHaveProperty('text', expect.stringContaining('2.0 КБ'));
  });

  it('обрезанный файл предупреждает об этом перед содержимым', () => {
    const rows = buildContentRows(version({ truncated: true }), undefined);

    expect(rows[0]).toMatchObject({ kind: 'notice', tone: 'warning' });
    expect(rows).toHaveLength(3);
  });
});

describe('buildPatchRows', () => {
  // Хунк с первой строки ничего не пропускает, поэтому его заголовка здесь нет.
  it('в одной колонке даёт строки подряд', () => {
    const rows = buildPatchRows(patch(), undefined, 'unified', entry());

    expect(rows.map((row) => row.kind)).toEqual(['line', 'line']);
  });

  it('в двух колонках складывает строки парами', () => {
    const rows = buildPatchRows(patch(), undefined, 'split', entry());

    expect(rows.map((row) => row.kind)).toEqual(['split', 'split']);
  });

  it('подставляет подсветку строк из токенов хунка', () => {
    const tokens = { hunks: [[[{ content: 'первая', color: '#fff', offset: 0 }], []]] };

    const rows = buildPatchRows(patch(), tokens, 'unified', entry());

    expect(rows[0]).toMatchObject({ tokens: tokens.hunks[0]?.[0] });
  });

  it('файлу вне git честно говорит, что сравнивать не с чем', () => {
    const rows = buildPatchRows(patch({ hunks: [] }), undefined, 'unified', entry({ untracked: true }));

    expect(rows[0]).toHaveProperty('text', expect.stringContaining('ещё нет в git'));
  });

  it('переименование без правок объясняет отдельно от «нет изменений»', () => {
    const rows = buildPatchRows(patch({ hunks: [] }), undefined, 'unified', entry({ status: 'renamed' }));

    expect(rows[0]).toHaveProperty('text', expect.stringContaining('поменялся только путь'));
  });

  it('пустой патч обычного коммита — это «содержимое не изменилось»', () => {
    const rows = buildPatchRows(patch({ hunks: [] }), undefined, 'unified', entry());

    expect(rows[0]).toHaveProperty('text', 'Содержимое не изменилось.');
  });

  it('двоичный файл не пытается показывать построчно', () => {
    const rows = buildPatchRows(patch({ binary: true }), undefined, 'unified', entry({ binary: true }));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('text', expect.stringContaining('Двоичный файл'));
  });

  it('обрезанный патч предупреждает и всё равно показывает, что успел', () => {
    const rows = buildPatchRows(patch({ truncated: true }), undefined, 'unified', entry());

    expect(rows[0]).toMatchObject({ kind: 'notice', tone: 'warning' });
    expect(rows[0]).toHaveProperty('text', expect.stringContaining('2 строки'));
    expect(rows.filter((row) => row.kind === 'line')).toHaveLength(2);
  });
});

describe('buildPatchRows: свёрнутые промежутки', () => {
  /** Хунк на строках 5–6 версии: до него и после остаются свёрнутые куски файла. */
  const gapped = (overrides: Partial<FilePatch> = {}): FilePatch =>
    patch({
      hunks: [
        {
          baseStart: 5,
          baseCount: 1,
          compareStart: 5,
          compareCount: 2,
          header: '',
          lines: [
            { kind: 'context', text: 'пятая', baseLine: 5, compareLine: 5 },
            { kind: 'insert', text: 'шестая', compareLine: 6 },
          ],
        },
      ],
      compareTotalLines: 10,
      ...overrides,
    });

  it('на промежуток перед первым хунком вешает кнопку разворачивания', () => {
    const rows = buildPatchRows(gapped(), undefined, 'unified', entry());

    expect(rows[0]).toMatchObject({ kind: 'expander', compareStart: 1, compareEnd: 4 });
  });

  it('хвост файла за последним хунком тоже разворачивается', () => {
    const rows = buildPatchRows(gapped(), undefined, 'unified', entry());

    // Строки 7–10: номер в предыдущей версии на единицу меньше — хунк добавил строку.
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'expander', compareStart: 7, compareEnd: 10, baseOffset: -1 });
  });

  it('без известной длины файла хвоста не выдумывает', () => {
    const rows = buildPatchRows(gapped({ compareTotalLines: undefined }), undefined, 'unified', entry());

    expect(rows.filter((row) => row.kind === 'expander')).toHaveLength(1);
  });

  it('обрезанный патч не разворачивают: его хунки не описывают файл целиком', () => {
    const rows = buildPatchRows(gapped({ truncated: true }), undefined, 'unified', entry());

    expect(rows.some((row) => row.kind === 'expander')).toBe(false);
  });

  it('подгруженные строки становятся контекстом, а на остаток остаётся кнопка', () => {
    const context = new Map([
      [3, { text: 'третья' }],
      [4, { text: 'четвёртая' }],
    ]);

    const rows = buildPatchRows(gapped(), undefined, 'unified', entry(), context);

    expect(rows[0]).toMatchObject({ kind: 'expander', compareStart: 1, compareEnd: 2 });
    expect(rows[1]).toMatchObject({ kind: 'line', line: { kind: 'context', text: 'третья', compareLine: 3, baseLine: 3 } });
    expect(rows[2]).toMatchObject({ kind: 'line', line: { text: 'четвёртая', compareLine: 4 } });
  });

  it('развёрнутый целиком промежуток не оставляет ни кнопок, ни заголовка хунка', () => {
    const context = new Map([1, 2, 3, 4].map((line) => [line, { text: `строка ${line}` }]));

    const rows = buildPatchRows(gapped(), undefined, 'unified', entry(), context);

    // Строки 1–4 и хунк с пятой идут подряд: разделять их нечем и незачем.
    expect(rows.slice(0, 4).every((row) => row.kind === 'line')).toBe(true);
    expect(rows[4]).toMatchObject({ kind: 'line', line: { compareLine: 5 } });
  });

  it('пока в промежутке остались скрытые строки, заголовок хунка на месте', () => {
    const context = new Map([[4, { text: 'четвёртая' }]]);

    const rows = buildPatchRows(gapped(), undefined, 'unified', entry(), context);

    expect(rows.some((row) => row.kind === 'hunk')).toBe(true);
  });

  it('обрезанный патч сохраняет заголовки: промежутки там неизвестны', () => {
    const rows = buildPatchRows(gapped({ truncated: true }), undefined, 'unified', entry());

    expect(rows.some((row) => row.kind === 'hunk')).toBe(true);
  });

  it('в двух колонках строка промежутка одинакова с обеих сторон', () => {
    const context = new Map([[4, { text: 'четвёртая', tokens: [{ content: 'четвёртая', color: '#fff', offset: 0 }] }]]);

    const rows = buildPatchRows(gapped(), undefined, 'split', entry(), context);
    const line = rows.find((row) => row.kind === 'split');

    expect(line).toMatchObject({
      row: { left: { line: { baseLine: 4 } }, right: { line: { compareLine: 4 } } },
      leftTokens: context.get(4)?.tokens,
      rightTokens: context.get(4)?.tokens,
    });
  });

  it('у промежутка своя высота строки', () => {
    const [expander] = buildPatchRows(gapped(), undefined, 'unified', entry());

    expect(versionRowHeight(expander as never, 19, 80)).toBe(EXPANDER_ROW_HEIGHT);
  });
});

describe('versionRowHeight', () => {
  it('строки кода занимают ровно строку', () => {
    const [row] = buildContentRows(version(), undefined);

    expect(versionRowHeight(row as never, 19, 80)).toBe(19);
  });

  it('длинная строка файла занимает столько строк, на сколько перенеслась', () => {
    const [row] = buildContentRows({ ...version(), lines: ['a'.repeat(25)] }, undefined);

    expect(versionRowHeight(row as never, 19, 10)).toBe(57);
  });

  it('служебные строки и заголовки хунков имеют свои высоты', () => {
    const [service] = noticeRows('muted', 'Загружаем…');
    // Заголовок появляется только над хунком, выше которого что-то свёрнуто.
    const shifted = patch({ hunks: [{ ...hunk(), baseStart: 5, compareStart: 5 }] });
    const header = buildPatchRows(shifted, undefined, 'unified', entry()).find((row) => row.kind === 'hunk');

    expect(versionRowHeight(service as never, 19, 80)).toBe(NOTICE_ROW_HEIGHT);
    expect(header && versionRowHeight(header, 19, 80)).toBe(HUNK_ROW_HEIGHT);
  });

  it('строка без перевода в конце файла занимает две строки: под ней подпись', () => {
    const withNote = patch({
      hunks: [
        {
          ...hunk(),
          lines: [{ kind: 'insert', text: 'последняя', compareLine: 1, noNewlineAtEof: true }],
        },
      ],
    });

    const unified = buildPatchRows(withNote, undefined, 'unified', entry());
    const split = buildPatchRows(withNote, undefined, 'split', entry());

    expect(versionRowHeight(unified[0] as never, 19, 80)).toBe(38);
    expect(versionRowHeight(split[0] as never, 19, 80)).toBe(38);
  });
});
