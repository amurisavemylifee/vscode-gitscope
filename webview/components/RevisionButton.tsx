import type { Revision } from '@shared/model';
import { Icon, type IconName } from './Icon';
import './RevisionButton.css';

interface RevisionButtonProps {
  readonly revision: Revision | null;
  /** Что это за ревизия: первая строка подсказки при наведении. */
  readonly hint: string;
  readonly onClick: () => void;
}

/**
 * Кнопка выбора точки истории: ветка, тег или коммит.
 *
 * Одна на все панели — и в сравнении ревизий, и в истории файла селектор
 * обязан выглядеть и вести себя одинаково: это одно и то же действие.
 */
export function RevisionButton({ revision, hint, onClick }: RevisionButtonProps) {
  const title = revision
    ? [hint, revision.subject, revision.authorName, revision.sha.slice(0, 12)]
        .filter((part) => part !== undefined && part !== '')
        .join('\n')
    : hint;

  return (
    <button type="button" className="gs-revision" title={title} onClick={onClick}>
      <Icon name={revision ? iconForSpec(revision.spec) : 'commit'} />
      <span className="gs-revision__label">{revision?.label ?? 'выбрать…'}</span>
      <Icon name="chevron-down" size={12} className="gs-revision__caret" />
    </button>
  );
}

/** Грубая эвристика для иконки: она подсказывает, а не утверждает. */
function iconForSpec(spec: string): IconName {
  if (/^[0-9a-f]{7,40}$/i.test(spec)) {
    return 'commit';
  }
  if (spec.includes('/')) {
    return 'remote';
  }
  return 'branch';
}
