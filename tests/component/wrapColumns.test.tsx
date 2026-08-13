import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWrapColumns } from '../../webview/hooks/useWrapColumns';

/** Область прокрутки с заданной шириной: в jsdom у элементов своих размеров нет. */
const canvas = (clientWidth: number) => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: clientWidth });
  return element;
};

// Ширину символа в jsdom померить нечем, и хук берёт запасные 8px. Отсюда и
// ожидания: (ширина / половин − жёлоб − отступ − запас) / 8.
const UNIFIED = { gutter: 110, halves: 1 };
const SPLIT = { gutter: 64, halves: 2 };

describe('useWrapColumns', () => {
  it('считает колонки по ширине области', async () => {
    const { result } = renderHook(() => useWrapColumns(canvas(600), UNIFIED, 'dark-plus'));

    await waitFor(() => expect(result.current).toBe(59));
  });

  it('в двух колонках делит ширину пополам', async () => {
    const { result } = renderHook(() => useWrapColumns(canvas(600), SPLIT, 'dark-plus'));

    await waitFor(() => expect(result.current).toBe(27));
  });

  // Панель истории заводит замер раньше, чем появляется сама область: пока она
  // ждёт ответа хоста, канвы в разметке нет. Замер должен случиться, когда она
  // появится, — иначе перенос остаётся по наименьшей ширине до первой смены
  // раскладки.
  it('меряет область, появившуюся позже первого рендера', async () => {
    const { result, rerender } = renderHook(
      ({ element }: { element: HTMLElement | null }) => useWrapColumns(element, UNIFIED, 'dark-plus'),
      { initialProps: { element: null as HTMLElement | null } },
    );

    expect(result.current).toBe(20);

    rerender({ element: canvas(900) });

    await waitFor(() => expect(result.current).toBe(96));
  });

  it('на узкой области не сходится уже двадцати символов', async () => {
    const { result } = renderHook(() => useWrapColumns(canvas(200), UNIFIED, 'dark-plus'));

    await waitFor(() => expect(result.current).toBe(20));
  });
});
