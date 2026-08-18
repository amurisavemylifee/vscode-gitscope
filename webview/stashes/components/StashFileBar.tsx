import type { ViewMode } from '@shared/model';
import type { StashFile } from '@shared/stashModel';
import { Icon } from '../../components/Icon';
import { SegmentedButton } from '../../components/Segmented';
import { StatusBadge } from '../../components/StatusBadge';
import './StashFileBar.css';

interface StashFileBarProps {
  /** Файл, который сейчас перед глазами; `null` — показывать нечего. */
  readonly file: StashFile | null;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onCollapseAll: () => void;
  readonly onExpandAll: () => void;
  readonly onOpenFile: () => void;
  readonly onOpenDiff: () => void;
}

/** Шапка правой области: какой файл показан и что с ним можно сделать. */
export function StashFileBar({
  file,
  viewMode,
  onViewModeChange,
  onCollapseAll,
  onExpandAll,
  onOpenFile,
  onOpenDiff,
}: StashFileBarProps) {
  return (
    <header className="gs-stash-bar">
      {file ? <StatusBadge status={file.status} /> : null}

      <span className="gs-stash-bar__path" title={file?.path}>
        {file?.path ?? ''}
      </span>

      {file?.untracked === true ? (
        <span className="gs-stash-bar__note" title="Файла не было в git: показан целиком">
          не был в git
        </span>
      ) : null}

      <span className="gs-stash-bar__spacer" />

      <button type="button" className="gs-stash-bar__action" title="Свернуть все файлы" onClick={onCollapseAll}>
        <Icon name="fold" size={14} />
      </button>

      <button type="button" className="gs-stash-bar__action" title="Развернуть все файлы" onClick={onExpandAll}>
        <Icon name="unfold" size={14} />
      </button>

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
        className="gs-stash-bar__action"
        title="Открыть файл из стеша отдельной вкладкой"
        disabled={!file}
        onClick={onOpenFile}
      >
        <Icon name="file" size={14} />
      </button>

      <button
        type="button"
        className="gs-stash-bar__action"
        title="Открыть эти изменения отдельной вкладкой"
        disabled={!file}
        onClick={onOpenDiff}
      >
        <Icon name="external" size={14} />
      </button>
    </header>
  );
}
