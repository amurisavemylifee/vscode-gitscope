import { useEffect, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CodeText } from '../../components/CodeText';
import { Icon } from '../../components/Icon';
import { ExpanderRow, HunkRow, LineRow, SplitLineRow } from '../../components/DiffLines';
import type { NoticeTone } from '../../diff/rows';
import type { LineTokens } from '../../syntax/highlighter';
import { changeAtOffset, type Changes } from '../changes';
import { versionRowHeight, type VersionRow } from '../rows';
import './VersionCanvas.css';

/** Куда прокрутить область. Номер меняется при каждом переходе, чтобы повторный сработал. */
export interface ScrollTarget {
  readonly row: number;
  readonly nonce: number;
}

interface VersionCanvasProps {
  /** Заводится в панели: ширину переноса по нему считает и полоса-обзор. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly rows: readonly VersionRow[];
  readonly lineHeight: number;
  /** Сколько символов кода помещается в строку — по нему считаются высоты. */
  readonly columns: number;
  /** Смена значения возвращает прокрутку к началу: показывают уже другой файл. */
  readonly resetKey: string;
  readonly changes: Changes;
  readonly currentChange: number;
  readonly scrollTo: ScrollTarget | null;
  readonly onCurrentChange: (index: number) => void;
  readonly onExpand: (startLine: number, endLine: number) => void;
}

/**
 * Правая область: содержимое выбранной версии или её отличия от предыдущей.
 *
 * Строки виртуализованы по тем же причинам, что и в панели сравнения: файл на
 * десятки тысяч строк иначе кладёт webview ещё до того, как что-то покажет.
 */
export function VersionCanvas({
  scrollRef,
  rows,
  lineHeight,
  columns,
  resetKey,
  changes,
  currentChange,
  scrollTo,
  onCurrentChange,
  onExpand,
}: VersionCanvasProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row ? versionRowHeight(row, lineHeight, columns) : lineHeight;
    },
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 24,
  });

  // Перестроился список строк или изменилась ширина переноса — прежние
  // измерения к ним не относятся.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rows, lineHeight, columns]);

  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  useEffect(() => {
    if (scrollTo === null) {
      return;
    }
    // На строку выше самого изменения: видно, из чего оно выросло, а не только
    // первую правку, прижатую к верхнему краю.
    virtualizer.scrollToIndex(Math.max(0, scrollTo.row - 1), { align: 'start' });
  }, [scrollTo, virtualizer]);

  // Счётчик в шапке следит за прокруткой, а не только за кнопками перехода.
  // Высота видимой части нужна ему у конца файла: последний экран прокруткой
  // уже не пролистать, а изменений на нём помещается несколько.
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  useEffect(() => {
    if (changes.blocks.length > 0) {
      onCurrentChange(changeAtOffset(changes, scrollOffset, scrollRef.current?.clientHeight ?? 0));
    }
  }, [changes, scrollOffset, onCurrentChange]);

  const seek = (offset: number) => {
    const viewport = scrollRef.current?.clientHeight ?? 0;
    virtualizer.scrollToOffset(Math.max(0, offset - viewport / 2));
  };

  return (
    <div className="gs-version-area">
      <div
        className="gs-version"
        ref={scrollRef}
        // Сколько символов помещается в строку: по этому же числу посчитаны
        // высоты строк, поэтому вёрстка и расчёт переносят в одних местах.
        style={{ '--gs-wrap-columns': columns } as React.CSSProperties}
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
                <RowContent row={row} onExpand={onExpand} />
              </div>
            );
          })}
        </div>
      </div>

      {changes.blocks.length > 0 ? <ChangeRuler changes={changes} current={currentChange} onSeek={seek} /> : null}
    </div>
  );
}

/**
 * Полоса-обзор справа: где по всему файлу лежат изменения и какое из них сейчас
 * читают. Клик по полосе переносит прокрутку в это место файла.
 */
function ChangeRuler({
  changes,
  current,
  onSeek,
}: {
  readonly changes: Changes;
  readonly current: number;
  readonly onSeek: (offset: number) => void;
}) {
  return (
    <div
      className="gs-ruler"
      title="Изменения по всему файлу"
      aria-hidden="true"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientY - box.top) / box.height) * changes.total);
      }}
    >
      {changes.blocks.map((block, index) => (
        <span
          key={block.row}
          className={`gs-ruler__mark gs-ruler__mark--${block.kind}${index === current ? ' gs-ruler__mark--current' : ''}`}
          style={{
            top: `${(block.top / changes.total) * 100}%`,
            height: `${(block.height / changes.total) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

function RowContent({
  row,
  onExpand,
}: {
  readonly row: VersionRow;
  readonly onExpand: (startLine: number, endLine: number) => void;
}) {
  switch (row.kind) {
    case 'notice':
      return <Notice tone={row.tone} text={row.text} />;
    case 'code':
      return <CodeLine number={row.number} text={row.text} tokens={row.tokens} />;
    case 'hunk':
      return <HunkRow hunk={row.hunk} />;
    case 'expander':
      return <ExpanderRow row={row} onExpand={onExpand} />;
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
