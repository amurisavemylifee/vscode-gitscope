import * as vscode from 'vscode';
import { COMPARE_PANEL_VIEW_TYPE } from '@shared/protocol';
import { ComparePanel } from './features/compare/ComparePanel';
import { runCompareCommand } from './features/compare/compareCommand';
import { createOutputChannelLogger } from './services/logging';
import { RepositoryLocator } from './services/RepositoryLocator';

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputChannelLogger('GitScope');
  const locator = new RepositoryLocator(logger);

  context.subscriptions.push(
    logger,
    vscode.commands.registerCommand('gitscope.compareRevisions', async () => {
      try {
        await runCompareCommand(context.extensionUri, locator, logger);
      } catch (error) {
        logger.error('Команда сравнения завершилась ошибкой', error);
        void vscode.window.showErrorMessage(
          `GitScope: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
    vscode.window.registerWebviewPanelSerializer(COMPARE_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        // Данные сравнения не восстанавливаем: они могли устареть, а показывать
        // протухший diff хуже, чем попросить выбрать ревизии заново.
        ComparePanel.revive(panel, context.extensionUri, logger);
      },
    }),
  );

  logger.info('GitScope активирован');
}

export function deactivate(): void {
  // Всё, что нужно закрыть, лежит в context.subscriptions.
}
