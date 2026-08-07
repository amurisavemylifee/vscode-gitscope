import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { buildRowLanes, countLanes } from '../lanes';
import { GraphRow, ROW_HEIGHT } from './GraphRow';
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

/**
 * Все коммиты одним виртуализированным списком — на большом графе их могут быть
 * тысячи. Высота строки фиксирована, поэтому измерять элементы не нужно, как и
 * в `DiffCanvas`.
 */
export function GraphCanvas({ nodes, selectedSha, hasMore, loading, onSelect, onLoadMore }: GraphCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowLanes = useMemo(() => buildRowLanes(nodes), [nodes]);
  const laneCount = useMemo(() => countLanes(nodes), [nodes]);

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

  return (
    <div className="gs-gcanvas" ref={scrollRef}>
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
    </div>
  );
}
