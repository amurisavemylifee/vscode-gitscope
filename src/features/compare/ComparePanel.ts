import * as vscode from 'vscode';
import type { Logger } from '@shared/logger';
import { createRpcServer, type RpcHandlers, type RpcServer } from '@shared/messaging';
import {
  COMPARE_PANEL_VIEW_TYPE,
  type GitScopeNotifications,
  type GitScopeRequests,
  type PanelSettings,
  type PanelState,
} from '@shared/protocol';
import { onPanelSettingsChanged, readPanelSettings } from '../../services/settings';
import { buildWebviewHtml, createWebviewTransport } from '../webview/host';

/**
 * Панель сравнения. Владеет webview, роутит RPC и держит текущее состояние.
 *
 * В окне живёт максимум одна панель: сравнение — это «рабочий стол», а не
 * документ, поэтому повторный вызов команды переиспользует открытую панель.
 */
export class ComparePanel implements vscode.Disposable {
  private static current: ComparePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rpc: RpcServer<GitScopeNotifications>;
  private settings: PanelSettings;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly logger: Logger,
  ) {
    this.settings = readPanelSettings();

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
    };
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri, 'GitScope');

    const transport = createWebviewTransport(this.panel.webview, this.disposables);
    this.rpc = createRpcServer<GitScopeRequests, GitScopeNotifications>(transport, this.createHandlers(), (error) =>
      this.logger.error('Необработанная ошибка в обработчике RPC', error),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      onPanelSettingsChanged((settings) => {
        this.settings = settings;
        this.rpc.notify('settings/updated', settings);
      }),
    );
  }

  /** Открывает панель или показывает уже открытую. */
  static show(extensionUri: vscode.Uri, logger: Logger): ComparePanel {
    if (ComparePanel.current) {
      ComparePanel.current.panel.reveal(ComparePanel.current.panel.viewColumn);
      return ComparePanel.current;
    }
    const panel = vscode.window.createWebviewPanel(COMPARE_PANEL_VIEW_TYPE, 'GitScope: сравнение', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: false,
    });
    ComparePanel.current = new ComparePanel(panel, extensionUri, logger);
    return ComparePanel.current;
  }

  /** Восстановление панели после перезапуска VS Code. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logger: Logger): void {
    ComparePanel.current?.dispose();
    ComparePanel.current = new ComparePanel(panel, extensionUri, logger);
  }

  private createHandlers(): RpcHandlers<GitScopeRequests> {
    const notSelected = (): never => {
      throw new Error('Ревизии для сравнения ещё не выбраны');
    };

    return {
      'panel/ready': (): PanelState => ({
        settings: this.settings,
        summary: null,
        fetch: { inProgress: false, hasRemote: false },
        error: null,
      }),
      'comparison/patch': notSelected,
      'comparison/context': notSelected,
      'revision/pick': notSelected,
      'revision/swap': notSelected,
      'comparison/reload': notSelected,
      'repository/fetch': notSelected,
    };
  }

  dispose(): void {
    if (ComparePanel.current === this) {
      ComparePanel.current = undefined;
    }
    this.rpc.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}
