import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { formatRelativeTime } from '@shared/time';
import { badgeAppearance, RefBadge, type BadgeEntity } from './RefBadge';
import type { RowLanes, RowSegment } from '../lanes';
import './GraphRow.css';

export const ROW_HEIGHT = 28;
export const LANE_WIDTH = 16;
/** Число различимых цветов дорожек — дальше циклически повторяются. */
export const LANE_PALETTE_SIZE = 8;

interface GraphRowProps {
  readonly node: GraphNode;
  readonly rowLanes: RowLanes;
  readonly laneCount: number;
  readonly selected: boolean;
  readonly onSelect: (entity: GraphEntity) => void;
}

/** Одна строка графа: дорожки слева, коммит и бейджи справа. */
export function GraphRow({ node, rowLanes, laneCount, selected, onSelect }: GraphRowProps) {
  const selectCommit = () => onSelect({ kind: 'commit', commit: node.commit });

  return (
    <div
      className={`gs-grow${selected ? ' gs-grow--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={selectCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCommit();
        }
      }}
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
          className={`gs-grow__dot gs-lane-${rowLanes.ownLane % LANE_PALETTE_SIZE}`}
          cx={laneX(rowLanes.ownLane)}
          cy={ROW_HEIGHT / 2}
          r={4}
        />
      </svg>

      <span className="gs-grow__sha">{node.commit.shortSha}</span>
      <span className="gs-grow__subject" title={node.commit.subject}>
        {node.commit.subject}
      </span>

      {node.branches.length + node.tags.length + node.stashes.length > 0 ? (
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

      <span className="gs-grow__author">{node.commit.authorName}</span>
      <span className="gs-grow__date">{formatRelativeTime(node.commit.authoredAt)}</span>
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

/** Отрезок одной дорожки внутри строки — вертикальный или диагональный. */
function LaneSegment({ segment, ownLane }: { readonly segment: RowSegment; readonly ownLane: number }) {
  const colorClass = `gs-lane-${segment.lane % LANE_PALETTE_SIZE}`;

  if (segment.part === 'top') {
    return <line className={colorClass} x1={laneX(segment.lane)} y1={0} x2={laneX(segment.lane)} y2={ROW_HEIGHT / 2} />;
  }
  if (segment.part === 'through') {
    return <line className={colorClass} x1={laneX(segment.lane)} y1={0} x2={laneX(segment.lane)} y2={ROW_HEIGHT} />;
  }
  // 'bottom' — от центра дорожки этого коммита до низа строки, в дорожку родителя.
  return (
    <line className={colorClass} x1={laneX(ownLane)} y1={ROW_HEIGHT / 2} x2={laneX(segment.lane)} y2={ROW_HEIGHT} />
  );
}
