/**
 * Модель сравнения — единственный источник правды о форме данных.
 *
 * Файл изоморфный: импортируется и из extension host (Node), и из webview
 * (браузер). Никаких импортов, никакого `vscode`, только типы.
 */

/** Статус файла. Отражает коды `git diff --name-status`, кроме unmerged/unknown. */
export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';

/** Сторона сравнения. `base` — левая (откуда), `compare` — правая (куда). */
export type Side = 'base' | 'compare';

/** Режим отображения диффа. */
export type ViewMode = 'unified' | 'split';

/** Разрешённая точка истории. */
export interface Revision {
  /** Что выбрал пользователь: `origin/main`, `HEAD~3`, сырой SHA. */
  readonly spec: string;
  /** Полный SHA, в который разрешился spec. Именно он уходит в git-команды. */
  readonly sha: string;
  /** Короткая подпись для шапки: `origin/main` или `a1b2c3d`. */
  readonly label: string;
  /** Заголовок коммита, если удалось прочитать. */
  readonly subject?: string;
  /** Автор и дата коммита — для подсказки в шапке. */
  readonly authorName?: string;
  readonly authoredAt?: string;
}

/** Один изменённый файл в списке. Патч сюда не входит — он грузится отдельно. */
export interface FileChange {
  /** Путь на стороне compare; для удалённого файла — путь на стороне base. */
  readonly path: string;
  /** Прежний путь, заполнен только для `renamed` и `copied`. */
  readonly previousPath?: string;
  readonly status: ChangeStatus;
  /** Процент схожести 0..100 для `renamed`/`copied`. */
  readonly similarity?: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly binary: boolean;
}

export type DiffLineKind = 'context' | 'insert' | 'delete';

/** Диапазон изменённых символов внутри строки (интра-строчная подсветка). */
export interface InlineRange {
  readonly start: number;
  readonly end: number;
}

export interface DiffLine {
  readonly kind: DiffLineKind;
  /** Текст строки без ведущего маркера `+`/`-`/пробела. */
  readonly text: string;
  /** Номер строки в base. Отсутствует у добавленных строк. */
  readonly baseLine?: number;
  /** Номер строки в compare. Отсутствует у удалённых строк. */
  readonly compareLine?: number;
  /** Изменённые фрагменты внутри строки, если словный diff их нашёл. */
  readonly inlineRanges?: readonly InlineRange[];
  /** git пометил строку как `\ No newline at end of file`. */
  readonly noNewlineAtEof?: boolean;
}

export interface Hunk {
  readonly baseStart: number;
  readonly baseCount: number;
  readonly compareStart: number;
  readonly compareCount: number;
  /** Текст после закрывающих `@@` — обычно имя функции. */
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

/** Патч одного файла. Грузится лениво, когда файл попадает во вьюпорт. */
export interface FilePatch {
  readonly path: string;
  readonly status: ChangeStatus;
  readonly binary: boolean;
  readonly hunks: readonly Hunk[];
  /**
   * Патч оказался больше лимита и был обрезан — UI показывает предупреждение
   * вместо того, чтобы делать вид, что изменений больше нет.
   */
  readonly truncated: boolean;
  /** Размеры файла в строках на каждой стороне. Нужны, чтобы знать, есть ли
   *  что разворачивать за последним хунком. Отсутствуют у бинарников. */
  readonly baseTotalLines?: number;
  readonly compareTotalLines?: number;
  /** Размер в байтах — единственное, что можно показать про бинарный файл. */
  readonly baseSize?: number;
  readonly compareSize?: number;
}

/** Результат первой фазы загрузки: что изменилось, без содержимого. */
export interface ComparisonSummary {
  readonly base: Revision;
  readonly compare: Revision;
  readonly files: readonly FileChange[];
  readonly insertions: number;
  readonly deletions: number;
  /** Сравнение выполнялось в этом репозитории (абсолютный путь к корню). */
  readonly repositoryRoot: string;
  /** Имя репозитория для шапки. */
  readonly repositoryName: string;
}
