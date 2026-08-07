import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '@shared/graph/model';
import { layoutCommits } from '@shared/graph/layout';

const commit = (sha: string, parents: readonly string[] = []): GraphCommit => ({
  sha,
  shortSha: sha.slice(0, 7),
  subject: sha,
  authorName: 'Тест',
  authoredAt: '2026-01-01T00:00:00+00:00',
  parents,
});

describe('layoutCommits', () => {
  it('линейная история — все коммиты на одной дорожке', () => {
    const nodes = layoutCommits([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1')]);

    expect(nodes.map((node) => node.lane)).toEqual([0, 0, 0]);
    expect(nodes[0]?.parentEdges).toEqual([{ parentSha: 'c2', lane: 0 }]);
    expect(nodes[1]?.parentEdges).toEqual([{ parentSha: 'c1', lane: 0 }]);
    expect(nodes[2]?.parentEdges).toEqual([]);
  });

  it('merge: главная линия остаётся прямой, ветка сливается диагональю', () => {
    // main: c1 → c2; feature (от c1): c3; merge m = merge(c2, c3), c2 первым родителем.
    const nodes = layoutCommits([
      commit('m', ['c2', 'c3']),
      commit('c2', ['c1']),
      commit('c3', ['c1']),
      commit('c1'),
    ]);
    const bySha = new Map(nodes.map((node) => [node.commit.sha, node]));

    expect(bySha.get('m')).toMatchObject({
      lane: 0,
      parentEdges: [
        { parentSha: 'c2', lane: 0 },
        { parentSha: 'c3', lane: 1 },
      ],
    });
    expect(bySha.get('c2')).toMatchObject({ lane: 0, parentEdges: [{ parentSha: 'c1', lane: 0 }] });
    // c3 на своей дорожке (1), но её ребро к общему предку указывает в дорожку c2 (0) —
    // диагональ, которой рендерер рисует схождение.
    expect(bySha.get('c3')).toMatchObject({ lane: 1, parentEdges: [{ parentSha: 'c1', lane: 0 }] });
    expect(bySha.get('c1')).toMatchObject({ lane: 0, parentEdges: [] });
  });

  it('octopus-merge: у коммита с тремя родителями — три дорожки', () => {
    const nodes = layoutCommits([commit('m', ['a', 'b', 'c']), commit('a'), commit('b'), commit('c')]);
    const bySha = new Map(nodes.map((node) => [node.commit.sha, node]));

    expect(bySha.get('m')?.parentEdges).toEqual([
      { parentSha: 'a', lane: 0 },
      { parentSha: 'b', lane: 1 },
      { parentSha: 'c', lane: 2 },
    ]);
    expect(bySha.get('a')?.lane).toBe(0);
    expect(bySha.get('b')?.lane).toBe(1);
    expect(bySha.get('c')?.lane).toBe(2);
  });

  it('два независимых тупика веток без общего предка не пересекаются', () => {
    // Обе ветки видны «одновременно» (перемежаются в списке) — должны получить разные
    // дорожки и никогда не сослаться на дорожку друг друга.
    const nodes = layoutCommits([
      commit('a2', ['a1']),
      commit('b2', ['b1']),
      commit('a1'),
      commit('b1'),
    ]);
    const bySha = new Map(nodes.map((node) => [node.commit.sha, node]));

    expect(bySha.get('a2')?.lane).toBe(0);
    expect(bySha.get('a1')?.lane).toBe(0);
    expect(bySha.get('b2')?.lane).toBe(1);
    expect(bySha.get('b1')?.lane).toBe(1);
    expect(bySha.get('a2')?.parentEdges).toEqual([{ parentSha: 'a1', lane: 0 }]);
    expect(bySha.get('b2')?.parentEdges).toEqual([{ parentSha: 'b1', lane: 1 }]);
  });

  it('переиспользует освободившуюся дорожку для несвязанной ветки', () => {
    // a-ветка полностью заканчивается (её дорожка освобождается), только потом
    // начинается b-ветка — она должна встать на ту же, уже свободную дорожку 0.
    const nodes = layoutCommits([commit('a2', ['a1']), commit('a1'), commit('b2', ['b1']), commit('b1')]);
    const bySha = new Map(nodes.map((node) => [node.commit.sha, node]));

    expect(bySha.get('a2')?.lane).toBe(0);
    expect(bySha.get('a1')?.lane).toBe(0);
    expect(bySha.get('b2')?.lane).toBe(0);
    expect(bySha.get('b1')?.lane).toBe(0);
  });

  it('точка ветвления: второй ребёнок того же родителя переиспользует его дорожку', () => {
    // X и Y — два разных коммита с общим первым родителем R (обычная точка форка).
    const nodes = layoutCommits([commit('x', ['r']), commit('y', ['r']), commit('r')]);
    const bySha = new Map(nodes.map((node) => [node.commit.sha, node]));

    expect(bySha.get('x')).toMatchObject({ lane: 0, parentEdges: [{ parentSha: 'r', lane: 0 }] });
    // Y получает свежую дорожку (1), но ребро к общему родителю указывает туда же,
    // куда и у X (0) — R не размножается на несколько дорожек.
    expect(bySha.get('y')).toMatchObject({ lane: 1, parentEdges: [{ parentSha: 'r', lane: 0 }] });
    expect(bySha.get('r')).toMatchObject({ lane: 0, parentEdges: [] });
  });

  it('пустой список коммитов даёт пустой список узлов', () => {
    expect(layoutCommits([])).toEqual([]);
  });

  it('узлы по умолчанию без декораций', () => {
    const [node] = layoutCommits([commit('a')]);

    expect(node).toMatchObject({ branches: [], tags: [], stashes: [] });
  });
});
