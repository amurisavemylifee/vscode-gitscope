import * as vscode from 'vscode';
import { HISTORY_PANEL_VIEW_TYPE } from '@shared/historyProtocol';
import { COMPARE_PANEL_VIEW_TYPE } from '@shared/protocol';
import { STASH_PANEL_VIEW_TYPE } from '@shared/stashProtocol';
import { ComparePanel } from './features/compare/ComparePanel';
import { runCompareCommand, type CompareCommandArgs } from './features/compare/compareCommand';
import { HistoryPanel } from './features/history/HistoryPanel';
import { runFileHistoryCommand, type FileHistoryCommandArgs } from './features/history/fileHistoryCommand';
import { StashPanel } from './features/stashes/StashPanel';
import { runStashesCommand, type StashesCommandArgs } from './features/stashes/stashesCommand';
import { createOutputChannelLogger } from './services/logging';
import { FILE_VERSION_SCHEME, FileVersionContentProvider } from './services/FileVersionDocuments';
import { RepositoryLocator } from './services/RepositoryLocator';

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputChannelLogger('GitScope');
  const locator = new RepositoryLocator(logger);

  const report = (error: unknown) => {
    logger.error('Команда завершилась ошибкой', error);
    void vscode.window.showErrorMessage(`GitScope: ${error instanceof Error ? error.message : String(error)}`);
  };

  context.subscriptions.push(
    logger,
    vscode.commands.registerCommand('gitscope.compareRevisions', async (args?: CompareCommandArgs) => {
      try {
        await runCompareCommand(context.extensionUri, locator, logger, args ?? {});
      } catch (error) {
        report(error);
      }
    }),
    vscode.commands.registerCommand('gitscope.fileHistory', async (arg?: vscode.Uri | FileHistoryCommandArgs) => {
      try {
        await runFileHistoryCommand(context.extensionUri, locator, logger, arg);
      } catch (error) {
        report(error);
      }
    }),
    vscode.commands.registerCommand('gitscope.stashes', async (args?: StashesCommandArgs) => {
      try {
        await runStashesCommand(context.extensionUri, locator, logger, args ?? {});
      } catch (error) {
        report(error);
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider(
      FILE_VERSION_SCHEME,
      new FileVersionContentProvider(locator, logger),
    ),
    vscode.window.registerWebviewPanelSerializer(COMPARE_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        // Данные сравнения не восстанавливаем: они могли устареть, а показывать
        // протухший diff хуже, чем попросить выбрать ревизии заново.
        ComparePanel.revive(panel, context.extensionUri, logger);
      },
    }),
    vscode.window.registerWebviewPanelSerializer(HISTORY_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        // История тоже перечитывается заново: файл мог измениться, а показывать
        // вчерашний список версий как сегодняшний нельзя.
        HistoryPanel.revive(panel, context.extensionUri, logger);
      },
    }),
    vscode.window.registerWebviewPanelSerializer(STASH_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        // Список стешей тоже перечитывается заново: стеши снимают и создают
        // между сеансами, и вчерашний список сегодня уже неправда.
        StashPanel.revive(panel, context.extensionUri, logger);
      },
    }),
  );

  logger.info('GitScope активирован');
}

export function deactivate(): void {
  // Всё, что нужно закрыть, лежит в context.subscriptions.
}
