import * as vscode from 'vscode';
import type { GitRepository } from '@core/git/GitRepository';
import { GraphService } from '../../services/GraphService';
import type { Logger } from '@shared/logger';
import {
  createRpcServer,
  toErrorPayload,
  type RpcErrorPayload,
  type RpcHandlers,
  type RpcServer,
} from '@shared/messaging';
import {
  GRAPH_PANEL_VIEW_TYPE,
  type GitGraphNotifications,
  type GitGraphRequests,
  type GraphPanelState,
  type GraphRefFilter,
  type GraphSnapshot,
} from '@shared/graphProtocol';
import { buildWebviewHtml, createWebviewTransport } from '../webview/host';

/** Сколько коммитов запрашивать за раз и на сколько увеличивать при «загрузить ещё». */
const INITIAL_LIMIT = 300;
const LOAD_MORE_STEP = 300;

const DEFAULT_FILTER: GraphRefFilter = { mode: 'default', selectedRefs: [] };

/**
 * Панель графа коммитов: владеет webview, роутит RPC, хранит текущий фильтр веток.
 *
 * Как и `ComparePanel` — синглтон на окно: граф это тоже рабочий стол, а не документ,
 * повторный вызов команды переиспользует уже открытую панель.
 */
export class GraphPanel implements vscode.Disposable {
  private static current: GraphPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rpc: RpcServer<GitGraphNotifications>;

  private service: GraphService | null = null;
  private filter: GraphRefFilter = DEFAULT_FILTER;
  private limit = INITIAL_LIMIT;
  private snapshotData: GraphSnapshot | null = null;
  private failure: RpcErrorPayload | null = null;
  private loading = false;
  private loadController: AbortController | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly logger: Logger,
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
    };
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri, 'GitScope: граф', 'graph');

    const transport = createWebviewTransport(this.panel.webview, this.disposables);
    this.rpc = createRpcServer<GitGraphRequests, GitGraphNotifications>(transport, this.createHandlers(), (error) =>
      this.logger.error('Необработанная ошибка в обработчике RPC графа', error),
    );

    this.disposables.push(this.panel.onDidDispose(() => this.dispose()));
  }

  static show(extensionUri: vscode.Uri, logger: Logger): GraphPanel {
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal(GraphPanel.current.panel.viewColumn);
      return GraphPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      GRAPH_PANEL_VIEW_TYPE,
      'GitScope: граф',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    GraphPanel.current = new GraphPanel(panel, extensionUri, logger);
    return GraphPanel.current;
  }

  /** Восстановление после перезапуска VS Code. Граф не восстанавливаем — он мог устареть. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logger: Logger): void {
    GraphPanel.current?.dispose();
    GraphPanel.current = new GraphPanel(panel, extensionUri, logger);
  }

  /** Задаёт репозиторий и запускает первую загрузку с настройками по умолчанию. */
  async load(repository: GitRepository): Promise<void> {
    this.service = new GraphService(repository);
    this.filter = DEFAULT_FILTER;
    this.limit = INITIAL_LIMIT;
    this.panel.title = `GitScope: граф · ${basename(repository.root)}`;
    await this.reload();
  }

  private createHandlers(): RpcHandlers<GitGraphRequests> {
    return {
      'panel/ready': (): GraphPanelState => this.snapshot(),

      'graph/setFilter': (filter) => {
        this.filter = filter;
        this.limit = INITIAL_LIMIT;
        void this.reload();
        return null;
      },

      'graph/loadMore': () => {
        this.limit += LOAD_MORE_STEP;
        void this.reload();
        return null;
      },

      'graph/reload': () => {
        void this.reload();
        return null;
      },
    };
  }

  private snapshot(): GraphPanelState {
    return { snapshot: this.snapshotData, error: this.failure, loading: this.loading };
  }

  private async reload(): Promise<void> {
    const service = this.service;
    if (!service) {
      return;
    }

    this.loadController?.abort(new Error('Началась новая загрузка графа'));
    const controller = new AbortController();
    this.loadController = controller;

    this.loading = true;
    this.rpc.notify('graph/loading', { loading: true });

    try {
      const snapshot = await service.loadSnapshot(this.filter, this.limit, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      this.snapshotData = snapshot;
      this.failure = null;
      this.rpc.notify('graph/updated', snapshot);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.logger.error('Не удалось построить граф коммитов', error);
      this.snapshotData = null;
      this.failure = toErrorPayload(error);
      this.rpc.notify('graph/failed', this.failure);
    } finally {
      if (!controller.signal.aborted) {
        this.loading = false;
        this.rpc.notify('graph/loading', { loading: false });
      }
    }
  }

  dispose(): void {
    if (GraphPanel.current === this) {
      GraphPanel.current = undefined;
    }
    this.loadController?.abort(new Error('Панель закрыта'));
    this.rpc.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
