import type { ComparisonSummary, Side, ViewMode } from '@shared/model';
import type { FetchInfo } from '@shared/protocol';
import { formatRelativeTime } from '@shared/time';
import { plural } from '@shared/time';
import { DiffStat } from './DiffStat';
import { Icon, type IconName } from './Icon';
import { RevisionButton } from './RevisionButton';
import './CompareHeader.css';

interface CompareHeaderProps {
  readonly summary: ComparisonSummary | null;
  readonly fetch: FetchInfo;
  readonly loading: boolean;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onPickRevision: (side: Side) => void;
  readonly onSwap: () => void;
  readonly onReload: () => void;
  readonly onFetch: () => void;
}

/** Fetch старше суток — повод предупредить: сравнение с origin/* уже может врать. */
const STALE_FETCH_MS = 24 * 60 * 60 * 1000;

export function CompareHeader({
  summary,
  fetch,
  loading,
  viewMode,
  onViewModeChange,
  onPickRevision,
  onSwap,
  onReload,
  onFetch,
}: CompareHeaderProps) {
  return (
    <header className="gs-header">
      <div className="gs-header__row">
        <RevisionButton revision={summary?.base ?? null} hint="Базовая ревизия" onClick={() => onPickRevision('base')} />

        <button type="button" className="gs-header__swap" title="Поменять ревизии местами" onClick={onSwap}>
          <Icon name="swap" size={15} />
        </button>

        <RevisionButton
          revision={summary?.compare ?? null}
          hint="Сравниваемая ревизия"
          onClick={() => onPickRevision('compare')}
        />

        <div className="gs-header__spacer" />

        {summary ? (
          <span className="gs-header__summary">
            <DiffStat insertions={summary.insertions} deletions={summary.deletions} />
            <span className="gs-header__files">
              {summary.files.length} {plural(summary.files.length, ['файл', 'файла', 'файлов'])}
            </span>
          </span>
        ) : null}

        <div className="gs-header__modes" role="group" aria-label="Режим отображения">
          <ModeButton
            active={viewMode === 'unified'}
            icon="rows"
            label="Одной колонкой"
            onClick={() => onViewModeChange('unified')}
          />
          <ModeButton
            active={viewMode === 'split'}
            icon="columns"
            label="Двумя колонками"
            onClick={() => onViewModeChange('split')}
          />
        </div>

        <button
          type="button"
          className={`gs-header__icon-button${loading ? ' gs-header__icon-button--spinning' : ''}`}
          title="Перечитать сравнение"
          disabled={loading}
          onClick={onReload}
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>

      <div className="gs-header__row gs-header__row--meta">
        {summary ? <span className="gs-header__repo">{summary.repositoryName}</span> : null}
        {fetch.hasRemote ? <FetchStatus fetch={fetch} onFetch={onFetch} /> : null}
      </div>
    </header>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: IconName;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`gs-header__mode${active ? ' gs-header__mode--active' : ''}`}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function FetchStatus({ fetch, onFetch }: { readonly fetch: FetchInfo; readonly onFetch: () => void }) {
  const stale = fetch.lastFetchedAt !== undefined && Date.now() - fetch.lastFetchedAt > STALE_FETCH_MS;
  const when = fetch.lastFetchedAt === undefined ? 'неизвестно когда' : formatRelativeTime(fetch.lastFetchedAt);

  return (
    <span className={`gs-fetch${stale ? ' gs-fetch--stale' : ''}`}>
      {stale ? <Icon name="warning" size={12} /> : null}
      <span>ссылки с сервера обновлялись {when}</span>
      <button type="button" className="gs-fetch__button" disabled={fetch.inProgress} onClick={onFetch}>
        <Icon name="download" size={12} />
        {fetch.inProgress ? 'обновляем…' : 'обновить'}
      </button>
    </span>
  );
}
