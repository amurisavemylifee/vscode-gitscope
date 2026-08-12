/**
 * Модель истории одного файла.
 *
 * Как и модель сравнения, файл изоморфный: его импортируют и extension host, и
 * webview, поэтому здесь только типы, без импортов из Node и `vscode`.
 */

import type { ChangeStatus, Revision } from './model';

/** Ссылка, указывающая на коммит. `head` — ветка, на которой стоит HEAD. */
export interface HistoryRef {
  readonly kind: 'head' | 'branch' | 'remote' | 'tag';
  readonly name: string;
}

/**
 * Одна версия файла в списке слева.
 *
 * Рабочая копия описывается таким же элементом: у неё нет SHA и автора, зато
 * есть статус и числа строк, поэтому карточка рисуется тем же кодом.
 */
export interface HistoryEntry {
  /** SHA коммита или `working` у рабочей копии. Им же адресуются запросы содержимого. */
  readonly id: string;
  readonly kind: 'commit' | 'working';
  /** Имя файла на этой версии — до переименования оно другое. */
  readonly path: string;
  readonly status: ChangeStatus;
  readonly insertions: number;
  readonly deletions: number;
  readonly binary: boolean;
  /** Прежнее имя, если эта версия переименовала файл. */
  readonly previousPath?: string;
  readonly similarity?: number;
  /** Файла ещё нет в git: у него не с чем показывать разницу. */
  readonly untracked?: boolean;
  readonly sha?: string;
  readonly shortSha?: string;
  readonly subject?: string;
  readonly authorName?: string;
  /** ISO-8601 с таймзоной автора. */
  readonly authoredAt?: string;
  readonly refs?: readonly HistoryRef[];
}

/** Файл, историю которого показывает панель. */
export interface HistoryTarget {
  /** Путь относительно корня репозитория, каким он стал сейчас. */
  readonly path: string;
  readonly repositoryRoot: string;
  readonly repositoryName: string;
  /**
   * Точка, с которой смотрим историю: показываются только коммиты, до которых
   * от неё можно дойти. `null` — разрешить ревизию не удалось, например в
   * репозитории, где ещё нет ни одного коммита.
   */
  readonly revision: Revision | null;
}

/** Содержимое файла на выбранной версии. */
export interface FileVersion {
  readonly entryId: string;
  readonly path: string;
  readonly lines: readonly string[];
  /** Файл оказался больше предела и прочитан не целиком. */
  readonly truncated: boolean;
  readonly binary: boolean;
  /** Файла на этой версии нет: этот коммит его и удалил. */
  readonly missing: boolean;
  readonly bytes: number;
}
