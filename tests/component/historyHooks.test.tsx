import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FileVersion } from '@shared/historyModel';

const request = vi.fn();
const on = vi.fn(() => () => undefined);

// bridge зовёт acquireVsCodeApi при импорте — вне webview его не существует.
vi.mock('../../webview/history/api/bridge', () => ({
  bridge: { request, on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

const { useVersions } = await import('../../webview/history/hooks/useVersions');
const { useResizer } = await import('../../webview/hooks/useResizer');

const version = (entryId: string): FileVersion => ({
  entryId,
  path: 'src/app.ts',
  lines: ['одна'],
  truncated: false,
  binary: false,
  missing: false,
  bytes: 4,
});

describe('useVersions', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('запрашивает содержимое версии один раз и запоминает его', async () => {
    request.mockResolvedValue(version('a'));
    const { result } = renderHook(() => useVersions('файл', 3));

    act(() => result.current.requestVersion('a'));
    await waitFor(() => expect(result.current.versions.get('a')?.status).toBe('ready'));

    act(() => result.current.requestVersion('a'));

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('history/version', { entryId: 'a' });
  });

  it('до ответа держит версию в состоянии загрузки', () => {
    request.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useVersions('файл', 3));

    act(() => result.current.requestVersion('a'));

    expect(result.current.versions.get('a')).toEqual({ status: 'loading' });
  });

  it('патч и содержимое живут по отдельности, не мешая друг другу', async () => {
    request.mockImplementation((method: string) =>
      Promise.resolve(method === 'history/version' ? version('a') : { path: 'src/app.ts', hunks: [] }),
    );
    const { result } = renderHook(() => useVersions('файл', 3));

    act(() => {
      result.current.requestVersion('a');
      result.current.requestPatch('a');
    });

    await waitFor(() => {
      expect(result.current.versions.get('a')?.status).toBe('ready');
      expect(result.current.patches.get('a')?.status).toBe('ready');
    });
  });

  it('после неудачи разрешает повторить запрос', async () => {
    request.mockRejectedValueOnce(new Error('канал закрыт'));
    const { result } = renderHook(() => useVersions('файл', 3));

    act(() => result.current.requestVersion('a'));
    await waitFor(() => expect(result.current.versions.get('a')).toEqual({ status: 'failed', message: 'канал закрыт' }));

    request.mockResolvedValue(version('a'));
    act(() => result.current.requestVersion('a'));

    await waitFor(() => expect(result.current.versions.get('a')?.status).toBe('ready'));
  });

  it('смена файла обесценивает всё загруженное', async () => {
    request.mockResolvedValue(version('a'));
    const { result, rerender } = renderHook(({ key }) => useVersions(key, 3), {
      initialProps: { key: 'первый' },
    });

    act(() => result.current.requestVersion('a'));
    await waitFor(() => expect(result.current.versions.size).toBe(1));

    rerender({ key: 'второй' });

    expect(result.current.versions.size).toBe(0);
    expect(result.current.patches.size).toBe(0);
  });

  it('другое число строк контекста обесценивает только патчи', async () => {
    request.mockResolvedValue(version('a'));
    const { result, rerender } = renderHook(({ context }) => useVersions('файл', context), {
      initialProps: { context: 3 },
    });

    act(() => {
      result.current.requestVersion('a');
      result.current.requestPatch('a');
    });
    await waitFor(() => expect(result.current.patches.size).toBe(1));

    rerender({ context: 10 });

    expect(result.current.patches.size).toBe(0);
    expect(result.current.versions.size).toBe(1);
  });
});

describe('useResizer', () => {
  const drag = (clientX: number) => {
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
    });
  };

  it('двигает границу за курсором, сохраняя место захвата', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useResizer(300, onChange, 100, 500));

    // Захват за середину полосы: ширина не должна прыгнуть под курсор.
    act(() => result.current({ clientX: 310 }));
    drag(360);

    expect(onChange).toHaveBeenCalledWith(350);
  });

  it('не выпускает границу за отведённые пределы', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useResizer(300, onChange, 100, 500));

    act(() => result.current({ clientX: 300 }));
    drag(50);
    expect(onChange).toHaveBeenLastCalledWith(100);

    drag(900);
    expect(onChange).toHaveBeenLastCalledWith(500);
  });

  it('после отпускания кнопки перестаёт слушать мышь и убирает курсор', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useResizer(300, onChange, 100, 500));

    act(() => result.current({ clientX: 300 }));
    expect(document.body.style.cursor).toBe('col-resize');

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    drag(400);

    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('без движения ничего не сообщает', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useResizer(300, onChange, 100, 500));

    act(() => result.current({ clientX: 300 }));
    drag(300);

    expect(onChange).not.toHaveBeenCalled();
  });
});
