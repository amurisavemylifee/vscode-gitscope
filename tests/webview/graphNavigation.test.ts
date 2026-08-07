import { describe, expect, it } from 'vitest';
import { nextSelectedIndex } from '../../webview/graph/navigation';

const COUNT = 100;

describe('nextSelectedIndex', () => {
  it('стрелки двигают выделение на строку', () => {
    expect(nextSelectedIndex('ArrowDown', 5, COUNT)).toBe(6);
    expect(nextSelectedIndex('ArrowUp', 5, COUNT)).toBe(4);
  });

  it('из «ничего не выбрано» любая стрелка приводит к первой строке', () => {
    expect(nextSelectedIndex('ArrowDown', -1, COUNT)).toBe(0);
    expect(nextSelectedIndex('ArrowUp', -1, COUNT)).toBe(0);
    expect(nextSelectedIndex('PageUp', -1, COUNT)).toBe(0);
  });

  it('не уезжает за границы списка', () => {
    expect(nextSelectedIndex('ArrowUp', 0, COUNT)).toBe(0);
    expect(nextSelectedIndex('ArrowDown', COUNT - 1, COUNT)).toBe(COUNT - 1);
    expect(nextSelectedIndex('PageDown', COUNT - 2, COUNT)).toBe(COUNT - 1);
    expect(nextSelectedIndex('PageUp', 1, COUNT)).toBe(0);
  });

  it('Home и End прыгают на края', () => {
    expect(nextSelectedIndex('Home', 42, COUNT)).toBe(0);
    expect(nextSelectedIndex('End', 42, COUNT)).toBe(COUNT - 1);
  });

  it('страницами двигает крупнее, чем стрелками', () => {
    const byArrow = nextSelectedIndex('ArrowDown', 10, COUNT) ?? 0;
    const byPage = nextSelectedIndex('PageDown', 10, COUNT) ?? 0;

    expect(byPage).toBeGreaterThan(byArrow);
  });

  it('чужие клавиши не перехватываются', () => {
    expect(nextSelectedIndex('Enter', 5, COUNT)).toBeNull();
    expect(nextSelectedIndex('a', 5, COUNT)).toBeNull();
    expect(nextSelectedIndex('Tab', 5, COUNT)).toBeNull();
  });

  it('на пустом графе навигации нет', () => {
    expect(nextSelectedIndex('ArrowDown', -1, 0)).toBeNull();
    expect(nextSelectedIndex('Home', -1, 0)).toBeNull();
  });
});
