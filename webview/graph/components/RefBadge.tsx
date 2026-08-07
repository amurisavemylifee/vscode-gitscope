import { Icon, type IconName } from '../../components/Icon';
import type { GraphEntity } from '@shared/graph/model';
import './RefBadge.css';

interface RefBadgeProps {
  readonly icon: IconName;
  readonly label: string;
  readonly tone?: 'branch' | 'remote' | 'tag' | 'stash' | 'current';
  readonly title?: string;
  readonly onClick: () => void;
}

/** Маленькая кликабельная плашка — ветка, тег или стеш, висящие на коммите. */
export function RefBadge({ icon, label, tone = 'branch', title, onClick }: RefBadgeProps) {
  return (
    <button
      type="button"
      className={`gs-ref-badge gs-ref-badge--${tone}`}
      title={title ?? label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} size={11} />
      <span className="gs-ref-badge__label">{label}</span>
    </button>
  );
}

/** Бейджами показываются только эти три вида сущностей — коммит выбирается кликом по строке, не по бейджу. */
export type BadgeEntity = Extract<GraphEntity, { kind: 'branch' | 'tag' | 'stash' }>;

/** Иконка и оттенок бейджа по типу сущности графа. */
export function badgeAppearance(entity: BadgeEntity): { icon: IconName; tone: RefBadgeProps['tone'] } {
  switch (entity.kind) {
    case 'branch': {
      if (entity.ref.isCurrent) {
        return { icon: 'branch', tone: 'current' };
      }
      return entity.ref.kind === 'remote' ? { icon: 'remote', tone: 'remote' } : { icon: 'branch', tone: 'branch' };
    }
    case 'tag':
      return { icon: 'tag', tone: 'tag' };
    case 'stash':
      return { icon: 'stash', tone: 'stash' };
  }
}
