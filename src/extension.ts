import * as vscode from 'vscode';
import { GRAPH_PANEL_VIEW_TYPE } from '@shared/graphProtocol';
import { COMPARE_PANEL_VIEW_TYPE } from '@shared/protocol';
import { ComparePanel } from './features/compare/ComparePanel';
import { runCompareCommand, type CompareCommandArgs } from './features/compare/compareCommand';
import { GraphPanel } from './features/graph/GraphPanel';
import { runGraphCommand, type GraphCommandArgs } from './features/graph/graphCommand';
import { createOutputChannelLogger } from './services/logging';
import { RepositoryLocator } from './services/RepositoryLocator';

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputChannelLogger('GitScope');
  const locator = new RepositoryLocator(logger);

  context.subscriptions.push(
    logger,
    vscode.commands.registerCommand('gitscope.compareRevisions', async (args?: CompareCommandArgs) => {
      try {
        await runCompareCommand(context.extensionUri, locator, logger, args ?? {});
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
    vscode.commands.registerCommand('gitscope.showGitGraph', async (args?: GraphCommandArgs) => {
      try {
        await runGraphCommand(context.extensionUri, locator, logger, args ?? {});
      } catch (error) {
        logger.error('Команда графа коммитов завершилась ошибкой', error);
        void vscode.window.showErrorMessage(
          `GitScope: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
    vscode.window.registerWebviewPanelSerializer(GRAPH_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        // Граф тоже не восстанавливаем: история могла уйти вперёд.
        GraphPanel.revive(panel, context.extensionUri, logger);
      },
    }),
  );

  logger.info('GitScope активирован');
}

export function deactivate(): void {
  // Всё, что нужно закрыть, лежит в context.subscriptions.
}
