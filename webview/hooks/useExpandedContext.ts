import { useCallback, useEffect, useState } from 'react';
import { bridge } from '../api/bridge';
import type { ContextLine, ContextStore } from '../diff/rows';
import { highlightLines, type SyntaxTheme } from '../syntax/highlighter';

/**
 * Строки файлов, подгруженные по кнопке «развернуть».
 *
 * Хранятся по номеру строки на стороне compare: так соседние развороты
 * склеиваются сами собой, а сборщик строк просто спрашивает, есть ли уже
 * нужная строка, и рисует кнопку только на оставшиеся промежутки.
 */
export function useExpandedContext(comparisonKey: string, theme: SyntaxTheme) {
  const [context, setContext] = useState<ContextStore>(() => new Map());

  // Другое сравнение — другие файлы; и смена темы обесценивает подсветку.
  useEffect(() => {
    setContext(new Map());
  }, [comparisonKey, theme]);

  const expandContext = useCallback(
    (path: string, startLine: number, endLine: number) => {
      void (async () => {
        const lines = await bridge
          .request('comparison/context', { path, side: 'compare', startLine, endLine })
          .catch(() => undefined);
        if (!lines) {
          return;
        }

        const tokens = await highlightLines(path, lines, theme).catch(() => undefined);

        setContext((previous) => {
          const next = new Map(previous);
          const forFile = new Map(next.get(path) ?? []);
          lines.forEach((text, offset) => {
            const line: ContextLine = tokens?.[offset] ? { text, tokens: tokens[offset] } : { text };
            forFile.set(startLine + offset, line);
          });
          next.set(path, forFile);
          return next;
        });
      })();
    },
    [theme],
  );

  return { context, expandContext };
}
