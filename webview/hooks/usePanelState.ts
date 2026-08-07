import { useEffect, useState } from 'react';
import type { RpcErrorPayload } from '@shared/messaging';
import type { ComparisonSummary } from '@shared/model';
import type { FetchInfo, PanelSettings } from '@shared/protocol';
import { bridge } from '../api/bridge';

export interface PanelStore {
  /** Первый ответ от extension host получен. */
  readonly ready: boolean;
  readonly summary: ComparisonSummary | null;
  readonly settings: PanelSettings;
  readonly fetch: FetchInfo;
  readonly error: RpcErrorPayload | null;
  readonly loading: boolean;
}

const DEFAULT_SETTINGS: PanelSettings = { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 };
const DEFAULT_FETCH: FetchInfo = { inProgress: false, hasRemote: false };

/** Состояние панели: одна подписка на все уведомления extension host. */
export function usePanelState(): PanelStore {
  const [store, setStore] = useState<PanelStore>({
    ready: false,
    summary: null,
    settings: DEFAULT_SETTINGS,
    fetch: DEFAULT_FETCH,
    error: null,
    loading: false,
  });

  useEffect(() => {
    const patch = (changes: Partial<PanelStore>) => setStore((previous) => ({ ...previous, ...changes }));

    bridge
      .request('panel/ready', {})
      .then((state) =>
        patch({
          ready: true,
          summary: state.summary,
          settings: state.settings,
          fetch: state.fetch,
          error: state.error,
          loading: state.loading,
        }),
      )
      .catch((error: unknown) =>
        patch({
          ready: true,
          error: { message: error instanceof Error ? error.message : String(error) },
        }),
      );

    const unsubscribers = [
      bridge.on('comparison/updated', (summary) => patch({ summary, error: null })),
      bridge.on('comparison/failed', (error) => patch({ error, summary: null })),
      bridge.on('comparison/loading', ({ loading }) => patch({ loading })),
      bridge.on('fetch/updated', (fetch) => patch({ fetch })),
      bridge.on('settings/updated', (settings) => patch({ settings })),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, []);

  return store;
}
