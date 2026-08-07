import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '@shared/graph/model';
import { layoutCommits } from '@shared/graph/layout';
import { buildRowLanes, countLanes } from '../../webview/graph/lanes';

const commit = (sha: string, parents: readonly string[] = []): GraphCommit => ({
  sha,
  shortSha: sha.slice(0, 7),
  subject: sha,
  authorName: 'Тест',
  authoredAt: '2026-01-01T00:00:00+00:00',
  parents,
});

describe('buildRowLanes', () => {
  it('линейная история: прямая линия через весь список, без верхнего отрезка у первой строки', () => {
    const nodes = layoutCommits([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1')]);
    const rows = buildRowLanes(nodes);

    expect(rows[0]).toEqual({ ownLane: 0, segments: [{ lane: 0, part: 'bottom' }] });
    expect(rows[1]).toEqual({ ownLane: 0, segments: [{ lane: 0, part: 'top' }, { lane: 0, part: 'bottom' }] });
    expect(rows[2]).toEqual({ ownLane: 0, segments: [{ lane: 0, part: 'top' }] });
  });

  it('строка без родителей и без входящих рёбер — совсем без отрезков', () => {
    const rows = buildRowLanes(layoutCommits([commit('a')]));

    expect(rows).toEqual([{ ownLane: 0, segments: [] }]);
  });

  it('диагональ: ребро в чужую дорожку рисуется как bottom-сегмент от своей дорожки в чужую', () => {
    // main: c1 → c2; feature (от c1): c3; merge m = merge(c2, c3).
    const nodes = layoutCommits([commit('m', ['c2', 'c3']), commit('c2', ['c1']), commit('c3', ['c1']), commit('c1')]);
    const rows = buildRowLanes(nodes);

    // c3 сидит на дорожке 1, но её ребро к c1 указывает в дорожку 0 — диагональ.
    const c3Row = rows[2];
    expect(c3Row?.ownLane).toBe(1);
    expect(c3Row?.segments).toContainEqual({ lane: 0, part: 'bottom' });
  });

  it('сквозной проход: линия одной дорожки проходит через строку чужого коммита', () => {
    // main: m1 → m2; feature (от m1): f1. Порядок строк: f1, m2, m1 — между
    // строкой f1 (дорожка 0) и строкой m1 (дорожка 0) лежит строка m2 (дорожка 1),
    // через которую дорожка 0 должна пройти транзитом.
    const nodes = layoutCommits([commit('f1', ['m1']), commit('m2', ['m1']), commit('m1')]);
    const rows = buildRowLanes(nodes);

    expect(rows[0]).toMatchObject({ ownLane: 0, segments: [{ lane: 0, part: 'bottom' }] });
    // Своя диагональ m2 (дорожка 1 → 0) плюс сквозной проход дорожки 0 от f1.
    expect(rows[1]?.ownLane).toBe(1);
    expect(rows[1]?.segments).toContainEqual({ lane: 0, part: 'bottom' });
    expect(rows[1]?.segments).toContainEqual({ lane: 0, part: 'through' });
    // В m1 сходятся оба ребра — от f1 и от m2, оба в дорожку 0.
    expect(rows[2]?.segments.filter((segment) => segment.part === 'top')).toEqual([
      { lane: 0, part: 'top' },
      { lane: 0, part: 'top' },
    ]);
  });

  it('ребро к родителю за пределами загруженной истории — просто обрубок снизу, без сквозного прохода', () => {
    // История урезана лимитом: у c2 есть родитель c1, но c1 в списке уже нет.
    const nodes = layoutCommits([commit('c2', ['c1'])]);
    const rows = buildRowLanes(nodes);

    expect(rows).toEqual([{ ownLane: 0, segments: [{ lane: 0, part: 'bottom' }] }]);
  });

  it('пустой список коммитов даёт пустой список строк', () => {
    expect(buildRowLanes([])).toEqual([]);
  });
});

describe('countLanes', () => {
  it('считает максимум и по своим дорожкам узлов, и по дорожкам рёбер', () => {
    const nodes = layoutCommits([commit('m', ['a', 'b', 'c']), commit('a'), commit('b'), commit('c')]);

    expect(countLanes(nodes)).toBe(3);
  });

  it('на пустом графе — одна дорожка', () => {
    expect(countLanes([])).toBe(1);
  });
});
