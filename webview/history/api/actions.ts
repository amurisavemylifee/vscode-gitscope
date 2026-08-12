import type { ViewMode } from '@shared/model';
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
  // Пикер живёт в extension host: пока пользователь листает список, панель не
  // ждёт ответа, а новая история приедет уведомлением.
  pickRevision: (): void => void bridge.request('history/pickRevision', {}).catch(() => undefined),
  openVersion: (entryId: string) => bridge.request('history/open', { entryId }),
  // Раскладку шлём свою: вкладка сравнения открывается тем же числом колонок,
  // каким изменения показаны в панели.
  openDiff: (entryId: string, viewMode: ViewMode) => bridge.request('history/openDiff', { entryId, viewMode }),
  copySha: (entryId: string) => bridge.request('history/copySha', { entryId }),
};
