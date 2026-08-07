import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphEntity } from '@shared/graph/model';
import { plural } from '@shared/time';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { BranchFilter } from './components/BranchFilter';
import { DetailsPanel } from './components/DetailsPanel';
import { GraphCanvas } from './components/GraphCanvas';
import { entitySha, filterModeLabel } from './entity';
import { useGraphState } from './hooks/useGraphState';
import './App.css';

interface StoredLayout {
  readonly detailsWidth: number;
}

const MIN_DETAILS_WIDTH = 220;
const MAX_DETAILS_WIDTH = 480;

export function App() {
  const { ready, snapshot, error, loading } = useGraphState();

  const stored = useRef(persistedState.read<StoredLayout>()).current;
  const [detailsWidth, setDetailsWidth] = useState(stored.detailsWidth ?? 300);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const startResize = useResizer(detailsWidth, (width) => {
    setDetailsWidth(width);
    persistedState.write<StoredLayout>({ detailsWidth: width });
  });

  const nodes = snapshot?.nodes ?? [];

  const jumpToSha = useCallback(
    (sha: string) => {
      const node = nodes.find((candidate) => candidate.commit.sha === sha);
      if (node) {
        setSelectedEntity({ kind: 'commit', commit: node.commit });
      }
    },
    [nodes],
  );

  if (!ready) {
    return (
      <div className="gs-gapp">
        <EmptyState title="Готовим граф…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gs-gapp">
        <EmptyState
          tone="error"
          title="Не удалось построить граф"
          description={
            <>
              {error.message}
              {error.detail ? <div className="gs-gapp__error-detail">{error.detail}</div> : null}
            </>
          }
          action={
            <button type="button" className="gs-button" onClick={actions.reload}>
              Повторить
            </button>
          }
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="gs-gapp">
        <EmptyState title={loading ? 'Считаем граф…' : 'Репозиторий не выбран'} />
      </div>
    );
  }

  return (
    <div className="gs-gapp">
      <header className="gs-gheader">
        <span className="gs-gheader__repo">{snapshot.repositoryName}</span>
        <span className="gs-gheader__count">
          {nodes.length} {plural(nodes.length, ['коммит', 'коммита', 'коммитов'])}
          {snapshot.hasMore ? '+' : ''}
        </span>

        <div className="gs-gheader__spacer" />

        <div className="gs-gheader__filter">
          <button type="button" className="gs-button" onClick={() => setFilterOpen((open) => !open)}>
            <Icon name="branch" size={13} />
            {filterModeLabel(snapshot.filter.mode)}
            <Icon name={filterOpen ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
          {filterOpen ? (
            <div className="gs-gheader__popover">
              <BranchFilter
                availableRefs={snapshot.availableRefs}
                includedRefs={snapshot.includedRefs}
                filter={snapshot.filter}
                onChange={actions.setFilter}
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`gs-gheader__icon-button${loading ? ' gs-gheader__icon-button--spinning' : ''}`}
          title="Перечитать граф"
          disabled={loading}
          onClick={actions.reload}
        >
          <Icon name="refresh" size={15} />
        </button>
      </header>

      {nodes.length === 0 ? (
        <EmptyState
          title="Коммитов нет"
          description="Выбранные ветки не дали ни одного коммита — попробуйте изменить фильтр веток."
        />
      ) : (
        <div className="gs-gapp__body">
          <GraphCanvas
            nodes={nodes}
            selectedSha={entitySha(selectedEntity)}
            hasMore={snapshot.hasMore}
            loading={loading}
            onSelect={setSelectedEntity}
            onLoadMore={actions.loadMore}
          />
          <div
            className="gs-gapp__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ширина панели деталей"
            onPointerDown={startResize}
          />
          <DetailsPanel entity={selectedEntity} width={detailsWidth} onJumpToSha={jumpToSha} />
        </div>
      )}
    </div>
  );
}

/** Перетаскивание границы панели деталей — по смещению курсора, а не по абсолютной координате: панель справа. */
function useResizer(current: number, onChange: (width: number) => void) {
  const width = useRef(current);
  width.current = current;
  const startX = useRef(0);
  const startWidth = useRef(current);

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const delta = startX.current - event.clientX;
      const next = Math.min(MAX_DETAILS_WIDTH, Math.max(MIN_DETAILS_WIDTH, startWidth.current + delta));
      if (next !== width.current) {
        onChange(next);
      }
    };
    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onChange]);

  return useCallback((event: React.PointerEvent) => {
    startX.current = event.clientX;
    startWidth.current = width.current;
    setDragging(true);
  }, []);
}
