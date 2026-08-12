import type { SplitCell } from '@shared/diff/splitRows';
import type { DiffLine, Hunk, ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import type { DiffRow } from '../diff/rows';
import type { LineTokens } from '../syntax/highlighter';
import { CodeText } from './CodeText';
import { Icon } from './Icon';
import './DiffLines.css';

const MARKERS: Record<DiffLine['kind'], string> = {
  context: ' ',
  insert: '+',
  delete: '−',
};

/** Сколько строк открывать за один шаг у большого промежутка. */
export const EXPAND_STEP = 20;
/** Промежуток не длиннее — открываем целиком одной кнопкой. */
const EXPAND_AT_ONCE = 24;
/** Длиннее — кнопки «открыть всё» уже нет: это заметная пауза и много памяти. */
const EXPAND_ALL_LIMIT = 1000;

// Полоса заголовка тянется на всю ширину строк, а она зависит от режима: в двух
// колонках это две половины, в одной — одна. Ширина задана в CSS, отсюда только
// режим.
export function HunkRow({ hunk, viewMode }: { readonly hunk: Hunk; readonly viewMode: ViewMode }) {
  return (
    <div className={`gs-diff__hunk-header gs-diff__hunk-header--${viewMode}`}>
      <span className="gs-diff__hunk-range">
        @@ -{hunk.baseStart},{hunk.baseCount} +{hunk.compareStart},{hunk.compareCount} @@
      </span>
      {hunk.header ? <span className="gs-diff__hunk-context">{hunk.header}</span> : null}
    </div>
  );
}

export function LineRow({ line, tokens }: { readonly line: DiffLine; readonly tokens: LineTokens | undefined }) {
  return (
    <div className={`gs-diff__line gs-diff__line--${line.kind}`}>
      <div className="gs-diff__row">
        <span className="gs-diff__num">{line.baseLine ?? ''}</span>
        <span className="gs-diff__num">{line.compareLine ?? ''}</span>
        <span className="gs-diff__marker" aria-hidden="true">
          {MARKERS[line.kind]}
        </span>
        <code className="gs-diff__code">
          <CodeText text={line.text} tokens={tokens} ranges={line.inlineRanges} kind={line.kind} />
        </code>
      </div>
      {line.noNewlineAtEof ? <NoNewlineNote /> : null}
    </div>
  );
}

export function SplitLineRow({
  left,
  right,
  leftTokens,
  rightTokens,
}: {
  readonly left: SplitCell | undefined;
  readonly right: SplitCell | undefined;
  readonly leftTokens: LineTokens | undefined;
  readonly rightTokens: LineTokens | undefined;
}) {
  return (
    <div className="gs-split">
      <div className="gs-split__row">
        <SplitSide cell={left} tokens={leftTokens} side="left" />
        <SplitSide cell={right} tokens={rightTokens} side="right" />
      </div>
      {left?.line.noNewlineAtEof || right?.line.noNewlineAtEof ? <NoNewlineNote /> : null}
    </div>
  );
}

function SplitSide({
  cell,
  tokens,
  side,
}: {
  readonly cell: SplitCell | undefined;
  readonly tokens: LineTokens | undefined;
  readonly side: 'left' | 'right';
}) {
  const kind = cell?.line.kind ?? 'empty';
  const number = side === 'left' ? cell?.line.baseLine : cell?.line.compareLine;

  return (
    <>
      <span className={`gs-diff__num gs-split__cell gs-split__cell--${kind}`}>{number ?? ''}</span>
      <span className={`gs-diff__marker gs-split__cell gs-split__cell--${kind}`} aria-hidden="true">
        {cell ? MARKERS[cell.line.kind] : ''}
      </span>
      <code className={`gs-diff__code gs-split__cell gs-split__cell--${kind}`}>
        {cell ? (
          <CodeText text={cell.line.text} tokens={tokens} ranges={cell.line.inlineRanges} kind={cell.line.kind} />
        ) : null}
      </code>
    </>
  );
}

/**
 * Кнопки раскрытия свёрнутых строк между хунками.
 *
 * Короткий промежуток открывается целиком, длинный — шагами от ближайшего
 * хунка: чаще всего нужно посмотреть пару строк вокруг правки, а не весь файл.
 */
export function ExpanderRow({
  row,
  onExpand,
}: {
  /** Достаточно границ промежутка — их несут строки обеих панелей. */
  readonly row: { readonly compareStart: number; readonly compareEnd: number };
  readonly onExpand: (from: number, to: number) => void;
}) {
  const count = row.compareEnd - row.compareStart + 1;

  if (count <= EXPAND_AT_ONCE) {
    return (
      <div className="gs-expander">
        <button type="button" className="gs-expander__button" onClick={() => onExpand(row.compareStart, row.compareEnd)}>
          <Icon name="unfold" size={12} />
          развернуть {count} {plural(count, ['строку', 'строки', 'строк'])}
        </button>
      </div>
    );
  }

  return (
    <div className="gs-expander">
      <button
        type="button"
        className="gs-expander__button"
        title="Показать строки сверху промежутка"
        onClick={() => onExpand(row.compareStart, row.compareStart + EXPAND_STEP - 1)}
      >
        <Icon name="chevron-up" size={12} />
        {EXPAND_STEP}
      </button>
      {count <= EXPAND_ALL_LIMIT ? (
        <button
          type="button"
          className="gs-expander__button"
          onClick={() => onExpand(row.compareStart, row.compareEnd)}
        >
          <Icon name="unfold" size={12} />
          все {count}
        </button>
      ) : (
        <span className="gs-expander__label">
          скрыто {count} {plural(count, ['строка', 'строки', 'строк'])}
        </span>
      )}
      <button
        type="button"
        className="gs-expander__button"
        title="Показать строки снизу промежутка"
        onClick={() => onExpand(row.compareEnd - EXPAND_STEP + 1, row.compareEnd)}
      >
        <Icon name="chevron-down" size={12} />
        {EXPAND_STEP}
      </button>
    </div>
  );
}

export function NoticeRow({
  row,
  onAction,
}: {
  readonly row: Extract<DiffRow, { kind: 'notice' }>;
  readonly onAction: (type: 'retry' | 'expand') => void;
}) {
  const { action } = row;
  return (
    <div className={`gs-notice gs-notice--${row.tone}`}>
      {row.tone === 'muted' ? null : <Icon name="warning" size={13} />}
      <span className="gs-notice__text">{row.text}</span>
      {action ? (
        <button type="button" className="gs-notice__action" onClick={() => onAction(action.type)}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function NoNewlineNote() {
  return (
    <div className="gs-diff__row gs-diff__row--note">
      <span className="gs-diff__num" />
      <span className="gs-diff__num" />
      <span className="gs-diff__marker" aria-hidden="true">
        \
      </span>
      <code className="gs-diff__code">в конце файла нет перевода строки</code>
    </div>
  );
}
