import { describe, expect, it } from 'vitest';
import { buildCodeSegments } from '../../webview/diff/segments';
import type { LineTokens } from '../../webview/syntax/highlighter';

/** Токены Shiki, из которых важны только текст и цвет. */
const tokens = (...pairs: [string, string][]): LineTokens =>
  pairs.map(([content, color], index) => ({ content, color, offset: index }));

const outline = (segments: ReturnType<typeof buildCodeSegments>) =>
  segments.map((segment) => `${segment.text}${segment.changed ? '*' : ''}`);

describe('buildCodeSegments', () => {
  it('без подсветки и без правок отдаёт строку целиком', () => {
    expect(buildCodeSegments('просто текст', undefined, undefined)).toEqual([
      { text: 'просто текст', changed: false },
    ]);
  });

  it('сохраняет цвета токенов', () => {
    const segments = buildCodeSegments('const x', tokens(['const', '#569CD6'], [' x', '#D4D4D4']), undefined);

    expect(segments).toEqual([
      { text: 'const', color: '#569CD6', changed: false },
      { text: ' x', color: '#D4D4D4', changed: false },
    ]);
  });

  it('помечает изменённый диапазон, когда подсветки нет', () => {
    const segments = buildCodeSegments('const x = 42;', undefined, [{ start: 10, end: 12 }]);

    expect(outline(segments)).toEqual(['const x = ', '42*', ';']);
  });

  it('режет токен подсветки по границе изменённого диапазона', () => {
    // Токен `= 42;` шире правки: без разрезания пришлось бы выбирать между
    // подсветкой синтаксиса и подсветкой правки.
    const segments = buildCodeSegments('x = 42;', tokens(['x ', '#9CDCFE'], ['= 42;', '#D4D4D4']), [
      { start: 4, end: 6 },
    ]);

    expect(outline(segments)).toEqual(['x ', '= ', '42*', ';']);
    expect(segments.every((segment) => segment.color !== undefined)).toBe(true);
    expect(segments[2]?.color).toBe('#D4D4D4');
  });

  it('обрабатывает несколько изменённых диапазонов', () => {
    const segments = buildCodeSegments('a b c', undefined, [
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ]);

    expect(outline(segments)).toEqual(['a*', ' b ', 'c*']);
  });

  it('не выходит за границы строки, если диапазон оказался длиннее', () => {
    const segments = buildCodeSegments('коротко', undefined, [{ start: 0, end: 999 }]);

    expect(outline(segments)).toEqual(['коротко*']);
  });

  it('пустую строку не превращает ни во что', () => {
    expect(buildCodeSegments('', undefined, undefined)).toEqual([]);
  });

  it('работает с кириллицей', () => {
    const segments = buildCodeSegments('имя = "старое"', undefined, [{ start: 7, end: 13 }]);

    expect(outline(segments)).toEqual(['имя = "', 'старое*', '"']);
  });
});
