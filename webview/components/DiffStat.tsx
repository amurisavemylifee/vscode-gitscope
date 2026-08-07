import './DiffStat.css';

interface DiffStatProps {
  readonly insertions: number;
  readonly deletions: number;
  /** Показывать полоску из квадратиков рядом с числами. */
  readonly withBar?: boolean;
  readonly compact?: boolean;
}

const BAR_SEGMENTS = 5;

/**
 * `+120 −12` и полоска пропорций, как в списке файлов у pull request.
 *
 * Полоска показывает соотношение добавленного и удалённого, а не абсолютный
 * объём: глазу нужен один взгляд, чтобы понять «тут почти только добавляли».
 */
export function DiffStat({ insertions, deletions, withBar = false, compact = false }: DiffStatProps) {
  const total = insertions + deletions;
  const filled = total === 0 ? 0 : Math.max(1, Math.round((insertions / total) * BAR_SEGMENTS));

  return (
    <span className={`gs-diffstat${compact ? ' gs-diffstat--compact' : ''}`}>
      <span className="gs-diffstat__added">+{insertions}</span>
      <span className="gs-diffstat__removed">−{deletions}</span>
      {withBar ? (
        <span
          className="gs-diffstat__bar"
          title={`${insertions} добавлено, ${deletions} удалено`}
          aria-hidden="true"
        >
          {Array.from({ length: BAR_SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={
                total === 0
                  ? 'gs-diffstat__cell'
                  : `gs-diffstat__cell gs-diffstat__cell--${index < filled ? 'added' : 'removed'}`
              }
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}
