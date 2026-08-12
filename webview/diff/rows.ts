import { buildSplitRows, type SplitRow } from '@shared/diff/splitRows';
import type { DiffLine, FileChange, Hunk, ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import type { PatchState } from '../hooks/usePatches';
import type { LineTokens } from '../syntax/highlighter';
import { formatBytes } from '../format';
import { visualLines } from './wrap';

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

/** Строка кода занимает столько строк, на сколько кусков её разложил перенос. */
export function rowHeight(row: DiffRow, lineHeight: number, columns: number): number {
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
      return lineHeight * (visualLines(row.line.text, columns) + (row.line.noNewlineAtEof ? 1 : 0));
    case 'split': {
      // Половины стоят рядом, поэтому строка высотой с ту, что перенеслась больше.
      const wrapped = Math.max(
        row.row.left ? visualLines(row.row.left.line.text, columns) : 1,
        row.row.right ? visualLines(row.row.right.line.text, columns) : 1,
      );
      const note = row.row.left?.line.noNewlineAtEof || row.row.right?.line.noNewlineAtEof ? 1 : 0;
      return lineHeight * (wrapped + note);
    }
  }
}

/** Что нужно знать о строке виртуализатора: какая она по счёту и где кончается. */
interface RowBounds {
  readonly index: number;
  readonly end: number;
}

/**
 * Строка под верхним краем области — та, что сейчас перед глазами.
 *
 * Виртуализатор отдаёт строки с запасом сверху и снизу, поэтому первая в его
 * списке — вовсе не первая видимая. Считать по ней значило бы отставать
 * заголовком файла и подсветкой в дереве на весь запас, а при разной высоте
 * строк — каждый раз на разное число пикселей.
 */
export function rowAtOffset(items: readonly RowBounds[], offset: number): number {
  const visible = items.find((item) => item.end > offset) ?? items[items.length - 1];
  return visible?.index ?? 0;
}

/** Последняя строка хунка на каждой стороне. Пустой хунк «заканчивается» на своей стартовой строке. */
export const endOf = (start: number, count: number) => (count === 0 ? start : start + count - 1);

/** Что осталось от промежутка и куда встаёт заголовок следующего хунка. */
export interface EmittedGap {
  /** Остались ли скрытые строки: без них заголовку нечего отмечать. */
  readonly hidden: boolean;
  /** Место заголовка в общем списке — сразу за последним пропуском. */
  readonly headerAt: number;
  /** Сколько строк промежутка открыто после последнего пропуска. */
  readonly prepended: number;
}

/**
 * Заголовок описывает то, что идёт под ним.
 *
 * Открытые строки промежутка стоят между пропуском и хунком, то есть под
 * заголовком, — значит и в его счёт они входят: блок начинается на столько
 * строк выше и на столько же длиннее.
 */
export function withOpenedContext(hunk: Hunk, prepended: number): Hunk {
  if (prepended === 0) {
    return hunk;
  }
  return {
    ...hunk,
    baseStart: hunk.baseStart - prepended,
    baseCount: hunk.baseCount + prepended,
    compareStart: hunk.compareStart - prepended,
    compareCount: hunk.compareCount + prepended,
  };
}

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
     *
     * Возвращает, остались ли в промежутке скрытые строки, и место для
     * заголовка следующего хунка: по этому заголовок решает, показываться ли
     * ему и где встать.
     */
    const emitGap = (compareFrom: number, compareTo: number, baseFrom: number, gapIndex: number): EmittedGap => {
      // У обрезанного патча промежутки неизвестны — считаем, что скрытое есть.
      if (patch.truncated) {
        return { hidden: true, headerAt: rows.length, prepended: 0 };
      }
      if (compareFrom > compareTo) {
        return { hidden: false, headerAt: rows.length, prepended: 0 };
      }
      const baseOffset = baseFrom - compareFrom;
      let lastHiddenEnd: number | undefined;

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
          lastHiddenEnd = end;
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

      // Строки за последним пропуском идут дальше подряд с кодом хунка: каждая
      // дала ровно одну строку списка, поэтому заголовку место перед ними.
      const prepended = lastHiddenEnd === undefined ? 0 : compareTo - lastHiddenEnd;
      return { hidden: lastHiddenEnd !== undefined, headerAt: rows.length - prepended, prepended };
    };

    let previousCompareEnd = 0;
    let previousBaseEnd = 0;

    patch.hunks.forEach((hunk, hunkIndex) => {
      const gap = emitGap(previousCompareEnd + 1, hunk.compareStart - 1, previousBaseEnd + 1, hunkIndex);

      // Заголовок хунка нужен ровно затем, чтобы отметить пропущенные строки.
      // Если пропускать нечего — промежутка не было или его развернули целиком —
      // код идёт подряд, и полоса посреди него только делит его без причины.
      // А если что-то осталось, заголовок встаёт сразу за пропуском: открытые
      // строки промежутка — продолжение кода хунка, и резать их полосой незачем.
      if (gap.hidden) {
        rows.splice(gap.headerAt, 0, {
          kind: 'hunk',
          key: `hunk:${file.path}:${hunkIndex}`,
          fileIndex,
          hunkIndex,
          hunk: withOpenedContext(hunk, gap.prepended),
        });
      }

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
