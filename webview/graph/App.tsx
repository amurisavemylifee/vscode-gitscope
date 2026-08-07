import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const MIN_DETAILS_WIDTH = 260;
const MAX_DETAILS_WIDTH = 520;

export function App() {
  const { ready, snapshot, error, loading } = useGraphState();

  const stored = useRef(persistedState.read<StoredLayout>()).current;
  const [detailsWidth, setDetailsWidth] = useState(stored.detailsWidth ?? 340);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const startResize = useResizer(detailsWidth, (width) => {
    setDetailsWidth(width);
    persistedState.write<StoredLayout>({ detailsWidth: width });
  });

  const nodes = useMemo(() => snapshot?.nodes ?? [], [snapshot]);
  const selectedSha = entitySha(selectedEntity);
  const selectedNode = useMemo(
    () => (selectedSha === null ? null : (nodes.find((node) => node.commit.sha === selectedSha) ?? null)),
    [nodes, selectedSha],
  );

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
        <span className="gs-gheader__repo">
          <Icon name="branch" size={13} className="gs-gheader__repo-icon" />
          {snapshot.repositoryName}
        </span>
        <span className="gs-gheader__count">
          {nodes.length} {plural(nodes.length, ['коммит', 'коммита', 'коммитов'])}
          {snapshot.hasMore ? ' и ещё' : ''}
        </span>

        <div className="gs-gheader__spacer" />

        <FilterMenu open={filterOpen} onOpenChange={setFilterOpen} label={filterModeLabel(snapshot.filter.mode)}>
          <BranchFilter
            availableRefs={snapshot.availableRefs}
            includedRefs={snapshot.includedRefs}
            filter={snapshot.filter}
            onChange={actions.setFilter}
          />
        </FilterMenu>

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
            selectedSha={selectedSha}
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
          <DetailsPanel
            entity={selectedEntity}
            node={selectedNode}
            width={detailsWidth}
            onJumpToSha={jumpToSha}
            onSelect={setSelectedEntity}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Выпадающая панель фильтра веток.
 *
 * Закрывается по Escape и клику мимо — иначе поповер, перекрывающий верх графа,
 * приходилось бы закрывать той же кнопкой, которой открыл, и он воспринимался бы
 * как режим, а не как меню.
 */
function FilterMenu({
  open,
  onOpenChange,
  label,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className="gs-gheader__filter" ref={container}>
      <button
        type="button"
        className={`gs-button gs-gheader__filter-button${open ? ' gs-gheader__filter-button--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="branch" size={13} />
        {label}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </button>
      {open ? (
        <div className="gs-gheader__popover" role="dialog" aria-label="Фильтр веток">
          {children}
        </div>
      ) : null}
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
