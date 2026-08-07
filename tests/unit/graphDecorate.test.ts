import { describe, expect, it } from 'vitest';
import { attachDecorations } from '@shared/graph/decorate';
import type { GraphCommit, GraphRef, GraphStash } from '@shared/graph/model';
import { layoutCommits } from '@shared/graph/layout';

const commit = (sha: string, parents: readonly string[] = []): GraphCommit => ({
  sha,
  shortSha: sha.slice(0, 7),
  subject: sha,
  authorName: 'Тест',
  authoredAt: '2026-01-01T00:00:00+00:00',
  parents,
});

const ref = (kind: GraphRef['kind'], name: string, sha: string): GraphRef => ({
  kind,
  name,
  sha,
  isCurrent: false,
});

const stash = (index: number, sha: string, baseSha: string | undefined): GraphStash => ({
  index,
  ref: `stash@{${index}}`,
  sha,
  baseSha,
  message: `стеш ${index}`,
  authorName: 'Тест',
  authoredAt: '2026-01-01T00:00:00+00:00',
});

describe('attachDecorations', () => {
  it('вешает ветку и тег на нужный коммит', () => {
    const nodes = layoutCommits([commit('a'), commit('b')]);
    const decorated = attachDecorations(
      nodes,
      [ref('head', 'main', 'a'), ref('tag', 'v1.0.0', 'b')],
      [],
    );

    expect(decorated.find((node) => node.commit.sha === 'a')?.branches.map((item) => item.name)).toEqual(['main']);
    expect(decorated.find((node) => node.commit.sha === 'b')?.tags.map((item) => item.name)).toEqual(['v1.0.0']);
  });

  it('несколько веток на одном коммите', () => {
    const nodes = layoutCommits([commit('a')]);
    const decorated = attachDecorations(nodes, [ref('head', 'main', 'a'), ref('remote', 'origin/main', 'a')], []);

    expect(decorated[0]?.branches.map((item) => item.name).sort()).toEqual(['main', 'origin/main']);
  });

  it('стеш крепится к своему базовому коммиту, а не к своему собственному sha', () => {
    const nodes = layoutCommits([commit('a')]);
    const decorated = attachDecorations(nodes, [], [stash(0, 'stash-sha', 'a')]);

    expect(decorated[0]?.stashes).toEqual([stash(0, 'stash-sha', 'a')]);
  });

  it('стеш без определённого базового коммита никуда не крепится', () => {
    const nodes = layoutCommits([commit('a')]);
    const decorated = attachDecorations(nodes, [], [stash(0, 'stash-sha', undefined)]);

    expect(decorated[0]?.stashes).toEqual([]);
  });

  it('коммит без ссылок и стешей получает пустые массивы', () => {
    const nodes = layoutCommits([commit('a')]);
    const decorated = attachDecorations(nodes, [], []);

    expect(decorated[0]).toMatchObject({ branches: [], tags: [], stashes: [] });
  });
});
