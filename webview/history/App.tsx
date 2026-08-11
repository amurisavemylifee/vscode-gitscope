import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryEntry } from '@shared/historyModel';
import type { ViewMode } from '@shared/model';
import { EmptyState } from '../components/EmptyState';
import { useCodeLineHeight } from '../hooks/useCodeLineHeight';
import { useResizer } from '../hooks/useResizer';
import { useSyntaxTheme } from '../hooks/useSyntaxTokens';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { EntryList } from './components/EntryList';
import { HistoryHeader } from './components/HistoryHeader';
import { VersionCanvas } from './components/VersionCanvas';
import { VersionHeader, type VersionMode } from './components/VersionHeader';
import { useHistoryState } from './hooks/useHistoryState';
import { useContentTokens, usePatchTokens } from './hooks/useVersionTokens';
import { useVersions } from './hooks/useVersions';
import { buildContentRows, buildPatchRows, noticeRows } from './rows';
import './App.css';

interface StoredLayout {
  readonly versionMode: VersionMode;
  readonly viewMode: ViewMode;
  readonly listWidth: number;
}

const MIN_LIST_WIDTH = 220;
const MAX_LIST_WIDTH = 620;

export function App() {
  const { ready, target, entries, hasMore, settings, error, loading, loadingMore, revision, loadMore } =
    useHistoryState();

  const stored = useRef(persistedState.read<StoredLayout>()).current;
  const [versionMode, setVersionMode] = useState<VersionMode>(stored.versionMode ?? 'content');
  const [viewMode, setViewMode] = useState<ViewMode | null>(stored.viewMode ?? null);
  const [listWidth, setListWidth] = useState(stored.listWidth ?? 320);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ключ жизни кэша: другой файл — другие версии, перечитанная история —
  // другое содержимое рабочей копии.
  const historyKey = `${target?.repositoryRoot ?? ''}:${target?.path ?? ''}:${revision}`;
  const { versions, patches, requestVersion, requestPatch } = useVersions(historyKey, settings.contextLines);

  const theme = useSyntaxTheme();
  const lineHeight = useCodeLineHeight(theme);

  // Список пришёл заново: держимся за прежний выбор, если он в нём остался, —
  // иначе перечитанная история сбрасывала бы просмотр на первую версию.
  useEffect(() => {
    setSelectedId((current) =>
      current !== null && entries.some((entry) => entry.id === current) ? current : (entries[0]?.id ?? null),
    );
  }, [entries]);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    if (versionMode === 'content') {
      requestVersion(selectedId);
    } else {
      requestPatch(selectedId);
    }
  }, [selectedId, versionMode, requestVersion, requestPatch]);

  const versionState = selectedId === null ? undefined : versions.get(selectedId);
  const patchState = selectedId === null ? undefined : patches.get(selectedId);
  const version = versionState?.status === 'ready' ? versionState.value : undefined;
  const patch = patchState?.status === 'ready' ? patchState.value : undefined;

  const contentTokens = useContentTokens(version, theme);
  const patchTokens = usePatchTokens(patch, theme);

  const rows = useMemo(() => {
    if (!selected) {
      return [];
    }
    const state = versionMode === 'content' ? versionState : patchState;
    if (state === undefined || state.status === 'loading') {
      return noticeRows('muted', 'Загружаем…');
    }
    if (state.status === 'failed') {
      return noticeRows('error', state.message);
    }
    if (versionMode === 'content') {
      return version ? buildContentRows(version, contentTokens) : [];
    }
    return patch ? buildPatchRows(patch, patchTokens, viewMode ?? settings.viewMode, selected) : [];
  }, [
    selected,
    versionMode,
    versionState,
    patchState,
    version,
    patch,
    contentTokens,
    patchTokens,
    viewMode,
    settings.viewMode,
  ]);

  const maxLineLength = useMemo(() => longestLine(patch?.hunks), [patch]);

  const changeVersionMode = useCallback((mode: VersionMode) => {
    setVersionMode(mode);
    persistedState.write<StoredLayout>({ versionMode: mode });
  }, []);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    persistedState.write<StoredLayout>({ viewMode: mode });
  }, []);

  const onListWidthChange = useCallback((width: number) => {
    setListWidth(width);
    persistedState.write<StoredLayout>({ listWidth: width });
  }, []);
  const startResize = useResizer(listWidth, onListWidthChange, MIN_LIST_WIDTH, MAX_LIST_WIDTH);

  const selectEntry = useCallback((entry: HistoryEntry) => setSelectedId(entry.id), []);
  const openEntry = useCallback((entry: HistoryEntry) => {
    void actions.openVersion(entry.id).catch(() => undefined);
  }, []);

  const header = (
    <HistoryHeader
      target={target}
      versionCount={entries.length}
      hasMore={hasMore}
      loading={loading}
      onReload={actions.reload}
    />
  );

  if (!ready) {
    return (
      <div className="gs-history">
        <EmptyState title="Готовим панель…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gs-history">
        {header}
        <EmptyState
          tone="error"
          title="Не удалось прочитать историю файла"
          description={
            <>
              {error.message}
              {error.detail ? <div className="gs-history__error-detail">{error.detail}</div> : null}
            </>
          }
          action={
            <button type="button" className="gs-button" onClick={actions.reload}>
              Повторить
            </button>
          }
        />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="gs-history">
        {header}
        <EmptyState
          title={loading ? 'Читаем историю…' : 'У файла нет истории'}
          description={
            loading
              ? undefined
              : 'Этот файл ещё ни разу не попадал в коммиты — показывать пока нечего.'
          }
        />
      </div>
    );
  }

  return (
    <div className="gs-history">
      {header}
      <div className="gs-history__body">
        <aside className="gs-history__entries" style={{ width: `${listWidth}px` }}>
          <EntryList
            entries={entries}
            selectedId={selectedId}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onSelect={selectEntry}
            onOpen={openEntry}
            onLoadMore={loadMore}
          />
        </aside>

        <div
          className="gs-history__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина списка версий"
          onPointerDown={startResize}
        />

        <section className="gs-history__version">
          <VersionHeader
            entry={selected}
            mode={versionMode}
            viewMode={viewMode ?? settings.viewMode}
            onModeChange={changeVersionMode}
            onViewModeChange={changeViewMode}
            onOpen={() => selected && openEntry(selected)}
            onCopySha={() => (selected ? actions.copySha(selected.id) : Promise.resolve())}
          />
          <VersionCanvas
            rows={rows}
            lineHeight={lineHeight}
            maxLineLength={maxLineLength}
            resetKey={`${selectedId ?? ''}:${versionMode}`}
          />
        </section>
      </div>
    </div>
  );
}

/** Самая длинная строка патча — по ней выравниваются половины в двух колонках. */
function longestLine(hunks: readonly { readonly lines: readonly { readonly text: string }[] }[] | undefined): number {
  let longest = 0;
  for (const hunk of hunks ?? []) {
    for (const line of hunk.lines) {
      if (line.text.length > longest) {
        longest = line.text.length;
      }
    }
  }
  return longest;
}
