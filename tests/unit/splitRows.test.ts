import { describe, expect, it } from 'vitest';
import type { DiffLine } from '@shared/model';
import { buildSplitRows } from '@shared/diff/splitRows';

const context = (text: string, base: number, compare: number): DiffLine => ({
  kind: 'context',
  text,
  baseLine: base,
  compareLine: compare,
});
const removed = (text: string, base: number): DiffLine => ({ kind: 'delete', text, baseLine: base });
const added = (text: string, compare: number): DiffLine => ({ kind: 'insert', text, compareLine: compare });

/** Компактная запись результата: `левое|правое`, пустая сторона — пробел. */
const outline = (rows: ReturnType<typeof buildSplitRows>) =>
  rows.map((row) => `${row.left?.line.text ?? ''}|${row.right?.line.text ?? ''}`);

describe('buildSplitRows', () => {
  it('контекст занимает обе стороны', () => {
    const rows = buildSplitRows([context('одинаково', 1, 1)]);

    expect(outline(rows)).toEqual(['одинаково|одинаково']);
  });

  it('замена строки встаёт на одну высоту', () => {
    const rows = buildSplitRows([removed('было', 1), added('стало', 1)]);

    expect(outline(rows)).toEqual(['было|стало']);
  });

  it('лишние удаления оставляют правую сторону пустой', () => {
    const rows = buildSplitRows([removed('первое', 1), removed('второе', 2), added('замена', 1)]);

    expect(outline(rows)).toEqual(['первое|замена', 'второе|']);
  });

  it('лишние вставки оставляют левую сторону пустой', () => {
    const rows = buildSplitRows([removed('было', 1), added('одно', 1), added('два', 2)]);

    expect(outline(rows)).toEqual(['было|одно', '|два']);
  });

  it('чистое добавление занимает только правую сторону', () => {
    const rows = buildSplitRows([added('новое', 1)]);

    expect(outline(rows)).toEqual(['|новое']);
  });

  it('сохраняет позицию строки в хунке — по ней ищется подсветка', () => {
    const rows = buildSplitRows([context('a', 1, 1), removed('b', 2), added('c', 2)]);

    expect(rows[0]?.left?.index).toBe(0);
    expect(rows[1]?.left?.index).toBe(1);
    expect(rows[1]?.right?.index).toBe(2);
  });

  it('обрабатывает чередование блоков', () => {
    const rows = buildSplitRows([
      context('шапка', 1, 1),
      removed('старое', 2),
      added('новое', 2),
      context('середина', 3, 3),
      added('дописано', 4),
      context('подвал', 4, 5),
    ]);

    expect(outline(rows)).toEqual([
      'шапка|шапка',
      'старое|новое',
      'середина|середина',
      '|дописано',
      'подвал|подвал',
    ]);
  });

  it('на пустом хунке отдаёт пустой список', () => {
    expect(buildSplitRows([])).toEqual([]);
  });
});
