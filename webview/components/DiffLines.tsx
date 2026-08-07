import type { SplitCell } from '@shared/diff/splitRows';
import type { DiffLine, Hunk } from '@shared/model';
import { plural } from '@shared/time';
import { buildCodeSegments } from '../diff/segments';
import type { DiffRow } from '../diff/rows';
import type { LineTokens } from '../syntax/highlighter';
import { Icon } from './Icon';
import './DiffLines.css';

const MARKERS: Record<DiffLine['kind'], string> = {
  context: ' ',
  insert: '+',
  delete: '−',
};

/** Флаги начертания из Shiki: 1 — курсив, 2 — жирный, 4 — подчёркивание. */
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

/** Сколько строк открывать за один шаг у большого промежутка. */
export const EXPAND_STEP = 20;
/** Промежуток не длиннее — открываем целиком одной кнопкой. */
const EXPAND_AT_ONCE = 24;
/** Длиннее — кнопки «открыть всё» уже нет: это заметная пауза и много памяти. */
const EXPAND_ALL_LIMIT = 1000;

export function HunkRow({ hunk }: { readonly hunk: Hunk }) {
  return (
    <div className="gs-diff__hunk-header">
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
          <CodeText line={line} tokens={tokens} />
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
        {cell ? <CodeText line={cell.line} tokens={tokens} /> : null}
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
  readonly row: Extract<DiffRow, { kind: 'expander' }>;
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

/**
 * Текст строки: подсветка синтаксиса и словный diff одновременно.
 *
 * Пока токены не досчитались, строка показывается обычным текстом — подсветка
 * никогда не задерживает появление диффа.
 */
function CodeText({ line, tokens }: { readonly line: DiffLine; readonly tokens: LineTokens | undefined }) {
  const segments = buildCodeSegments(line.text, tokens, line.inlineRanges);

  if (segments.length === 0) {
    return null;
  }

  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={segment.changed ? `gs-diff__changed gs-diff__changed--${line.kind}` : undefined}
          style={{
            ...(segment.color !== undefined ? { color: segment.color } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & ITALIC ? { fontStyle: 'italic' } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & BOLD ? { fontWeight: 'bold' } : {}),
            ...(segment.fontStyle !== undefined && segment.fontStyle & UNDERLINE
              ? { textDecoration: 'underline' }
              : {}),
          }}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}
