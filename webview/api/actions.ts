import type { Side } from '@shared/model';
import { bridge } from './bridge';

/**
 * Команды панели в сторону extension host.
 *
 * Все они ничего не возвращают: результат приходит уведомлением об обновлении
 * сравнения. Так панель не висит в ожидании, пока пользователь листает список
 * ревизий в QuickPick.
 */
export const actions = {
  pickRevision: (side: Side) => send('revision/pick', { side }),
  swapRevisions: () => send('revision/swap', {}),
  reload: () => send('comparison/reload', {}),
  fetchRemote: () => send('repository/fetch', {}),
};

function send<K extends 'revision/pick' | 'revision/swap' | 'comparison/reload' | 'repository/fetch'>(
  method: K,
  params: Parameters<typeof bridge.request<K>>[1],
): void {
  // Ошибку показывать некому: сюда попадают только команды, а о неудаче
  // extension host сообщит через comparison/failed или всплывающим сообщением.
  void bridge.request(method, params).catch(() => undefined);
}
