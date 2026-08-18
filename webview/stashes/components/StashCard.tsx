import type { StashEntry } from '@shared/stashModel';
import type { StashSummaryResult } from '@shared/stashProtocol';
import { formatDateTime, formatRelativeTime, plural } from '@shared/time';
import { CopyShaButton } from '../../components/CopyShaButton';
import { DiffStat } from '../../components/DiffStat';
import { Icon } from '../../components/Icon';

/** Идентификатор карточки в DOM: по нему список сообщает, что сейчас выделено. */
export const stashCardId = (sha: string): string => `gs-stash-${sha}`;

/**
 * Заголовок карточки.
 *
 * У стеша со своим сообщением это оно и есть. Обычный `git stash` сообщения не
 * оставляет — git пишет в reflog тему базового коммита, но она уже показана
 * отдельной строкой, поэтому карточка называет такой стеш по ветке, на которой
 * его сделали: это то, что и правда отличает его от соседних.
 */
export function stashTitle(entry: StashEntry): string {
  if (entry.message !== '') {
    return entry.message;
  }
  return entry.branch === undefined ? 'Без сообщения' : `WIP на ${entry.branch}`;
}

interface StashCardProps {
  readonly entry: StashEntry;
  /** Содержимое стеша; `undefined` — ещё считается. */
  readonly summary: StashSummaryResult | undefined;
  readonly selected: boolean;
  /** Первая и последняя карточки не продолжают линию за пределы своей точки. */
  readonly first: boolean;
  readonly last: boolean;
  readonly onSelect: () => void;
  readonly onCopySha: () => Promise<unknown>;
}

/**
 * Один стеш в списке слева.
 *
 * Устроена как карточка версии файла: слева линия с точками, справа — то, по
 * чему стеш узнают. Коммит, поверх которого стеш лежит, вынесен отдельной
 * строкой: стеш, снятый с чужой ветки три недели назад, — совсем другой стеш,
 * и понять это надо, не открывая его.
 */
export function StashCard({ entry, summary, selected, first, last, onSelect, onCopySha }: StashCardProps) {
  const title = stashTitle(entry);

  const classes = [
    'gs-stash',
    selected ? 'gs-stash--selected' : '',
    first ? 'gs-stash--first' : '',
    last ? 'gs-stash--last' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} id={stashCardId(entry.sha)} role="option" aria-selected={selected} onClick={onSelect}>
      <span className="gs-stash__rail" aria-hidden="true">
        <span className="gs-stash__dot" />
      </span>

      <div className="gs-stash__body">
        <div className="gs-stash__row">
          <Icon name={selected ? 'chevron-down' : 'chevron-right'} size={12} className="gs-stash__chevron" />
          <span className="gs-stash__subject" title={title}>
            {title}
          </span>
          {entry.untrackedSha === undefined ? null : (
            <span className="gs-stash__flag" title="В стеше есть файлы, которых не было в git">
              новые
            </span>
          )}
        </div>

        <div className="gs-stash__base" title={`Стеш сделан поверх коммита ${entry.base.sha}`}>
          <Icon name="commit" size={11} />
          <span className="gs-stash__base-sha">{entry.base.shortSha}</span>
          <span className="gs-stash__base-subject">{entry.base.subject}</span>
        </div>

        <div className="gs-stash__row gs-stash__row--meta">
          <span className="gs-stash__ref">{entry.ref}</span>
          {entry.branch === undefined ? null : (
            <>
              <span className="gs-stash__separator">·</span>
              <Icon name="branch" size={11} />
              <span className="gs-stash__branch">{entry.branch}</span>
            </>
          )}
          <span className="gs-stash__separator">·</span>
          <span className="gs-stash__when">{formatRelativeTime(entry.createdAt)}</span>
        </div>

        <div className="gs-stash__row gs-stash__row--meta">
          <CopyShaButton shortSha={entry.shortSha} title="Скопировать SHA стеша" onCopy={onCopySha} />
          <span className="gs-stash__separator">·</span>
          <span className="gs-stash__when">{formatDateTime(entry.createdAt)}</span>
          <span className="gs-stash__separator">·</span>
          <span className="gs-stash__author" title={entry.authorName}>
            {entry.authorName}
          </span>
          <span className="gs-stash__spacer" />
          <StashStat summary={summary} />
        </div>
      </div>
    </div>
  );
}

/** Итог по стешу: сколько файлов и строк — или почему чисел пока нет. */
function StashStat({ summary }: { readonly summary: StashSummaryResult | undefined }) {
  if (summary === undefined) {
    return <span className="gs-stash__note">считаем…</span>;
  }
  if (summary.summary === null) {
    return (
      <span className="gs-stash__note" title={summary.error?.message}>
        не прочитан
      </span>
    );
  }

  const { files, insertions, deletions } = summary.summary;
  return (
    <>
      <span className="gs-stash__note">
        {files.length} {plural(files.length, ['файл', 'файла', 'файлов'])}
      </span>
      <DiffStat insertions={insertions} deletions={deletions} compact />
    </>
  );
}
