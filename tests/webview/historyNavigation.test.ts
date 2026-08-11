import { describe, expect, it } from 'vitest';
import { nextSelectedIndex } from '../../webview/history/navigation';

describe('nextSelectedIndex', () => {
  it('стрелки двигают выделение на соседнюю версию', () => {
    expect(nextSelectedIndex(2, 'ArrowDown', 10)).toBe(3);
    expect(nextSelectedIndex(2, 'ArrowUp', 10)).toBe(1);
  });

  it('на краях списка выделение упирается, а не перескакивает', () => {
    expect(nextSelectedIndex(0, 'ArrowUp', 10)).toBe(0);
    expect(nextSelectedIndex(9, 'ArrowDown', 10)).toBe(9);
  });

  it('PageUp и PageDown прыгают через десяток версий и тоже упираются', () => {
    expect(nextSelectedIndex(0, 'PageDown', 100)).toBe(10);
    expect(nextSelectedIndex(95, 'PageDown', 100)).toBe(99);
    expect(nextSelectedIndex(15, 'PageUp', 100)).toBe(5);
    expect(nextSelectedIndex(3, 'PageUp', 100)).toBe(0);
  });

  it('Home и End уводят к краям списка', () => {
    expect(nextSelectedIndex(5, 'Home', 10)).toBe(0);
    expect(nextSelectedIndex(5, 'End', 10)).toBe(9);
  });

  it('остальные клавиши не перехватываются', () => {
    expect(nextSelectedIndex(0, 'a', 10)).toBeUndefined();
    expect(nextSelectedIndex(0, 'Enter', 10)).toBeUndefined();
    expect(nextSelectedIndex(0, 'ArrowLeft', 10)).toBeUndefined();
  });

  it('в пустом списке двигать нечего', () => {
    expect(nextSelectedIndex(0, 'ArrowDown', 0)).toBeUndefined();
    expect(nextSelectedIndex(0, 'End', 0)).toBeUndefined();
  });
});
