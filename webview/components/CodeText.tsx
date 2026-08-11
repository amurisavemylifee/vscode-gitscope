import type { DiffLineKind, InlineRange } from '@shared/model';
import { buildCodeSegments } from '../diff/segments';
import type { LineTokens } from '../syntax/highlighter';

/** Флаги начертания из Shiki: 1 — курсив, 2 — жирный, 4 — подчёркивание. */
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

interface CodeTextProps {
  readonly text: string;
  readonly tokens?: LineTokens | undefined;
  /** Изменённые фрагменты внутри строки; есть только у строк диффа. */
  readonly ranges?: readonly InlineRange[] | undefined;
  readonly kind?: DiffLineKind;
}

/**
 * Текст строки кода: подсветка синтаксиса и словный diff одновременно.
 *
 * Пока токены не досчитались, строка показывается обычным текстом — подсветка
 * никогда не задерживает появление кода.
 */
export function CodeText({ text, tokens, ranges, kind = 'context' }: CodeTextProps) {
  const segments = buildCodeSegments(text, tokens, ranges);

  if (segments.length === 0) {
    return null;
  }

  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={segment.changed ? `gs-diff__changed gs-diff__changed--${kind}` : undefined}
          style={{
            ...(segment.color !== undefined ? { color: segment.color } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & ITALIC ? { fontStyle: 'italic' } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & BOLD ? { fontWeight: 'bold' } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & UNDERLINE
              ? { textDecoration: 'underline' }
              : {}),
          }}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}
