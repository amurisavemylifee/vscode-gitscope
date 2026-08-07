import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { formatAbsoluteTime, formatRelativeTime } from '@shared/time';
import { badgeAppearance, RefBadge, type BadgeEntity } from './RefBadge';
import type { RowLanes, RowSegment } from '../lanes';
import './GraphRow.css';

export const ROW_HEIGHT = 30;
export const LANE_WIDTH = 15;
/** Число различимых цветов дорожек — дальше циклически повторяются. */
export const LANE_PALETTE_SIZE = 8;

const DOT_RADIUS = 4;
/** Радиус кольца merge-коммита: чуть больше обычной точки, чтобы слияние читалось с одного взгляда. */
const MERGE_DOT_RADIUS = 4.5;

interface GraphRowProps {
  readonly node: GraphNode;
  readonly rowLanes: RowLanes;
  readonly laneCount: number;
  readonly selected: boolean;
  readonly onSelect: (entity: GraphEntity) => void;
}

/** Одна строка графа: дорожки слева, коммит и бейджи справа. */
export function GraphRow({ node, rowLanes, laneCount, selected, onSelect }: GraphRowProps) {
  const { commit } = node;
  const isMerge = commit.parents.length > 1;
  const decorations = node.branches.length + node.tags.length + node.stashes.length;

  return (
    <div
      className={`gs-grow${selected ? ' gs-grow--selected' : ''}`}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect({ kind: 'commit', commit })}
    >
      <svg
        className="gs-grow__lanes"
        width={laneCount * LANE_WIDTH}
        height={ROW_HEIGHT}
        aria-hidden="true"
        focusable="false"
      >
        {rowLanes.segments.map((segment, index) => (
          <LaneSegment key={index} segment={segment} ownLane={rowLanes.ownLane} />
        ))}
        <circle
          className={`gs-grow__dot${isMerge ? ' gs-grow__dot--merge' : ''} gs-lane-${rowLanes.ownLane % LANE_PALETTE_SIZE}`}
          cx={laneX(rowLanes.ownLane)}
          cy={ROW_HEIGHT / 2}
          r={isMerge ? MERGE_DOT_RADIUS : DOT_RADIUS}
        />
      </svg>

      <span className="gs-grow__main">
        {decorations > 0 ? (
          <span className="gs-grow__badges">
            {node.branches.map((ref) => (
              <RefBadgeFor key={`branch:${ref.kind}:${ref.name}`} entity={{ kind: 'branch', ref }} onSelect={onSelect} />
            ))}
            {node.tags.map((ref) => (
              <RefBadgeFor key={`tag:${ref.name}`} entity={{ kind: 'tag', ref }} onSelect={onSelect} />
            ))}
            {node.stashes.map((stash) => (
              <RefBadgeFor key={`stash:${stash.ref}`} entity={{ kind: 'stash', stash }} onSelect={onSelect} />
            ))}
          </span>
        ) : null}
        <span className="gs-grow__subject" title={commit.subject}>
          {commit.subject}
        </span>
      </span>

      <span className="gs-grow__author" title={commit.authorName}>
        {commit.authorName}
      </span>
      <span className="gs-grow__date" title={formatAbsoluteTime(commit.authoredAt)}>
        {formatRelativeTime(commit.authoredAt)}
      </span>
      <span className="gs-grow__sha">{commit.shortSha}</span>
    </div>
  );
}

function RefBadgeFor({
  entity,
  onSelect,
}: {
  readonly entity: BadgeEntity;
  readonly onSelect: (entity: GraphEntity) => void;
}) {
  const { icon, tone } = badgeAppearance(entity);
  const label = entity.kind === 'stash' ? entity.stash.ref : entity.ref.name;

  return <RefBadge icon={icon} tone={tone} label={label} onClick={() => onSelect(entity)} />;
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

/**
 * Отрезок одной дорожки внутри строки.
 *
 * Переход между дорожками рисуется кубической кривой, а не диагональю: на
 * плотной истории ломаные линии дают «частокол» из острых углов, и глаз
 * перестаёт прослеживать отдельную линию. Контрольные точки стоят на середине
 * по вертикали — получается симметричная S, у которой начало и конец строго
 * вертикальны и стыкуются с соседними строками без излома.
 */
function LaneSegment({ segment, ownLane }: { readonly segment: RowSegment; readonly ownLane: number }) {
  const colorClass = `gs-lane-${segment.lane % LANE_PALETTE_SIZE}`;
  const middle = ROW_HEIGHT / 2;

  if (segment.part === 'top') {
    return <line className={colorClass} x1={laneX(segment.lane)} y1={0} x2={laneX(segment.lane)} y2={middle} />;
  }
  if (segment.part === 'through') {
    return <line className={colorClass} x1={laneX(segment.lane)} y1={0} x2={laneX(segment.lane)} y2={ROW_HEIGHT} />;
  }

  const from = laneX(ownLane);
  const to = laneX(segment.lane);
  if (from === to) {
    return <line className={colorClass} x1={from} y1={middle} x2={to} y2={ROW_HEIGHT} />;
  }

  const control = middle + (ROW_HEIGHT - middle) / 2;
  return (
    <path
      className={colorClass}
      d={`M ${from} ${middle} C ${from} ${control}, ${to} ${control}, ${to} ${ROW_HEIGHT}`}
    />
  );
}
