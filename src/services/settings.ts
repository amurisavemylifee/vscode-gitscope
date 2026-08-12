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

/**
 * Готовит вкладку сравнения к той же раскладке, что выбрана в панели.
 *
 * У `vscode.diff` параметра раскладки нет: одна колонка или две — это настройка
 * самого редактора, ровно та, что переключается кнопкой на его панели. Поэтому
 * пишем в неё, и только когда она и правда расходится с выбранной.
 *
 * Пишем всегда в пользовательские настройки: настройки воркспейса лежат в
 * `.vscode/settings.json` репозитория, и правка по клику пачкала бы его.
 * Если раскладка переопределена там, она и победит — это выбор проекта.
 */
export async function applyDiffLayout(viewMode: ViewMode): Promise<void> {
  const config = vscode.workspace.getConfiguration('diffEditor');
  const sideBySide = viewMode === 'split';

  if (config.get<boolean>('renderSideBySide') !== sideBySide) {
    await config.update('renderSideBySide', sideBySide, vscode.ConfigurationTarget.Global);
  }
}

/** Подписка на изменение любой настройки `gitscope.*`. */
export function onPanelSettingsChanged(listener: (settings: PanelSettings) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('gitscope')) {
      listener(readPanelSettings());
    }
  });
}
