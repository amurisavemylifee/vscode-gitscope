import type { DiffLine, Hunk } from '@shared/model';
import type { LineTokens } from '../syntax/highlighter';
import type { DiffRow } from '../diff/rows';
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
          <CodeText text={line.text} tokens={tokens} />
        </code>
      </div>
      {line.noNewlineAtEof ? (
        <div className="gs-diff__row gs-diff__row--note">
          <span className="gs-diff__num" />
          <span className="gs-diff__num" />
          <span className="gs-diff__marker" aria-hidden="true">
            \
          </span>
          <code className="gs-diff__code">в конце файла нет перевода строки</code>
        </div>
      ) : null}
    </div>
  );
}

/** Пока подсветка не досчиталась, строка показывается обычным текстом. */
function CodeText({ text, tokens }: { readonly text: string; readonly tokens: LineTokens | undefined }) {
  if (tokens === undefined || tokens.length === 0) {
    return <>{text}</>;
  }
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={index}
          style={{
            color: token.color,
            ...(token.fontStyle !== undefined && token.fontStyle & ITALIC ? { fontStyle: 'italic' } : {}),
            ...(token.fontStyle !== undefined && token.fontStyle & BOLD ? { fontWeight: 'bold' } : {}),
            ...(token.fontStyle !== undefined && token.fontStyle & UNDERLINE ? { textDecoration: 'underline' } : {}),
          }}
        >
          {token.content}
        </span>
      ))}
    </>
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
