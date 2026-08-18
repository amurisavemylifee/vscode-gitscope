import { useEffect, useState } from 'react';
import type { RpcErrorPayload } from '@shared/messaging';
import type { PanelSettings } from '@shared/protocol';
import type { StashEntry, StashTarget } from '@shared/stashModel';
import type { StashSummaryResult } from '@shared/stashProtocol';
import { bridge } from '../api/bridge';

export interface StashStore {
  /** Первый ответ от extension host получен. */
  readonly ready: boolean;
  readonly target: StashTarget | null;
  readonly entries: readonly StashEntry[];
  /** Содержимое стешей по SHA: приходит по одному, по мере готовности. */
  readonly summaries: ReadonlyMap<string, StashSummaryResult>;
  readonly settings: PanelSettings;
  readonly error: RpcErrorPayload | null;
  /** Список читается прямо сейчас. */
  readonly loading: boolean;
}

const DEFAULT_SETTINGS: PanelSettings = { viewMode: 'unified', contextLines: 3, collapseFilesOverLines: 1500 };

/** Состояние панели: одна подписка на все уведомления extension host. */
export function useStashesState(): StashStore {
  const [store, setStore] = useState<StashStore>({
    ready: false,
    target: null,
    entries: [],
    summaries: new Map(),
    settings: DEFAULT_SETTINGS,
    error: null,
    loading: false,
  });

  useEffect(() => {
    const patch = (changes: Partial<StashStore>) => setStore((previous) => ({ ...previous, ...changes }));

    bridge
      .request('stashes/ready', {})
      .then((state) =>
        patch({
          ready: true,
          target: state.target,
          entries: state.entries,
          summaries: new Map(state.summaries.map((summary) => [summary.sha, summary])),
          settings: state.settings,
          error: state.error,
          loading: state.loading,
        }),
      )
      .catch((error: unknown) =>
        patch({ ready: true, error: { message: error instanceof Error ? error.message : String(error) } }),
      );

    const unsubscribers = [
      // Посчитанное содержимое переживает перечитывание списка: коммит стеша
      // неизменен, и заново спрашивать про него git незачем.
      bridge.on('stashes/updated', ({ target, entries }) => patch({ target, entries, error: null })),
      bridge.on('stashes/summary', (summary) =>
        setStore((previous) => ({ ...previous, summaries: new Map(previous.summaries).set(summary.sha, summary) })),
      ),
      bridge.on('stashes/failed', (error) => patch({ error, entries: [] })),
      bridge.on('stashes/loading', ({ loading }) => patch({ loading })),
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
