/**
 * Модель стешей.
 *
 * Как и остальные модели, файл изоморфный: его импортируют и extension host, и
 * webview, поэтому здесь только типы, без импортов из Node и `vscode`.
 */

import type { FileChange } from './model';

/** Коммит, поверх которого лежит стеш. */
export interface StashBase {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
}

/**
 * Один стеш в списке.
 *
 * Стеш — это коммит с двумя-тремя родителями: база, состояние индекса и, если
 * стешили с `-u`, новые файлы. Их SHA лежат прямо здесь: по ним панель знает,
 * что показывать как изменение, а что — как файл, которого в git не было.
 */
export interface StashEntry {
  /** Полный SHA коммита стеша. Им адресуются все запросы: `stash@{n}` сдвигается. */
  readonly sha: string;
  readonly shortSha: string;
  /** Позиционная ссылка на момент чтения списка — только для показа. */
  readonly ref: string;
  /** Сообщение стеша. Пустое у сделанного обычным `git stash`. */
  readonly message: string;
  /** Стеш сделан без своего сообщения. */
  readonly automatic: boolean;
  /** Ветка, на которой стеш создан; `undefined` — стешили в detached HEAD. */
  readonly branch?: string;
  readonly authorName: string;
  /** ISO-8601 с таймзоной автора. */
  readonly createdAt: string;
  readonly base: StashBase;
  /** Состояние индекса на момент стеша — второй родитель. */
  readonly indexSha?: string;
  /** Файлы, которых не было в git, — третий родитель. Нет, если стешили без `-u`. */
  readonly untrackedSha?: string;
}

/** Файл внутри стеша: изменение плюс то, откуда оно в стеш попало. */
export interface StashFile extends FileChange {
  /** Файла не было в git: стеш сохранил его целиком, сравнивать не с чем. */
  readonly untracked?: boolean;
  /** Изменение лежало в индексе — вернуть его туда умеет только `git stash pop --index`. */
  readonly staged?: boolean;
}

/** Что лежит внутри одного стеша. */
export interface StashSummary {
  /** SHA стеша, к которому относится список. */
  readonly sha: string;
  readonly files: readonly StashFile[];
  readonly insertions: number;
  readonly deletions: number;
}

/** Репозиторий, стеши которого показывает панель. */
export interface StashTarget {
  readonly repositoryRoot: string;
  readonly repositoryName: string;
}
