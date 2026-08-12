import { buildSplitRows, type SplitRow } from '@shared/diff/splitRows';
import type { DiffLine, FileChange, Hunk, ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import type { PatchState } from '../hooks/usePatches';
import type { LineTokens } from '../syntax/highlighter';
import { formatBytes } from '../format';

export type NoticeTone = 'muted' | 'error' | 'warning';
export type NoticeAction = 'retry' | 'expand';

/** Строка файла, подгруженная при разворачивании контекста, вместе с подсветкой. */
export interface ContextLine {
  readonly text: string;
  readonly tokens?: LineTokens;
}

/** Подгруженный контекст: путь файла → номер строки на стороне compare → строка. */
export type ContextStore = ReadonlyMap<string, ReadonlyMap<number, ContextLine>>;

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
      /** Задано у строк подгруженного контекста: у них своя подсветка. */
      readonly tokens?: LineTokens;
    }
  | {
      readonly kind: 'split';
      readonly key: string;
      readonly fileIndex: number;
      readonly hunkIndex: number;
      readonly row: SplitRow;
      readonly tokens?: LineTokens;
    }
  | {
      readonly kind: 'expander';
      readonly key: string;
      readonly fileIndex: number;
      /** Диапазон строк на стороне compare, включительно. */
      readonly compareStart: number;
      readonly compareEnd: number;
      /** Сколько прибавить к номеру строки compare, чтобы получить номер в base. */
      readonly baseOffset: number;
    };

export interface BuildRowsParams {
  readonly files: readonly FileChange[];
  readonly patches: ReadonlyMap<string, PatchState>;
  readonly context: ContextStore;
  readonly viewMode: ViewMode;
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
export const EXPANDER_ROW_HEIGHT = 26;

export function rowHeight(row: DiffRow, lineHeight: number): number {
  switch (row.kind) {
    case 'file':
      return FILE_ROW_HEIGHT;
    case 'notice':
      return NOTICE_ROW_HEIGHT;
    case 'hunk':
      return HUNK_ROW_HEIGHT;
    case 'expander':
      return EXPANDER_ROW_HEIGHT;
    case 'line':
      return row.line.noNewlineAtEof ? lineHeight * 2 : lineHeight;
    case 'split':
      return row.row.left?.line.noNewlineAtEof || row.row.right?.line.noNewlineAtEof ? lineHeight * 2 : lineHeight;
  }
}

/** Последняя строка хунка на каждой стороне. Пустой хунк «заканчивается» на своей стартовой строке. */
export const endOf = (start: number, count: number) => (count === 0 ? start : start + count - 1);

export function buildDiffRows({
  files,
  patches,
  context,
  viewMode,
  collapsed,
  expanded,
  collapseOverLines,
}: BuildRowsParams): BuiltRows {
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

    const fetched = context.get(file.path);

    /**
     * Промежуток между хунками. Уже подгруженные строки показываем как
     * контекст, на остальное вешаем кнопку «развернуть». Обрезанный патч
     * разворачивать нельзя: его хунки не описывают файл целиком, и
     * промежутки посчитались бы неправильно.
     */
    const emitGap = (compareFrom: number, compareTo: number, baseFrom: number, gapIndex: number) => {
      if (compareFrom > compareTo || patch.truncated) {
        return;
      }
      const baseOffset = baseFrom - compareFrom;

      let cursor = compareFrom;
      while (cursor <= compareTo) {
        const available = fetched?.get(cursor);
        if (available === undefined) {
          let end = cursor;
          while (end + 1 <= compareTo && fetched?.get(end + 1) === undefined) {
            end += 1;
          }
          rows.push({
            kind: 'expander',
            key: `gap:${file.path}:${gapIndex}:${cursor}`,
            fileIndex,
            compareStart: cursor,
            compareEnd: end,
            baseOffset,
          });
          cursor = end + 1;
          continue;
        }

        const line: DiffLine = {
          kind: 'context',
          text: available.text,
          baseLine: cursor + baseOffset,
          compareLine: cursor,
        };
        pushLine(rows, viewMode, {
          key: `ctx:${file.path}:${cursor}`,
          fileIndex,
          // -1 означает «строка не из хунка»: токены подсветки лежат при ней самой.
          hunkIndex: -1,
          lineIndex: 0,
          line,
          ...(available.tokens ? { tokens: available.tokens } : {}),
        });
        cursor += 1;
      }
    };

    let previousCompareEnd = 0;
    let previousBaseEnd = 0;

    patch.hunks.forEach((hunk, hunkIndex) => {
      emitGap(previousCompareEnd + 1, hunk.compareStart - 1, previousBaseEnd + 1, hunkIndex);

      rows.push({ kind: 'hunk', key: `hunk:${file.path}:${hunkIndex}`, fileIndex, hunkIndex, hunk });

      if (viewMode === 'split') {
        buildSplitRows(hunk.lines).forEach((row, rowIndex) => {
          rows.push({
            kind: 'split',
            key: `split:${file.path}:${hunkIndex}:${rowIndex}`,
            fileIndex,
            hunkIndex,
            row,
          });
        });
      } else {
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
      }

      previousCompareEnd = endOf(hunk.compareStart, hunk.compareCount);
      previousBaseEnd = endOf(hunk.baseStart, hunk.baseCount);
    });

    if (patch.compareTotalLines !== undefined) {
      emitGap(previousCompareEnd + 1, patch.compareTotalLines, previousBaseEnd + 1, patch.hunks.length);
    }
  });

  return { rows, fileRowIndex };
}

/** Строка контекста в промежутке: в двух колонках она одинакова с обеих сторон. */
function pushLine(
  rows: DiffRow[],
  viewMode: ViewMode,
  row: {
    key: string;
    fileIndex: number;
    hunkIndex: number;
    lineIndex: number;
    line: DiffLine;
    tokens?: LineTokens;
  },
): void {
  if (viewMode === 'split') {
    rows.push({
      kind: 'split',
      key: row.key,
      fileIndex: row.fileIndex,
      hunkIndex: row.hunkIndex,
      row: { left: { line: row.line, index: 0 }, right: { line: row.line, index: 0 } },
      ...(row.tokens ? { tokens: row.tokens } : {}),
    });
    return;
  }
  rows.push({ kind: 'line', ...row });
}
