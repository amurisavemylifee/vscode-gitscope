import { useEffect, useState } from 'react';

const FALLBACK_LINE_HEIGHT = 19;
const LINE_HEIGHT_RATIO = 1.5;

/**
 * Высота строки кода в пикселях.
 *
 * Виртуализатору нужны точные высоты заранее, а редактор у каждого настроен
 * своим кеглем. Считаем от `--vscode-editor-font-size` и тут же прописываем
 * результат в CSS — так число в JS и реальная вёрстка не расходятся.
 *
 * `theme` в зависимостях не случаен: смена темы — самый частый момент, когда
 * VS Code переписывает свои переменные, включая размер шрифта.
 */
export function useCodeLineHeight(theme: string): number {
  const [lineHeight, setLineHeight] = useState(FALLBACK_LINE_HEIGHT);

  useEffect(() => {
    const measure = () => {
      const raw = getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-size');
      const fontSize = Number.parseFloat(raw);
      const next =
        Number.isFinite(fontSize) && fontSize > 0 ? Math.round(fontSize * LINE_HEIGHT_RATIO) : FALLBACK_LINE_HEIGHT;

      document.documentElement.style.setProperty('--gs-line-height-code', `${next}px`);
      setLineHeight(next);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [theme]);

  return lineHeight;
}
