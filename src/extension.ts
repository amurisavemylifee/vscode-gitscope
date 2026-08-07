import * as vscode from 'vscode';
import { COMPARE_PANEL_VIEW_TYPE } from '@shared/protocol';
import { ComparePanel } from './features/compare/ComparePanel';
import { createOutputChannelLogger } from './services/logging';

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputChannelLogger('GitScope');
  context.subscriptions.push(logger);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitscope.compareRevisions', () => {
      ComparePanel.show(context.extensionUri, logger);
    }),
    vscode.window.registerWebviewPanelSerializer(COMPARE_PANEL_VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => {
        ComparePanel.revive(panel, context.extensionUri, logger);
      },
    }),
  );

  logger.info('GitScope активирован');
}

export function deactivate(): void {
  // Всё, что нужно закрыть, лежит в context.subscriptions.
}
