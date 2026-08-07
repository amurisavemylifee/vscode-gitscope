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
  const branches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return availableRefs.filter((ref) => ref.kind !== 'tag' && (query === '' || ref.name.toLowerCase().includes(query)));
  }, [availableRefs, search]);

  const toggle = (name: string) => {
    const base = filter.mode === 'custom' ? filter.selectedRefs : includedRefs;
    const next = base.includes(name) ? base.filter((item) => item !== name) : [...base, name];
    onChange({ mode: 'custom', selectedRefs: next });
  };

  return (
    <div className="gs-branch-filter">
      <div className="gs-branch-filter__search">
        <Icon name="search" size={13} />
        <input
          type="text"
          placeholder="Поиск веток…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <label className="gs-branch-filter__all">
        <input
          type="checkbox"
          checked={filter.mode === 'all'}
          onChange={(event) =>
            onChange(event.target.checked ? { mode: 'all', selectedRefs: [] } : { mode: 'default', selectedRefs: [] })
          }
        />
        Показать все ветки (--all)
      </label>

      <ul className="gs-branch-filter__list">
        {branches.map((ref) => (
          <li key={`${ref.kind}:${ref.name}`}>
            <label className="gs-branch-filter__item">
              <input
                type="checkbox"
                disabled={filter.mode === 'all'}
                checked={filter.mode === 'all' || includedSet.has(ref.name)}
                onChange={() => toggle(ref.name)}
              />
              <Icon name={ref.kind === 'remote' ? 'remote' : 'branch'} size={12} />
              <span className="gs-branch-filter__name">{ref.name}</span>
            </label>
          </li>
        ))}
        {branches.length === 0 ? <li className="gs-branch-filter__empty">Ничего не найдено</li> : null}
      </ul>

      {filter.mode === 'custom' ? (
        <button type="button" className="gs-button" onClick={() => onChange({ mode: 'default', selectedRefs: [] })}>
          Сбросить к дефолту
        </button>
      ) : null}
    </div>
  );
}
