import type { GraphNode } from '@shared/graph/model';

/**
 * Геометрия одной дорожки внутри строки: где рисовать отрезок и докуда.
 *
 * - `top` — от верхнего края строки до центра, всегда вертикальный (входящее
 *   ребро приходит в ту же дорожку, где сидит сам коммит — это гарантирует
 *   алгоритм раскладки, поэтому диагоналей сверху не бывает).
 * - `bottom` — от центра до нижнего края; может быть диагональным, если
 *   родитель уходит в другую дорожку (`lane` ≠ `ownLane` этой строки).
 * - `through` — сквозной отрезок на всю высоту строки: дорожка чужого ребра,
 *   которое проходит через эту строку транзитом, не касаясь её коммита.
 */
export interface RowSegment {
  readonly lane: number;
  readonly part: 'top' | 'bottom' | 'through';
}

export interface RowLanes {
  readonly ownLane: number;
  readonly segments: readonly RowSegment[];
}

interface EdgeSpan {
  readonly lane: number;
  readonly fromRow: number;
  /** `undefined` — родитель за пределами загруженной истории (лимит/фильтр). */
  readonly toRow: number | undefined;
}

/**
 * Готовит геометрию для рендера дорожек графа по уже разложенным узлам.
 *
 * Отдельно от `layoutCommits`: та функция про то, какой SHA в какой дорожке
 * лежит, а эта — чисто про пиксели строки: что рисовать сверху, снизу и
 * транзитом. Смешивать их усложнило бы тестирование обеих вещей.
 */
export function buildRowLanes(nodes: readonly GraphNode[]): RowLanes[] {
  const rowBySha = new Map(nodes.map((node, index) => [node.commit.sha, index]));

  const spans: EdgeSpan[] = [];
  nodes.forEach((node, index) => {
    for (const edge of node.parentEdges) {
      spans.push({ lane: edge.lane, fromRow: index, toRow: rowBySha.get(edge.parentSha) });
    }
  });

  const incomingByRow = new Map<number, number[]>();
  for (const span of spans) {
    if (span.toRow !== undefined) {
      const lanes = incomingByRow.get(span.toRow) ?? [];
      lanes.push(span.lane);
      incomingByRow.set(span.toRow, lanes);
    }
  }

  return nodes.map((node, index) => {
    const segments: RowSegment[] = [];

    for (const lane of incomingByRow.get(index) ?? []) {
      segments.push({ lane, part: 'top' });
    }
    for (const span of spans) {
      if (span.fromRow === index) {
        segments.push({ lane: span.lane, part: 'bottom' });
      } else if (span.toRow !== undefined && span.fromRow < index && index < span.toRow) {
        segments.push({ lane: span.lane, part: 'through' });
      }
    }

    return { ownLane: node.lane, segments };
  });
}

/** Сколько дорожек нужно под весь список — ширина «шапки» с линиями. */
export function countLanes(nodes: readonly GraphNode[]): number {
  let max = 0;
  for (const node of nodes) {
    max = Math.max(max, node.lane);
    for (const edge of node.parentEdges) {
      max = Math.max(max, edge.lane);
    }
  }
  return max + 1;
}
