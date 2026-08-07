import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { buildRowLanes, countLanes } from '../lanes';
import { nextSelectedIndex } from '../navigation';
import { GraphRow, LANE_WIDTH, ROW_HEIGHT } from './GraphRow';
import './GraphCanvas.css';

interface GraphCanvasProps {
  readonly nodes: readonly GraphNode[];
  readonly selectedSha: string | null;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onSelect: (entity: GraphEntity) => void;
  readonly onLoadMore: () => void;
}

/** Сколько строк до конца списка начинаем подгружать следующую порцию истории. */
const LOAD_MORE_THRESHOLD = 20;
/** Предел ширины области дорожек: за ним граф съедает место у тем коммитов. */
const MAX_LANE_AREA = 220;

/**
 * Все коммиты одним виртуализированным списком — на большом графе их могут быть
 * тысячи. Высота строки фиксирована, поэтому измерять элементы не нужно, как и
 * в `DiffCanvas`.
 *
 * Список ведёт себя как listbox с активным потомком: строки виртуализированы, и
 * переносить на них фокус нельзя — уехавшая за пределы окна строка забрала бы
 * фокус с собой в никуда. Поэтому фокус живёт на самом контейнере, а выбранная
 * строка помечается `aria-activedescendant`.
 */
export function GraphCanvas({ nodes, selectedSha, hasMore, loading, onSelect, onLoadMore }: GraphCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowLanes = useMemo(() => buildRowLanes(nodes), [nodes]);
  const laneCount = useMemo(() => countLanes(nodes), [nodes]);
  const selectedIndex = useMemo(
    () => (selectedSha === null ? -1 : nodes.findIndex((node) => node.commit.sha === selectedSha)),
    [nodes, selectedSha],
  );

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => nodes[index]?.commit.sha ?? index,
    overscan: 16,
  });

  const items = virtualizer.getVirtualItems();
  const lastVisibleIndex = items[items.length - 1]?.index ?? 0;

  useEffect(() => {
    if (!loading && hasMore && lastVisibleIndex >= nodes.length - LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  }, [lastVisibleIndex, hasMore, loading, nodes.length, onLoadMore]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const next = nextSelectedIndex(event.key, selectedIndex, nodes.length);
      const node = next === null ? undefined : nodes[next];
      if (next === null || !node) {
        return;
      }
      event.preventDefault();
      onSelect({ kind: 'commit', commit: node.commit });
      virtualizer.scrollToIndex(next, { align: 'auto' });
    },
    [nodes, selectedIndex, onSelect, virtualizer],
  );

  return (
    <div
      className="gs-gcanvas"
      ref={scrollRef}
      role="listbox"
      aria-label="Коммиты"
      aria-activedescendant={selectedIndex >= 0 ? rowId(selectedSha) : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ '--gs-lane-area': `${Math.min(MAX_LANE_AREA, laneCount * LANE_WIDTH)}px` } as React.CSSProperties}
    >
      <div className="gs-gcanvas__list" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {items.map((item) => {
          const node = nodes[item.index];
          const lanes = rowLanes[item.index];
          if (!node || !lanes) {
            return null;
          }
          return (
            <div
              key={item.key}
              id={rowId(node.commit.sha)}
              className="gs-gcanvas__row"
              style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
            >
              <GraphRow
                node={node}
                rowLanes={lanes}
                laneCount={laneCount}
                selected={node.commit.sha === selectedSha}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>

      {hasMore && loading ? <div className="gs-gcanvas__more">Загружаем историю…</div> : null}
    </div>
  );
}

const rowId = (sha: string | null) => `gs-commit-${sha ?? ''}`;
