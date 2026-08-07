import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphNode } from '@shared/graph/model';
import type { GraphPanelState, GraphSnapshot } from '@shared/graphProtocol';

const request = vi.fn();
const listeners = new Map<string, (payload: unknown) => void>();
const on = vi.fn((method: string, handler: (payload: unknown) => void) => {
  listeners.set(method, handler);
  return () => listeners.delete(method);
});

vi.mock('../../webview/graph/api/bridge', () => ({
  bridge: { request: (...args: unknown[]) => request(...args), on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

const { App } = await import('../../webview/graph/App');
const { useGraphState } = await import('../../webview/graph/hooks/useGraphState');
const { actions } = await import('../../webview/graph/api/actions');

const node = (sha: string, subject: string): GraphNode => ({
  commit: { sha, shortSha: sha.slice(0, 7), subject, authorName: 'Тарас', authoredAt: '2026-01-01T10:00:00+03:00', parents: [] },
  lane: 0,
  parentEdges: [],
  branches: [],
  tags: [],
  stashes: [],
});

const snapshot = (
  nodes: GraphNode[] = [node('a'.repeat(40), 'первый')],
  overrides: Partial<GraphSnapshot> = {},
): GraphSnapshot => ({
  repositoryRoot: '/repo',
  repositoryName: 'repo',
  nodes,
  availableRefs: [],
  includedRefs: ['main'],
  filter: { mode: 'default', selectedRefs: [] },
  hasMore: false,
  ...overrides,
});

const state = (overrides: Partial<GraphPanelState> = {}): GraphPanelState => ({
  snapshot: null,
  error: null,
  loading: false,
  ...overrides,
});

const respondWith = (panelState: GraphPanelState) => {
  request.mockImplementation((method: string) => {
    if (method === 'panel/ready') {
      return Promise.resolve(panelState);
    }
    return Promise.resolve(null);
  });
};

describe('useGraphState', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('забирает начальное состояние одним запросом', async () => {
    respondWith(state({ snapshot: snapshot() }));
    const { result } = renderHook(() => useGraphState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.snapshot?.repositoryName).toBe('repo');
  });

  it('подхватывает обновление графа из уведомления', async () => {
    respondWith(state());
    const { result } = renderHook(() => useGraphState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => listeners.get('graph/updated')?.(snapshot()));

    expect(result.current.snapshot?.nodes).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('на уведомление об ошибке забывает прежний граф', async () => {
    respondWith(state({ snapshot: snapshot() }));
    const { result } = renderHook(() => useGraphState());
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    act(() => listeners.get('graph/failed')?.({ message: 'репозиторий не найден' }));

    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toEqual({ message: 'репозиторий не найден' });
  });

  it('следит за флагом загрузки', async () => {
    respondWith(state());
    const { result } = renderHook(() => useGraphState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => listeners.get('graph/loading')?.({ loading: true }));
    expect(result.current.loading).toBe(true);
  });

  it('если начальный запрос отклонён с Error, панель всё равно становится готовой', async () => {
    request.mockRejectedValue(new Error('канал закрыт'));
    const { result } = renderHook(() => useGraphState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error?.message).toBe('канал закрыт');
  });

  it('если запрос отклонён не Error-объектом, сообщение строится через String()', async () => {
    request.mockRejectedValue('что-то пошло не так');
    const { result } = renderHook(() => useGraphState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error?.message).toBe('что-то пошло не так');
  });
});

describe('actions', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(null);
  });

  it('шлют команды в extension host', () => {
    actions.setFilter({ mode: 'all', selectedRefs: [] });
    actions.loadMore();
    actions.reload();

    expect(request.mock.calls.map((call) => call[0])).toEqual(['graph/setFilter', 'graph/loadMore', 'graph/reload']);
    expect(request.mock.calls[0]?.[1]).toEqual({ mode: 'all', selectedRefs: [] });
  });
});

describe('App', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('до первого ответа показывает подготовку графа', () => {
    request.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByText('Готовим граф…')).toBeInTheDocument();
  });

  it('ошибку показывает вместе с кнопкой повтора', async () => {
    respondWith(state({ error: { message: 'репозиторий не найден' } }));
    render(<App />);

    await screen.findByText('репозиторий не найден');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(request).toHaveBeenCalledWith('graph/reload', {});
  });

  it('ошибку с подробностями показывает вместе с detail', async () => {
    respondWith(state({ error: { message: 'репозиторий не найден', detail: 'проверьте путь' } }));
    render(<App />);

    await screen.findByText('репозиторий не найден');
    expect(screen.getByText('проверьте путь')).toBeInTheDocument();
  });

  it('без коммитов в выбранных ветках объясняет это отдельным экраном', async () => {
    respondWith(state({ snapshot: snapshot([]) }));
    render(<App />);

    await screen.findByText('Коммитов нет');
  });

  it('при готовом графе показывает шапку с именем репозитория и числом коммитов', async () => {
    respondWith(state({ snapshot: snapshot([node('a'.repeat(40), 'первый'), node('b'.repeat(40), 'второй')]) }));
    render(<App />);

    await screen.findByText('repo');
    expect(screen.getByText('2 коммита')).toBeInTheDocument();
  });

  it('кнопка фильтра открывает панель выбора веток', async () => {
    respondWith(state({ snapshot: snapshot() }));
    render(<App />);

    await screen.findByText('repo');
    await userEvent.click(screen.getByRole('button', { name: /Ветки: по умолчанию/ }));

    expect(screen.getByPlaceholderText('Поиск веток…')).toBeInTheDocument();
  });

  it('чекбокс в панели фильтра шлёт graph/setFilter', async () => {
    respondWith(
      state({
        snapshot: snapshot([node('a'.repeat(40), 'первый')], {
          availableRefs: [{ kind: 'head', name: 'main', sha: 'a'.repeat(40), isCurrent: true }],
        }),
      }),
    );
    render(<App />);

    await screen.findByText('repo');
    await userEvent.click(screen.getByRole('button', { name: /Ветки: по умолчанию/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'main' }));

    expect(request).toHaveBeenCalledWith('graph/setFilter', { mode: 'custom', selectedRefs: [] });
  });

  it('без репозитория (нет ни снимка, ни загрузки) объясняет, что делать', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByText('Репозиторий не выбран');
  });

  it('пока идёт первый расчёт без снимка — отдельный текст, не «репозиторий не выбран»', async () => {
    respondWith(state({ loading: true }));
    render(<App />);

    await screen.findByText('Считаем граф…');
  });

  it('hasMore добавляет «+» к счётчику коммитов', async () => {
    respondWith(state({ snapshot: snapshot([node('a'.repeat(40), 'первый')], { hasMore: true }) }));
    render(<App />);

    await screen.findByText('repo');
    expect(screen.getByText('1 коммит+')).toBeInTheDocument();
  });

  it('во время перезагрузки кнопка обновления получает индикатор вращения', async () => {
    respondWith(state({ snapshot: snapshot(), loading: true }));
    render(<App />);

    await screen.findByText('repo');
    expect(screen.getByRole('button', { name: 'Перечитать граф' })).toHaveClass('gs-gheader__icon-button--spinning');
  });
});
