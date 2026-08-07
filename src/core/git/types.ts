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
