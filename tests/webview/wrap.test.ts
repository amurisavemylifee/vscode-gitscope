import { describe, expect, it } from 'vitest';
import { displayWidth, visualLines } from '../../webview/diff/wrap';

describe('displayWidth', () => {
  it('считает обычный текст по символам', () => {
    expect(displayWidth('const x = 1;')).toBe(12);
  });

  it('дотягивает табуляцию до следующей отметки', () => {
    expect(displayWidth('\ta')).toBe(5);
    expect(displayWidth('ab\tc')).toBe(5);
    expect(displayWidth('abcd\te')).toBe(9);
  });

  it('не считает хвостовые пробелы: при переносе они повисают за краем', () => {
    expect(displayWidth('код   ')).toBe(3);
    expect(displayWidth('код\t')).toBe(3);
    expect(displayWidth('  отступ слева')).toBe(14);
  });

  it('иероглифы и знаки полной ширины занимают две колонки', () => {
    expect(displayWidth('日本語')).toBe(6);
    expect(displayWidth('한글')).toBe(4);
    expect(displayWidth('ＡＢ')).toBe(4);
  });

  it('кириллица остаётся в одну колонку', () => {
    expect(displayWidth('значение')).toBe(8);
  });
});

describe('visualLines', () => {
  it('короткая строка занимает одну', () => {
    expect(visualLines('a'.repeat(20), 20)).toBe(1);
  });

  it('на символ длиннее — уже две', () => {
    expect(visualLines('a'.repeat(21), 20)).toBe(2);
  });

  it('делит длинную строку по ширине, а не по словам', () => {
    expect(visualLines('a'.repeat(100), 20)).toBe(5);
    expect(visualLines('a'.repeat(101), 20)).toBe(6);
  });

  it('пустая строка всё равно занимает строку', () => {
    expect(visualLines('', 20)).toBe(1);
  });

  it('без ширины не делится: иначе высота ушла бы в бесконечность', () => {
    expect(visualLines('a'.repeat(100), 0)).toBe(1);
  });
});
