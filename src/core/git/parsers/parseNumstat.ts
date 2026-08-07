import { GitParseError } from '../errors';

export interface NumstatEntry {
  readonly path: string;
  readonly previousPath?: string;
  readonly insertions: number;
  readonly deletions: number;
  readonly binary: boolean;
}

/**
 * Разбирает вывод `git diff --numstat -z -M -C <base> <compare>`.
 *
 * Запись: `добавлено \t удалено \t путь` и NUL в конце. У переименований третье
 * поле пустое, а следом идут два отдельных NUL-поля со старым и новым путём.
 * У бинарных файлов вместо чисел стоят дефисы.
 */
export function parseNumstat(output: string): NumstatEntry[] {
  const records = output.split('\0');
  const entries: NumstatEntry[] = [];

  let index = 0;
  while (index < records.length) {
    const record = records[index];
    index += 1;

    if (record === undefined || record === '') {
      continue;
    }

    // Ищем табуляции вручную: путь тоже может содержать табуляцию, поэтому
    // split('\t') разорвал бы имя файла на части.
    const firstTab = record.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      throw new GitParseError('Запись --numstat не содержит двух табуляций', record);
    }

    const rawInsertions = record.slice(0, firstTab);
    const rawDeletions = record.slice(firstTab + 1, secondTab);
    const inlinePath = record.slice(secondTab + 1);
    const binary = rawInsertions === '-' || rawDeletions === '-';

    const counts = {
      insertions: binary ? 0 : toCount(rawInsertions, record),
      deletions: binary ? 0 : toCount(rawDeletions, record),
      binary,
    };

    if (inlinePath !== '') {
      entries.push({ path: inlinePath, ...counts });
      continue;
    }

    const previousPath = records[index];
    const path = records[index + 1];
    index += 2;
    if (previousPath === undefined || path === undefined) {
      throw new GitParseError('У записи --numstat о переименовании не хватает путей', record);
    }
    entries.push({ path, previousPath, ...counts });
  }

  return entries;
}

function toCount(raw: string, record: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new GitParseError('В записи --numstat не число вместо количества строк', record);
  }
  return value;
}
