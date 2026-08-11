import { bridge } from './bridge';

/**
 * Команды панели в сторону extension host.
 *
 * Открытие версии и копирование SHA возвращают обещание: кнопка показывает
 * результат прямо на себе, а не молчит в ответ на нажатие.
 */
export const actions = {
  // Ошибку перезагрузки показывать некому: о неудаче extension host сообщит
  // уведомлением history/failed.
  reload: (): void => void bridge.request('history/reload', {}).catch(() => undefined),
  openVersion: (entryId: string) => bridge.request('history/open', { entryId }),
  copySha: (entryId: string) => bridge.request('history/copySha', { entryId }),
};
