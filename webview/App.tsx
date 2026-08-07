import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewMode } from '@shared/model';
import { plural } from '@shared/time';
import { actions } from './api/actions';
import { persistedState } from './api/bridge';
import { CompareHeader } from './components/CompareHeader';
import { EmptyState } from './components/EmptyState';
import { FileDiff } from './components/FileDiff';
import { FileTree } from './components/FileTree';
import { usePanelState } from './hooks/usePanelState';
import { usePatches } from './hooks/usePatches';
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
  const [activePath, setActivePath] = useState<string | null>(null);

  const comparisonKey = summary ? `${summary.base.sha}..${summary.compare.sha}` : '';
  const { patches, requestPatch } = usePatches(comparisonKey);

  const fileElements = useRef(new Map<string, HTMLElement>());
  const registerElement = useCallback((path: string, element: HTMLElement | null) => {
    if (element) {
      fileElements.current.set(path, element);
    } else {
      fileElements.current.delete(path);
    }
  }, []);

  const selectFile = useCallback((path: string) => {
    setActivePath(path);
    fileElements.current.get(path)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    persistedState.write<StoredLayout>({ viewMode: mode });
  }, []);

  const startResize = useResizer(treeWidth, (width) => {
    setTreeWidth(width);
    persistedState.write<StoredLayout>({ treeWidth: width });
  });

  // Пока панель не сказала своё слово, режим берём из настроек расширения.
  const effectiveViewMode = viewMode ?? settings.viewMode;

  const header = (
    <CompareHeader
      summary={summary}
      fetch={fetch}
      loading={loading}
      viewMode={effectiveViewMode}
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
              <button type="button" className="gs-button gs-button--primary" onClick={() => actions.pickRevision('base')}>
                Выбрать ревизии
              </button>
            )
          }
        />
      </div>
    );
  }

  if (summary.files.length === 0) {
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
            {summary.files.length} {plural(summary.files.length, ['изменённый файл', 'изменённых файла', 'изменённых файлов'])}
          </div>
          <FileTree files={summary.files} activePath={activePath} onSelect={selectFile} />
        </aside>

        <div
          className="gs-app__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина дерева файлов"
          onPointerDown={startResize}
        />

        <main className="gs-app__files">
          {summary.files.map((file) => (
            <FileDiff
              key={file.path}
              file={file}
              state={patches.get(file.path)}
              collapseOverLines={settings.collapseFilesOverLines}
              onRequest={requestPatch}
              registerElement={registerElement}
            />
          ))}
        </main>
      </div>
    </div>
  );
}

/** Перетаскивание границы между деревом и списком файлов. */
function useResizer(current: number, onChange: (width: number) => void) {
  const width = useRef(current);
  width.current = current;

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const next = Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, event.clientX));
      if (next !== width.current) {
        onChange(next);
      }
    };
    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    document.body.style.cursor = 'col-resize';
    // Пока тянем границу, выделение текста в диффе только мешает.
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onChange]);

  return useCallback(() => setDragging(true), []);
}
