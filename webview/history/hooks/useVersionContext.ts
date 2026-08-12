import { useCallback, useEffect, useState } from 'react';
import type { ContextLine } from '../../diff/rows';
import { highlightLines, type SyntaxTheme } from '../../syntax/highlighter';
import { bridge } from '../api/bridge';
import type { VersionContext } from '../rows';

/**
 * Строки версий, подгруженные по кнопке разворачивания.
 *
 * Хранятся по номеру строки, как и в панели сравнения: соседние развороты
 * склеиваются сами собой, а сборщик строк просто спрашивает, есть ли уже нужная
 * строка, и рисует кнопку только на оставшиеся промежутки. Ключ верхней карты —
 * версия: у каждой свой файл, и путать их строки нельзя.
 */
export function useVersionContext(historyKey: string, theme: SyntaxTheme) {
  const [context, setContext] = useState<ReadonlyMap<string, VersionContext>>(() => new Map());

  // Другой файл или перечитанная история — другие версии; смена темы
  // обесценивает подсветку.
  useEffect(() => {
    setContext(new Map());
  }, [historyKey, theme]);

  const expand = useCallback(
    (entryId: string, path: string, startLine: number, endLine: number) => {
      void (async () => {
        const lines = await bridge
          .request('history/context', { entryId, startLine, endLine })
          .catch(() => undefined);
        if (!lines) {
          return;
        }

        const tokens = await highlightLines(path, lines, theme).catch(() => undefined);

        setContext((previous) => {
          const next = new Map(previous);
          const forEntry = new Map(next.get(entryId) ?? []);
          lines.forEach((text, offset) => {
            const line: ContextLine = tokens?.[offset] ? { text, tokens: tokens[offset] } : { text };
            forEntry.set(startLine + offset, line);
          });
          next.set(entryId, forEntry);
          return next;
        });
      })();
    },
    [theme],
  );

  /** Свернуть всё развёрнутое у версии — обратный ход кнопки «показать файл целиком». */
  const collapse = useCallback((entryId: string) => {
    setContext((previous) => {
      if (!previous.has(entryId)) {
        return previous;
      }
      const next = new Map(previous);
      next.delete(entryId);
      return next;
    });
  }, []);

  return { context, expand, collapse };
}
