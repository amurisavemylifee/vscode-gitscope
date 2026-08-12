import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ViewMode } from '@shared/model';
import { CodeText } from '../../components/CodeText';
import { Icon } from '../../components/Icon';
import { HunkRow, LineRow, SplitLineRow } from '../../components/DiffLines';
import type { NoticeTone } from '../../diff/rows';
import type { LineTokens } from '../../syntax/highlighter';
import { versionRowHeight, type VersionRow } from '../rows';
import './VersionCanvas.css';

interface VersionCanvasProps {
  readonly rows: readonly VersionRow[];
  readonly lineHeight: number;
  readonly maxLineLength: number;
  readonly viewMode: ViewMode;
  /** Смена значения возвращает прокрутку к началу: показывают уже другой файл. */
  readonly resetKey: string;
}

/**
 * Правая область: содержимое выбранной версии или её отличия от предыдущей.
 *
 * Строки виртуализованы по тем же причинам, что и в панели сравнения: файл на
 * десятки тысяч строк иначе кладёт webview ещё до того, как что-то покажет.
 */
export function VersionCanvas({ rows, lineHeight, maxLineLength, viewMode, resetKey }: VersionCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row ? versionRowHeight(row, lineHeight) : lineHeight;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 24,
  });

  // Перестроился список строк — прежние измерения к нему не относятся.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rows, lineHeight]);

  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  return (
    <div
      className="gs-version"
      ref={scrollRef}
      // Половины двух колонок обязаны быть одной ширины во всех строках, иначе
      // колонки разъезжаются. Шрифт моноширинный, поэтому ширину самой длинной
      // строки можно выразить в ch.
      style={{ '--gs-split-code': `${Math.max(maxLineLength + 2, 40)}ch` } as React.CSSProperties}
    >
      <div className="gs-version__list" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) {
            return null;
          }
          return (
            <div
              key={item.key}
              className="gs-version__row"
              style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
            >
              <RowContent row={row} viewMode={viewMode} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowContent({ row, viewMode }: { readonly row: VersionRow; readonly viewMode: ViewMode }) {
  switch (row.kind) {
    case 'notice':
      return <Notice tone={row.tone} text={row.text} />;
    case 'code':
      return <CodeLine number={row.number} text={row.text} tokens={row.tokens} />;
    case 'hunk':
      return <HunkRow hunk={row.hunk} viewMode={viewMode} />;
    case 'line':
      return <LineRow line={row.line} tokens={row.tokens} />;
    case 'split':
      return (
        <SplitLineRow
          left={row.row.left}
          right={row.row.right}
          leftTokens={row.leftTokens}
          rightTokens={row.rightTokens}
        />
      );
  }
}

/** Строка файла целиком: один номер вместо двух, никаких маркеров. */
function CodeLine({
  number,
  text,
  tokens,
}: {
  readonly number: number;
  readonly text: string;
  readonly tokens: LineTokens | undefined;
}) {
  return (
    <div className="gs-code">
      <span className="gs-code__num">{number}</span>
      <code className="gs-code__text">
        <CodeText text={text} tokens={tokens} />
      </code>
    </div>
  );
}

function Notice({ tone, text }: { readonly tone: NoticeTone; readonly text: string }) {
  return (
    <div className={`gs-version__notice gs-version__notice--${tone}`}>
      {tone === 'muted' ? null : <Icon name="warning" size={13} />}
      <span>{text}</span>
    </div>
  );
}
