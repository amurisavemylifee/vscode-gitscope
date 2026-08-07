import { describe, expect, it } from 'vitest';
import type { Hunk } from '@shared/model';
import { annotateHunkWithWordDiff, computeInlineDiff } from '@shared/diff/wordDiff';

/** Достаёт подсвеченные куски строки — так проверять нагляднее, чем по индексам. */
const pieces = (text: string, ranges: readonly { start: number; end: number }[] | undefined) =>
  (ranges ?? []).map((range) => text.slice(range.start, range.end));

describe('computeInlineDiff', () => {
  it('находит изменённое слово внутри строки', () => {
    const base = 'const answer = 41;';
    const compare = 'const answer = 42;';
    const result = computeInlineDiff(base, compare);

    expect(pieces(base, result?.base)).toEqual(['41']);
    expect(pieces(compare, result?.compare)).toEqual(['42']);
  });

  it('различает изменение внутри вызова функции, не подсвечивая её целиком', () => {
    const base = 'foo(alpha, beta)';
    const compare = 'foo(alpha, gamma)';
    const result = computeInlineDiff(base, compare);

    expect(pieces(base, result?.base)).toEqual(['beta']);
    expect(pieces(compare, result?.compare)).toEqual(['gamma']);
  });

  it('видит добавление в конец строки', () => {
    const base = 'let x = 1';
    const compare = 'let x = 1;';
    const result = computeInlineDiff(base, compare);

    expect(result?.base).toEqual([]);
    expect(pieces(compare, result?.compare)).toEqual([';']);
  });

  it('склеивает соседние изменённые токены в один диапазон', () => {
    const base = 'a = один два';
    const compare = 'a = три четыре';
    const result = computeInlineDiff(base, compare);

    // Иначе в разметке получилось бы четыре span-а вместо одного.
    expect(result?.compare).toHaveLength(1);
    expect(pieces(compare, result?.compare)).toEqual(['три четыре']);
  });

  it('на одинаковых строках не находит ничего', () => {
    expect(computeInlineDiff('одно и то же', 'одно и то же')).toEqual({ base: [], compare: [] });
  });

  it('отказывается размечать совсем непохожие строки', () => {
    // Мозаика из подсвеченных кусков читается хуже, чем строка целиком.
    expect(computeInlineDiff('import { readFile } from "node:fs"', 'export default 42')).toBeUndefined();
  });

  it('не берётся за слишком длинные строки', () => {
    const long = Array.from({ length: 600 }, (_, index) => `слово${index}`).join(' ');

    expect(computeInlineDiff(long, `${long} хвост`)).toBeUndefined();
  });

  it('работает с кириллицей', () => {
    const base = 'const заголовок = "старый";';
    const compare = 'const заголовок = "новый";';
    const result = computeInlineDiff(base, compare);

    expect(pieces(base, result?.base)).toEqual(['старый']);
    expect(pieces(compare, result?.compare)).toEqual(['новый']);
  });
});

describe('annotateHunkWithWordDiff', () => {
  const hunk = (lines: Hunk['lines']): Hunk => ({
    baseStart: 1,
    baseCount: 1,
    compareStart: 1,
    compareCount: 1,
    header: '',
    lines,
  });

  it('размечает пару «удалено — добавлено»', () => {
    const result = annotateHunkWithWordDiff(
      hunk([
        { kind: 'context', text: 'до', baseLine: 1, compareLine: 1 },
        { kind: 'delete', text: 'const a = 1;', baseLine: 2 },
        { kind: 'insert', text: 'const a = 2;', compareLine: 2 },
        { kind: 'context', text: 'после', baseLine: 3, compareLine: 3 },
      ]),
    );

    expect(pieces('const a = 1;', result.lines[1]?.inlineRanges)).toEqual(['1']);
    expect(pieces('const a = 2;', result.lines[2]?.inlineRanges)).toEqual(['2']);
  });

  it('сопоставляет строки по порядку внутри блока', () => {
    const result = annotateHunkWithWordDiff(
      hunk([
        { kind: 'delete', text: 'первая = 1;', baseLine: 1 },
        { kind: 'delete', text: 'вторая = 2;', baseLine: 2 },
        { kind: 'insert', text: 'первая = 11;', compareLine: 1 },
        { kind: 'insert', text: 'вторая = 22;', compareLine: 2 },
      ]),
    );

    expect(pieces('первая = 11;', result.lines[2]?.inlineRanges)).toEqual(['11']);
    expect(pieces('вторая = 22;', result.lines[3]?.inlineRanges)).toEqual(['22']);
  });

  it('лишние строки блока оставляет без разметки', () => {
    const result = annotateHunkWithWordDiff(
      hunk([
        { kind: 'delete', text: 'x = 1;', baseLine: 1 },
        { kind: 'insert', text: 'x = 2;', compareLine: 1 },
        { kind: 'insert', text: 'y = 3;', compareLine: 2 },
      ]),
    );

    expect(result.lines[2]?.inlineRanges).toBeUndefined();
  });

  it('чистое добавление без удалений не размечает', () => {
    const result = annotateHunkWithWordDiff(
      hunk([
        { kind: 'context', text: 'до', baseLine: 1, compareLine: 1 },
        { kind: 'insert', text: 'новая строка', compareLine: 2 },
      ]),
    );

    expect(result.lines.every((line) => line.inlineRanges === undefined)).toBe(true);
  });

  it('не трогает исходный хунк', () => {
    const original = hunk([
      { kind: 'delete', text: 'a = 1;', baseLine: 1 },
      { kind: 'insert', text: 'a = 2;', compareLine: 1 },
    ]);
    annotateHunkWithWordDiff(original);

    expect(original.lines[0]?.inlineRanges).toBeUndefined();
  });
});
