import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@shared/historyModel';
import type { DiffLine, FilePatch, Hunk } from '@shared/model';
import { HUNK_ROW_HEIGHT } from '../../webview/diff/rows';
import { changeAtOffset, collectChanges, wrapChangeIndex } from '../../webview/history/changes';
import { buildPatchRows } from '../../webview/history/rows';

const LINE = 20;

const entry = (): HistoryEntry => ({
  id: 'a',
  kind: 'commit',
  path: 'src/app.ts',
  status: 'modified',
  insertions: 2,
  deletions: 1,
  binary: false,
});

const hunk = (lines: readonly DiffLine[]): Hunk => ({
  baseStart: 1,
  baseCount: lines.filter((line) => line.kind !== 'insert').length,
  compareStart: 1,
  compareCount: lines.filter((line) => line.kind !== 'delete').length,
  header: '',
  lines,
});

const patch = (lines: readonly DiffLine[]): FilePatch => ({
  path: 'src/app.ts',
  status: 'modified',
  binary: false,
  hunks: [hunk(lines)],
  truncated: false,
});

const rowsOf = (lines: readonly DiffLine[], viewMode: 'unified' | 'split' = 'unified') =>
  buildPatchRows(patch(lines), undefined, viewMode, entry());

const context = (text: string, line: number): DiffLine => ({ kind: 'context', text, baseLine: line, compareLine: line });
const insert = (text: string, line: number): DiffLine => ({ kind: 'insert', text, compareLine: line });
const remove = (text: string, line: number): DiffLine => ({ kind: 'delete', text, baseLine: line });

describe('collectChanges', () => {
  it('соседние изменённые строки считает одним изменением', () => {
    const { blocks } = collectChanges(rowsOf([insert('первая', 1), insert('вторая', 2)]), LINE);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'insert', height: LINE * 2 });
  });

  it('изменения через контекст — это два разных изменения', () => {
    const rows = rowsOf([insert('первая', 1), context('вторая', 2), insert('третья', 3)]);

    expect(collectChanges(rows, LINE).blocks).toHaveLength(2);
  });

  it('удаление рядом со вставкой — одно смешанное изменение', () => {
    const { blocks } = collectChanges(rowsOf([remove('было', 1), insert('стало', 1)]), LINE);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('mixed');
  });

  it('удаления отмечает отдельным цветом', () => {
    const { blocks } = collectChanges(rowsOf([remove('было', 1)]), LINE);

    expect(blocks[0]?.kind).toBe('delete');
  });

  it('запоминает, где изменение лежит в области прокрутки', () => {
    const rows = rowsOf([context('первая', 1), insert('вторая', 2)]);

    const { blocks, total } = collectChanges(rows, LINE);

    // Заголовок хунка, строка контекста, изменение.
    expect(blocks[0]).toMatchObject({ row: 2, top: HUNK_ROW_HEIGHT + LINE, height: LINE });
    expect(total).toBe(HUNK_ROW_HEIGHT + LINE * 2);
  });

  it('в двух колонках находит те же изменения, что и в одной', () => {
    const lines = [context('первая', 1), remove('было', 2), insert('стало', 2)];

    const unified = collectChanges(rowsOf(lines, 'unified'), LINE).blocks;
    const split = collectChanges(rowsOf(lines, 'split'), LINE).blocks;

    expect(split).toHaveLength(unified.length);
    expect(split[0]?.kind).toBe('mixed');
  });

  it('в просмотре файла целиком изменений нет', () => {
    const { blocks } = collectChanges([{ kind: 'code', key: 'code:0', number: 1, text: 'первая' }], LINE);

    expect(blocks).toEqual([]);
  });

  it('свёрнутый промежуток разрывает изменения, а не склеивает их', () => {
    const twoHunks: FilePatch = {
      ...patch([insert('первая', 1)]),
      hunks: [hunk([insert('первая', 1)]), { ...hunk([insert('дальняя', 9)]), compareStart: 9, baseStart: 9 }],
      compareTotalLines: 9,
    };

    const { blocks } = collectChanges(buildPatchRows(twoHunks, undefined, 'unified', entry()), LINE);

    expect(blocks).toHaveLength(2);
  });
});

describe('changeAtOffset', () => {
  const blocks = collectChanges(
    rowsOf([insert('первая', 1), context('вторая', 2), context('третья', 3), insert('четвёртая', 4)]),
    LINE,
  ).blocks;

  it('пока изменение не уехало за верхний край, счётчик стоит на нём', () => {
    expect(changeAtOffset(blocks, 0)).toBe(0);
    expect(changeAtOffset(blocks, HUNK_ROW_HEIGHT)).toBe(0);
  });

  it('уехало — счётчик переходит к следующему', () => {
    expect(changeAtOffset(blocks, HUNK_ROW_HEIGHT + LINE)).toBe(1);
  });

  it('ниже последнего изменения остаётся на нём, а не срывается за список', () => {
    expect(changeAtOffset(blocks, 10_000)).toBe(blocks.length - 1);
    expect(changeAtOffset([], 0)).toBe(0);
  });
});

describe('wrapChangeIndex', () => {
  it('после последнего изменения возвращает к первому', () => {
    expect(wrapChangeIndex(3, 3)).toBe(0);
  });

  it('перед первым — к последнему', () => {
    expect(wrapChangeIndex(-1, 3)).toBe(2);
  });

  it('без изменений держится нуля', () => {
    expect(wrapChangeIndex(-1, 0)).toBe(0);
  });
});
