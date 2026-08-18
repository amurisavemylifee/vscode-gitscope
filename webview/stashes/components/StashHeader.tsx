import type { StashTarget } from '@shared/stashModel';
import { plural } from '@shared/time';
import { Icon } from '../../components/Icon';
import './StashHeader.css';

interface StashHeaderProps {
  readonly target: StashTarget | null;
  readonly count: number;
  readonly loading: boolean;
  readonly onReload: () => void;
}

/** Шапка панели: чьи стеши, сколько их и кнопка перечитать список. */
export function StashHeader({ target, count, loading, onReload }: StashHeaderProps) {
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
