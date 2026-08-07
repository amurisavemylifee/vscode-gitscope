import type { StashInfo } from '../types';

/** Формат для `git stash list`: поля через NUL, записи через \x01. */
export const STASH_FORMAT = ['%gd', '%H', '%P', '%s', '%an', '%aI'].join('%x00') + '%x01';

const STASH_REF_INDEX = /^stash@\{(\d+)\}$/;

/** Разбирает вывод `git stash list --format=STASH_FORMAT`. */
export function parseStashes(output: string): StashInfo[] {
  const stashes: StashInfo[] = [];

  for (const record of output.split('\x01')) {
    const trimmed = record.replace(/^\n/, '');
    if (trimmed === '') {
      continue;
    }

    const [ref, sha, parents, message, authorName, authoredAt] = trimmed.split('\0');
    const indexMatch = ref ? STASH_REF_INDEX.exec(ref) : null;
    if (!ref || !sha || !indexMatch || !indexMatch[1]) {
      continue;
    }

    stashes.push({
      index: Number.parseInt(indexMatch[1], 10),
      ref,
      sha,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      message: message ?? '',
      authorName: authorName ?? '',
      authoredAt: authoredAt ?? '',
    });
  }

  return stashes;
}
