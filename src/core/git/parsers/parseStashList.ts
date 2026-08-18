/**
 * Формат `git stash list`. Стеш — обычный коммит, поэтому годятся все поля
 * log; сверх них нужны `%P` (по родителям видно, что именно лежит внутри
 * стеша), `%gd` — позиционная ссылка `stash@{0}` — и `%gs`, строка reflog, в
 * которой git хранит сообщение стеша.
 */
export const STASH_FORMAT = ['%H', '%h', '%P', '%gd', '%gs', '%cI', '%an'].join('%x00') + '%x01';

/** Одна запись `git stash list`. */
export interface StashRecord {
  readonly sha: string;
  readonly shortSha: string;
  /** База, состояние индекса и — если стешили с `-u` — новые файлы. */
  readonly parents: readonly string[];
  /** Позиционная ссылка на момент чтения списка: `stash@{0}`. */
  readonly ref: string;
  /** Сообщение стеша. Пустое у сделанного обычным `git stash`: его там нет. */
  readonly message: string;
  /** Стеш сделан без своего сообщения. */
  readonly automatic: boolean;
  /** Ветка, на которой стеш создан; `undefined` — стешили в detached HEAD. */
  readonly branch?: string;
  /** ISO-8601 с таймзоной автора. */
  readonly createdAt: string;
  readonly authorName: string;
}

/** Разбирает вывод `git stash list --format=STASH_FORMAT`. */
export function parseStashList(output: string): StashRecord[] {
  const stashes: StashRecord[] = [];

  for (const record of output.split('\x01')) {
    const trimmed = record.replace(/^\n/, '');
    if (trimmed === '') {
      continue;
    }

    const [sha, shortSha, parents, ref, subject, createdAt, authorName] = trimmed.split('\0');
    if (!sha || !shortSha || !ref) {
      continue;
    }

    stashes.push({
      sha,
      shortSha,
      parents: (parents ?? '').split(' ').filter((parent) => parent !== ''),
      ref,
      ...parseStashSubject(subject ?? ''),
      createdAt: createdAt ?? '',
      authorName: authorName ?? '',
    });
  }

  return stashes;
}

/** «WIP on main: a1b2c3d Тема базового коммита» — стеш без своего сообщения. */
const AUTOMATIC = /^WIP on ([^:]+): [0-9a-f]{4,40} /;
/** «On main: своё сообщение» — стеш, сделанный `git stash push -m`. */
const NAMED = /^On ([^:]+): ([\s\S]*)$/;
/** Так git называет ветку, когда стешили в detached HEAD. */
const NO_BRANCH = '(no branch)';

/**
 * Разбирает строку reflog стеша на ветку и сообщение.
 *
 * У автоматического стеша сообщения нет вовсе: git дописывает в reflog тему
 * базового коммита, и она уже показана в карточке отдельной строкой. Выдавать
 * её за сообщение стеша значило бы показать одно и то же дважды.
 */
function parseStashSubject(subject: string): Pick<StashRecord, 'message' | 'automatic' | 'branch'> {
  const automatic = AUTOMATIC.exec(subject);
  if (automatic) {
    return { message: '', automatic: true, ...branchOf(automatic[1]) };
  }

  const named = NAMED.exec(subject);
  if (named) {
    return { message: named[2] ?? '', automatic: false, ...branchOf(named[1]) };
  }

  // Строка незнакомой формы: показываем как есть — это всё же сообщение,
  // написанное человеком или другим инструментом.
  return { message: subject, automatic: false };
}

const branchOf = (name: string | undefined): { branch?: string } =>
  name === undefined || name === '' || name === NO_BRANCH ? {} : { branch: name };
