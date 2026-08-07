import type { RefInfo, RefKind } from '../types';

/**
 * Формат для `git for-each-ref`. Поля разделены NUL, записи — \x01: тема
 * коммита может содержать что угодно, кроме управляющих символов, а перевод
 * строки как разделитель записей ненадёжен.
 */
export const REF_FORMAT =
  [
    '%(refname)',
    '%(refname:short)',
    '%(objectname)',
    '%(*objectname)',
    '%(committerdate:iso-strict)',
    '%(authorname)',
    '%(contents:subject)',
  ].join('%00') + '%01';

const KIND_BY_PREFIX: readonly (readonly [string, RefKind])[] = [
  ['refs/heads/', 'head'],
  ['refs/remotes/', 'remote'],
  ['refs/tags/', 'tag'],
];

/** Разбирает вывод `git for-each-ref --format=REF_FORMAT`. */
export function parseRefs(output: string): RefInfo[] {
  const refs: RefInfo[] = [];

  for (const record of output.split('\x01')) {
    const trimmed = record.replace(/^\n/, '');
    if (trimmed === '') {
      continue;
    }

    const [fullName, name, objectName, peeledObjectName, committedAt, authorName, subject] = trimmed.split('\0');
    if (!fullName || !name || !objectName) {
      continue;
    }

    const kind = KIND_BY_PREFIX.find(([prefix]) => fullName.startsWith(prefix))?.[1];
    if (!kind) {
      continue;
    }

    refs.push({
      kind,
      name,
      fullName,
      // У аннотированного тега objectname — это сам тег, а нужен коммит,
      // на который он указывает.
      sha: peeledObjectName !== undefined && peeledObjectName !== '' ? peeledObjectName : objectName,
      ...(subject ? { subject } : {}),
      ...(authorName ? { authorName } : {}),
      ...(committedAt ? { committedAt } : {}),
    });
  }

  return refs;
}
