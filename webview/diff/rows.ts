import type { DiffLine, FileChange, Hunk } from '@shared/model';
import { plural } from '@shared/time';
import type { PatchState } from '../hooks/usePatches';
import { formatBytes } from '../format';

export type NoticeTone = 'muted' | 'error' | 'warning';
export type NoticeAction = 'retry' | 'expand';

/**
 * Плоский список строк всего сравнения.
 *
 * Панель рисует один сплошной скролл на все файлы, поэтому и виртуализатору
 * нужен один сплошной массив: вложенные компоненты на файл пришлось бы
 * виртуализировать по отдельности, и общая прокрутка развалилась бы.
 */
export type DiffRow =
  | { readonly kind: 'file'; readonly key: string; readonly fileIndex: number }
  | {
      readonly kind: 'notice';
      readonly key: string;
      readonly fileIndex: number;
      readonly tone: NoticeTone;
      readonly text: string;
      readonly action?: { readonly label: string; readonly type: NoticeAction };
    }
  | {
      readonly kind: 'hunk';
      readonly key: string;
      readonly fileIndex: number;
      readonly hunkIndex: number;
      readonly hunk: Hunk;
    }
  | {
      readonly kind: 'line';
      readonly key: string;
      readonly fileIndex: number;
      readonly hunkIndex: number;
      readonly lineIndex: number;
      readonly line: DiffLine;
    };

export interface BuildRowsParams {
  readonly files: readonly FileChange[];
  readonly patches: ReadonlyMap<string, PatchState>;
  /** Файлы, свёрнутые пользователем вручную. */
  readonly collapsed: ReadonlySet<string>;
  /** Большие файлы, которые пользователь всё-таки захотел увидеть. */
  readonly expanded: ReadonlySet<string>;
  /** 0 — не сворачивать большие файлы автоматически. */
  readonly collapseOverLines: number;
}

export interface BuiltRows {
  readonly rows: readonly DiffRow[];
  /** Индекс строки-заголовка для каждого файла — по нему работает переход из дерева. */
  readonly fileRowIndex: readonly number[];
}

export const FILE_ROW_HEIGHT = 34;
export const NOTICE_ROW_HEIGHT = 32;
export const HUNK_ROW_HEIGHT = 24;

export function rowHeight(row: DiffRow, lineHeight: number): number {
  switch (row.kind) {
    case 'file':
      return FILE_ROW_HEIGHT;
    case 'notice':
      return NOTICE_ROW_HEIGHT;
    case 'hunk':
      return HUNK_ROW_HEIGHT;
    case 'line':
      return row.line.noNewlineAtEof ? lineHeight * 2 : lineHeight;
  }
}

export function buildDiffRows({ files, patches, collapsed, expanded, collapseOverLines }: BuildRowsParams): BuiltRows {
  const rows: DiffRow[] = [];
  const fileRowIndex: number[] = [];

  files.forEach((file, fileIndex) => {
    fileRowIndex.push(rows.length);
    rows.push({ kind: 'file', key: `file:${file.path}`, fileIndex });

    if (collapsed.has(file.path)) {
      return;
    }

    const notice = (tone: NoticeTone, text: string, action?: { label: string; type: NoticeAction }) => {
      rows.push({
        kind: 'notice',
        key: `notice:${file.path}:${rows.length}`,
        fileIndex,
        tone,
        text,
        ...(action ? { action } : {}),
      });
    };

    const state = patches.get(file.path);

    if (state === undefined || state.status === 'loading') {
      notice('muted', 'Загружаем изменения…');
      return;
    }

    if (state.status === 'failed') {
      notice('error', state.message, { label: 'Повторить', type: 'retry' });
      return;
    }

    const { patch } = state;

    if (patch.binary) {
      notice('muted', `Двоичный файл: ${formatBytes(patch.baseSize)} → ${formatBytes(patch.compareSize)}`);
      return;
    }

    if (patch.hunks.length === 0) {
      notice(
        'muted',
        file.status === 'renamed' || file.status === 'copied'
          ? 'Содержимое не изменилось — поменялся только путь.'
          : 'Содержимое не изменилось.',
      );
      return;
    }

    const lineCount = patch.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);

    if (patch.truncated) {
      notice(
        'warning',
        `Изменения слишком велики: показаны первые ${lineCount} ${plural(lineCount, ['строка', 'строки', 'строк'])}, остальное обрезано.`,
      );
    }

    // Большой файл сворачиваем сами: развернуть его целиком — осознанное
    // решение пользователя, а не то, что случается при каждой прокрутке.
    if (collapseOverLines > 0 && lineCount > collapseOverLines && !expanded.has(file.path)) {
      notice('muted', `${lineCount} ${plural(lineCount, ['строка', 'строки', 'строк'])} изменений`, {
        label: 'Показать',
        type: 'expand',
      });
      return;
    }

    patch.hunks.forEach((hunk, hunkIndex) => {
      rows.push({ kind: 'hunk', key: `hunk:${file.path}:${hunkIndex}`, fileIndex, hunkIndex, hunk });
      hunk.lines.forEach((line, lineIndex) => {
        rows.push({
          kind: 'line',
          key: `line:${file.path}:${hunkIndex}:${lineIndex}`,
          fileIndex,
          hunkIndex,
          lineIndex,
          line,
        });
      });
    });
  });

  return { rows, fileRowIndex };
}
