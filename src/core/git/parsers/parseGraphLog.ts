import type { GraphCommitInfo } from '../types';

/** Формат для графа: как LOG_FORMAT, плюс %P — SHA родителей через пробел. */
export const GRAPH_LOG_FORMAT = ['%H', '%h', '%an', '%aI', '%s', '%P'].join('%x00') + '%x01';

/** Разбирает вывод `git log --format=GRAPH_LOG_FORMAT`. */
export function parseGraphLog(output: string): GraphCommitInfo[] {
  const commits: GraphCommitInfo[] = [];

  for (const record of output.split('\x01')) {
    const trimmed = record.replace(/^\n/, '');
    if (trimmed === '') {
      continue;
    }

    const [sha, shortSha, authorName, authoredAt, subject, parents] = trimmed.split('\0');
    if (!sha || !shortSha) {
      continue;
    }

    commits.push({
      sha,
      shortSha,
      authorName: authorName ?? '',
      authoredAt: authoredAt ?? '',
      subject: subject ?? '',
      parents: parents ? parents.split(' ').filter(Boolean) : [],
    });
  }

  return commits;
}
