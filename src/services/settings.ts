import * as vscode from 'vscode';
import type { PanelSettings } from '@shared/protocol';
import type { ViewMode } from '@shared/model';

/** Читает настройки расширения. Значения по умолчанию продублированы из манифеста. */
export function readPanelSettings(): PanelSettings {
  const config = vscode.workspace.getConfiguration('gitscope');
  return {
    viewMode: config.get<ViewMode>('diff.defaultViewMode') ?? 'unified',
    contextLines: config.get<number>('diff.contextLines') ?? 3,
    collapseFilesOverLines: config.get<number>('diff.collapseFilesOverLines') ?? 1500,
  };
}

/** Подписка на изменение любой настройки `gitscope.*`. */
export function onPanelSettingsChanged(listener: (settings: PanelSettings) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('gitscope')) {
      listener(readPanelSettings());
    }
  });
}
