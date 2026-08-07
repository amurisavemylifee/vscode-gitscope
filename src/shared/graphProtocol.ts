/**
 * Контракт канала webview ⇄ extension host для панели графа коммитов.
 *
 * Отдельный файл от `protocol.ts`: тот целиком про сравнение ревизий, и граф с ним
 * не пересекается по данным — смешивать их в одном месте только запутало бы обе панели.
 */

import type { RpcErrorPayload } from './messaging';
import type { GraphNode, GraphRef } from './graph/model';

/**
 * Режим отбора веток для графа:
 * - `default` — автоматика: текущая ветка плюс недавно живые (см. `GraphService`);
 * - `custom` — ровно то, что перечислено в `selectedRefs`;
 * - `all` — буквально `git log --all`, без всякого ограничения.
 */
export type GraphRefMode = 'default' | 'custom' | 'all';

/** Какие ветки участвуют в раскладке графа. */
export interface GraphRefFilter {
  readonly mode: GraphRefMode;
  /** Короткие имена веток. Имеет смысл только при `mode === 'custom'`. */
  readonly selectedRefs: readonly string[];
}

/** Снимок графа: то, что уходит в webview одним куском после каждой перестройки. */
export interface GraphSnapshot {
  readonly repositoryRoot: string;
  readonly repositoryName: string;
  readonly nodes: readonly GraphNode[];
  /** Все ветки и теги репозитория — материал для панели фильтра. */
  readonly availableRefs: readonly GraphRef[];
  /** Ветки, которые реально попали в этот граф — независимо от режима фильтра. */
  readonly includedRefs: readonly string[];
  readonly filter: GraphRefFilter;
  /** История упёрлась в лимит — в панели есть смысл предложить «показать ещё». */
  readonly hasMore: boolean;
}

/** Всё, что webview получает при старте, одним куском. */
export interface GraphPanelState {
  readonly snapshot: GraphSnapshot | null;
  readonly error: RpcErrorPayload | null;
  readonly loading: boolean;
}

/** Запросы webview → extension host. */
export type GitGraphRequests = {
  /** Первый вызов после загрузки: забрать текущее состояние панели. */
  'panel/ready': { params: Record<string, never>; result: GraphPanelState };
  /** Сменить набор веток, участвующих в графе. */
  'graph/setFilter': { params: GraphRefFilter; result: null };
  /** Досчитать историю глубже — снимает текущий лимит на следующую порцию. */
  'graph/loadMore': { params: Record<string, never>; result: null };
  /** Перечитать граф с диска. */
  'graph/reload': { params: Record<string, never>; result: null };
};

/** Уведомления extension host → webview. */
export type GitGraphNotifications = {
  'graph/loading': { readonly loading: boolean };
  'graph/updated': GraphSnapshot;
  'graph/failed': RpcErrorPayload;
};

/** Идентификатор типа webview-панели. Должен совпадать с `activationEvents`. */
export const GRAPH_PANEL_VIEW_TYPE = 'gitscope.graph';
