/** Типы, которыми оперирует git-слой и которые не уходят в webview как есть. */

export type RefKind = 'head' | 'remote' | 'tag';

/** Ссылка репозитория: локальная ветка, удалённая ветка или тег. */
export interface RefInfo {
  readonly kind: RefKind;
  /** Короткое имя: `main`, `origin/main`, `v1.2.0`. */
  readonly name: string;
  /** Полное: `refs/heads/main`. */
  readonly fullName: string;
  /** SHA коммита. Для аннотированных тегов — уже разыменованный. */
  readonly sha: string;
  readonly subject?: string;
  readonly authorName?: string;
  /** Дата коммита, ISO-8601. */
  readonly committedAt?: string;
}

export interface CommitInfo {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly authorName: string;
  /** ISO-8601 с таймзоной автора. */
  readonly authoredAt: string;
}

/** Коммит графа: то же самое, что CommitInfo, плюс SHA родителей для рёбер графа. */
export interface GraphCommitInfo extends CommitInfo {
  /** SHA родителей в порядке git (первый — «основная» линия). Пусто у корневого коммита. */
  readonly parents: readonly string[];
}

/** Одна запись `git stash list`. */
export interface StashInfo {
  /** Индекс в стеке: 0 у stash@{0}. */
  readonly index: number;
  /** Полная ссылка, например `stash@{0}`. */
  readonly ref: string;
  readonly sha: string;
  /** parents[0] — коммит, на котором был сделан стеш. */
  readonly parents: readonly string[];
  readonly message: string;
  readonly authorName: string;
  readonly authoredAt: string;
}
