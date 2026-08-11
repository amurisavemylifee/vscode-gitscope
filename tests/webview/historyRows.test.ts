import { describe, expect, it } from 'vitest';
import type { FileVersion, HistoryEntry } from '@shared/historyModel';
import type { FilePatch, Hunk } from '@shared/model';
import { HUNK_ROW_HEIGHT, NOTICE_ROW_HEIGHT } from '../../webview/diff/rows';
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
  it('в одной колонке даёт заголовок хунка и строки подряд', () => {
    const rows = buildPatchRows(patch(), undefined, 'unified', entry());

    expect(rows.map((row) => row.kind)).toEqual(['hunk', 'line', 'line']);
  });

  it('в двух колонках складывает строки парами', () => {
    const rows = buildPatchRows(patch(), undefined, 'split', entry());

    expect(rows.map((row) => row.kind)).toEqual(['hunk', 'split', 'split']);
  });

  it('подставляет подсветку строк из токенов хунка', () => {
    const tokens = { hunks: [[[{ content: 'первая', color: '#fff', offset: 0 }], []]] };

    const rows = buildPatchRows(patch(), tokens, 'unified', entry());

    expect(rows[1]).toMatchObject({ tokens: tokens.hunks[0]?.[0] });
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

describe('versionRowHeight', () => {
  it('строки кода занимают ровно строку', () => {
    const [row] = buildContentRows(version(), undefined);

    expect(versionRowHeight(row as never, 19)).toBe(19);
  });

  it('служебные строки и заголовки хунков имеют свои высоты', () => {
    const [service] = noticeRows('muted', 'Загружаем…');
    const [header] = buildPatchRows(patch(), undefined, 'unified', entry());

    expect(versionRowHeight(service as never, 19)).toBe(NOTICE_ROW_HEIGHT);
    expect(versionRowHeight(header as never, 19)).toBe(HUNK_ROW_HEIGHT);
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

    expect(versionRowHeight(unified[1] as never, 19)).toBe(38);
    expect(versionRowHeight(split[1] as never, 19)).toBe(38);
  });
});
