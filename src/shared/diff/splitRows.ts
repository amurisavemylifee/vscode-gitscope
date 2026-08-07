import type { DiffLine } from '../model';

/** Ссылка на строку хунка вместе с её позицией — по позиции ищутся токены подсветки. */
export interface SplitCell {
  readonly line: DiffLine;
  readonly index: number;
}

/** Одна строка режима двух колонок. Пустая сторона означает, что там ничего нет. */
export interface SplitRow {
  readonly left?: SplitCell;
  readonly right?: SplitCell;
}

/**
 * Превращает последовательность строк хунка в выровненные пары.
 *
 * Удаления идут слева, вставки справа, и одинаковые по счёту удаление и
 * вставка встают на одну высоту — так замена строки читается как замена, а не
 * как два несвязанных события. Контекст занимает обе стороны.
 *
 * Функция изоморфная и чистая: считается в webview при переключении режима, а
 * проверяется обычным юнит-тестом.
 */
export function buildSplitRows(lines: readonly DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      break;
    }

    if (line.kind === 'context') {
      rows.push({ left: { line, index }, right: { line, index } });
      index += 1;
      continue;
    }

    const deletions: SplitCell[] = [];
    while (lines[index]?.kind === 'delete') {
      deletions.push({ line: lines[index] as DiffLine, index });
      index += 1;
    }

    const insertions: SplitCell[] = [];
    while (lines[index]?.kind === 'insert') {
      insertions.push({ line: lines[index] as DiffLine, index });
      index += 1;
    }

    const height = Math.max(deletions.length, insertions.length);
    for (let offset = 0; offset < height; offset += 1) {
      const left = deletions[offset];
      const right = insertions[offset];
      rows.push({
        ...(left ? { left } : {}),
        ...(right ? { right } : {}),
      });
    }
  }

  return rows;
}
