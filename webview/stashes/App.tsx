import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFileTree, flattenFileTree } from '@shared/fileTree';
import type { ViewMode } from '@shared/model';
import type { StashEntry, StashFile } from '@shared/stashModel';
import { DiffCanvas, type ScrollTarget } from '../components/DiffCanvas';
import { EmptyState } from '../components/EmptyState';
import { useCodeLineHeight } from '../hooks/useCodeLineHeight';
import { useResizer } from '../hooks/useResizer';
import { useSyntaxTheme, useSyntaxTokens } from '../hooks/useSyntaxTokens';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { StashFileBar } from './components/StashFileBar';
import { StashHeader } from './components/StashHeader';
import { StashList } from './components/StashList';
import { useStashContext } from './hooks/useStashContext';
import { useStashPatches } from './hooks/useStashPatches';
import { useStashesState } from './hooks/useStashesState';
import './App.css';

interface StoredLayout {
  readonly viewMode: ViewMode;
  readonly listWidth: number;
}

const MIN_LIST_WIDTH = 240;
const MAX_LIST_WIDTH = 620;

export function App() {
  const { ready, target, entries, summaries, settings, error, loading } = useStashesState();

  const stored = useRef(persistedState.read<StoredLayout>()).current;
  const [viewMode, setViewMode] = useState<ViewMode | null>(stored.viewMode ?? null);
  const [listWidth, setListWidth] = useState(stored.listWidth ?? 320);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  // Пока в панели не переключали колонки, смотрим так, как велит настройка.
  const effectiveViewMode = viewMode ?? settings.viewMode;

  // Список пришёл заново: держимся за прежний выбор, если стеш в нём остался, —
  // иначе перечитывание сбрасывало бы просмотр на самый свежий стеш.
  useEffect(() => {
    setSelectedSha((current) =>
      current !== null && entries.some((entry) => entry.sha === current) ? current : (entries[0]?.sha ?? null),
    );
  }, [entries]);

  const summary = selectedSha === null ? undefined : summaries.get(selectedSha);

  // Порядок правой области — порядок дерева слева: клик по нижнему файлу
  // прокручивает вниз, а соседи по дереву оказываются соседями и на полотне.
  const files = useMemo(() => {
    const changes = summary?.summary?.files ?? [];
    const tree = buildFileTree(changes.map((change) => change.path));
    return flattenFileTree(tree).map((node) => changes[node.index] as StashFile);
  }, [summary]);

  const { patches, requestPatch } = useStashPatches(selectedSha, settings.contextLines);
  const theme = useSyntaxTheme();
  const tokens = useSyntaxTokens(patches, theme);
  const lineHeight = useCodeLineHeight(theme);
  const { context, expandContext } = useStashContext(selectedSha, theme);

  // Другой стеш — прежние решения о свёрнутых файлах к нему не относятся.
  useEffect(() => {
    setCollapsed(new Set());
    setExpanded(new Set());
    setScrollTarget(null);
    setActivePath(null);
  }, [selectedSha]);

  const toggleCollapse = useCallback((path: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandLarge = useCallback((path: string) => {
    setExpanded((previous) => new Set(previous).add(path));
  }, []);

  const collapseAll = useCallback(() => setCollapsed(new Set(files.map((file) => file.path))), [files]);
  // Большие файлы, свёрнутые самой панелью, остаются свёрнутыми: развернуть их
  // все разом — это разбор десятков тысяч строк и решение не на одну кнопку.
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const selectStash = useCallback((entry: StashEntry) => setSelectedSha(entry.sha), []);
  const copySha = useCallback((entry: StashEntry) => actions.copySha(entry.sha), []);

  const selectFile = useCallback(
    (path: string) => {
      const fileIndex = files.findIndex((file) => file.path === path);
      if (fileIndex >= 0) {
        setActivePath(path);
        setScrollTarget({ fileIndex, nonce: Date.now() });
      }
    },
    [files],
  );

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    persistedState.write<StoredLayout>({ viewMode: mode });
  }, []);

  const onListWidthChange = useCallback((width: number) => {
    setListWidth(width);
    persistedState.write<StoredLayout>({ listWidth: width });
  }, []);
  const startResize = useResizer(listWidth, onListWidthChange, MIN_LIST_WIDTH, MAX_LIST_WIDTH);

  // Открывается то, на что смотрим: файл, который сейчас перед глазами.
  const activeFile = files.find((file) => file.path === activePath) ?? files[0] ?? null;
  const openFile = useCallback(() => {
    if (selectedSha !== null && activeFile) {
      void actions.openFile(selectedSha, activeFile.path).catch(() => undefined);
    }
  }, [selectedSha, activeFile]);
  const openDiff = useCallback(() => {
    if (selectedSha !== null && activeFile) {
      void actions.openDiff(selectedSha, activeFile.path, effectiveViewMode).catch(() => undefined);
    }
  }, [selectedSha, activeFile, effectiveViewMode]);

  const header = (
    <StashHeader target={target} count={entries.length} loading={loading} onReload={actions.reload} />
  );

  if (!ready) {
    return (
      <div className="gs-stashes">
        <EmptyState title="Готовим панель…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gs-stashes">
        {header}
        <EmptyState
          tone="error"
          title="Не удалось прочитать список стешей"
          description={
            <>
              {error.message}
              {error.detail ? <div className="gs-stashes__error-detail">{error.detail}</div> : null}
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
    // Панель без репозитория — это восстановленная после перезапуска вкладка:
    // данные она не хранит, поэтому спрашивает заново, чьи стеши показывать.
    return (
      <div className="gs-stashes">
        {header}
        {target === null ? (
          <EmptyState
            title="Репозиторий не выбран"
            description="Выберите репозиторий, стеши которого нужно посмотреть."
            action={
              <button type="button" className="gs-button gs-button--primary" onClick={actions.pickRepository}>
                Выбрать репозиторий
              </button>
            }
          />
        ) : (
          <EmptyState
            title={loading ? 'Читаем список стешей…' : 'Стешей нет'}
            description={
              loading
                ? undefined
                : `В репозитории «${target.repositoryName}» нет ни одного стеша. Они появляются здесь после git stash.`
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="gs-stashes">
      {header}
      <div className="gs-stashes__body">
        <aside className="gs-stashes__list" style={{ width: `${listWidth}px` }}>
          <StashList
            entries={entries}
            summaries={summaries}
            selectedSha={selectedSha}
            files={files}
            activePath={activePath}
            onSelect={selectStash}
            onSelectFile={selectFile}
            onCopySha={copySha}
          />
        </aside>

        <div
          className="gs-stashes__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина списка стешей"
          onPointerDown={startResize}
        />

        <section className="gs-stashes__diff">
          <StashFileBar
            file={activeFile}
            viewMode={effectiveViewMode}
            onViewModeChange={changeViewMode}
            onCollapseAll={collapseAll}
            onExpandAll={expandAll}
            onOpenFile={openFile}
            onOpenDiff={openDiff}
          />

          {summary === undefined ? (
            <EmptyState title="Считаем содержимое стеша…" />
          ) : summary.summary === null ? (
            <EmptyState
              tone="error"
              title="Не удалось прочитать содержимое стеша"
              description={summary.error?.message}
            />
          ) : files.length === 0 ? (
            <EmptyState title="В этом стеше нет файлов" />
          ) : (
            <DiffCanvas
              files={files}
              patches={patches}
              tokens={tokens}
              context={context}
              viewMode={effectiveViewMode}
              collapsed={collapsed}
              expanded={expanded}
              collapseOverLines={settings.collapseFilesOverLines}
              lineHeight={lineHeight}
              theme={theme}
              scrollTarget={scrollTarget}
              onToggleCollapse={toggleCollapse}
              onExpandLarge={expandLarge}
              onExpandContext={expandContext}
              onRequestPatch={requestPatch}
              onVisibleFileChange={setActivePath}
            />
          )}
        </section>
      </div>
    </div>
  );
}
