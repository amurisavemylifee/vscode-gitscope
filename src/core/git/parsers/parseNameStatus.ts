import type { ChangeStatus } from '@shared/model';
import { GitParseError } from '../errors';

export interface NameStatusEntry {
  readonly status: ChangeStatus;
  /** Путь на стороне compare; для удалённого файла — путь на стороне base. */
  readonly path: string;
  /** Заполнен для renamed/copied. */
  readonly previousPath?: string;
  /** Процент схожести 0..100 из суффикса статуса (`R100`, `C075`). */
  readonly similarity?: number;
}

const STATUS_BY_LETTER: Record<string, ChangeStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
};

/**
 * Разбирает код статуса: буква изменения и необязательный процент схожести
 * (`M`, `R100`, `C075`).
 *
 * Одна и та же запись встречается и в `--name-status`, и в последнем поле
 * `--raw`, поэтому разбор вынесен отдельно.
 */
export function parseStatusCode(raw: string): { status: ChangeStatus; similarity?: number } {
  const letter = raw[0] ?? '';
  const score = Number.parseInt(raw.slice(1), 10);
  // Неизвестная буква статуса (например, U при конфликте слияния) не должна
  // прятать файл из списка — показываем его как изменённый.
  const status = STATUS_BY_LETTER[letter] ?? 'modified';
  return Number.isFinite(score) ? { status, similarity: score } : { status };
}

/**
 * Разбирает вывод `git diff --name-status -z -M -C <base> <compare>`.
 *
 * Формат с `-z`: записи разделены NUL, обычная запись — это два поля
 * (`статус`, `путь`), а переименование и копирование — три
 * (`R100`, `старый путь`, `новый путь`).
 *
 * Разделитель NUL выбран не случайно: в табулированном выводе git экранирует
 * пути с пробелами и кавычками, и восстановить исходное имя однозначно нельзя.
 */
export function parseNameStatus(output: string): NameStatusEntry[] {
  const fields = output.split('\0');
  const entries: NameStatusEntry[] = [];

  let index = 0;
  while (index < fields.length) {
    const rawStatus = fields[index];
    index += 1;

    // Последнее поле после завершающего NUL — пустая строка.
    if (rawStatus === undefined || rawStatus === '') {
      continue;
    }

    const { status, similarity } = parseStatusCode(rawStatus);
    const needsTwoPaths = status === 'renamed' || status === 'copied';

    const firstPath = fields[index];
    index += 1;
    if (firstPath === undefined) {
      throw new GitParseError('Вывод --name-status оборвался на середине записи', rawStatus);
    }

    if (!needsTwoPaths) {
      entries.push({ status, path: firstPath });
      continue;
    }

    const secondPath = fields[index];
    index += 1;
    if (secondPath === undefined) {
      throw new GitParseError('У записи о переименовании нет второго пути', `${rawStatus} ${firstPath}`);
    }

    entries.push({
      status,
      path: secondPath,
      previousPath: firstPath,
      ...(similarity !== undefined ? { similarity } : {}),
    });
  }

  return entries;
}
