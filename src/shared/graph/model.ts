/**
 * Модель графа коммитов — как ComparisonSummary у сравнения: изоморфная, без
 * зависимости от `@core` (тот привязан к Node). Слой services переводит
 * git-специфичные DTO (`GraphCommitInfo`, `RefInfo`, `StashInfo` из `@core/git/types`)
 * в эти плоские формы на границе.
 */

export interface GraphCommit {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly authorName: string;
  /** ISO-8601 с таймзоной автора. */
  readonly authoredAt: string;
  /** SHA родителей в порядке git; пусто у корневого коммита. */
  readonly parents: readonly string[];
}

export type GraphRefKind = 'head' | 'remote' | 'tag';

export interface GraphRef {
  readonly kind: GraphRefKind;
  readonly name: string;
  readonly sha: string;
  /** Ветка, на которой сейчас стоит HEAD репозитория. */
  readonly isCurrent: boolean;
  /** Сообщение аннотированного тега либо тема коммита, на который указывает ссылка. */
  readonly subject?: string;
  readonly authorName?: string;
  readonly authoredAt?: string;
}

export interface GraphStash {
  readonly index: number;
  /** Например `stash@{0}`. */
  readonly ref: string;
  readonly sha: string;
  /** Коммит, на котором был сделан стеш. `undefined` не бывает на практике, но стеш — не обычный коммит, и парсер этого не гарантирует. */
  readonly baseSha: string | undefined;
  readonly message: string;
  readonly authorName: string;
  readonly authoredAt: string;
}

/** Куда идёт линия от коммита к одному из его родителей. */
export interface GraphLaneEdge {
  readonly parentSha: string;
  readonly lane: number;
}

/**
 * Один коммит, уже разложенный по дорожкам, плюс что на нём «висит».
 *
 * Точки схождения нескольких дочерних линий в один коммит отдельно не отмечаются:
 * они уже видны из `parentEdges` тех детей, чья дорожка отличается от дорожки, в
 * которую указывает ребро — рендереру этого достаточно, чтобы нарисовать диагональ.
 */
export interface GraphNode {
  readonly commit: GraphCommit;
  readonly lane: number;
  readonly parentEdges: readonly GraphLaneEdge[];
  readonly branches: readonly GraphRef[];
  readonly tags: readonly GraphRef[];
  readonly stashes: readonly GraphStash[];
}

/** Что выбрал пользователь кликом — для боковой панели деталей. */
export type GraphEntity =
  | { readonly kind: 'commit'; readonly commit: GraphCommit }
  | { readonly kind: 'branch'; readonly ref: GraphRef }
  | { readonly kind: 'tag'; readonly ref: GraphRef }
  | { readonly kind: 'stash'; readonly stash: GraphStash };
