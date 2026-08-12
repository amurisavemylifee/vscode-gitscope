import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { FileChange, ViewMode } from '@shared/model';
import { buildDiffRows, rowHeight, type ContextStore, type DiffRow } from '../diff/rows';
import type { PatchState } from '../hooks/usePatches';
import type { LineTokens, PatchTokens } from '../syntax/highlighter';
import { ExpanderRow, HunkRow, LineRow, NoticeRow, SplitLineRow } from './DiffLines';
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
  readonly context: ContextStore;
  readonly viewMode: ViewMode;
  readonly collapsed: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
  readonly collapseOverLines: number;
  readonly lineHeight: number;
  readonly maxLineLength: number;
  readonly scrollTarget: ScrollTarget | null;
  readonly onToggleCollapse: (path: string) => void;
  readonly onExpandLarge: (path: string) => void;
  readonly onExpandContext: (path: string, startLine: number, endLine: number) => void;
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
  context,
  viewMode,
  collapsed,
  expanded,
  collapseOverLines,
  lineHeight,
  maxLineLength,
  scrollTarget,
  onToggleCollapse,
  onExpandLarge,
  onExpandContext,
  onRequestPatch,
  onVisibleFileChange,
}: DiffCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rows, fileRowIndex } = useMemo(
    () => buildDiffRows({ files, patches, context, viewMode, collapsed, expanded, collapseOverLines }),
    [files, patches, context, viewMode, collapsed, expanded, collapseOverLines],
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
      <div
        className={`gs-canvas gs-canvas--${viewMode}`}
        ref={scrollRef}
        // Ширина самой длинной строки: по ней выравниваются строки и половины
        // двух колонок. Шрифт моноширинный, поэтому её можно выразить в ch;
        // пара символов сверху — на правый отступ ячейки кода.
        style={{ '--gs-code-width': `${maxLineLength + 2}ch` } as React.CSSProperties}
      >
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
                  viewMode={viewMode}
                  onToggleCollapse={onToggleCollapse}
                  onExpandLarge={onExpandLarge}
                  onExpandContext={onExpandContext}
                  onRequestPatch={onRequestPatch}
                  collapsed={collapsed}
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
  viewMode,
  collapsed,
  onToggleCollapse,
  onExpandLarge,
  onExpandContext,
  onRequestPatch,
}: {
  readonly row: DiffRow;
  readonly files: readonly FileChange[];
  readonly tokens: ReadonlyMap<string, PatchTokens>;
  readonly viewMode: ViewMode;
  readonly collapsed: ReadonlySet<string>;
  readonly onToggleCollapse: (path: string) => void;
  readonly onExpandLarge: (path: string) => void;
  readonly onExpandContext: (path: string, startLine: number, endLine: number) => void;
  readonly onRequestPatch: (path: string) => void;
}) {
  const file = files[row.fileIndex];
  if (!file) {
    return null;
  }

  /** Токены строки хунка. У подгруженного контекста подсветка своя, при самой строке. */
  const hunkTokens = (hunkIndex: number, lineIndex: number): LineTokens | undefined =>
    hunkIndex < 0 ? undefined : tokens.get(file.path)?.hunks[hunkIndex]?.[lineIndex];

  switch (row.kind) {
    case 'file':
      return (
        <FileHeaderRow file={file} collapsed={collapsed.has(file.path)} onToggle={() => onToggleCollapse(file.path)} />
      );
    case 'notice':
      return (
        <NoticeRow
          row={row}
          onAction={(type) => (type === 'retry' ? onRequestPatch(file.path) : onExpandLarge(file.path))}
        />
      );
    case 'hunk':
      return <HunkRow hunk={row.hunk} viewMode={viewMode} />;
    case 'expander':
      return (
        <ExpanderRow row={row} viewMode={viewMode} onExpand={(from, to) => onExpandContext(file.path, from, to)} />
      );
    case 'line':
      return <LineRow line={row.line} tokens={row.tokens ?? hunkTokens(row.hunkIndex, row.lineIndex)} />;
    case 'split':
      return (
        <SplitLineRow
          left={row.row.left}
          right={row.row.right}
          leftTokens={row.tokens ?? (row.row.left ? hunkTokens(row.hunkIndex, row.row.left.index) : undefined)}
          rightTokens={row.tokens ?? (row.row.right ? hunkTokens(row.hunkIndex, row.row.right.index) : undefined)}
        />
      );
  }
}
