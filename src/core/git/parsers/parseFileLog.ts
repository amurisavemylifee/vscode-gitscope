import type { HistoryRef } from '@shared/historyModel';
import type { ChangeStatus } from '@shared/model';
import type { CommitInfo } from '../types';
import { parseStatusCode } from './parseNameStatus';

/**
 * Формат заголовка коммита в истории файла: поля через NUL, запись закрывается
 * `\x01`. Отдельный от `LOG_FORMAT` формат нужен из-за `%D` — списка ссылок на
 * коммит — и `%P`: по числу родителей видно слияние, для которого git не
 * печатает diff.
 */
export const FILE_LOG_FORMAT = ['%H', '%h', '%an', '%aI', '%D', '%P', '%s'].join('%x00') + '%x01';

/** Что коммит сделал с файлом. */
export interface FileLogChange {
  readonly status: ChangeStatus;
  /** Имя файла после этого коммита. */
  readonly path: string;
  /** Прежнее имя, если коммит переименовал файл. */
  readonly previousPath?: string;
  readonly similarity?: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly binary: boolean;
}

export interface FileLogCommit extends CommitInfo {
  readonly refs: readonly HistoryRef[];
  /** У слияния несколько родителей — и никакого diff в выводе log. */
  readonly merge: boolean;
  /** Отсутствует у слияний: для них git не печатает diff. */
  readonly change?: FileLogChange;
}

/**
 * Разбирает вывод `git log --raw --numstat -z --format=FILE_LOG_FORMAT`.
 *
 * Одним вызовом git отдаёт про каждый коммит и статус (`--raw`), и числа
 * изменённых строк (`--numstat`) — вместе эти флаги работают, в отличие от
 * `--name-status` с `--numstat`, где побеждает последний.
 *
 * Устройство вывода: заголовок коммита, `\x01`, дальше вперемешку записи двух
 * видов, и сразу за ними заголовок следующего коммита. Отличить запись от
 * начала заголовка можно по форме: `--raw` начинается с двоеточия, `--numstat`
 * содержит табуляции, а SHA — ни то, ни другое.
 */
export function parseFileLog(output: string): FileLogCommit[] {
  const chunks = output.split('\x01');
  const commits: FileLogCommit[] = [];

  let header = parseHeader(tokenize(chunks[0] ?? ''));

  for (let index = 1; index < chunks.length; index += 1) {
    const tokens = tokenize(chunks[index] ?? '');
    const { change, rest } = takeChange(tokens);

    if (header) {
      commits.push(change === undefined ? header : { ...header, change });
    }
    header = parseHeader(rest);
  }

  return commits;
}

/**
 * Режет кусок вывода на NUL-поля.
 *
 * Выбрасываются только следы разделителей: NUL, который `-z` ставит после
 * заголовка коммита, и перевод строки перед блоком записей. Пустые поля внутри
 * заголовка выбрасывать нельзя — у коммита без веток и тегов `%D` пустое, и
 * без этого поля все остальные разъезжаются на одну позицию.
 */
function tokenize(chunk: string): string[] {
  const tokens = chunk.split('\0');
  if (tokens[0] === '') {
    tokens.shift();
  }
  const first = tokens[0];
  if (first !== undefined) {
    tokens[0] = first.replace(/^\n+/, '');
  }
  return tokens;
}

type FileLogHeader = CommitInfo & { readonly refs: readonly HistoryRef[]; readonly merge: boolean };

function parseHeader(tokens: readonly string[]): FileLogHeader | undefined {
  const [sha, shortSha, authorName, authoredAt, refs, parents, subject] = tokens;
  // Последнее поле после завершающего NUL — пустая строка, а не коммит.
  if (!sha || !shortSha) {
    return undefined;
  }
  return {
    sha,
    shortSha,
    authorName: authorName ?? '',
    authoredAt: authoredAt ?? '',
    subject: subject ?? '',
    refs: parseHistoryRefs(refs ?? ''),
    merge: (parents ?? '').split(' ').filter((parent) => parent !== '').length > 1,
  };
}

/** Записи об изменении файла и всё, что осталось после них — заголовок следующего коммита. */
function takeChange(tokens: readonly string[]): { change: FileLogChange | undefined; rest: readonly string[] } {
  let status: ChangeStatus | undefined;
  let similarity: number | undefined;
  let path: string | undefined;
  let previousPath: string | undefined;
  let insertions = 0;
  let deletions = 0;
  let binary = false;

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] as string;

    if (token === '') {
      break;
    }

    if (token.startsWith(':')) {
      // `:100644 100644 a7bc997 6fe8acc M` — статус идёт последним полем.
      const code = token.slice(token.lastIndexOf(' ') + 1);
      const parsed = parseStatusCode(code);
      status = parsed.status;
      similarity = parsed.similarity;
      const twoPaths = parsed.status === 'renamed' || parsed.status === 'copied';
      previousPath = twoPaths ? tokens[index + 1] : undefined;
      path = tokens[index + (twoPaths ? 2 : 1)];
      index += twoPaths ? 3 : 2;
      continue;
    }

    const firstTab = token.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : token.indexOf('\t', firstTab + 1);
    if (secondTab < 0) {
      break;
    }

    const rawInsertions = token.slice(0, firstTab);
    const rawDeletions = token.slice(firstTab + 1, secondTab);
    const inlinePath = token.slice(secondTab + 1);
    binary = rawInsertions === '-' || rawDeletions === '-';
    insertions = binary ? 0 : toCount(rawInsertions);
    deletions = binary ? 0 : toCount(rawDeletions);
    // У переименования путь в самой записи пуст, а старое и новое имя идут
    // следом отдельными полями.
    index += inlinePath === '' ? 3 : 1;
    path ??= inlinePath === '' ? tokens[index - 1] : inlinePath;
  }

  const rest = tokens.slice(index);
  if (path === undefined) {
    return { change: undefined, rest };
  }

  return {
    change: {
      status: status ?? 'modified',
      path,
      insertions,
      deletions,
      binary,
      ...(previousPath !== undefined ? { previousPath } : {}),
      ...(similarity !== undefined ? { similarity } : {}),
    },
    rest,
  };
}

function toCount(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Разбирает `%D`: `HEAD -> main, tag: v1.0, origin/main`.
 *
 * Ссылки нужны карточкам коммитов: подпись «main» или «v1.0» рядом с темой
 * сразу отвечает на вопрос «а это вообще где», который иначе требует отдельного
 * похода в git.
 */
function parseHistoryRefs(raw: string): HistoryRef[] {
  if (raw === '') {
    return [];
  }

  return raw.split(', ').flatMap((entry): HistoryRef[] => {
    if (entry.startsWith('tag: ')) {
      return [{ kind: 'tag', name: entry.slice('tag: '.length) }];
    }
    if (entry.startsWith('HEAD -> ')) {
      return [{ kind: 'head', name: entry.slice('HEAD -> '.length) }];
    }
    if (entry === 'HEAD') {
      return [{ kind: 'head', name: 'HEAD' }];
    }
    if (entry === '') {
      return [];
    }
    // Локальную ветку от серверной отличаем по слешу: своё имя ветки его почти
    // никогда не содержит, а `origin/main` — всегда.
    return [{ kind: entry.includes('/') ? 'remote' : 'branch', name: entry }];
  });
}
