import type { InlineRange } from '@shared/model';
import type { LineTokens } from '../syntax/highlighter';

export interface CodeSegment {
  readonly text: string;
  readonly color?: string;
  readonly fontStyle?: number;
  /** Кусок попал в изменённый диапазон — рисуется с более плотной подложкой. */
  readonly changed: boolean;
}

/**
 * Сводит воедино два независимых разбиения одной и той же строки: токены
 * подсветки от Shiki и диапазоны словного diff.
 *
 * Оба описывают отрезки одного текста, но границы у них не совпадают, поэтому
 * токены приходится резать по границам диапазонов. Без этого пришлось бы
 * выбирать между подсветкой синтаксиса и подсветкой правки.
 */
export function buildCodeSegments(
  text: string,
  tokens: LineTokens | undefined,
  ranges: readonly InlineRange[] | undefined,
): CodeSegment[] {
  const hasRanges = ranges !== undefined && ranges.length > 0;
  const hasTokens = tokens !== undefined && tokens.length > 0;

  if (!hasRanges && !hasTokens) {
    return text === '' ? [] : [{ text, changed: false }];
  }

  // Границы: концы токенов и концы диапазонов.
  const boundaries = new Set<number>([0, text.length]);
  let offset = 0;
  if (hasTokens) {
    for (const token of tokens) {
      offset += token.content.length;
      boundaries.add(Math.min(offset, text.length));
    }
  }
  if (hasRanges) {
    for (const range of ranges) {
      boundaries.add(Math.min(range.start, text.length));
      boundaries.add(Math.min(range.end, text.length));
    }
  }

  const points = [...boundaries].sort((left, right) => left - right);
  const segments: CodeSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] as number;
    const end = points[index + 1] as number;
    if (start >= end) {
      continue;
    }

    const token = hasTokens ? tokenAt(tokens, start) : undefined;
    segments.push({
      text: text.slice(start, end),
      ...(token?.color !== undefined ? { color: token.color } : {}),
      ...(token?.fontStyle !== undefined ? { fontStyle: token.fontStyle } : {}),
      changed: hasRanges ? ranges.some((range) => start >= range.start && end <= range.end) : false,
    });
  }

  return segments;
}

function tokenAt(tokens: LineTokens, position: number) {
  let offset = 0;
  for (const token of tokens) {
    const end = offset + token.content.length;
    if (position < end) {
      return token;
    }
    offset = end;
  }
  return tokens[tokens.length - 1];
}
