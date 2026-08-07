/**
 * Контракт канала webview ⇄ extension host.
 *
 * Обе стороны импортируют этот файл, поэтому рассинхрон сообщений становится
 * ошибкой компиляции, а не багом в рантайме.
 */

import type { RpcErrorPayload } from './messaging';
import type { ComparisonSummary, FilePatch, Side, ViewMode } from './model';

export interface PanelSettings {
  readonly viewMode: ViewMode;
  readonly contextLines: number;
  /** 0 — не сворачивать большие файлы. */
  readonly collapseFilesOverLines: number;
}

/** Свежесть remote-ссылок. Сравнение с `origin/*` врёт, если fetch был давно. */
export interface FetchInfo {
  /** Время последнего fetch (ms epoch). `undefined` — узнать не удалось. */
  readonly lastFetchedAt?: number;
  readonly inProgress: boolean;
  /** Есть ли вообще remote — если нет, индикатор в шапке не нужен. */
  readonly hasRemote: boolean;
}

/** Всё, что webview получает при старте, одним куском. */
export interface PanelState {
  readonly settings: PanelSettings;
  readonly summary: ComparisonSummary | null;
  readonly fetch: FetchInfo;
  /** Заполнено, если последняя попытка сравнения провалилась. */
  readonly error: RpcErrorPayload | null;
}

/** Запрос на подгрузку свёрнутых строк контекста, нумерация с 1, включительно. */
export interface ContextRequest {
  readonly path: string;
  readonly side: Side;
  readonly startLine: number;
  readonly endLine: number;
}

/** Запросы webview → extension host. */
export type GitScopeRequests = {
  /** Первый вызов после загрузки: забрать текущее состояние панели. */
  'panel/ready': { params: Record<string, never>; result: PanelState };
  /** Вторая фаза загрузки: патч конкретного файла. */
  'comparison/patch': { params: { readonly path: string }; result: FilePatch };
  /** Строки файла для разворачивания свёрнутого контекста. */
  'comparison/context': { params: ContextRequest; result: readonly string[] };
  /** Открыть нативный QuickPick для выбора ревизии. Результат придёт уведомлением. */
  'revision/pick': { params: { readonly side: Side }; result: null };
  /** Поменять base и compare местами. */
  'revision/swap': { params: Record<string, never>; result: null };
  /** Перечитать сравнение с диска. */
  'comparison/reload': { params: Record<string, never>; result: null };
  /** `git fetch --all --prune`, чтобы remote-ссылки перестали быть протухшими. */
  'repository/fetch': { params: Record<string, never>; result: null };
};

/** Уведомления extension host → webview. */
export type GitScopeNotifications = {
  'comparison/loading': { readonly loading: boolean };
  'comparison/updated': ComparisonSummary;
  'comparison/failed': RpcErrorPayload;
  'fetch/updated': FetchInfo;
  'settings/updated': PanelSettings;
};

/** Идентификатор типа webview-панели. Должен совпадать с `activationEvents`. */
export const COMPARE_PANEL_VIEW_TYPE = 'gitscope.compare';
