import type { HistoryEntry } from '@shared/historyModel';
import { formatDateTime, formatRelativeTime } from '@shared/time';
import { CopyShaButton } from '../../components/CopyShaButton';
import { DiffStat } from '../../components/DiffStat';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';

/** Высота карточки известна заранее: без этого виртуализованный список не посчитать. */
export const ENTRY_CARD_HEIGHT = 76;
/** Переименование добавляет карточке строку с прежним именем файла. */
export const RENAMED_CARD_HEIGHT = 96;

export const entryCardHeight = (entry: HistoryEntry): number =>
  entry.previousPath === undefined ? ENTRY_CARD_HEIGHT : RENAMED_CARD_HEIGHT;

/** Идентификатор карточки в DOM: по нему список сообщает, что сейчас выделено. */
export const entryCardId = (entryId: string): string => `gs-entry-${entryId}`;

interface EntryCardProps {
  readonly entry: HistoryEntry;
  readonly selected: boolean;
  /** Первая и последняя карточки не продолжают линию за пределы своей точки. */
  readonly first: boolean;
  readonly last: boolean;
  readonly onSelect: () => void;
  readonly onCopySha: () => Promise<unknown>;
}

/**
 * Одна версия файла в списке слева.
 *
 * Слева от карточек проходит линия с точками — та же метафора, что у графа
 * коммитов: она показывает, что версии идут одной цепочкой, а не лежат
 * несвязанной кучей.
 */
export function EntryCard({ entry, selected, first, last, onSelect, onCopySha }: EntryCardProps) {
  const working = entry.kind === 'working';

  // У слияния git не печатает diff по файлу, поэтому чисел строк нет — нули
  // вместо них означали бы «ничего не изменилось», а это неправда.
  const stat = entry.merge ? (
    <span className="gs-entry__note" title="Слияние: что оно сделало с файлом, видно в самой версии">
      слияние
    </span>
  ) : entry.binary ? (
    <span className="gs-entry__note">двоичный</span>
  ) : (
    <DiffStat insertions={entry.insertions} deletions={entry.deletions} compact />
  );

  const classes = [
    'gs-entry',
    selected ? 'gs-entry--selected' : '',
    working ? 'gs-entry--working' : '',
    first ? 'gs-entry--first' : '',
    last ? 'gs-entry--last' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} id={entryCardId(entry.id)} role="option" aria-selected={selected} onClick={onSelect}>
      <span className="gs-entry__rail" aria-hidden="true">
        <span className="gs-entry__dot" />
      </span>

      <div className="gs-entry__body">
        <div className="gs-entry__row">
          <StatusBadge status={entry.status} />
          <span className="gs-entry__subject" title={working ? undefined : entry.subject}>
            {working ? 'Рабочая копия' : entry.subject}
          </span>
        </div>

        {entry.previousPath === undefined ? null : (
          <div className="gs-entry__renamed" title={`Прежнее имя файла: ${entry.previousPath}`}>
            <Icon name="chevron-right" size={11} />
            <span className="gs-entry__previous">{entry.previousPath}</span>
          </div>
        )}

        <div className="gs-entry__row gs-entry__row--meta">
          {working ? (
            <span className="gs-entry__note">{entry.untracked === true ? 'ещё не в git' : 'не закоммичено'}</span>
          ) : (
            <>
              <span className="gs-entry__author">{entry.authorName}</span>
              <span className="gs-entry__separator">·</span>
              <span className="gs-entry__when">{formatRelativeTime(entry.authoredAt ?? '')}</span>
            </>
          )}
        </div>

        <div className="gs-entry__row gs-entry__row--meta">
          {working ? (
            <span className="gs-entry__sha-text">на диске</span>
          ) : (
            <>
              <CopyShaButton
                shortSha={entry.shortSha ?? ''}
                title="Скопировать SHA коммита"
                onCopy={onCopySha}
              />
              <span className="gs-entry__separator">·</span>
              <span className="gs-entry__when">{formatDateTime(entry.authoredAt ?? '')}</span>
            </>
          )}
          <span className="gs-entry__spacer" />
          {stat}
        </div>
      </div>
    </div>
  );
}
