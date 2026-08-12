/**
 * Контракт канала webview ⇄ extension host для панели истории файла.
 *
 * Лежит отдельно от `protocol.ts`: у панелей разные наборы методов, и общая
 * схема заставляла бы каждую из них объявлять обработчики чужих запросов.
 */

import type { FileVersion, HistoryEntry, HistoryTarget } from './historyModel';
import type { RpcErrorPayload } from './messaging';
import type { FilePatch, ViewMode } from './model';
import type { PanelSettings } from './protocol';

/** Страница истории: коммиты грузятся пачками, а не все сразу. */
export interface HistoryPage {
  readonly entries: readonly HistoryEntry[];
  /** За этой страницей в истории есть ещё коммиты. */
  readonly hasMore: boolean;
}

/** Всё, что панель истории знает о файле в данный момент. */
export interface HistorySnapshot extends HistoryPage {
  readonly target: HistoryTarget | null;
}

/** Всё, что webview получает при старте, одним куском. */
export interface HistoryPanelState extends HistorySnapshot {
  readonly settings: PanelSettings;
  readonly error: RpcErrorPayload | null;
  /** История считается прямо сейчас — панель могла открыться посреди загрузки. */
  readonly loading: boolean;
}

/** Запросы webview → extension host. */
export type HistoryRequests = {
  /** Первый вызов после загрузки: забрать текущее состояние панели. */
  'history/ready': { params: Record<string, never>; result: HistoryPanelState };
  /** Следующая пачка коммитов, когда список долистали до конца. */
  'history/more': { params: Record<string, never>; result: HistoryPage };
  /** Содержимое файла на выбранной версии. */
  'history/version': { params: { readonly entryId: string }; result: FileVersion };
  /** Что эта версия изменила в файле по сравнению с предыдущей. */
  'history/patch': { params: { readonly entryId: string }; result: FilePatch };
  /** Строки версии для разворачивания свёрнутого контекста, нумерация с 1, включительно. */
  'history/context': {
    params: { readonly entryId: string; readonly startLine: number; readonly endLine: number };
    result: readonly string[];
  };
  /** Открыть версию отдельной вкладкой редактора, только для чтения. */
  'history/open': { params: { readonly entryId: string }; result: null };
  /**
   * Открыть отдельной вкладкой сравнение версии с предыдущей.
   *
   * Раскладку панель передаёт свою: вкладка должна открыться тем же числом
   * колонок, каким пользователь смотрит изменения здесь.
   */
  'history/openDiff': { params: { readonly entryId: string; readonly viewMode: ViewMode }; result: null };
  /** Положить полный SHA коммита в буфер обмена. */
  'history/copySha': { params: { readonly entryId: string }; result: null };
  /** Открыть нативный QuickPick для выбора точки истории. Результат придёт уведомлением. */
  'history/pickRevision': { params: Record<string, never>; result: null };
  /** Перечитать историю с диска. */
  'history/reload': { params: Record<string, never>; result: null };
};

/** Уведомления extension host → webview. */
export type HistoryNotifications = {
  'history/loading': { readonly loading: boolean };
  'history/updated': HistorySnapshot;
  'history/failed': RpcErrorPayload;
  'settings/updated': PanelSettings;
};

/** Идентификатор типа webview-панели. Должен совпадать с `activationEvents`. */
export const HISTORY_PANEL_VIEW_TYPE = 'gitscope.fileHistory';

/** Идентификатор элемента списка, обозначающего рабочую копию. */
export const WORKING_ENTRY_ID = 'working';
