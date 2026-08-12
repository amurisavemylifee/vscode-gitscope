import type { HistoryEntry } from '@shared/historyModel';
import type { ViewMode } from '@shared/model';
import { Icon, type IconName } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import './VersionHeader.css';

/** Что показывать справа: файл целиком или только внесённые версией изменения. */
export type VersionMode = 'content' | 'diff';

/**
 * Что предлагает кнопка разворачивания: показать скрытые строки, свернуть их
 * обратно или ничего — когда сворачивать и разворачивать нечего.
 */
export type ExpandMode = 'expand' | 'collapse' | 'none';

interface VersionHeaderProps {
  readonly entry: HistoryEntry | null;
  readonly mode: VersionMode;
  readonly viewMode: ViewMode;
  /** Сколько в версии изменений и на котором из них стоит просмотр. */
  readonly changeCount: number;
  readonly changeIndex: number;
  readonly expandMode: ExpandMode;
  readonly onModeChange: (mode: VersionMode) => void;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onStepChange: (delta: number) => void;
  readonly onToggleExpand: () => void;
  readonly onOpen: () => void;
}

/** Шапка правой области: что именно показано и что с этим можно сделать. */
export function VersionHeader({
  entry,
  mode,
  viewMode,
  changeCount,
  changeIndex,
  expandMode,
  onModeChange,
  onViewModeChange,
  onStepChange,
  onToggleExpand,
  onOpen,
}: VersionHeaderProps) {
  if (!entry) {
    return null;
  }

  return (
    <header className="gs-version-header">
      <StatusBadge status={entry.status} />

      <span className="gs-version-header__path" title={entry.path}>
        {entry.path}
      </span>

      <span className="gs-version-header__spacer" />

      {mode === 'diff' && changeCount > 0 ? (
        <div className="gs-version-header__nav" role="group" aria-label="Переход по изменениям">
          <button
            type="button"
            className="gs-version-header__action"
            title="Предыдущее изменение (Alt+↑)"
            onClick={() => onStepChange(-1)}
          >
            <Icon name="chevron-up" size={14} />
          </button>
          <span className="gs-version-header__counter" aria-label={`Изменение ${changeIndex + 1} из ${changeCount}`}>
            {changeIndex + 1}/{changeCount}
          </span>
          <button
            type="button"
            className="gs-version-header__action"
            title="Следующее изменение (Alt+↓)"
            onClick={() => onStepChange(1)}
          >
            <Icon name="chevron-down" size={14} />
          </button>
        </div>
      ) : null}

      {mode === 'diff' && expandMode !== 'none' ? (
        <button
          type="button"
          className="gs-version-header__action"
          title={expandMode === 'expand' ? 'Показать файл целиком' : 'Свернуть неизменённые строки'}
          onClick={onToggleExpand}
        >
          <Icon name={expandMode === 'expand' ? 'unfold' : 'fold'} size={14} />
        </button>
      ) : null}

      <div className="gs-segmented" role="group" aria-label="Что показывать">
        <SegmentedButton active={mode === 'content'} label="Файл" onClick={() => onModeChange('content')} />
        <SegmentedButton active={mode === 'diff'} label="Изменения" onClick={() => onModeChange('diff')} />
      </div>

      {mode === 'diff' ? (
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
      ) : null}

      {/* Открывается то же, что показано: файл — версией, изменения — сравнением. */}
      <button
        type="button"
        className="gs-version-header__action"
        title={
          mode === 'content'
            ? 'Открыть эту версию отдельной вкладкой (Enter)'
            : 'Открыть эти изменения отдельной вкладкой (Enter)'
        }
        onClick={onOpen}
      >
        {/* Значок один: рядом стоит переключатель колонок, и вторая «полоса с
            колонками» читалась бы как ещё один режим отображения. */}
        <Icon name="external" size={14} />
      </button>
    </header>
  );
}

function SegmentedButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon?: IconName;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`gs-segmented__button${active ? ' gs-segmented__button--active' : ''}`}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={14} /> : label}
    </button>
  );
}
