import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryEntry, HistoryTarget } from '@shared/historyModel';
import type { RpcErrorPayload } from '@shared/messaging';
import type { PanelSettings } from '@shared/protocol';
import { bridge } from '../api/bridge';

export interface HistoryStore {
  /** Первый ответ от extension host получен. */
  readonly ready: boolean;
  readonly target: HistoryTarget | null;
  readonly entries: readonly HistoryEntry[];
  readonly hasMore: boolean;
  readonly settings: PanelSettings;
  readonly error: RpcErrorPayload | null;
  readonly loading: boolean;
  /** Догружается следующая страница истории. */
  readonly loadingMore: boolean;
  /**
   * Счётчик перечитываний истории. Растёт на каждый свежий список версий и тем
   * самым обесценивает кэш содержимого: коммиты неизменны, а рабочая копия —
   * нет, и после перечитывания она может быть уже другой.
   */
  readonly revision: number;
}

const DEFAULT_SETTINGS: PanelSettings = { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 };

/** Состояние панели: одна подписка на все уведомления extension host. */
export function useHistoryState(): HistoryStore & { readonly loadMore: () => void } {
  const [store, setStore] = useState<HistoryStore>({
    ready: false,
    target: null,
    entries: [],
    hasMore: false,
    settings: DEFAULT_SETTINGS,
    error: null,
    loading: false,
    loadingMore: false,
    revision: 0,
  });

  // Страницы догружаются от прокрутки, а она успевает попросить добавку
  // несколько раз подряд — второй запрос вернул бы те же коммиты дважды.
  const loadingMore = useRef(false);

  useEffect(() => {
    const patch = (changes: Partial<HistoryStore>) => setStore((previous) => ({ ...previous, ...changes }));

    bridge
      .request('history/ready', {})
      .then((state) =>
        patch({
          ready: true,
          target: state.target,
          entries: state.entries,
          hasMore: state.hasMore,
          settings: state.settings,
          error: state.error,
          loading: state.loading,
        }),
      )
      .catch((error: unknown) =>
        patch({ ready: true, error: { message: error instanceof Error ? error.message : String(error) } }),
      );

    const unsubscribers = [
      bridge.on('history/updated', ({ target, entries, hasMore }) => {
        loadingMore.current = false;
        setStore((previous) => ({
          ...previous,
          target,
          entries,
          hasMore,
          error: null,
          loadingMore: false,
          revision: previous.revision + 1,
        }));
      }),
      bridge.on('history/failed', (error) => patch({ error, entries: [], hasMore: false })),
      bridge.on('history/loading', ({ loading }) => patch({ loading })),
      bridge.on('settings/updated', (settings) => patch({ settings })),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore.current) {
      return;
    }
    loadingMore.current = true;
    setStore((previous) => ({ ...previous, loadingMore: true }));

    bridge
      .request('history/more', {})
      .then((page) => {
        loadingMore.current = false;
        setStore((previous) => ({
          ...previous,
          entries: [...previous.entries, ...page.entries],
          hasMore: page.hasMore,
          loadingMore: false,
        }));
      })
      .catch(() => {
        // Не показываем ошибку: уже загруженная история остаётся рабочей, а
        // кнопка обновления в шапке даёт повторить попытку целиком.
        loadingMore.current = false;
        setStore((previous) => ({ ...previous, hasMore: false, loadingMore: false }));
      });
  }, []);

  return { ...store, loadMore };
}
