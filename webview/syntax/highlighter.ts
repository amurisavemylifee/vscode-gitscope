import { createHighlighterCore, type HighlighterCore, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { FilePatch } from '@shared/model';
import { languageForPath, languageLoader } from './languages';

export type SyntaxTheme = 'dark-plus' | 'light-plus';

/** Токены строки; пустой массив — строка есть, но подсвечивать нечего. */
export type LineTokens = readonly ThemedToken[];

/** `hunks[индекс хунка][индекс строки в хунке]`. */
export interface PatchTokens {
  readonly hunks: readonly (readonly LineTokens[])[];
}

/**
 * Подсветка синтаксиса для панели.
 *
 * Движок — JavaScript, а не Oniguruma на WebAssembly: WASM потребовал бы
 * ослабить CSP до `wasm-unsafe-eval`, а разница в качестве подсветки на
 * обычном коде незаметна. Грамматики подгружаются по одной, только для тех
 * языков, что реально встретились в сравнении.
 *
 * Темы — `dark-plus` и `light-plus`: это встроенные темы самого VS Code,
 * поэтому подсвеченный код в панели выглядит так же, как в редакторе.
 */
let highlighterPromise: Promise<HighlighterCore> | undefined;
const loadedLanguages = new Set<string>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('shiki/themes/dark-plus.mjs'), import('shiki/themes/light-plus.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

/** Определяет тему по классу, который VS Code вешает на документ панели. */
export function detectTheme(): SyntaxTheme {
  const kind = document.body.dataset['vscodeThemeKind'] ?? '';
  return kind.includes('light') ? 'light-plus' : 'dark-plus';
}

/**
 * Подсвечивает патч.
 *
 * Каждый хунк токенизируется двумя кусками — базовой и сравниваемой сторонами
 * целиком, а не построчно. Это важно для многострочных конструкций:
 * построчная подсветка разваливает блочные комментарии и шаблонные строки.
 */
/** Готовит токенизатор для языка файла. `undefined` — язык вне списка поддерживаемых. */
async function prepareTokenizer(
  path: string,
  theme: SyntaxTheme,
): Promise<((lines: readonly string[]) => LineTokens[]) | undefined> {
  const language = languageForPath(path);
  const loader = language === undefined ? undefined : languageLoader(language);
  if (language === undefined || loader === undefined) {
    return undefined;
  }

  const highlighter = await getHighlighter();
  if (!loadedLanguages.has(language)) {
    await highlighter.loadLanguage(loader as Parameters<HighlighterCore['loadLanguage']>[0]);
    loadedLanguages.add(language);
  }

  return (lines) => {
    if (lines.length === 0) {
      return [];
    }
    const { tokens } = highlighter.codeToTokens(lines.join('\n'), { lang: language, theme });
    // Длина обязана совпасть со списком строк: по ней идёт выравнивание.
    return lines.map((_, index) => tokens[index] ?? []);
  };
}

/** Подсветка для строк, подгруженных при разворачивании контекста. */
export async function highlightLines(
  path: string,
  lines: readonly string[],
  theme: SyntaxTheme,
): Promise<LineTokens[] | undefined> {
  const tokenize = await prepareTokenizer(path, theme);
  return tokenize?.(lines);
}

export async function highlightPatch(patch: FilePatch, theme: SyntaxTheme): Promise<PatchTokens | undefined> {
  const tokenize = await prepareTokenizer(patch.path, theme);
  if (tokenize === undefined) {
    return undefined;
  }

  return {
    hunks: patch.hunks.map((hunk) => {
      const baseLines: string[] = [];
      const compareLines: string[] = [];
      const positions = hunk.lines.map((line) => {
        if (line.kind === 'delete') {
          return { side: 'base' as const, index: baseLines.push(line.text) - 1 };
        }
        if (line.kind === 'insert') {
          return { side: 'compare' as const, index: compareLines.push(line.text) - 1 };
        }
        baseLines.push(line.text);
        return { side: 'compare' as const, index: compareLines.push(line.text) - 1 };
      });

      const baseTokens = tokenize(baseLines);
      const compareTokens = tokenize(compareLines);

      return positions.map(({ side, index }) => (side === 'base' ? baseTokens[index] : compareTokens[index]) ?? []);
    }),
  };
}
