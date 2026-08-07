/** На сколько строк прыгают PageUp и PageDown. */
const PAGE_SIZE = 15;

/**
 * Куда переместить выделение по нажатой клавише.
 *
 * `null` означает «клавиша не наша» — вызывающий не должен гасить событие, иначе
 * из графа нельзя будет уйти табом и перестанут работать горячие клавиши редактора.
 *
 * `current === -1` значит «ничего не выбрано»: тогда любая навигация приводит к
 * краю списка, а не проваливается.
 */
export function nextSelectedIndex(key: string, current: number, count: number): number | null {
  if (count === 0) {
    return null;
  }

  const clamp = (index: number) => Math.min(count - 1, Math.max(0, index));

  switch (key) {
    case 'ArrowDown':
      return clamp(current + 1);
    case 'ArrowUp':
      // Из «ничего не выбрано» вверх — к первой строке, а не к последней:
      // список читается сверху вниз, и первый Arrow должен показать начало.
      return current <= 0 ? 0 : clamp(current - 1);
    case 'PageDown':
      return clamp(current + PAGE_SIZE);
    case 'PageUp':
      return current <= 0 ? 0 : clamp(current - PAGE_SIZE);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
