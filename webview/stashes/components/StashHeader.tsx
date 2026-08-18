import type { ViewMode } from '@shared/model';
import type { StashTarget } from '@shared/stashModel';
import { plural } from '@shared/time';
import { Icon } from '../../components/Icon';
import { SegmentedButton } from '../../components/Segmented';
import './StashHeader.css';

interface StashHeaderProps {
  readonly target: StashTarget | null;
  readonly count: number;
  readonly loading: boolean;
  readonly hasFiles: boolean;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onCollapseAll: () => void;
  readonly onExpandAll: () => void;
  readonly onReload: () => void;
}

/** Шапка панели: чьи стеши, сколько их и что можно сделать с показанным диффом. */
export function StashHeader({
  target,
  count,
  loading,
  hasFiles,
  viewMode,
  onViewModeChange,
  onCollapseAll,
  onExpandAll,
  onReload,
}: StashHeaderProps) {
  return (
    <header className="gs-stashes-header">
      <Icon name="archive" size={15} className="gs-stashes-header__icon" />

      <span className="gs-stashes-header__title">Стеши</span>

      {target ? <span className="gs-stashes-header__repository">{target.repositoryName}</span> : null}

      <span className="gs-stashes-header__spacer" />

      {count > 0 ? (
        <span className="gs-stashes-header__count">
          {count} {plural(count, ['стеш', 'стеша', 'стешей'])}
        </span>
      ) : null}

      <div className="gs-segmented" role="group" aria-label="Режим отображения">
        <SegmentedButton
          active={viewMode === 'unified'}
          icon="rows"
          label="Одной колонкой"
          onClick={() => onViewModeChange('unified')}
        />
        <SegmentedButton
          active={viewMode === 'split'}
          icon="columns"
          label="Двумя колонками"
          onClick={() => onViewModeChange('split')}
        />
      </div>

      <button
        type="button"
        className="gs-stashes-header__action"
        title="Свернуть все файлы"
        disabled={!hasFiles}
        onClick={onCollapseAll}
      >
        <Icon name="fold" size={15} />
      </button>

      <button
        type="button"
        className="gs-stashes-header__action"
        title="Развернуть все файлы"
        disabled={!hasFiles}
        onClick={onExpandAll}
      >
        <Icon name="unfold" size={15} />
      </button>

      <button
        type="button"
        className={`gs-stashes-header__action${loading ? ' gs-stashes-header__action--spinning' : ''}`}
        title="Перечитать список стешей"
        disabled={loading}
        onClick={onReload}
      >
        <Icon name="refresh" size={15} />
      </button>
    </header>
  );
}
