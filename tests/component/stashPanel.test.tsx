import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StashEntry } from '@shared/stashModel';
import type { StashPanelState } from '@shared/stashProtocol';

const request = vi.fn();
const listeners = new Map<string, (payload: unknown) => void>();
const on = vi.fn((method: string, handler: (payload: unknown) => void) => {
  listeners.set(method, handler);
  return () => listeners.delete(method);
});

vi.mock('../../webview/stashes/api/bridge', () => ({
  bridge: { request: (...args: unknown[]) => request(...args), on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

vi.mock('../../webview/syntax/highlighter', () => ({
  highlightLines: vi.fn(async () => undefined),
  highlightPatch: vi.fn(async () => undefined),
  detectTheme: () => 'dark-plus',
}));

const { App } = await import('../../webview/stashes/App');
const { useStashesState } = await import('../../webview/stashes/hooks/useStashesState');
const { useStashPatches } = await import('../../webview/stashes/hooks/useStashPatches');
const { useStashContext } = await import('../../webview/stashes/hooks/useStashContext');
const { actions } = await import('../../webview/stashes/api/actions');

const SHA = 'a'.repeat(40);

const stash = (overrides: Partial<StashEntry> = {}): StashEntry => ({
  sha: SHA,
  shortSha: 'aaaaaaa',
  ref: 'stash@{0}',
  message: 'правки формы логина',
  automatic: false,
  branch: 'main',
  authorName: 'Аня Петрова',
  createdAt: '2026-08-12T01:19:02+02:00',
  base: { sha: 'b'.repeat(40), shortSha: 'bbbbbbb', subject: 'Fix login redirect' },
  indexSha: 'c'.repeat(40),
  ...overrides,
});

const summaryOf = (sha = SHA) => ({
  sha,
  summary: {
    sha,
    files: [
      { path: 'src/app.ts', status: 'modified' as const, insertions: 3, deletions: 1, binary: false, staged: true },
      {
        path: 'notes.md',
        status: 'added' as const,
        insertions: 2,
        deletions: 0,
        binary: false,
        untracked: true,
      },
    ],
    insertions: 5,
    deletions: 1,
  },
  error: null,
});

const state = (overrides: Partial<StashPanelState> = {}): StashPanelState => ({
  settings: { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 },
  target: { repositoryRoot: '/repo', repositoryName: 'repo' },
  entries: [stash()],
  summaries: [summaryOf()],
  error: null,
  loading: false,
  ...overrides,
});

/** Ответы на разные методы канала: панель зовёт несколько за время рендера. */
const respondWith = (panelState: StashPanelState, patchOverride: Record<string, unknown> = {}) => {
  request.mockImplementation((method: string, params: Record<string, number> = {}) => {
    if (method === 'stashes/ready') {
      return Promise.resolve(panelState);
    }
    if (method === 'stashes/context') {
      const { startLine = 1, endLine = 0 } = params;
      return Promise.resolve(Array.from({ length: endLine - startLine + 1 }, (_, at) => `строка ${startLine + at}`));
    }
    if (method === 'stashes/patch') {
      return Promise.resolve({
        path: 'src/app.ts',
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
            lines: [{ kind: 'insert', text: 'export const answer = 42;', compareLine: 1 }],
          },
        ],
        ...patchOverride,
      });
    }
    return Promise.resolve(null);
  });
};

describe('useStashesState', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('забирает начальное состояние одним запросом', async () => {
    respondWith(state());
    const { result } = renderHook(() => useStashesState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.target?.repositoryName).toBe('repo');
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.summaries.get(SHA)?.summary?.files).toHaveLength(2);
  });

  it('добавляет содержимое стешей по мере готовности', async () => {
    respondWith(state({ summaries: [] }));
    const { result } = renderHook(() => useStashesState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => listeners.get('stashes/summary')?.(summaryOf()));

    expect(result.current.summaries.get(SHA)?.summary?.insertions).toBe(5);
  });

  it('перечитанный список не выбрасывает уже посчитанное содержимое', async () => {
    respondWith(state());
    const { result } = renderHook(() => useStashesState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() =>
      listeners.get('stashes/updated')?.({
        target: { repositoryRoot: '/repo', repositoryName: 'repo' },
        entries: [stash(), stash({ sha: 'e'.repeat(40), ref: 'stash@{1}', message: 'второй' })],
      }),
    );

    expect(result.current.entries).toHaveLength(2);
    // Коммит стеша неизменен: спрашивать про него git заново незачем.
    expect(result.current.summaries.get(SHA)?.summary?.insertions).toBe(5);
  });

  it('на ошибку забывает прежний список стешей', async () => {
    respondWith(state());
    const { result } = renderHook(() => useStashesState());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => listeners.get('stashes/failed')?.({ message: 'не репозиторий' }));

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toEqual({ message: 'не репозиторий' });
  });

  it('если начальный запрос не удался, панель всё равно становится готовой', async () => {
    request.mockRejectedValue(new Error('канал закрыт'));
    const { result } = renderHook(() => useStashesState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error?.message).toBe('канал закрыт');
  });
});

describe('useStashPatches', () => {
  beforeEach(() => {
    request.mockReset();
  });

  const patch = { path: 'src/app.ts', status: 'modified', binary: false, truncated: false, hunks: [] };

  it('запрашивает патч один раз, сколько бы раз его ни попросили', async () => {
    request.mockResolvedValue(patch);
    const { result } = renderHook(() => useStashPatches(SHA, 3));

    act(() => {
      result.current.requestPatch('src/app.ts');
      result.current.requestPatch('src/app.ts');
    });

    await waitFor(() => expect(result.current.patches.get('src/app.ts')?.status).toBe('ready'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('без выбранного стеша не спрашивает ничего', () => {
    request.mockResolvedValue(patch);
    const { result } = renderHook(() => useStashPatches(null, 3));

    act(() => result.current.requestPatch('src/app.ts'));

    expect(request).not.toHaveBeenCalled();
  });

  it('после ошибки разрешает повторить запрос', async () => {
    request.mockRejectedValueOnce(new Error('git сломался')).mockResolvedValueOnce(patch);
    const { result } = renderHook(() => useStashPatches(SHA, 3));

    act(() => result.current.requestPatch('src/app.ts'));
    await waitFor(() => expect(result.current.patches.get('src/app.ts')?.status).toBe('failed'));

    act(() => result.current.requestPatch('src/app.ts'));
    await waitFor(() => expect(result.current.patches.get('src/app.ts')?.status).toBe('ready'));
  });

  it('другое число строк контекста обесценивает посчитанные патчи', async () => {
    request.mockResolvedValue(patch);
    const { result, rerender } = renderHook(({ lines }) => useStashPatches(SHA, lines), {
      initialProps: { lines: 3 },
    });

    act(() => result.current.requestPatch('src/app.ts'));
    await waitFor(() => expect(result.current.patches.get('src/app.ts')?.status).toBe('ready'));

    rerender({ lines: 8 });

    await waitFor(() => expect(result.current.patches.size).toBe(0));
  });
});

describe('useStashContext', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('складывает подгруженные строки по их номерам', async () => {
    request.mockResolvedValue(['восьмая', 'девятая']);
    const { result } = renderHook(() => useStashContext(SHA, 'dark-plus'));

    act(() => result.current.expandContext('src/app.ts', 8, 9));

    await waitFor(() => expect(result.current.context.get('src/app.ts')?.size).toBe(2));
    expect(result.current.context.get('src/app.ts')?.get(8)).toEqual({ text: 'восьмая' });
    expect(request).toHaveBeenCalledWith('stashes/context', {
      sha: SHA,
      path: 'src/app.ts',
      startLine: 8,
      endLine: 9,
    });
  });

  it('без выбранного стеша не спрашивает ничего', () => {
    const { result } = renderHook(() => useStashContext(null, 'dark-plus'));

    act(() => result.current.expandContext('src/app.ts', 1, 2));

    expect(request).not.toHaveBeenCalled();
  });

  it('ошибку загрузки переживает молча — кнопка просто останется на месте', async () => {
    request.mockRejectedValue(new Error('git сломался'));
    const { result } = renderHook(() => useStashContext(SHA, 'dark-plus'));

    act(() => result.current.expandContext('src/app.ts', 1, 2));

    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(result.current.context.size).toBe(0);
  });

  it('на другом стеше подгруженные строки забываются: файлы там другие', async () => {
    request.mockResolvedValue(['первая']);
    const { result, rerender } = renderHook(({ sha }) => useStashContext(sha, 'dark-plus'), {
      initialProps: { sha: SHA },
    });

    act(() => result.current.expandContext('src/app.ts', 1, 1));
    await waitFor(() => expect(result.current.context.size).toBe(1));

    rerender({ sha: 'e'.repeat(40) });

    await waitFor(() => expect(result.current.context.size).toBe(0));
  });
});

describe('actions стешей', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(null);
  });

  it('шлют команды в extension host', async () => {
    actions.reload();
    actions.pickRepository();
    await actions.openFile(SHA, 'src/app.ts');
    await actions.openDiff(SHA, 'src/app.ts', 'split');
    await actions.copySha(SHA);

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'stashes/reload',
      'stashes/pickRepository',
      'stashes/open',
      'stashes/openDiff',
      'stashes/copySha',
    ]);
    expect(request.mock.calls[3]?.[1]).toEqual({ sha: SHA, path: 'src/app.ts', viewMode: 'split' });
  });

  it('о неудачной перезагрузке молчат — о ней сообщит extension host', () => {
    request.mockRejectedValue(new Error('нет репозитория'));

    expect(() => actions.reload()).not.toThrow();
  });
});

describe('App стешей', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('до первого ответа показывает подготовку панели', () => {
    request.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByText('Готовим панель…')).toBeInTheDocument();
  });

  it('показывает репозиторий и число стешей в шапке', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByText('repo');
    expect(screen.getByText('1 стеш')).toBeInTheDocument();
  });

  it('пустой список объясняет через репозиторий, а не вообще', async () => {
    respondWith(state({ entries: [], summaries: [] }));
    render(<App />);

    await screen.findByText('Стешей нет');
    expect(screen.getByText(/В репозитории «repo» нет ни одного стеша/)).toBeInTheDocument();
  });

  it('во время чтения списка не притворяется, что стешей нет', async () => {
    respondWith(state({ entries: [], summaries: [], loading: true }));
    render(<App />);

    await screen.findByText('Читаем список стешей…');
  });

  it('восстановленной панели без репозитория предлагает его выбрать', async () => {
    respondWith(state({ entries: [], summaries: [], target: null }));
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать репозиторий' }));

    expect(request).toHaveBeenCalledWith('stashes/pickRepository', {});
  });

  it('ошибку показывает вместе с подсказкой и кнопкой повтора', async () => {
    respondWith(state({ error: { message: 'Не репозиторий', detail: 'Откройте папку с git' } }));
    render(<App />);

    await screen.findByText('Не репозиторий');
    expect(screen.getByText('Откройте папку с git')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(request).toHaveBeenCalledWith('stashes/reload', {});
  });

  it('раскрывает первый стеш и показывает его файлы деревом', async () => {
    respondWith(state());
    render(<App />);

    expect(await screen.findByRole('listbox', { name: 'Стеши' })).toBeInTheDocument();
    expect(await screen.findByText('2 изменённых файла')).toBeInTheDocument();
    expect(screen.getByText('app.ts')).toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
  });

  it('помечает в дереве файлы из индекса и файлы вне git', async () => {
    respondWith(state());
    render(<App />);

    expect(await screen.findByTitle('Изменение лежало в индексе')).toBeInTheDocument();
    expect(screen.getByTitle('Файла не было в git — стеш сохранил его целиком')).toBeInTheDocument();
  });

  it('пока содержимое стеша не пришло, дифф не выдумывает', async () => {
    respondWith(state({ summaries: [] }));
    render(<App />);

    expect(await screen.findByText('Считаем содержимое стеша…')).toBeInTheDocument();
  });

  it('непрочитанный стеш объясняет, а не показывает пустотой', async () => {
    respondWith(state({ summaries: [{ sha: SHA, summary: null, error: { message: 'объект повреждён' } }] }));
    render(<App />);

    await screen.findByText('Не удалось прочитать содержимое стеша');
    // Причина видна и на месте дерева файлов, и на месте диффа: пустым не
    // остаётся ни то, ни другое.
    expect(screen.getAllByText('объект повреждён')).toHaveLength(2);
    expect(screen.getByText('не прочитан')).toBeInTheDocument();
  });

  it('на раскрытом стеше просит патчи его файлов', async () => {
    respondWith(state());
    render(<App />);

    await waitFor(() => expect(request).toHaveBeenCalledWith('stashes/patch', { sha: SHA, path: 'notes.md' }));
  });

  it('стрелки листают стеши', async () => {
    respondWith(
      state({
        entries: [stash(), stash({ sha: 'e'.repeat(40), shortSha: 'eeeeeee', ref: 'stash@{1}', message: 'второй' })],
        summaries: [summaryOf(), summaryOf('e'.repeat(40))],
      }),
    );
    render(<App />);

    const list = await screen.findByRole('listbox', { name: 'Стеши' });
    list.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(list).toHaveAttribute('aria-activedescendant', `gs-stash-${'e'.repeat(40)}`);
  });

  it('клик по списку отдаёт ему фокус — иначе стрелки не листали бы стеши', async () => {
    respondWith(state());
    render(<App />);
    const list = await screen.findByRole('listbox', { name: 'Стеши' });

    await userEvent.click(list);

    expect(document.activeElement).toBe(list);
  });

  it('копирует SHA стеша по клику в карточке', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByTitle('Скопировать SHA стеша'));

    expect(request).toHaveBeenCalledWith('stashes/copySha', { sha: SHA });
  });

  it('открывает файл из стеша отдельной вкладкой', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByTitle('Открыть файл из стеша отдельной вкладкой'));

    expect(request).toHaveBeenCalledWith('stashes/open', { sha: SHA, path: 'src/app.ts' });
  });

  it('вкладку сравнения просит открыть той же раскладкой, что выбрана в панели', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByTitle('Двумя колонками'));
    await userEvent.click(await screen.findByTitle('Открыть эти изменения отдельной вкладкой'));

    expect(request).toHaveBeenCalledWith('stashes/openDiff', {
      sha: SHA,
      path: 'src/app.ts',
      viewMode: 'split',
    });
  });

  it('перечитывает список по кнопке в шапке', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByTitle('Перечитать список стешей'));

    expect(request).toHaveBeenCalledWith('stashes/reload', {});
  });
});
