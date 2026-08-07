import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileChange } from '@shared/model';
import { buildDiffRows, rowHeight, type DiffRow } from '../diff/rows';
import type { PatchState } from '../hooks/usePatches';
import type { PatchTokens } from '../syntax/highlighter';
import { HunkRow, LineRow, NoticeRow } from './DiffLines';
import { FileHeaderRow } from './FileHeaderRow';
import './DiffCanvas.css';

export interface ScrollTarget {
  readonly fileIndex: number;
  /** Меняется при каждом клике, чтобы повторный выбор того же файла тоже сработал. */
  readonly nonce: number;
}

interface DiffCanvasProps {
  readonly files: readonly FileChange[];
  readonly patches: ReadonlyMap<string, PatchState>;
  readonly tokens: ReadonlyMap<string, PatchTokens>;
  readonly collapsed: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly collapseOverLines: number;
  readonly lineHeight: number;
  readonly scrollTarget: ScrollTarget | null;
  readonly onToggleCollapse: (path: string) => void;
  readonly onExpandLarge: (path: string) => void;
  readonly onRequestPatch: (path: string) => void;
  readonly onVisibleFileChange: (path: string) => void;
}

/** На сколько файлов вперёд запрашивать патчи, чтобы прокрутка не упиралась в загрузку. */
const PREFETCH_FILES = 2;

/**
 * Все изменения одним сплошным скроллом.
 *
 * Строки виртуализированы: на большом сравнении их десятки тысяч, и без окна
 * рендеринга webview заваливается ещё до того, как пользователь что-то увидит.
 * Высоты строк известны заранее (высота строки кода фиксирована), поэтому
 * измерять элементы не нужно — прокрутка получается точной и дешёвой.
 */
export function DiffCanvas({
  files,
  patches,
  tokens,
  collapsed,
  expanded,
  collapseOverLines,
  lineHeight,
  scrollTarget,
  onToggleCollapse,
  onExpandLarge,
  onRequestPatch,
  onVisibleFileChange,
}: DiffCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rows, fileRowIndex } = useMemo(
    () => buildDiffRows({ files, patches, collapsed, expanded, collapseOverLines }),
    [files, patches, collapsed, expanded, collapseOverLines],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row ? rowHeight(row, lineHeight) : lineHeight;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 24,
  });

  const items = virtualizer.getVirtualItems();
  const firstFileIndex = rows[items[0]?.index ?? 0]?.fileIndex ?? 0;
  const lastFileIndex = rows[items[items.length - 1]?.index ?? 0]?.fileIndex ?? 0;

  // Перестроился список строк — прежние измерения к нему не относятся.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rows, lineHeight]);

  // Подгружаем патчи для видимых файлов и нескольких следующих.
  useEffect(() => {
    const last = Math.min(files.length - 1, lastFileIndex + PREFETCH_FILES);
    for (let index = firstFileIndex; index <= last; index += 1) {
      const file = files[index];
      if (file) {
        onRequestPatch(file.path);
      }
    }
  }, [files, firstFileIndex, lastFileIndex, onRequestPatch]);

  // Дерево слева подсвечивает файл, который сейчас перед глазами.
  useEffect(() => {
    const file = files[firstFileIndex];
    if (file) {
      onVisibleFileChange(file.path);
    }
  }, [files, firstFileIndex, onVisibleFileChange]);

  useEffect(() => {
    if (!scrollTarget) {
      return;
    }
    const rowIndex = fileRowIndex[scrollTarget.fileIndex];
    if (rowIndex !== undefined) {
      virtualizer.scrollToIndex(rowIndex, { align: 'start' });
    }
  }, [scrollTarget, fileRowIndex, virtualizer]);

  const stickyFile = files[firstFileIndex];

  return (
    <div className="gs-canvas-wrapper">
      <div className="gs-canvas" ref={scrollRef}>
        <div className="gs-canvas__list" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) {
              return null;
            }
            return (
              <div
                key={item.key}
                className="gs-canvas__row"
                style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
              >
                <RowContent
                  row={row}
                  files={files}
                  tokens={tokens}
                  collapsed={collapsed}
                  onToggleCollapse={onToggleCollapse}
                  onExpandLarge={onExpandLarge}
                  onRequestPatch={onRequestPatch}
                />
              </div>
            );
          })}
        </div>
      </div>

      {stickyFile ? (
        <div className="gs-canvas__sticky">
          <FileHeaderRow
            file={stickyFile}
            collapsed={collapsed.has(stickyFile.path)}
            onToggle={() => onToggleCollapse(stickyFile.path)}
            floating
          />
        </div>
      ) : null}
    </div>
  );
}

function RowContent({
  row,
  files,
  tokens,
  collapsed,
  onToggleCollapse,
  onExpandLarge,
  onRequestPatch,
}: {
  readonly row: DiffRow;
  readonly files: readonly FileChange[];
  readonly tokens: ReadonlyMap<string, PatchTokens>;
  readonly collapsed: ReadonlySet<string>;
  readonly onToggleCollapse: (path: string) => void;
  readonly onExpandLarge: (path: string) => void;
  readonly onRequestPatch: (path: string) => void;
}) {
  const file = files[row.fileIndex];
  if (!file) {
    return null;
  }

  switch (row.kind) {
    case 'file':
      return (
        <FileHeaderRow
          file={file}
          collapsed={collapsed.has(file.path)}
          onToggle={() => onToggleCollapse(file.path)}
        />
      );
    case 'notice':
      return (
        <NoticeRow
          row={row}
          onAction={(type) => (type === 'retry' ? onRequestPatch(file.path) : onExpandLarge(file.path))}
        />
      );
    case 'hunk':
      return <HunkRow hunk={row.hunk} />;
    case 'line':
      return <LineRow line={row.line} tokens={tokens.get(file.path)?.hunks[row.hunkIndex]?.[row.lineIndex]} />;
  }
}
