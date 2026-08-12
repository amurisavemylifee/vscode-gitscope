import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryEntry } from '@shared/historyModel';
import type { ViewMode } from '@shared/model';
import { EmptyState } from '../components/EmptyState';
import { useCodeLineHeight } from '../hooks/useCodeLineHeight';
import { useResizer } from '../hooks/useResizer';
import { useSyntaxTheme } from '../hooks/useSyntaxTokens';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { collectChanges, wrapChangeIndex } from './changes';
import { EntryList } from './components/EntryList';
import { HistoryHeader } from './components/HistoryHeader';
import { VersionCanvas, type ScrollTarget } from './components/VersionCanvas';
import { VersionHeader, type ExpandMode, type VersionMode } from './components/VersionHeader';
import { useHistoryState } from './hooks/useHistoryState';
import { useVersionContext } from './hooks/useVersionContext';
import { useContentTokens, usePatchTokens } from './hooks/useVersionTokens';
import { useVersions } from './hooks/useVersions';
import { buildContentRows, buildPatchRows, noticeRows, type VersionRow } from './rows';
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

  // Пока в панели не переключали колонки, смотрим так, как велит настройка.
  const effectiveViewMode = viewMode ?? settings.viewMode;

  // Ключ жизни кэша: другой файл — другие версии, перечитанная история —
  // другое содержимое рабочей копии.
  const historyKey = `${target?.repositoryRoot ?? ''}:${target?.path ?? ''}:${revision}`;
  const { versions, patches, requestVersion, requestPatch } = useVersions(historyKey, settings.contextLines);

  const theme = useSyntaxTheme();
  const lineHeight = useCodeLineHeight(theme);
  const { context, expand, collapse } = useVersionContext(historyKey, theme);

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
  const entryContext = selectedId === null ? undefined : context.get(selectedId);

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
    return patch ? buildPatchRows(patch, patchTokens, effectiveViewMode, selected, entryContext) : [];
  }, [
    selected,
    versionMode,
    versionState,
    patchState,
    version,
    patch,
    contentTokens,
    patchTokens,
    entryContext,
    effectiveViewMode,
  ]);

  const maxLineLength = useMemo(() => longestRow(rows), [rows]);
  const changes = useMemo(() => collectChanges(rows, lineHeight), [rows, lineHeight]);

  const [changeIndex, setChangeIndex] = useState(0);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);

  // Другая версия или другой режим — счёт изменений начинается заново.
  useEffect(() => {
    setChangeIndex(0);
    setScrollTarget(null);
  }, [selectedId, versionMode]);

  const stepChange = useCallback(
    (delta: number) => {
      const next = wrapChangeIndex(changeIndex + delta, changes.blocks.length);
      const block = changes.blocks[next];
      if (block === undefined) {
        return;
      }
      setChangeIndex(next);
      setScrollTarget((previous) => ({ row: block.row, nonce: (previous?.nonce ?? 0) + 1 }));
    },
    [changes, changeIndex],
  );

  // Alt+стрелки, а не голые стрелки: те листают версии в списке слева.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }
      event.preventDefault();
      stepChange(event.key === 'ArrowDown' ? 1 : -1);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepChange]);

  const expandRange = useCallback(
    (startLine: number, endLine: number) => {
      if (selected) {
        expand(selected.id, selected.path, startLine, endLine);
      }
    },
    [expand, selected],
  );

  // Пока есть свёрнутые промежутки, кнопка предлагает показать файл целиком;
  // когда скрывать больше нечего — свернуть всё обратно.
  const hasGaps = useMemo(() => rows.some((row) => row.kind === 'expander'), [rows]);
  const expandMode: ExpandMode = hasGaps ? 'expand' : (entryContext?.size ?? 0) > 0 ? 'collapse' : 'none';

  const toggleExpand = useCallback(() => {
    if (!selected) {
      return;
    }
    if (expandMode === 'collapse') {
      collapse(selected.id);
      return;
    }
    if (patch?.compareTotalLines !== undefined) {
      expand(selected.id, selected.path, 1, patch.compareTotalLines);
    }
  }, [selected, expandMode, patch, expand, collapse]);

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

  // Открывается то, на что смотрим: содержимое версии или её сравнение с
  // предыдущей, и той же раскладкой. То же и по Enter в списке — это клавиша
  // той же кнопки.
  const openEntry = useCallback(
    (entry: HistoryEntry) => {
      const opened =
        versionMode === 'content' ? actions.openVersion(entry.id) : actions.openDiff(entry.id, effectiveViewMode);
      void opened.catch(() => undefined);
    },
    [versionMode, effectiveViewMode],
  );
  const copySha = useCallback((entry: HistoryEntry) => actions.copySha(entry.id), []);

  const header = (
    <HistoryHeader
      target={target}
      versionCount={entries.length}
      hasMore={hasMore}
      loading={loading}
      onPickRevision={actions.pickRevision}
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
              : // Точку истории видно в шапке, и без неё сообщение врало бы:
                // на выбранной ревизии файла может не быть, а на соседней — есть.
                `До «${target?.revision?.label ?? 'выбранной ревизии'}» этот файл ни разу не попадал в коммиты.`
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
            onCopySha={copySha}
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
            viewMode={effectiveViewMode}
            changeCount={changes.blocks.length}
            changeIndex={changeIndex}
            expandMode={expandMode}
            onModeChange={changeVersionMode}
            onViewModeChange={changeViewMode}
            onStepChange={stepChange}
            onToggleExpand={toggleExpand}
            onOpen={() => selected && openEntry(selected)}
          />
          <VersionCanvas
            rows={rows}
            lineHeight={lineHeight}
            maxLineLength={maxLineLength}
            viewMode={effectiveViewMode}
            resetKey={`${selectedId ?? ''}:${versionMode}`}
            changes={changes}
            currentChange={changeIndex}
            scrollTo={scrollTarget}
            onCurrentChange={setChangeIndex}
            onExpand={expandRange}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * Самая длинная показанная строка.
 *
 * По ней канва задаёт ширину строк: половины двух колонок обязаны быть
 * одинаковой ширины, а подложки изменений — доходить до конца самой длинной
 * строки, а не обрываться на краю окна. Считается по готовым строкам, а не по
 * хункам патча: в просмотре файла целиком и в развёрнутых промежутках строки
 * свои, и патч про них ничего не знает.
 */
function longestRow(rows: readonly VersionRow[]): number {
  let longest = 0;

  for (const row of rows) {
    let length = 0;
    switch (row.kind) {
      case 'code':
        length = row.text.length;
        break;
      case 'line':
        length = row.line.text.length;
        break;
      case 'split':
        length = Math.max(row.row.left?.line.text.length ?? 0, row.row.right?.line.text.length ?? 0);
        break;
    }
    if (length > longest) {
      longest = length;
    }
  }

  return longest;
}
