import type { GraphNode, GraphRef, GraphStash } from './model';

/**
 * Развешивает ветки, теги и стеши на уже разложенные узлы графа.
 *
 * Отдельно от `layoutCommits`, потому что раскладка — это про дорожки и рёбра, а
 * декорации — просто группировка по SHA. Смешивать их в одной функции усложнило бы
 * тестирование обеих вещей по отдельности.
 */
export function attachDecorations(
  nodes: readonly GraphNode[],
  refs: readonly GraphRef[],
  stashes: readonly GraphStash[],
): GraphNode[] {
  const branchesBySha = groupBy(
    refs.filter((ref) => ref.kind !== 'tag'),
    (ref) => ref.sha,
  );
  const tagsBySha = groupBy(
    refs.filter((ref) => ref.kind === 'tag'),
    (ref) => ref.sha,
  );
  const stashesByBaseSha = groupBy(
    stashes.filter((stash): stash is GraphStash & { baseSha: string } => stash.baseSha !== undefined),
    (stash) => stash.baseSha,
  );

  return nodes.map((node) => ({
    ...node,
    branches: branchesBySha.get(node.commit.sha) ?? [],
    tags: tagsBySha.get(node.commit.sha) ?? [],
    stashes: stashesByBaseSha.get(node.commit.sha) ?? [],
  }));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const existing = map.get(key(item));
    if (existing) {
      existing.push(item);
    } else {
      map.set(key(item), [item]);
    }
  }
  return map;
}
