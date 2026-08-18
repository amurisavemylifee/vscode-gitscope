/**
 * Контракт канала webview ⇄ extension host для панели стешей.
 *
 * Лежит отдельно от `protocol.ts` и `historyProtocol.ts` по той же причине: у
 * панелей разные наборы методов, и общая схема заставляла бы каждую из них
 * объявлять обработчики чужих запросов.
 */

import type { RpcErrorPayload } from './messaging';
import type { FilePatch, ViewMode } from './model';
import type { PanelSettings } from './protocol';
import type { StashEntry, StashSummary, StashTarget } from './stashModel';

/**
 * Итог по одному стешу: список файлов или причина, по которой посчитать его не
 * вышло. Стеши считаются по одному и приходят по мере готовности, поэтому
 * поломка на одном из них не должна забирать с собой остальные.
 */
export interface StashSummaryResult {
  readonly sha: string;
  readonly summary: StashSummary | null;
  readonly error: RpcErrorPayload | null;
}

/** Список стешей и репозиторий, которому они принадлежат. */
export interface StashSnapshot {
  readonly target: StashTarget | null;
  readonly entries: readonly StashEntry[];
}

/** Всё, что webview получает при старте, одним куском. */
export interface StashPanelState extends StashSnapshot {
  readonly settings: PanelSettings;
  /** Итоги, посчитанные к моменту открытия панели: остальные придут уведомлениями. */
  readonly summaries: readonly StashSummaryResult[];
  readonly error: RpcErrorPayload | null;
  /** Список читается прямо сейчас — панель могла открыться посреди загрузки. */
  readonly loading: boolean;
}

/** Запрос строк для разворачивания свёрнутого контекста, нумерация с 1, включительно. */
export interface StashContextRequest {
  readonly sha: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

/** Запросы webview → extension host. */
export type StashRequests = {
  /** Первый вызов после загрузки: забрать текущее состояние панели. */
  'stashes/ready': { params: Record<string, never>; result: StashPanelState };
  /** Патч файла внутри стеша — грузится, когда файл подъезжает к экрану. */
  'stashes/patch': { params: { readonly sha: string; readonly path: string }; result: FilePatch };
  /** Строки файла для разворачивания свёрнутого контекста. */
  'stashes/context': { params: StashContextRequest; result: readonly string[] };
  /** Открыть версию файла из стеша отдельной вкладкой, только для чтения. */
  'stashes/open': { params: { readonly sha: string; readonly path: string }; result: null };
  /**
   * Открыть отдельной вкладкой сравнение файла с его состоянием в базе стеша.
   *
   * Раскладку панель передаёт свою: вкладка должна открыться тем же числом
   * колонок, каким пользователь смотрит изменения здесь.
   */
  'stashes/openDiff': {
    params: { readonly sha: string; readonly path: string; readonly viewMode: ViewMode };
    result: null;
  };
  /** Положить полный SHA стеша в буфер обмена. */
  'stashes/copySha': { params: { readonly sha: string }; result: null };
  /**
   * Выбрать репозиторий заново. Нужно восстановленной после перезапуска
   * панели: данные она не хранит, а спросить, чьи стеши показывать, надо.
   */
  'stashes/pickRepository': { params: Record<string, never>; result: null };
  /** Перечитать список стешей с диска. */
  'stashes/reload': { params: Record<string, never>; result: null };
};

/** Уведомления extension host → webview. */
export type StashNotifications = {
  'stashes/loading': { readonly loading: boolean };
  'stashes/updated': StashSnapshot;
  /** Посчитан ещё один стеш: список файлов у его карточки. */
  'stashes/summary': StashSummaryResult;
  'stashes/failed': RpcErrorPayload;
  'settings/updated': PanelSettings;
};

/** Идентификатор типа webview-панели. Должен совпадать с `activationEvents`. */
export const STASH_PANEL_VIEW_TYPE = 'gitscope.stashes';
