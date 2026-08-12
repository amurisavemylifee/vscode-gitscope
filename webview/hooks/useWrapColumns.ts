import { useEffect, useState, type RefObject } from 'react';
import { CELL_EPSILON, CODE_PADDING } from '../diff/wrap';

/** Уже — не бывает: на совсем узкой панели код лучше обрезать прокруткой, чем ронять в столбик. */
const MIN_COLUMNS = 20;
/** Ширина символа, если мерить нечем: в jsdom у элементов нет размеров. */
const FALLBACK_CHAR_WIDTH = 8;
/** По скольким символам мерить ширину одного: на длинной пробе дробная часть точнее. */
const SAMPLE = 100;

interface WrapMetrics {
  /** Ширина жёлоба слева от кода в пикселях. */
  readonly gutter: number;
  /** На сколько половин делится строка: две колонки делят ширину пополам. */
  readonly halves: number;
}

/**
 * Сколько символов кода помещается в строку.
 *
 * Это число — единственная общая мера переноса: по нему канва задаёт ширину
 * ячейки кода, а расчёт высоты строки считает, на сколько кусков разъедется
 * текст. Поэтому неточность в жёлобе или отступе ничего не ломает: она лишь
 * оставит у правого края немного воздуха.
 *
 * `theme` в зависимостях не случаен: вместе с темой VS Code меняет размер
 * шрифта редактора, а с ним и ширину символа.
 */
export function useWrapColumns(ref: RefObject<HTMLElement | null>, { gutter, halves }: WrapMetrics, theme: string) {
  const [columns, setColumns] = useState(MIN_COLUMNS);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const measure = () => {
      // clientWidth — уже без вертикальной полосы прокрутки: код не должен
      // затекать под неё.
      const available = element.clientWidth / halves - gutter - CODE_PADDING - CELL_EPSILON;
      setColumns(Math.max(MIN_COLUMNS, Math.floor(available / measureCharWidth())));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, gutter, halves, theme]);

  return columns;
}

/** Ширина символа кода. Меряем настоящим шрифтом: тем же, каким рисуются строки. */
function measureCharWidth(): number {
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;font-family:var(--gs-font-code);font-size:var(--gs-font-size-code)';
  probe.textContent = '0'.repeat(SAMPLE);

  document.body.append(probe);
  const width = probe.getBoundingClientRect().width / SAMPLE;
  probe.remove();

  return width > 0 ? width : FALLBACK_CHAR_WIDTH;
}
