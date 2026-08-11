import type { HistoryTarget } from '@shared/historyModel';
import { plural } from '@shared/time';
import { Icon } from '../../components/Icon';
import './HistoryHeader.css';

interface HistoryHeaderProps {
  readonly target: HistoryTarget | null;
  readonly versionCount: number;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onReload: () => void;
}

/** Шапка панели: какой файл, в каком репозитории и сколько у него версий. */
export function HistoryHeader({ target, versionCount, hasMore, loading, onReload }: HistoryHeaderProps) {
  const segments = target?.path.split('/') ?? [];
  const name = segments.pop() ?? '';
  const directory = segments.length > 0 ? `${segments.join('/')}/` : '';

  return (
    <header className="gs-history-header">
      <Icon name="history" size={15} className="gs-history-header__icon" />

      <span className="gs-history-header__path" title={target?.path}>
        <span className="gs-history-header__directory">{directory}</span>
        <span className="gs-history-header__name">{name}</span>
      </span>

      {target ? <span className="gs-history-header__repository">{target.repositoryName}</span> : null}

      <span className="gs-history-header__spacer" />

      {versionCount > 0 ? (
        <span className="gs-history-header__count">
          {versionCount}
          {hasMore ? '+' : ''} {plural(versionCount, ['версия', 'версии', 'версий'])}
        </span>
      ) : null}

      <button
        type="button"
        className={`gs-history-header__action${loading ? ' gs-history-header__action--spinning' : ''}`}
        title="Перечитать историю"
        disabled={loading}
        onClick={onReload}
      >
        <Icon name="refresh" size={15} />
      </button>
    </header>
  );
}
