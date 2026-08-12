import { useEffect, useState } from 'react';
import type { HistoryEntry } from '@shared/historyModel';
import type { ViewMode } from '@shared/model';
import { Icon, type IconName } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import './VersionHeader.css';

/** Что показывать справа: файл целиком или только внесённые версией изменения. */
export type VersionMode = 'content' | 'diff';

/** Сколько держать отметку об успешном копировании. */
const COPIED_FEEDBACK_MS = 1200;

interface VersionHeaderProps {
  readonly entry: HistoryEntry | null;
  readonly mode: VersionMode;
  readonly viewMode: ViewMode;
  readonly onModeChange: (mode: VersionMode) => void;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onOpen: () => void;
  readonly onCopySha: () => Promise<unknown>;
}

/** Шапка правой области: что именно показано и что с этим можно сделать. */
export function VersionHeader({
  entry,
  mode,
  viewMode,
  onModeChange,
  onViewModeChange,
  onOpen,
  onCopySha,
}: VersionHeaderProps) {
  if (!entry) {
    return null;
  }

  const working = entry.kind === 'working';

  return (
    <header className="gs-version-header">
      <StatusBadge status={entry.status} />

      <span className="gs-version-header__path" title={entry.path}>
        {entry.path}
      </span>

      <span className="gs-version-header__spacer" />

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

      {working ? null : <CopyShaButton onCopy={onCopySha} />}

      <button
        type="button"
        className="gs-version-header__action"
        title="Открыть эту версию отдельной вкладкой (Enter)"
        onClick={onOpen}
      >
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

/**
 * Копирование SHA с подтверждением на самой кнопке.
 *
 * Всплывающее сообщение ради двух десятков символов — слишком громко, а молчание
 * оставляет вопрос «скопировалось или нет».
 */
function CopyShaButton({ onCopy }: { readonly onCopy: () => Promise<unknown> }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`gs-version-header__action${copied ? ' gs-version-header__action--done' : ''}`}
      title={copied ? 'SHA скопирован' : 'Скопировать SHA коммита'}
      onClick={() => {
        void onCopy().then(() => setCopied(true));
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  );
}
