import { useCallback, useEffect, useState } from 'react';
import type { PanelState } from '@shared/protocol';
import { bridge } from './api/bridge';
import { EmptyState } from './components/EmptyState';
import './App.css';

export function App() {
  const [state, setState] = useState<PanelState | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    bridge
      .request('panel/ready', {})
      .then(setState)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)));

    return bridge.on('comparison/updated', (summary) => {
      setState((previous) => (previous ? { ...previous, summary, error: null } : previous));
      setFailure(null);
    });
  }, []);

  const pickRevisions = useCallback(() => {
    bridge.request('revision/pick', { side: 'base' }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error));
    });
  }, []);

  if (failure) {
    return (
      <div className="gs-app">
        <EmptyState
          tone="error"
          title="Не удалось построить сравнение"
          description={failure}
          action={
            <button type="button" className="gs-button" onClick={pickRevisions}>
              Выбрать ревизии
            </button>
          }
        />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="gs-app">
        <EmptyState title="Загрузка…" />
      </div>
    );
  }

  if (!state.summary) {
    return (
      <div className="gs-app">
        <EmptyState
          title="Ревизии не выбраны"
          description="Выберите две точки истории — ветки, теги или коммиты. GitScope покажет, чем состояние кода в них отличается."
          action={
            <button type="button" className="gs-button gs-button--primary" onClick={pickRevisions}>
              Выбрать ревизии
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="gs-app">
      <EmptyState
        title={`${state.summary.base.label} → ${state.summary.compare.label}`}
        description={`Изменённых файлов: ${state.summary.files.length}`}
      />
    </div>
  );
}
