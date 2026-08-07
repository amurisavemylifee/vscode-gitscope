import { useEffect, useState } from 'react';
import type { RpcErrorPayload } from '@shared/messaging';
import type { GraphSnapshot } from '@shared/graphProtocol';
import { bridge } from '../api/bridge';

export interface GraphStore {
  /** Первый ответ от extension host получен. */
  readonly ready: boolean;
  readonly snapshot: GraphSnapshot | null;
  readonly error: RpcErrorPayload | null;
  readonly loading: boolean;
}

/** Состояние панели графа: одна подписка на все уведомления extension host. */
export function useGraphState(): GraphStore {
  const [store, setStore] = useState<GraphStore>({ ready: false, snapshot: null, error: null, loading: false });

  useEffect(() => {
    const patch = (changes: Partial<GraphStore>) => setStore((previous) => ({ ...previous, ...changes }));

    bridge
      .request('panel/ready', {})
      .then((state) => patch({ ready: true, snapshot: state.snapshot, error: state.error, loading: state.loading }))
      .catch((error: unknown) =>
        patch({ ready: true, error: { message: error instanceof Error ? error.message : String(error) } }),
      );

    const unsubscribers = [
      bridge.on('graph/updated', (snapshot) => patch({ snapshot, error: null })),
      bridge.on('graph/failed', (error) => patch({ error, snapshot: null })),
      bridge.on('graph/loading', ({ loading }) => patch({ loading })),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, []);

  return store;
}
