import { buildSplitRows, type SplitRow } from '@shared/diff/splitRows';
import type { FileVersion, HistoryEntry } from '@shared/historyModel';
import type { DiffLine, FilePatch, Hunk, ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import {
  endOf,
  EXPANDER_ROW_HEIGHT,
  HUNK_ROW_HEIGHT,
  NOTICE_ROW_HEIGHT,
  withOpenedContext,
  type ContextLine,
  type EmittedGap,
  type NoticeTone,
} from '../diff/rows';
import { visualLines } from '../diff/wrap';
import { formatBytes } from '../format';
import type { LineTokens, PatchTokens } from '../syntax/highlighter';

/**
 * Плоский список строк правой области.
 *
 * Как и в панели сравнения, строки виртуализованы: файл на пятьдесят тысяч
 * строк webview не переживёт, если отрисовать его целиком. Токены подсветки
 * кладутся прямо в строку — искать их при отрисовке дороже, а список всё равно
 * пересобирается, когда подсветка досчиталась.
 */
export type VersionRow =
  | { readonly kind: 'notice'; readonly key: string; readonly tone: NoticeTone; readonly text: string }
  | {
      readonly kind: 'code';
      readonly key: string;
      readonly number: number;
      readonly text: string;
      readonly tokens?: LineTokens;
    }
  | { readonly kind: 'hunk'; readonly key: string; readonly hunk: Hunk }
  | { readonly kind: 'line'; readonly key: string; readonly line: DiffLine; readonly tokens?: LineTokens }
  | {
      readonly kind: 'split';
      readonly key: string;
      readonly row: SplitRow;
      readonly leftTokens?: LineTokens;
      readonly rightTokens?: LineTokens;
    }
  | {
      readonly kind: 'expander';
      readonly key: string;
      /** Диапазон строк файла на этой версии, включительно. */
      readonly compareStart: number;
      readonly compareEnd: number;
      /** Сколько прибавить к номеру строки версии, чтобы получить номер в предыдущей. */
      readonly baseOffset: number;
    };

/** Строки версии, подгруженные по кнопке «развернуть»: номер строки → строка. */
export type VersionContext = ReadonlyMap<number, ContextLine>;

/** Строка кода занимает столько строк, на сколько кусков её разложил перенос. */
export function versionRowHeight(row: VersionRow, lineHeight: number, columns: number): number {
  switch (row.kind) {
    case 'notice':
      return NOTICE_ROW_HEIGHT;
    case 'hunk':
      return HUNK_ROW_HEIGHT;
    case 'expander':
      return EXPANDER_ROW_HEIGHT;
    case 'code':
      return lineHeight * visualLines(row.text, columns);
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

/** Файл целиком на выбранной версии. */
export function buildContentRows(version: FileVersion, tokens: readonly LineTokens[] | undefined): VersionRow[] {
  if (version.missing) {
    return [notice('muted', 'В этой версии файла нет: этот коммит его и удалил.')];
  }
  if (version.binary) {
    return [notice('muted', `Двоичный файл: ${formatBytes(version.bytes)}. Показать его текстом нельзя.`)];
  }

  const rows: VersionRow[] = [];
  if (version.truncated) {
    rows.push(notice('warning', 'Файл слишком большой: показано только его начало.'));
  }
  // Подсветка приходит позже самого содержимого и на огромных файлах не
  // приходит вовсе — строки от этого не ждут, а рисуются обычным текстом.
  version.lines.forEach((text, index) => {
    rows.push({
      kind: 'code',
      key: `code:${index}`,
      number: index + 1,
      text,
      ...(tokens?.[index] ? { tokens: tokens[index] } : {}),
    });
  });

  return rows;
}

/**
 * Что версия изменила по сравнению с предыдущей.
 *
 * Между хунками остаются свёрнутые промежутки: на них вешается кнопка
 * разворачивания, а уже подгруженные строки показываются как обычный контекст.
 * Так до «файла целиком» можно дойти, не вычитывая его весь заранее.
 */
export function buildPatchRows(
  patch: FilePatch,
  tokens: PatchTokens | undefined,
  viewMode: ViewMode,
  entry: HistoryEntry,
  context?: VersionContext,
): VersionRow[] {
  if (entry.untracked === true) {
    return [notice('muted', 'Файла ещё нет в git — сравнивать эту версию не с чем.')];
  }
  if (patch.binary) {
    return [notice('muted', 'Двоичный файл: показать разницу построчно нельзя.')];
  }
  if (patch.hunks.length === 0) {
    return [
      notice(
        'muted',
        entry.status === 'renamed' || entry.status === 'copied'
          ? 'Содержимое не изменилось — поменялся только путь.'
          : 'Содержимое не изменилось.',
      ),
    ];
  }

  const rows: VersionRow[] = [];

  if (patch.truncated) {
    const lineCount = patch.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
    rows.push(
      notice(
        'warning',
        `Изменения слишком велики: показаны первые ${lineCount} ${plural(lineCount, ['строка', 'строки', 'строк'])}, остальное обрезано.`,
      ),
    );
  }

  /**
   * Промежуток между хунками. Уже подгруженные строки показываем как контекст,
   * на остальное вешаем кнопку разворачивания. У обрезанного патча промежутков
   * нет вовсе: его хунки не описывают файл целиком, и границы посчитались бы
   * неправильно.
   *
   * Возвращает, остались ли в промежутке скрытые строки, и место для заголовка
   * следующего хунка: по этому заголовок решает, показываться ли ему и где
   * встать.
   */
  const emitGap = (from: number, to: number, baseFrom: number, gapIndex: number): EmittedGap => {
    // У обрезанного патча промежутки неизвестны — считаем, что скрытое есть.
    if (patch.truncated) {
      return { hidden: true, headerAt: rows.length, opened: [] };
    }
    if (from > to) {
      return { hidden: false, headerAt: rows.length, opened: [] };
    }
    const baseOffset = baseFrom - from;
    let lastHiddenEnd: number | undefined;

    let cursor = from;
    while (cursor <= to) {
      const available = context?.get(cursor);
      if (available === undefined) {
        let end = cursor;
        while (end + 1 <= to && context?.get(end + 1) === undefined) {
          end += 1;
        }
        rows.push({
          kind: 'expander',
          key: `gap:${gapIndex}:${cursor}`,
          compareStart: cursor,
          compareEnd: end,
          baseOffset,
        });
        lastHiddenEnd = end;
        cursor = end + 1;
        continue;
      }
      pushContextLine(rows, viewMode, cursor, cursor + baseOffset, available);
      cursor += 1;
    }

    // Строки за последним пропуском идут дальше подряд с кодом хунка: каждая
    // дала ровно одну строку списка, поэтому заголовку место перед ними.
    const opened: string[] = [];
    for (let line = (lastHiddenEnd ?? to) + 1; line <= to; line += 1) {
      opened.push(context?.get(line)?.text ?? '');
    }
    return { hidden: lastHiddenEnd !== undefined, headerAt: rows.length - opened.length, opened };
  };

  let previousEnd = 0;
  let previousBaseEnd = 0;

  patch.hunks.forEach((hunk, hunkIndex) => {
    const gap = emitGap(previousEnd + 1, hunk.compareStart - 1, previousBaseEnd + 1, hunkIndex);

    // Заголовок хунка нужен ровно затем, чтобы отметить пропущенные строки.
    // Если пропускать нечего — промежутка не было или его развернули целиком —
    // код идёт подряд, и полоса посреди него только делит его без причины.
    // А если что-то осталось, заголовок встаёт сразу за пропуском: открытые
    // строки промежутка — продолжение кода хунка, и резать их полосой незачем.
    if (gap.hidden) {
      rows.splice(gap.headerAt, 0, {
        kind: 'hunk',
        key: `hunk:${hunkIndex}`,
        hunk: withOpenedContext(hunk, gap.opened),
      });
    }
    const hunkTokens = tokens?.hunks[hunkIndex];

    if (viewMode === 'split') {
      buildSplitRows(hunk.lines).forEach((row, rowIndex) => {
        const leftTokens = row.left ? hunkTokens?.[row.left.index] : undefined;
        const rightTokens = row.right ? hunkTokens?.[row.right.index] : undefined;
        rows.push({
          kind: 'split',
          key: `split:${hunkIndex}:${rowIndex}`,
          row,
          ...(leftTokens ? { leftTokens } : {}),
          ...(rightTokens ? { rightTokens } : {}),
        });
      });
    } else {
      hunk.lines.forEach((line, lineIndex) => {
        const lineTokens = hunkTokens?.[lineIndex];
        rows.push({
          kind: 'line',
          key: `line:${hunkIndex}:${lineIndex}`,
          line,
          ...(lineTokens ? { tokens: lineTokens } : {}),
        });
      });
    }

    previousEnd = endOf(hunk.compareStart, hunk.compareCount);
    previousBaseEnd = endOf(hunk.baseStart, hunk.baseCount);
  });

  // Хвост файла после последнего хунка: без длины версии о нём ничего не известно.
  if (patch.compareTotalLines !== undefined) {
    emitGap(previousEnd + 1, patch.compareTotalLines, previousBaseEnd + 1, patch.hunks.length);
  }

  return rows;
}

/** Строка промежутка: в двух колонках она одинакова с обеих сторон. */
function pushContextLine(
  rows: VersionRow[],
  viewMode: ViewMode,
  compareLine: number,
  baseLine: number,
  available: ContextLine,
): void {
  const line: DiffLine = { kind: 'context', text: available.text, baseLine, compareLine };
  const key = `ctx:${compareLine}`;
  const { tokens } = available;

  if (viewMode === 'split') {
    rows.push({
      kind: 'split',
      key,
      row: { left: { line, index: 0 }, right: { line, index: 0 } },
      ...(tokens ? { leftTokens: tokens, rightTokens: tokens } : {}),
    });
    return;
  }
  rows.push({ kind: 'line', key, line, ...(tokens ? { tokens } : {}) });
}

const notice = (tone: NoticeTone, text: string): VersionRow => ({ kind: 'notice', key: `notice:${text}`, tone, text });

/** Единственная служебная строка вместо содержимого: «загружаем», «не вышло». */
export const noticeRows = (tone: NoticeTone, text: string): VersionRow[] => [notice(tone, text)];
