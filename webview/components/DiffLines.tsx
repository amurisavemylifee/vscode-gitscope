import type { DiffLine, Hunk } from '@shared/model';
import './DiffLines.css';

const MARKERS: Record<DiffLine['kind'], string> = {
  context: ' ',
  insert: '+',
  delete: '−',
};

/** Хунки файла одной колонкой — как `git diff` в терминале, только читаемо. */
export function UnifiedHunks({ hunks }: { readonly hunks: readonly Hunk[] }) {
  return (
    <div className="gs-diff">
      {hunks.map((hunk, hunkIndex) => (
        <div className="gs-diff__hunk" key={`${hunk.baseStart}-${hunk.compareStart}-${hunkIndex}`}>
          <HunkHeader hunk={hunk} />
          {hunk.lines.map((line, lineIndex) => (
            <UnifiedRow key={lineIndex} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function HunkHeader({ hunk }: { readonly hunk: Hunk }) {
  return (
    <div className="gs-diff__hunk-header">
      <span className="gs-diff__hunk-range">
        @@ -{hunk.baseStart},{hunk.baseCount} +{hunk.compareStart},{hunk.compareCount} @@
      </span>
      {hunk.header ? <span className="gs-diff__hunk-context">{hunk.header}</span> : null}
    </div>
  );
}

function UnifiedRow({ line }: { readonly line: DiffLine }) {
  return (
    <>
      <div className={`gs-diff__row gs-diff__row--${line.kind}`}>
        <span className="gs-diff__num">{line.baseLine ?? ''}</span>
        <span className="gs-diff__num">{line.compareLine ?? ''}</span>
        <span className="gs-diff__marker" aria-hidden="true">
          {MARKERS[line.kind]}
        </span>
        <code className="gs-diff__code">{line.text}</code>
      </div>
      {line.noNewlineAtEof ? <NoNewlineNote /> : null}
    </>
  );
}

export function NoNewlineNote() {
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
