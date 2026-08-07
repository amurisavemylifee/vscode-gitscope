import type { GraphRefFilter } from '@shared/graphProtocol';
import { bridge } from './bridge';

/**
 * Команды панели в сторону extension host. Ничего не возвращают: результат
 * приходит уведомлением `graph/updated` — панель не висит в ожидании ответа.
 */
export const actions = {
  setFilter: (filter: GraphRefFilter) => send('graph/setFilter', filter),
  loadMore: () => send('graph/loadMore', {}),
  reload: () => send('graph/reload', {}),
};

function send<K extends 'graph/setFilter' | 'graph/loadMore' | 'graph/reload'>(
  method: K,
  params: Parameters<typeof bridge.request<K>>[1],
): void {
  // Ошибку показывать некому: неудачу extension host сообщит через graph/failed.
  void bridge.request(method, params).catch(() => undefined);
}
