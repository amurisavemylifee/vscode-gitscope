import { useMemo, useState } from 'react';
import type { FileChange, FilePatch } from '@shared/model';
import { plural } from '@shared/time';
import { useNearViewport } from '../hooks/useNearViewport';
import type { PatchState } from '../hooks/usePatches';
import { DiffStat } from './DiffStat';
import { UnifiedHunks } from './DiffLines';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import './FileDiff.css';

interface FileDiffProps {
  readonly file: FileChange;
  readonly state: PatchState | undefined;
  /** 0 — не сворачивать большие файлы автоматически. */
  readonly collapseOverLines: number;
  readonly onRequest: (path: string) => void;
  readonly registerElement: (path: string, element: HTMLElement | null) => void;
}

export function FileDiff({ file, state, collapseOverLines, onRequest, registerElement }: FileDiffProps) {
  // null — решает автоматика, true/false — решение пользователя.
  const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);

  const observerRef = useNearViewport<HTMLElement>(() => onRequest(file.path), state === undefined);

  const lineCount = useMemo(() => {
    if (state?.status !== 'ready') {
      return 0;
    }
    return state.patch.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
  }, [state]);

  const tooBig = collapseOverLines > 0 && lineCount > collapseOverLines;
  const expanded = expandedByUser ?? !tooBig;

  return (
    <section
      className="gs-file"
      ref={(element) => {
        observerRef.current = element;
        registerElement(file.path, element);
      }}
    >
      <header className="gs-file__header">
        <button
          type="button"
          className="gs-file__toggle"
          aria-expanded={expanded}
          title={expanded ? 'Свернуть файл' : 'Развернуть файл'}
          onClick={() => setExpandedByUser(!expanded)}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} />
        </button>

        <StatusBadge status={file.status} />

        <span className="gs-file__path" title={file.path}>
          {file.previousPath ? (
            <>
              <span className="gs-file__previous">{file.previousPath}</span>
              <Icon name="chevron-right" size={11} />
            </>
          ) : null}
          <span className="gs-file__name">{file.path}</span>
        </span>

        {file.similarity !== undefined ? (
          <span className="gs-file__similarity" title="Насколько файл совпадает с прежним">
            {file.similarity}%
          </span>
        ) : null}

        {file.binary ? (
          <span className="gs-file__binary-tag">двоичный</span>
        ) : (
          <DiffStat insertions={file.insertions} deletions={file.deletions} withBar />
        )}
      </header>

      {expanded ? (
        <div className="gs-file__body">
          <FileDiffBody file={file} state={state} lineCount={lineCount} onRequest={onRequest} />
        </div>
      ) : (
        <button type="button" className="gs-file__collapsed" onClick={() => setExpandedByUser(true)}>
          Показать {lineCount} {plural(lineCount, ['строку', 'строки', 'строк'])} изменений
        </button>
      )}
    </section>
  );
}

function FileDiffBody({
  file,
  state,
  lineCount,
  onRequest,
}: {
  readonly file: FileChange;
  readonly state: PatchState | undefined;
  readonly lineCount: number;
  readonly onRequest: (path: string) => void;
}) {
  if (state === undefined || state.status === 'loading') {
    return <div className="gs-file__placeholder">Загружаем изменения…</div>;
  }

  if (state.status === 'failed') {
    return (
      <div className="gs-file__placeholder gs-file__placeholder--error">
        <Icon name="warning" size={14} />
        <span>{state.message}</span>
        <button type="button" className="gs-button" onClick={() => onRequest(file.path)}>
          Повторить
        </button>
      </div>
    );
  }

  const { patch } = state;

  if (patch.binary) {
    return <BinaryNote patch={patch} />;
  }

  if (patch.hunks.length === 0) {
    return (
      <div className="gs-file__placeholder">
        {file.status === 'renamed' || file.status === 'copied'
          ? 'Содержимое не изменилось — только путь.'
          : 'Содержимое не изменилось.'}
      </div>
    );
  }

  return (
    <>
      {patch.truncated ? (
        <div className="gs-file__warning">
          <Icon name="warning" size={13} />
          Изменения слишком велики: показаны первые {lineCount}{' '}
          {plural(lineCount, ['строка', 'строки', 'строк'])}, остальное обрезано.
        </div>
      ) : null}
      <UnifiedHunks hunks={patch.hunks} />
    </>
  );
}

function BinaryNote({ patch }: { readonly patch: FilePatch }) {
  return (
    <div className="gs-file__placeholder">
      Двоичный файл: {formatBytes(patch.baseSize)} → {formatBytes(patch.compareSize)}
    </div>
  );
}

function formatBytes(size: number | undefined): string {
  if (size === undefined) {
    return 'нет файла';
  }
  if (size < 1024) {
    return `${size} Б`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} КБ`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}
