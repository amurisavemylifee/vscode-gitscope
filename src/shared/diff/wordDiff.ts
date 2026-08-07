import type { DiffLine, Hunk, InlineRange } from '../model';

/**
 * Интра-строчный diff: какие именно куски строки изменились.
 *
 * git умеет `--word-diff`, но он ломает построчную структуру вывода, а она
 * нужна для нумерации строк и режима двух колонок. Поэтому считаем сами —
 * заодно алгоритм получается чистой функцией, которую легко проверить.
 */

/** Длиннее — не считаем: LCS квадратичный, а на минифицированном файле это заметно. */
const MAX_TOKENS = 400;

/** Ниже этого сходства строки считаются разными, и подсвечивать в них нечего. */
const MIN_SIMILARITY = 0.3;

export interface InlineDiff {
  readonly base: readonly InlineRange[];
  readonly compare: readonly InlineRange[];
}

interface Token {
  readonly text: string;
  readonly start: number;
}

/**
 * Разбивает строку на слова, пробелы и одиночные знаки препинания.
 *
 * Знаки отдельными токенами — иначе замена `foo(a)` на `foo(b)` подсветилась бы
 * целиком вместо одной буквы.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[\p{L}\p{N}_$]+|\s+|[^\p{L}\p{N}_$\s]/gu;

  for (const match of text.matchAll(pattern)) {
    tokens.push({ text: match[0], start: match.index });
  }
  return tokens;
}

/**
 * Склеивает соседние диапазоны.
 *
 * Через пробелы — тоже: в `три четыре` пробел совпадает с пробелом исходной
 * строки и по LCS считается неизменным, из-за чего подсветка разорвалась бы
 * надвое посреди одной правки.
 */
function mergeRanges(text: string, ranges: readonly InlineRange[]): InlineRange[] {
  const merged: InlineRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && text.slice(last.end, range.start).trim() === '') {
      merged[merged.length - 1] = { start: last.start, end: range.end };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * Считает, что изменилось между двумя строками.
 *
 * Возвращает `undefined`, если строки слишком непохожи или слишком длинны:
 * в обоих случаях честнее подсветить строку целиком, чем показать мозаику.
 */
export function computeInlineDiff(baseText: string, compareText: string): InlineDiff | undefined {
  if (baseText === compareText) {
    return { base: [], compare: [] };
  }

  const baseTokens = tokenize(baseText);
  const compareTokens = tokenize(compareText);
  if (baseTokens.length > MAX_TOKENS || compareTokens.length > MAX_TOKENS) {
    return undefined;
  }

  // Классический LCS по токенам.
  const rows = baseTokens.length;
  const columns = compareTokens.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      const row = table[i] as number[];
      const nextRow = table[i + 1] as number[];
      row[j] =
        baseTokens[i]?.text === compareTokens[j]?.text
          ? (nextRow[j + 1] as number) + 1
          : Math.max(nextRow[j] as number, row[j + 1] as number);
    }
  }

  const baseRanges: InlineRange[] = [];
  const compareRanges: InlineRange[] = [];
  let commonChars = 0;

  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    const baseToken = baseTokens[i] as Token;
    const compareToken = compareTokens[j] as Token;

    if (baseToken.text === compareToken.text) {
      commonChars += baseToken.text.length;
      i += 1;
      j += 1;
      continue;
    }
    if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      baseRanges.push({ start: baseToken.start, end: baseToken.start + baseToken.text.length });
      i += 1;
    } else {
      compareRanges.push({ start: compareToken.start, end: compareToken.start + compareToken.text.length });
      j += 1;
    }
  }
  for (; i < rows; i += 1) {
    const token = baseTokens[i] as Token;
    baseRanges.push({ start: token.start, end: token.start + token.text.length });
  }
  for (; j < columns; j += 1) {
    const token = compareTokens[j] as Token;
    compareRanges.push({ start: token.start, end: token.start + token.text.length });
  }

  const longest = Math.max(baseText.length, compareText.length);
  if (longest > 0 && commonChars / longest < MIN_SIMILARITY) {
    return undefined;
  }

  return { base: mergeRanges(baseText, baseRanges), compare: mergeRanges(compareText, compareRanges) };
}

/**
 * Проставляет хунку интра-строчную разметку.
 *
 * Пары ищутся внутри блока «подряд идущие удаления, затем подряд идущие
 * вставки»: первая удалённая строка сопоставляется с первой добавленной и так
 * далее. Именно так выглядит правка строки, ради которой всё и затевалось.
 */
export function annotateHunkWithWordDiff(hunk: Hunk): Hunk {
  const lines = [...hunk.lines];
  let index = 0;

  while (index < lines.length) {
    if (lines[index]?.kind !== 'delete') {
      index += 1;
      continue;
    }

    const deleteStart = index;
    while (lines[index]?.kind === 'delete') {
      index += 1;
    }
    const insertStart = index;
    while (lines[index]?.kind === 'insert') {
      index += 1;
    }

    const pairs = Math.min(insertStart - deleteStart, index - insertStart);
    for (let offset = 0; offset < pairs; offset += 1) {
      const removed = lines[deleteStart + offset] as DiffLine;
      const added = lines[insertStart + offset] as DiffLine;

      const inline = computeInlineDiff(removed.text, added.text);
      if (!inline || (inline.base.length === 0 && inline.compare.length === 0)) {
        continue;
      }
      lines[deleteStart + offset] = { ...removed, inlineRanges: inline.base };
      lines[insertStart + offset] = { ...added, inlineRanges: inline.compare };
    }
  }

  return { ...hunk, lines };
}
