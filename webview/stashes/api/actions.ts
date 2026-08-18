import type { ViewMode } from '@shared/model';
import { bridge } from './bridge';

/**
 * Команды панели в сторону extension host.
 *
 * Открытие вкладок и копирование SHA возвращают обещание: кнопка показывает
 * результат прямо на себе, а не молчит в ответ на нажатие. Остальное ничего не
 * возвращает — о результате extension host сообщит уведомлением.
 */
export const actions = {
  // Ошибку перезагрузки показывать некому: о неудаче extension host сообщит
  // уведомлением stashes/failed.
  reload: (): void => void bridge.request('stashes/reload', {}).catch(() => undefined),
  // Пикер живёт в extension host: пока пользователь выбирает репозиторий,
  // панель не ждёт ответа, а список приедет уведомлением.
  pickRepository: (): void => void bridge.request('stashes/pickRepository', {}).catch(() => undefined),
  openFile: (sha: string, path: string) => bridge.request('stashes/open', { sha, path }),
  // Раскладку шлём свою: вкладка сравнения открывается тем же числом колонок,
  // каким изменения показаны в панели.
  openDiff: (sha: string, path: string, viewMode: ViewMode) =>
    bridge.request('stashes/openDiff', { sha, path, viewMode }),
  copySha: (sha: string) => bridge.request('stashes/copySha', { sha }),
};
