import { useEffect, useRef, useState } from 'react';
import { detectTheme, highlightPatch, type PatchTokens, type SyntaxTheme } from '../syntax/highlighter';
import type { PatchState } from './usePatches';

/** Тема панели: VS Code меняет её на лету, подсветку надо пересчитывать. */
export function useSyntaxTheme(): SyntaxTheme {
  const [theme, setTheme] = useState<SyntaxTheme>(detectTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(detectTheme()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-kind'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * Токены подсветки для загруженных патчей.
 *
 * Считается асинхронно: до готовности строки показываются обычным текстом,
 * поэтому подсветка никогда не задерживает появление диффа.
 */
export function useSyntaxTokens(patches: ReadonlyMap<string, PatchState>, theme: SyntaxTheme) {
  const [tokens, setTokens] = useState<ReadonlyMap<string, PatchTokens>>(() => new Map());
  const highlighted = useRef<Set<string>>(new Set());
  // Смена темы обесценивает все посчитанные токены: цвета в них уже зашиты.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    highlighted.current = new Set();
    setTokens(new Map());
  }, [theme]);

  useEffect(() => {
    const current = generation.current;

    void (async () => {
      for (const [path, state] of patches) {
        if (generation.current !== current) {
          return;
        }
        if (state.status !== 'ready' || state.patch.binary || state.patch.hunks.length === 0) {
          continue;
        }
        if (highlighted.current.has(path)) {
          continue;
        }
        highlighted.current.add(path);

        const result = await highlightPatch(state.patch, theme);
        if (generation.current !== current) {
          return;
        }
        if (result !== undefined) {
          setTokens((previous) => new Map(previous).set(path, result));
        }
      }
    })();
  }, [patches, theme]);

  return tokens;
}
