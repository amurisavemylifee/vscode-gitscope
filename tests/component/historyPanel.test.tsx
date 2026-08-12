import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HistoryEntry } from '@shared/historyModel';
import type { HistoryPanelState } from '@shared/historyProtocol';

const request = vi.fn();
const listeners = new Map<string, (payload: unknown) => void>();
const on = vi.fn((method: string, handler: (payload: unknown) => void) => {
  listeners.set(method, handler);
  return () => listeners.delete(method);
});

vi.mock('../../webview/history/api/bridge', () => ({
  bridge: { request: (...args: unknown[]) => request(...args), on },
  persistedState: { read: () => ({}), write: () => undefined },
}));

vi.mock('../../webview/syntax/highlighter', () => ({
  highlightLines: vi.fn(async () => undefined),
  highlightPatch: vi.fn(async () => undefined),
  detectTheme: () => 'dark-plus',
}));

const { App } = await import('../../webview/history/App');
const { useHistoryState } = await import('../../webview/history/hooks/useHistoryState');
const { actions } = await import('../../webview/history/api/actions');

const commit = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'a'.repeat(40),
  kind: 'commit',
  path: 'src/app.ts',
  status: 'modified',
  insertions: 12,
  deletions: 3,
  binary: false,
  sha: 'a'.repeat(40),
  shortSha: 'aaaaaaa',
  subject: 'fix: гонка при загрузке',
  authorName: 'Аня Петрова',
  authoredAt: '2026-08-12T01:19:02+02:00',
  ...overrides,
});

const revision = { spec: 'main', sha: 'f'.repeat(40), label: 'main', subject: 'последний коммит' };

const state = (overrides: Partial<HistoryPanelState> = {}): HistoryPanelState => ({
  settings: { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 },
  target: { path: 'src/app.ts', repositoryRoot: '/repo', repositoryName: 'repo', revision },
  entries: [commit()],
  hasMore: false,
  error: null,
  loading: false,
  ...overrides,
});

/** Ответы на разные методы канала: панель зовёт несколько за время рендера. */
const respondWith = (panelState: HistoryPanelState, patchOverride: Record<string, unknown> = {}) => {
  request.mockImplementation((method: string, params: Record<string, number> = {}) => {
    if (method === 'history/context') {
      const { startLine = 1, endLine = 0 } = params;
      return Promise.resolve(Array.from({ length: endLine - startLine + 1 }, (_, at) => `строка ${startLine + at}`));
    }
    if (method === 'history/ready') {
      return Promise.resolve(panelState);
    }
    if (method === 'history/more') {
      // Список сам просит добавку, долистав до конца. Держим страницу
      // незавершённой, чтобы она не переписывала состояние посреди проверки.
      return new Promise(() => undefined);
    }
    if (method === 'history/version') {
      return Promise.resolve({
        entryId: panelState.entries[0]?.id ?? '',
        path: 'src/app.ts',
        lines: ['import React from "react";', 'export const App = () => null;'],
        truncated: false,
        binary: false,
        missing: false,
        bytes: 60,
      });
    }
    if (method === 'history/patch') {
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
            lines: [{ kind: 'insert', text: 'export const App = () => null;', compareLine: 1 }],
          },
        ],
        ...patchOverride,
      });
    }
    return Promise.resolve(null);
  });
};

describe('useHistoryState', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('забирает начальное состояние одним запросом', async () => {
    respondWith(state());
    const { result } = renderHook(() => useHistoryState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.target?.path).toBe('src/app.ts');
    expect(result.current.entries).toHaveLength(1);
  });

  it('подхватывает перечитанную историю и отмечает её новым номером', async () => {
    respondWith(state());
    const { result } = renderHook(() => useHistoryState());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const before = result.current.revision;

    act(() =>
      listeners.get('history/updated')?.({
        target: { path: 'src/app.ts', repositoryRoot: '/repo', repositoryName: 'repo', revision },
        entries: [commit(), commit({ id: 'b', sha: 'b', subject: 'feat: кэш' })],
        hasMore: true,
      }),
    );

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.revision).toBe(before + 1);
  });

  it('на ошибку забывает прежний список версий', async () => {
    respondWith(state());
    const { result } = renderHook(() => useHistoryState());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => listeners.get('history/failed')?.({ message: 'файл не в репозитории' }));

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toEqual({ message: 'файл не в репозитории' });
  });

  it('догружает следующую страницу и приклеивает её к списку', async () => {
    respondWith(state({ hasMore: true }));
    const { result } = renderHook(() => useHistoryState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    request.mockResolvedValueOnce({ entries: [commit({ id: 'b', sha: 'b', subject: 'старее' })], hasMore: false });
    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('не просит вторую страницу, пока не пришла первая', async () => {
    respondWith(state({ hasMore: true }));
    const { result } = renderHook(() => useHistoryState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    request.mockReturnValue(new Promise(() => undefined));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(request.mock.calls.filter((call) => call[0] === 'history/more')).toHaveLength(1);
  });

  it('неудачную догрузку не показывает как ошибку панели', async () => {
    respondWith(state({ hasMore: true }));
    const { result } = renderHook(() => useHistoryState());
    await waitFor(() => expect(result.current.ready).toBe(true));

    request.mockRejectedValueOnce(new Error('канал закрыт'));
    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('если начальный запрос не удался, панель всё равно становится готовой', async () => {
    request.mockRejectedValue(new Error('канал закрыт'));
    const { result } = renderHook(() => useHistoryState());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error?.message).toBe('канал закрыт');
  });
});

describe('actions истории', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(null);
  });

  it('шлют команды в extension host', async () => {
    actions.reload();
    await actions.openVersion('abc');
    await actions.openDiff('abc');
    await actions.copySha('abc');

    actions.pickRevision();

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'history/reload',
      'history/open',
      'history/openDiff',
      'history/copySha',
      'history/pickRevision',
    ]);
    expect(request.mock.calls[1]?.[1]).toEqual({ entryId: 'abc' });
  });

  it('о неудачной перезагрузке молчат — о ней сообщит extension host', () => {
    request.mockRejectedValue(new Error('нет репозитория'));

    expect(() => actions.reload()).not.toThrow();
  });
});

describe('App истории', () => {
  beforeEach(() => {
    request.mockReset();
    listeners.clear();
  });

  it('до первого ответа показывает подготовку панели', () => {
    request.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByText('Готовим панель…')).toBeInTheDocument();
  });

  it('показывает путь файла и репозиторий в шапке', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByText('app.ts');
    // Папка, разделитель и имя — три отдельных элемента: имя выделено, папка
    // приглушена, а слеш не должен попадать в перевёрнутую строку пути.
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getByText('repo')).toBeInTheDocument();
    expect(screen.getByText('1 версия')).toBeInTheDocument();
  });

  it('показывает точку истории и открывает пикер по клику', async () => {
    respondWith(state());
    render(<App />);

    const button = await screen.findByRole('button', { name: /main/ });
    expect(button).toHaveAttribute('title', expect.stringContaining('С какой точки истории смотрим'));

    await userEvent.click(button);
    expect(request).toHaveBeenCalledWith('history/pickRevision', {});
  });

  it('пустую историю объясняет через выбранную точку, а не вообще', async () => {
    respondWith(state({ entries: [] }));
    render(<App />);

    await screen.findByText('У файла нет истории');
    expect(screen.getByText('До «main» этот файл ни разу не попадал в коммиты.')).toBeInTheDocument();
  });

  it('у файла в корне репозитория лишнего слеша перед именем нет', async () => {
    respondWith(state({ target: { path: 'README.md', repositoryRoot: '/repo', repositoryName: 'repo', revision } }));
    render(<App />);

    await screen.findByText('README.md');
    expect(screen.queryByText('/')).not.toBeInTheDocument();
  });

  it('у неполного списка версий счётчик показывает, что это не всё', async () => {
    respondWith(state({ hasMore: true }));
    render(<App />);

    await screen.findByText('1+ версия');
  });

  it('ошибку показывает вместе с подсказкой и кнопкой повтора', async () => {
    respondWith(state({ error: { message: 'Файл не в репозитории', detail: 'Откройте папку с git' } }));
    render(<App />);

    await screen.findByText('Файл не в репозитории');
    expect(screen.getByText('Откройте папку с git')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(request).toHaveBeenCalledWith('history/reload', {});
  });

  it('файл без коммитов объясняет отдельным экраном, а не пустотой', async () => {
    respondWith(state({ entries: [] }));
    render(<App />);

    await screen.findByText('У файла нет истории');
  });

  it('во время загрузки истории не притворяется, что её нет', async () => {
    respondWith(state({ entries: [], loading: true }));
    render(<App />);

    await screen.findByText('Читаем историю…');
  });

  it('на готовой истории сразу просит содержимое первой версии', async () => {
    respondWith(state());
    render(<App />);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('history/version', { entryId: 'a'.repeat(40) }),
    );
    expect(await screen.findByRole('listbox', { name: 'Версии файла' })).toBeInTheDocument();
  });

  it('клик по списку отдаёт ему фокус — иначе стрелки не листали бы версии', async () => {
    respondWith(state());
    render(<App />);
    const list = await screen.findByRole('listbox', { name: 'Версии файла' });

    await userEvent.click(list);

    expect(document.activeElement).toBe(list);
  });

  it('переключение на «Изменения» запрашивает патч этой же версии', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('history/patch', { entryId: 'a'.repeat(40) }));
    // Режим двух колонок нужен только диффу — в просмотре файла его нет.
    expect(screen.getByRole('group', { name: 'Режим отображения' })).toBeInTheDocument();
  });

  it('считает изменения версии и переставляет счётчик по Alt+стрелке', async () => {
    respondWith(state(), {
      hunks: [
        {
          baseStart: 1,
          baseCount: 2,
          compareStart: 1,
          compareCount: 3,
          header: '',
          lines: [
            { kind: 'insert', text: 'первое изменение', compareLine: 1 },
            { kind: 'context', text: 'общая строка', baseLine: 1, compareLine: 2 },
            { kind: 'insert', text: 'второе изменение', compareLine: 3 },
          ],
        },
      ],
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));

    await screen.findByText('1/2');

    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.getByText('2/2')).toBeInTheDocument();

    // По кругу: после последнего изменения снова первое.
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('в просмотре файла счётчика изменений нет — считать нечего', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByRole('group', { name: 'Что показывать' });
    expect(screen.queryByRole('group', { name: 'Переход по изменениям' })).not.toBeInTheDocument();
  });

  it('на каждое изменение ставит засечку на полосе-обзоре', async () => {
    respondWith(state());
    const { container } = render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));

    await waitFor(() => expect(container.querySelectorAll('.gs-ruler__mark')).toHaveLength(1));
  });

  it('разворачивает файл целиком одной кнопкой и сворачивает обратно', async () => {
    respondWith(state(), {
      compareTotalLines: 10,
      hunks: [
        {
          baseStart: 5,
          baseCount: 1,
          compareStart: 5,
          compareCount: 1,
          header: '',
          lines: [{ kind: 'insert', text: 'пятая', compareLine: 5 }],
        },
      ],
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));

    const expand = await screen.findByTitle('Показать файл целиком');
    await userEvent.click(expand);

    expect(request).toHaveBeenCalledWith('history/context', {
      entryId: 'a'.repeat(40),
      startLine: 1,
      endLine: 10,
    });

    // Строки пришли — разворачивать больше нечего, и кнопка предлагает обратное.
    const collapse = await screen.findByTitle('Свернуть неизменённые строки');
    await userEvent.click(collapse);
    await screen.findByTitle('Показать файл целиком');
  });

  it('обрезанный патч разворачивать не предлагает', async () => {
    respondWith(state(), { truncated: true, compareTotalLines: 10 });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));

    await screen.findByRole('group', { name: 'Режим отображения' });
    expect(screen.queryByTitle('Показать файл целиком')).not.toBeInTheDocument();
  });

  it('кнопка открытия версии просит extension host открыть вкладку', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByTitle('Открыть эту версию отдельной вкладкой (Enter)'));

    expect(request).toHaveBeenCalledWith('history/open', { entryId: 'a'.repeat(40) });
  });

  it('в режиме изменений та же кнопка открывает вкладкой сравнение', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));
    await userEvent.click(await screen.findByTitle('Открыть эти изменения отдельной вкладкой (Enter)'));

    expect(request).toHaveBeenCalledWith('history/openDiff', { entryId: 'a'.repeat(40) });
    // Версию целиком в этом режиме не открывают: показано не её содержимое.
    expect(request).not.toHaveBeenCalledWith('history/open', expect.anything());
  });

  it('Enter в списке открывает то же, что и кнопка шапки', async () => {
    respondWith(state());
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Изменения' }));
    const list = await screen.findByRole('listbox', { name: 'Версии файла' });
    list.focus();
    await userEvent.keyboard('{Enter}');

    expect(request).toHaveBeenCalledWith('history/openDiff', { entryId: 'a'.repeat(40) });
  });

  it('копирование SHA живёт в карточке слева, а не в шапке версии', async () => {
    respondWith(state());
    render(<App />);

    await screen.findByRole('listbox', { name: 'Версии файла' });
    expect(screen.queryByTitle('Скопировать SHA коммита')).not.toBeInTheDocument();
  });

  it('у рабочей копии шапка версии остаётся без лишних кнопок', async () => {
    respondWith(
      state({
        entries: [
          {
            id: 'working',
            kind: 'working',
            path: 'src/app.ts',
            status: 'modified',
            insertions: 2,
            deletions: 0,
            binary: false,
          },
        ],
      }),
    );
    render(<App />);

    // Шапка версии уже отрисована — значит, кнопки копирования нет, а не «ещё нет».
    await screen.findByTitle('Открыть эту версию отдельной вкладкой (Enter)');
    expect(screen.queryByTitle('Скопировать SHA коммита')).not.toBeInTheDocument();
  });
});
