import { useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { HistoryEntry } from '@shared/historyModel';
import { nextSelectedIndex } from '../navigation';
import { EntryCard, entryCardHeight, entryCardId } from './EntryCard';
import './EntryList.css';

/** За сколько карточек до конца просить следующую страницу истории. */
const PREFETCH_ENTRIES = 8;
const FOOTER_HEIGHT = 40;

interface EntryListProps {
  readonly entries: readonly HistoryEntry[];
  readonly selectedId: string | null;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onSelect: (entry: HistoryEntry) => void;
  readonly onOpen: (entry: HistoryEntry) => void;
  readonly onCopySha: (entry: HistoryEntry) => Promise<unknown>;
  readonly onLoadMore: () => void;
}

/**
 * Список версий файла.
 *
 * Виртуализован: у долгоживущего файла версий бывают тысячи, а подгружаются они
 * страницами по мере прокрутки. Фокус держит сам список, а не карточка:
 * выделенная карточка может уехать за пределы окна виртуализации и унести фокус
 * с собой, поэтому активный элемент объявляется через `aria-activedescendant`.
 */
export function EntryList({
  entries,
  selectedId,
  hasMore,
  loadingMore,
  onSelect,
  onOpen,
  onCopySha,
  onLoadMore,
}: EntryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const entry = entries[index];
      return entry ? entryCardHeight(entry) : FOOTER_HEIGHT;
    },
    getItemKey: (index) => entries[index]?.id ?? 'more',
    overscan: 6,
  });

  const items = virtualizer.getVirtualItems();
  const lastVisible = items[items.length - 1]?.index ?? 0;
  const selectedIndex = entries.findIndex((entry) => entry.id === selectedId);

  useEffect(() => {
    if (hasMore && !loadingMore && lastVisible >= entries.length - PREFETCH_ENTRIES) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, lastVisible, entries.length, onLoadMore]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' && selectedIndex >= 0) {
        const entry = entries[selectedIndex];
        if (entry) {
          event.preventDefault();
          onOpen(entry);
        }
        return;
      }

      const next = nextSelectedIndex(selectedIndex < 0 ? 0 : selectedIndex, event.key, entries.length);
      if (next === undefined) {
        return;
      }
      event.preventDefault();

      const entry = entries[next];
      if (entry) {
        onSelect(entry);
        virtualizer.scrollToIndex(next, { align: 'auto' });
      }
    },
    [entries, selectedIndex, onOpen, onSelect, virtualizer],
  );

  return (
    <div
      className="gs-entries"
      ref={scrollRef}
      role="listbox"
      tabIndex={0}
      aria-label="Версии файла"
      {...(selectedId !== null ? { 'aria-activedescendant': entryCardId(selectedId) } : {})}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        // Фокус держит сам список, а не карточка: иначе после клика мышью
        // стрелки перестают листать версии. Заодно снимается выделение текста
        // при быстрых кликах по соседним карточкам.
        event.preventDefault();
        scrollRef.current?.focus();
      }}
    >
      <div className="gs-entries__list" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {items.map((item) => {
          const entry = entries[item.index];
          return (
            <div
              key={item.key}
              className="gs-entries__row"
              style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
            >
              {entry ? (
                <EntryCard
                  entry={entry}
                  selected={entry.id === selectedId}
                  first={item.index === 0}
                  last={item.index === entries.length - 1 && !hasMore}
                  onSelect={() => onSelect(entry)}
                  onCopySha={() => onCopySha(entry)}
                />
              ) : (
                <div className="gs-entries__more">загружаем ещё версии…</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
