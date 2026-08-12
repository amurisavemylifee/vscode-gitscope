import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFileTree, flattenFileTree } from '@shared/fileTree';
import type { FileChange, ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { CompareHeader } from './components/CompareHeader';
import { DiffCanvas, type ScrollTarget } from './components/DiffCanvas';
import { EmptyState } from './components/EmptyState';
import { FileTree } from './components/FileTree';
import { useCodeLineHeight } from './hooks/useCodeLineHeight';
import { useExpandedContext } from './hooks/useExpandedContext';
import { usePanelState } from './hooks/usePanelState';
import { usePatches } from './hooks/usePatches';
import { useResizer } from './hooks/useResizer';
import { useSyntaxTheme, useSyntaxTokens } from './hooks/useSyntaxTokens';
import './App.css';

interface StoredLayout {
  readonly viewMode: ViewMode;
  readonly treeWidth: number;
}

const MIN_TREE_WIDTH = 160;
const MAX_TREE_WIDTH = 560;

export function App() {
  const { ready, summary, settings, fetch, error, loading } = usePanelState();

  const stored = useRef(persistedState.read<StoredLayout>()).current;
  const [viewMode, setViewMode] = useState<ViewMode | null>(stored.viewMode ?? null);
  const [treeWidth, setTreeWidth] = useState(stored.treeWidth ?? 260);

  const comparisonKey = summary ? `${summary.base.sha}..${summary.compare.sha}` : '';
  const { patches, requestPatch } = usePatches(comparisonKey);

  const theme = useSyntaxTheme();
  const tokens = useSyntaxTokens(patches, theme);
  const lineHeight = useCodeLineHeight(theme);
  const { context, expandContext } = useExpandedContext(comparisonKey, theme);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);

  // Новое сравнение — старые решения о свёрнутых файлах к нему не относятся.
  useEffect(() => {
    setCollapsed(new Set());
    setExpanded(new Set());
    setScrollTarget(null);
  }, [comparisonKey]);

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

  // Порядок правой области — порядок дерева слева: клик по нижнему файлу
  // прокручивает вниз, а соседи по дереву оказываются соседями и на полотне.
  const files = useMemo(() => {
    const changes = summary?.files ?? [];
    const tree = buildFileTree(changes.map((change) => change.path));
    return flattenFileTree(tree).map((node) => changes[node.index] as FileChange);
  }, [summary]);

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

  const onTreeWidthChange = useCallback((width: number) => {
    setTreeWidth(width);
    persistedState.write<StoredLayout>({ treeWidth: width });
  }, []);
  const startResize = useResizer(treeWidth, onTreeWidthChange, MIN_TREE_WIDTH, MAX_TREE_WIDTH);

  const header = (
    <CompareHeader
      summary={summary}
      fetch={fetch}
      loading={loading}
      viewMode={viewMode ?? settings.viewMode}
      onViewModeChange={changeViewMode}
      onPickRevision={actions.pickRevision}
      onSwap={actions.swapRevisions}
      onReload={actions.reload}
      onFetch={actions.fetchRemote}
    />
  );

  if (!ready) {
    return (
      <div className="gs-app">
        <EmptyState title="Готовим панель…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="gs-app">
        {header}
        <EmptyState
          tone="error"
          title="Не удалось построить сравнение"
          description={
            <>
              {error.message}
              {error.detail ? <div className="gs-app__error-detail">{error.detail}</div> : null}
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

  if (!summary) {
    return (
      <div className="gs-app">
        {header}
        <EmptyState
          title={loading ? 'Считаем разницу…' : 'Ревизии не выбраны'}
          description={
            loading
              ? undefined
              : 'Выберите две точки истории — ветки, теги или коммиты. GitScope покажет, чем состояние кода в них отличается.'
          }
          action={
            loading ? undefined : (
              <button
                type="button"
                className="gs-button gs-button--primary"
                onClick={() => actions.pickRevision('base')}
              >
                Выбрать ревизии
              </button>
            )
          }
        />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="gs-app">
        {header}
        <EmptyState
          title="Различий нет"
          description={`Состояние кода в «${summary.base.label}» и «${summary.compare.label}» совпадает полностью.`}
        />
      </div>
    );
  }

  return (
    <div className="gs-app">
      {header}
      <div className="gs-app__body">
        <aside className="gs-app__tree" style={{ width: `${treeWidth}px` }}>
          <div className="gs-app__tree-title">
            {files.length}{' '}
            {plural(files.length, ['изменённый файл', 'изменённых файла', 'изменённых файлов'])}
          </div>
          <FileTree files={files} activePath={activePath} onSelect={selectFile} />
        </aside>

        <div
          className="gs-app__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина дерева файлов"
          onPointerDown={startResize}
        />

        <DiffCanvas
          files={files}
          patches={patches}
          tokens={tokens}
          context={context}
          viewMode={viewMode ?? settings.viewMode}
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
      </div>
    </div>
  );
}
