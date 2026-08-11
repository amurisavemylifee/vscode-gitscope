/** На сколько версий прыгает PageUp/PageDown. */
const PAGE_STEP = 10;

/**
 * Куда переехать выделению по нажатой клавише.
 *
 * Вынесено из компонента отдельной функцией, потому что список версий
 * виртуализован: в jsdom он не рисует ни одной строки, и проверить навигацию
 * через клики по разметке невозможно.
 *
 * `undefined` — клавиша не про навигацию, обработчик не должен её перехватывать.
 */
export function nextSelectedIndex(current: number, key: string, count: number): number | undefined {
  if (count === 0) {
    return undefined;
  }

  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index));

  switch (key) {
    case 'ArrowDown':
      return clamp(current + 1);
    case 'ArrowUp':
      return clamp(current - 1);
    case 'PageDown':
      return clamp(current + PAGE_STEP);
    case 'PageUp':
      return clamp(current - PAGE_STEP);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}
