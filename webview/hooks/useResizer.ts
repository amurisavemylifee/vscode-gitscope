import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Перетаскивание вертикальной границы между колонками панели.
 *
 * Слушатели вешаются на окно, а не на саму границу: полоса шириной в несколько
 * пикселей теряется под курсором на первом же резком движении, и перетаскивание
 * обрывается на середине.
 */
export function useResizer(
  current: number,
  onChange: (width: number) => void,
  min: number,
  max: number,
): (event: { readonly clientX: number }) => void {
  const width = useRef(current);
  width.current = current;

  const [origin, setOrigin] = useState<number | null>(null);

  useEffect(() => {
    if (origin === null) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const next = Math.min(max, Math.max(min, event.clientX - origin));
      if (next !== width.current) {
        onChange(next);
      }
    };
    const onUp = () => setOrigin(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    document.body.style.cursor = 'col-resize';
    // Пока тянем границу, выделение текста в панели только мешает.
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [origin, min, max, onChange]);

  // Отступ от левого края окна до колонки: без него панель, у которой слева
  // что-то есть, прыгает под курсор в момент захвата.
  return useCallback((event: { readonly clientX: number }) => setOrigin(event.clientX - width.current), []);
}
