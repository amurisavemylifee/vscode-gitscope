import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FilePatch } from '@shared/model';

const request = vi.fn();
const on = vi.fn(() => () => undefined);

// bridge зовёт acquireVsCodeApi при импорте — вне webview его не существует.
vi.mock('../../webview/api/bridge', () => ({
  bridge: { request, on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

vi.mock('../../webview/syntax/highlighter', () => ({
  highlightLines: vi.fn(async () => undefined),
  highlightPatch: vi.fn(async () => undefined),
  detectTheme: () => 'dark-plus',
}));

const { usePatches } = await import('../../webview/hooks/usePatches');
const { useExpandedContext } = await import('../../webview/hooks/useExpandedContext');

const patch = (path: string, longestLine = 'x'): FilePatch => ({
  path,
  status: 'modified',
  binary: false,
  truncated: false,
  hunks: [
    {
      baseStart: 1,
      baseCount: 1,
      compareStart: 1,
      compareCount: 1,
      header: '',
      lines: [{ kind: 'context', text: longestLine, baseLine: 1, compareLine: 1 }],
    },
  ],
});

describe('usePatches', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('запрашивает патч один раз, сколько бы раз его ни попросили', async () => {
    request.mockResolvedValue(patch('a.ts'));
    const { result } = renderHook(() => usePatches('base..compare'));

    act(() => {
      result.current.requestPatch('a.ts');
      result.current.requestPatch('a.ts');
      result.current.requestPatch('a.ts');
    });

    await waitFor(() => expect(result.current.patches.get('a.ts')?.status).toBe('ready'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('после ошибки разрешает повторить запрос', async () => {
    request.mockRejectedValueOnce(new Error('git сломался')).mockResolvedValueOnce(patch('a.ts'));
    const { result } = renderHook(() => usePatches('base..compare'));

    act(() => result.current.requestPatch('a.ts'));
    await waitFor(() => expect(result.current.patches.get('a.ts')).toMatchObject({ status: 'failed' }));

    act(() => result.current.requestPatch('a.ts'));
    await waitFor(() => expect(result.current.patches.get('a.ts')?.status).toBe('ready'));
  });

  it('запоминает длину самой длинной строки — по ней выравниваются колонки', async () => {
    request.mockResolvedValue(patch('a.ts', 'x'.repeat(137)));
    const { result } = renderHook(() => usePatches('base..compare'));

    act(() => result.current.requestPatch('a.ts'));

    await waitFor(() => expect(result.current.maxLineLength).toBe(137));
  });

  it('при смене сравнения сбрасывает всё загруженное', async () => {
    request.mockResolvedValue(patch('a.ts'));
    const { result, rerender } = renderHook(({ key }) => usePatches(key), {
      initialProps: { key: 'первое' },
    });

    act(() => result.current.requestPatch('a.ts'));
    await waitFor(() => expect(result.current.patches.size).toBe(1));

    rerender({ key: 'второе' });

    await waitFor(() => expect(result.current.patches.size).toBe(0));
    expect(result.current.maxLineLength).toBe(0);
  });
});

describe('useExpandedContext', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('складывает подгруженные строки по их номерам', async () => {
    request.mockResolvedValue(['восьмая', 'девятая']);
    const { result } = renderHook(() => useExpandedContext('base..compare', 'dark-plus'));

    act(() => result.current.expandContext('a.ts', 8, 9));

    await waitFor(() => expect(result.current.context.get('a.ts')?.size).toBe(2));
    expect(result.current.context.get('a.ts')?.get(8)).toEqual({ text: 'восьмая' });
    expect(result.current.context.get('a.ts')?.get(9)).toEqual({ text: 'девятая' });
  });

  it('соседние развороты складываются в один набор строк', async () => {
    request.mockResolvedValueOnce(['первая']).mockResolvedValueOnce(['вторая']);
    const { result } = renderHook(() => useExpandedContext('base..compare', 'dark-plus'));

    act(() => result.current.expandContext('a.ts', 1, 1));
    await waitFor(() => expect(result.current.context.get('a.ts')?.size).toBe(1));

    act(() => result.current.expandContext('a.ts', 2, 2));
    await waitFor(() => expect(result.current.context.get('a.ts')?.size).toBe(2));
  });

  it('ошибку загрузки переживает молча — кнопка просто останется на месте', async () => {
    request.mockRejectedValue(new Error('нет такого файла'));
    const { result } = renderHook(() => useExpandedContext('base..compare', 'dark-plus'));

    act(() => result.current.expandContext('a.ts', 1, 5));

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(result.current.context.size).toBe(0);
  });

  it('смена сравнения обнуляет подгруженный контекст', async () => {
    request.mockResolvedValue(['строка']);
    const { result, rerender } = renderHook(({ key }) => useExpandedContext(key, 'dark-plus'), {
      initialProps: { key: 'первое' },
    });

    act(() => result.current.expandContext('a.ts', 1, 1));
    await waitFor(() => expect(result.current.context.size).toBe(1));

    rerender({ key: 'второе' });

    await waitFor(() => expect(result.current.context.size).toBe(0));
  });
});
