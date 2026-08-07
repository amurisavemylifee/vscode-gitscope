import { useMemo, useState } from 'react';
import type { GraphRef } from '@shared/graph/model';
import type { GraphRefFilter } from '@shared/graphProtocol';
import { Icon } from '../../components/Icon';
import './BranchFilter.css';

interface BranchFilterProps {
  readonly availableRefs: readonly GraphRef[];
  /** Ветки, реально попавшие в текущий граф — источник состояния чекбоксов, когда фильтр не `custom`. */
  readonly includedRefs: readonly string[];
  readonly filter: GraphRefFilter;
  readonly onChange: (filter: GraphRefFilter) => void;
}

/**
 * Поиск и ручной выбор веток для графа, плюс переключатель «показать все».
 *
 * Дефолт — недавно живые ветки (см. `GraphService`) — держит граф читаемым в
 * репозитории с сотнями веток. Эта панель даёт осознанно выйти за его пределы:
 * добавить конкретную старую или удалённую ветку, либо снять галочку с одной из
 * дефолтных, либо честно попросить всё через `--all`.
 */
export function BranchFilter({ availableRefs, includedRefs, filter, onChange }: BranchFilterProps) {
  const [search, setSearch] = useState('');

  const includedSet = useMemo(() => new Set(includedRefs), [includedRefs]);
  const { local, remote } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = availableRefs.filter(
      (ref) => ref.kind !== 'tag' && (query === '' || ref.name.toLowerCase().includes(query)),
    );
    return {
      local: matching.filter((ref) => ref.kind === 'head'),
      remote: matching.filter((ref) => ref.kind === 'remote'),
    };
  }, [availableRefs, search]);

  const showingAll = filter.mode === 'all';

  const toggle = (name: string) => {
    const base = filter.mode === 'custom' ? filter.selectedRefs : includedRefs;
    const next = base.includes(name) ? base.filter((item) => item !== name) : [...base, name];
    onChange({ mode: 'custom', selectedRefs: next });
  };

  const renderGroup = (title: string, refs: readonly GraphRef[]) =>
    refs.length === 0 ? null : (
      <li className="gs-bfilter__group">
        <h3 className="gs-bfilter__group-title">{title}</h3>
        <ul className="gs-bfilter__group-list">
          {refs.map((ref) => (
            <li key={`${ref.kind}:${ref.name}`}>
              <label className={`gs-bfilter__item${ref.isCurrent ? ' gs-bfilter__item--current' : ''}`}>
                <input
                  type="checkbox"
                  disabled={showingAll}
                  checked={showingAll || includedSet.has(ref.name)}
                  onChange={() => toggle(ref.name)}
                />
                <Icon name={ref.kind === 'remote' ? 'remote' : 'branch'} size={12} />
                <span className="gs-bfilter__name">{ref.name}</span>
                {ref.isCurrent ? <span className="gs-bfilter__current-mark">текущая</span> : null}
              </label>
            </li>
          ))}
        </ul>
      </li>
    );

  return (
    <div className="gs-bfilter">
      <div className="gs-bfilter__search">
        <Icon name="search" size={13} />
        <input
          type="text"
          placeholder="Поиск веток…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <label className="gs-bfilter__all">
        <input
          type="checkbox"
          checked={showingAll}
          onChange={(event) =>
            onChange(event.target.checked ? { mode: 'all', selectedRefs: [] } : { mode: 'default', selectedRefs: [] })
          }
        />
        <span>
          Показать все ветки
          <span className="gs-bfilter__hint">включая давно не тронутые — граф станет плотнее</span>
        </span>
      </label>

      {local.length + remote.length === 0 ? (
        <p className="gs-bfilter__empty">Ничего не найдено</p>
      ) : (
        <ul className="gs-bfilter__list">
          {renderGroup('Локальные', local)}
          {renderGroup('С сервера', remote)}
        </ul>
      )}

      {filter.mode === 'custom' ? (
        <button
          type="button"
          className="gs-bfilter__reset"
          onClick={() => onChange({ mode: 'default', selectedRefs: [] })}
        >
          Сбросить к дефолту
        </button>
      ) : null}
    </div>
  );
}
