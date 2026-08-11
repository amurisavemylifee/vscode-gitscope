import { useEffect, useState } from 'react';
import type { FileVersion } from '@shared/historyModel';
import type { FilePatch } from '@shared/model';
import {
  highlightLines,
  highlightPatch,
  type LineTokens,
  type PatchTokens,
  type SyntaxTheme,
} from '../../syntax/highlighter';

/**
 * Предел, после которого подсветка отключается.
 *
 * Токенизация идёт одним куском, и на файле в сотню тысяч строк она заняла бы
 * секунды, всё это время держа поток webview. Без подсветки такой файл всё
 * равно читается, а вот подвисшая панель — нет.
 */
const MAX_HIGHLIGHT_LINES = 20_000;

/** Подсветка файла целиком. `undefined` — ещё не готова или не нужна. */
export function useContentTokens(
  version: FileVersion | undefined,
  theme: SyntaxTheme,
): readonly LineTokens[] | undefined {
  const [tokens, setTokens] = useState<readonly LineTokens[] | undefined>(undefined);

  useEffect(() => {
    setTokens(undefined);
    if (!version || version.binary || version.lines.length === 0 || version.lines.length > MAX_HIGHLIGHT_LINES) {
      return;
    }

    let cancelled = false;
    void highlightLines(version.path, version.lines, theme)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [version, theme]);

  return tokens;
}

/** Подсветка строк патча. */
export function usePatchTokens(patch: FilePatch | undefined, theme: SyntaxTheme): PatchTokens | undefined {
  const [tokens, setTokens] = useState<PatchTokens | undefined>(undefined);

  useEffect(() => {
    setTokens(undefined);
    if (!patch || patch.binary || patch.hunks.length === 0) {
      return;
    }

    let cancelled = false;
    void highlightPatch(patch, theme)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [patch, theme]);

  return tokens;
}
