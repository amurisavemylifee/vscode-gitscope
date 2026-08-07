import type { CommitInfo } from '../types';

/** Формат для `git log`: поля через NUL, записи через \x01 (тема может быть любой). */
export const LOG_FORMAT = ['%H', '%h', '%an', '%aI', '%s'].join('%x00') + '%x01';

/** Разбирает вывод `git log --format=LOG_FORMAT`. */
export function parseLog(output: string): CommitInfo[] {
  const commits: CommitInfo[] = [];

  for (const record of output.split('\x01')) {
    const trimmed = record.replace(/^\n/, '');
    if (trimmed === '') {
      continue;
    }

    const [sha, shortSha, authorName, authoredAt, subject] = trimmed.split('\0');
    if (!sha || !shortSha) {
      continue;
    }

    commits.push({
      sha,
      shortSha,
      authorName: authorName ?? '',
      authoredAt: authoredAt ?? '',
      subject: subject ?? '',
    });
  }

  return commits;
}
