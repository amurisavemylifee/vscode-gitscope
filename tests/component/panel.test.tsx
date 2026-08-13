import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComparisonSummary, FileChange, FilePatch } from '@shared/model';
import type { PanelState } from '@shared/protocol';

const request = vi.fn();
const listeners = new Map<string, (payload: unknown) => void>();
const on = vi.fn((method: string, handler: (payload: unknown) => void) => {
  listeners.set(method, handler);
  return () => listeners.delete(method);
});

vi.mock('../../webview/api/bridge', () => ({
  bridge: { request: (...args: unknown[]) => request(...args), on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

vi.mock('../../webview/syntax/highlighter', () => ({
  highlightLines: vi.fn(async () => undefined),
  highlightPatch: vi.fn(async () => [{ content: 'x', color: '#fff', offset: 0 }]),
  detectTheme: () => 'dark-plus',
}));

const { App } = await import('../../webview/App');
const { usePanelState } = await import('../../webview/hooks/usePanelState');
const { useCodeLineHeight } = await import('../../webview/hooks/useCodeLineHeight');
const { actions } = await import('../../webview/api/actions');

const file = (path: string): FileChange => ({
  path,
  status: 'modified',
  insertions: 1,
  deletions: 1,
  binary: false,
});

const summary = (files: FileChange[] = [file('src/a.ts')]): ComparisonSummary => ({
  base: { spec: 'main', sha: 'a'.repeat(40), label: 'main' },
  compare: { spec: 'feature', sha: 'b'.repeat(40), label: 'feature' },
  files,
  insertions: 1,
  deletions: 1,
  repositoryRoot: '/repo',
  repositoryName: 'repo',
});

const state = (overrides: Partial<PanelState> = {}): PanelState => ({
  settings: { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 },
  summary: null,
  fetch: { inProgress: false, hasRemote: false },
  error: null,
  loading: false,
  ...overrides,
});

/** Ответы на разные методы канала: панель зовёт несколько за время рендера. */
const respondWith = (panelState: PanelState) => {
  request.mockImplementation((method: string, payload?: { path?: string }) => {
    if (method === 'panel/ready') {
      return Promise.resolve(panelState);
    }
    if (method === 'comparison/patch') {
      const patch: FilePatch = {
        path: payload?.path ?? '',
        status: 'modified',
        binary: false,
        hunks: [],
        truncated: false,
      };
      return Promise.resolve(patch);
    }
    return Promise.resolve(null);
  });
};

describe('usePanelState', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('забирает начальное состояние одним запросом', async () => {
    respondWith(state({ summary: summary() }));
    const { result } = renderHook(() => usePanelState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.summary?.base.label).toBe('main');
  });

  it('подхватывает обновление сравнения из уведомления', async () => {
    respondWith(state());
    const { result } = renderHook(() => usePanelState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => listeners.get('comparison/updated')?.(summary()));

    expect(result.current.summary?.compare.label).toBe('feature');
    expect(result.current.error).toBeNull();
  });

  it('на уведомление об ошибке забывает прежнее сравнение', async () => {
    respondWith(state({ summary: summary() }));
    const { result } = renderHook(() => usePanelState());
    await waitFor(() => expect(result.current.summary).not.toBeNull());

    act(() => listeners.get('comparison/failed')?.({ message: 'ревизия не найдена' }));

    expect(result.current.summary).toBeNull();
    expect(result.current.error).toEqual({ message: 'ревизия не найдена' });
  });

  it('следит за флагом загрузки и настройками', async () => {
    respondWith(state());
    const { result } = renderHook(() => usePanelState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => listeners.get('comparison/loading')?.({ loading: true }));
    expect(result.current.loading).toBe(true);

    act(() =>
      listeners.get('settings/updated')?.({ viewMode: 'split', contextLines: 8, collapseFilesOverLines: 0 }),
    );
    expect(result.current.settings.viewMode).toBe('split');
  });

  it('если начальный запрос не удался, панель всё равно становится готовой', async () => {
    request.mockRejectedValue(new Error('канал закрыт'));
    const { result } = renderHook(() => usePanelState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error?.message).toBe('канал закрыт');
  });
});

describe('useCodeLineHeight', () => {
  it('без переменной редактора берёт разумное значение по умолчанию', () => {
    const { result } = renderHook(() => useCodeLineHeight('dark-plus'));

    expect(result.current).toBe(19);
  });

  it('считает высоту от размера шрифта редактора и прописывает её в CSS', () => {
    document.body.style.setProperty('--vscode-editor-font-size', '16px');
    const { result } = renderHook(() => useCodeLineHeight('dark-plus'));

    expect(result.current).toBe(24);
    expect(document.documentElement.style.getPropertyValue('--gs-line-height-code')).toBe('24px');

    document.body.style.removeProperty('--vscode-editor-font-size');
  });
});

describe('actions', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(null);
  });

  it('шлют команды в extension host', () => {
    actions.pickRevision('base');
    actions.swapRevisions();
    actions.reload();
    actions.fetchRemote();

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'revision/pick',
      'revision/swap',
      'comparison/reload',
      'repository/fetch',
    ]);
    expect(request.mock.calls[0]?.[1]).toEqual({ side: 'base' });
  });

  it('молчат об ошибке — о ней сообщит сам extension host', async () => {
    request.mockRejectedValue(new Error('нет репозитория'));

    expect(() => actions.reload()).not.toThrow();
    await Promise.resolve();
  });
});

describe('App', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('до первого ответа показывает подготовку панели', () => {
    request.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByText('Готовим панель…')).toBeInTheDocument();
  });

  it('без выбранных ревизий предлагает их выбрать', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByText('Ревизии не выбраны');
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать ревизии' }));

    expect(request).toHaveBeenCalledWith('revision/pick', { side: 'base' });
  });

  it('ошибку показывает вместе с подсказкой и кнопкой повтора', async () => {
    respondWith(state({ error: { message: 'Ревизия не найдена', detail: 'Возможно, нужен git fetch' } }));
    render(<App />);

    await screen.findByText('Ревизия не найдена');
    expect(screen.getByText('Возможно, нужен git fetch')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(request).toHaveBeenCalledWith('comparison/reload', {});
  });

  it('совпадающие ревизии объясняет отдельным экраном, а не пустотой', async () => {
    respondWith(state({ summary: summary([]) }));
    render(<App />);

    await screen.findByText('Различий нет');
    expect(screen.getByText(/«main» и «feature» совпадает полностью/)).toBeInTheDocument();
  });

  it('при готовом сравнении рисует дерево файлов и шапку', async () => {
    respondWith(state({ summary: summary([file('src/a.ts'), file('src/b.ts')]) }));
    render(<App />);

    await screen.findByText('2 изменённых файла');
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('feature')).toBeInTheDocument();
  });

  it('раскладывает файлы на полотне в порядке дерева, а не в порядке git', async () => {
    respondWith(state({ summary: summary([file('README.md'), file('src/a.ts')]) }));
    const { container } = render(<App />);

    await screen.findByText('2 изменённых файла');
    // Первый файл дерева — из папки: папки идут выше файлов корня.
    expect(container.querySelector('.gs-file-header__name')?.textContent).toBe('src/a.ts');
  });

  it('кнопки шапки сворачивают и разворачивают все файлы разом', async () => {
    respondWith(state({ summary: summary([file('src/a.ts'), file('src/b.ts')]) }));
    const { container } = render(<App />);

    await screen.findByText('2 изменённых файла');
    // Липкая полоса показывает файл, на который смотрят: по её кнопке и видно,
    // свёрнут он или нет.
    const toggle = () => container.querySelector('.gs-canvas__sticky button');

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть все файлы' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Развернуть все файлы' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('во время подсчёта сравнения не предлагает выбирать ревизии заново', async () => {
    respondWith(state({ loading: true }));
    render(<App />);

    await screen.findByText('Считаем разницу…');
    expect(screen.queryByRole('button', { name: 'Выбрать ревизии' })).not.toBeInTheDocument();
  });
});
