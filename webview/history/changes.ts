import { versionRowHeight, type VersionRow } from './rows';

/**
 * Слитный кусок изменённых строк — одна остановка при переходе к следующему
 * изменению и одна засечка на полосе-обзоре.
 */
export interface ChangeBlock {
  /** Индекс первой строки блока в общем списке — по нему прокручивают. */
  readonly row: number;
  /** Смещение блока от начала области прокрутки, в пикселях. */
  readonly top: number;
  readonly height: number;
  readonly kind: 'insert' | 'delete' | 'mixed';
}

export interface Changes {
  readonly blocks: readonly ChangeBlock[];
  /** Высота всей области прокрутки: по ней считаются доли засечек. */
  readonly total: number;
}

export const NO_CHANGES: Changes = { blocks: [], total: 0 };

/**
 * Изменения версии как список блоков с их местом в области прокрутки.
 *
 * Высоты считаются здесь же, той самой функцией, по которой их измеряет
 * виртуализатор: полосе-обзору нужны пиксели, а не номера строк, и брать их из
 * внутренностей виртуализатора значило бы держаться за его реализацию.
 */
export function collectChanges(rows: readonly VersionRow[], lineHeight: number): Changes {
  const blocks: ChangeBlock[] = [];
  let offset = 0;
  let open: OpenBlock | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) {
      continue;
    }

    const height = versionRowHeight(row, lineHeight);
    const marks = rowMarks(row);

    if (marks === undefined) {
      if (open !== null) {
        blocks.push(sealed(open));
        open = null;
      }
    } else if (open !== null) {
      open.height += height;
      open.insert = open.insert || marks.insert;
      open.deleted = open.deleted || marks.deleted;
    } else {
      open = { row: index, top: offset, height, insert: marks.insert, deleted: marks.deleted };
    }

    offset += height;
  }

  if (open !== null) {
    blocks.push(sealed(open));
  }

  return { blocks, total: offset };
}

/**
 * Какое изменение сейчас перед глазами: первое, чей низ ещё не уехал за верхний
 * край. Счётчик в шапке иначе врал бы при обычной прокрутке.
 */
export function changeAtOffset(blocks: readonly ChangeBlock[], offset: number): number {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block !== undefined && block.top + block.height > offset) {
      return index;
    }
  }
  return Math.max(0, blocks.length - 1);
}

/** Следующее или предыдущее изменение по кругу: после последнего — снова первое. */
export function wrapChangeIndex(index: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return ((index % count) + count) % count;
}

interface OpenBlock {
  readonly row: number;
  readonly top: number;
  height: number;
  insert: boolean;
  deleted: boolean;
}

const sealed = (open: OpenBlock): ChangeBlock => ({
  row: open.row,
  top: open.top,
  height: open.height,
  kind: open.insert && open.deleted ? 'mixed' : open.insert ? 'insert' : 'delete',
});

/** Что строка вносит в блок; `undefined` — она не изменение и блок на ней рвётся. */
function rowMarks(row: VersionRow): { readonly insert: boolean; readonly deleted: boolean } | undefined {
  if (row.kind === 'line') {
    return row.line.kind === 'context'
      ? undefined
      : { insert: row.line.kind === 'insert', deleted: row.line.kind === 'delete' };
  }
  if (row.kind === 'split') {
    const insert = row.row.right?.line.kind === 'insert';
    const deleted = row.row.left?.line.kind === 'delete';
    return insert || deleted ? { insert, deleted } : undefined;
  }
  return undefined;
}
