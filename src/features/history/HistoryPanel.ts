import * as vscode from 'vscode';
import type { GitRepository } from '@core/git/GitRepository';
import type { HistoryEntry, HistoryTarget } from '@shared/historyModel';
import {
  HISTORY_PANEL_VIEW_TYPE,
  type HistoryNotifications,
  type HistoryPage,
  type HistoryPanelState,
  type HistoryRequests,
} from '@shared/historyProtocol';
import type { Logger } from '@shared/logger';
import {
  createRpcServer,
  toErrorPayload,
  type RpcErrorPayload,
  type RpcHandlers,
  type RpcServer,
} from '@shared/messaging';
import type { PanelSettings } from '@shared/protocol';
import { FileHistoryService } from '../../services/FileHistoryService';
import { fileVersionUri } from '../../services/FileVersionDocuments';
import { onPanelSettingsChanged, readPanelSettings } from '../../services/settings';
import { buildWebviewHtml, createWebviewTransport } from '../webview/host';

interface HistoryContext {
  readonly repository: GitRepository;
  readonly service: FileHistoryService;
  readonly target: HistoryTarget;
}

/**
 * Панель истории файла: слева версии, справа выбранная версия.
 *
 * Как и панель сравнения, живёт в единственном экземпляре и переезжает на новый
 * файл вместо того, чтобы плодить вкладки: история — это инструмент, к которому
 * возвращаются, а не документ, который держат открытым.
 */
export class HistoryPanel implements vscode.Disposable {
  private static current: HistoryPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rpc: RpcServer<HistoryNotifications>;

  private settings: PanelSettings;
  private context: HistoryContext | null = null;
  private entries: HistoryEntry[] = [];
  private hasMore = false;
  private failure: RpcErrorPayload | null = null;
  private loading = false;
  private loadController: AbortController | undefined;

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
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri, 'GitScope', 'history');

    const transport = createWebviewTransport(this.panel.webview, this.disposables);
    this.rpc = createRpcServer<HistoryRequests, HistoryNotifications>(transport, this.createHandlers(), (error) =>
      this.logger.error('Необработанная ошибка в обработчике RPC', error),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      onPanelSettingsChanged((settings) => {
        this.settings = settings;
        this.rpc.notify('settings/updated', settings);
      }),
      // Сохранение файла меняет карточку рабочей копии: панель, которая этого
      // не заметила, показывает вчерашнее состояние сегодняшнего файла.
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.context && document.uri.fsPath === this.absolutePath(this.context)) {
          void this.reload();
        }
      }),
    );
  }

  static show(extensionUri: vscode.Uri, logger: Logger): HistoryPanel {
    if (HistoryPanel.current) {
      HistoryPanel.current.panel.reveal(HistoryPanel.current.panel.viewColumn);
      return HistoryPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      HISTORY_PANEL_VIEW_TYPE,
      'GitScope: история файла',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    HistoryPanel.current = new HistoryPanel(panel, extensionUri, logger);
    return HistoryPanel.current;
  }

  /** Восстановление после перезапуска VS Code. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logger: Logger): void {
    HistoryPanel.current?.dispose();
    HistoryPanel.current = new HistoryPanel(panel, extensionUri, logger);
  }

  /** Задаёт, историю какого файла показывать, и запускает загрузку. */
  async setTarget(repository: GitRepository, path: string): Promise<void> {
    this.context = {
      repository,
      service: new FileHistoryService(repository, path),
      target: {
        path,
        repositoryRoot: repository.root,
        repositoryName: basename(repository.root),
      },
    };
    await this.reload();
  }

  private createHandlers(): RpcHandlers<HistoryRequests> {
    return {
      'history/ready': (): HistoryPanelState => this.snapshot(),

      'history/more': async (_params, signal): Promise<HistoryPage> => {
        const context = this.requireContext();
        const last = [...this.entries].reverse().find((entry) => entry.kind === 'commit' && entry.sha !== undefined);
        if (last?.sha === undefined) {
          return { entries: [], hasMore: false };
        }

        // Ниже коммита переименования файл жил под прежним именем — с ним и
        // надо продолжать обход.
        const page = await context.service.page({ sha: last.sha, path: last.previousPath ?? last.path }, signal);
        this.entries = [...this.entries, ...page.entries];
        this.hasMore = page.hasMore;
        return page;
      },

      'history/version': ({ entryId }, signal) => this.requireContext().service.version(this.requireEntry(entryId), signal),

      'history/patch': ({ entryId }, signal) =>
        this.requireContext().service.patch(this.requireEntry(entryId), this.settings.contextLines, signal),

      'history/open': async ({ entryId }) => {
        const context = this.requireContext();
        const entry = this.requireEntry(entryId);
        const uri =
          entry.kind === 'working'
            ? vscode.Uri.file(this.absolutePath(context))
            : fileVersionUri(context.repository.root, entry.path, entry.sha ?? entry.id, entry.shortSha ?? entry.id);
        // Рядом с панелью, а не поверх неё: сравнивать версию с историей
        // удобнее, когда видно и то, и другое.
        await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
        return null;
      },

      'history/copySha': async ({ entryId }) => {
        const sha = this.requireEntry(entryId).sha;
        if (sha !== undefined) {
          await vscode.env.clipboard.writeText(sha);
        }
        return null;
      },

      'history/reload': () => {
        void this.reload();
        return null;
      },
    };
  }

  private snapshot(): HistoryPanelState {
    return {
      settings: this.settings,
      target: this.context?.target ?? null,
      entries: this.entries,
      hasMore: this.hasMore,
      error: this.failure,
      loading: this.loading,
    };
  }

  private requireContext(): HistoryContext {
    if (!this.context) {
      throw new Error('Файл ещё не выбран');
    }
    return this.context;
  }

  private requireEntry(entryId: string): HistoryEntry {
    const entry = this.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new Error('Этой версии нет в загруженной истории');
    }
    return entry;
  }

  private absolutePath(context: HistoryContext): string {
    return vscode.Uri.joinPath(vscode.Uri.file(context.repository.root), ...context.target.path.split('/')).fsPath;
  }

  private async reload(): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    this.loadController?.abort(new Error('Началась новая загрузка истории'));
    const controller = new AbortController();
    this.loadController = controller;

    this.loading = true;
    this.rpc.notify('history/loading', { loading: true });
    this.panel.title = `GitScope: история ${basename(context.target.path)}`;

    try {
      // Рабочая копия и первая страница истории независимы — считаем разом.
      const [working, page] = await Promise.all([
        context.service.workingEntry(controller.signal),
        context.service.page(undefined, controller.signal),
      ]);
      if (controller.signal.aborted) {
        return;
      }

      this.entries = working ? [working, ...page.entries] : [...page.entries];
      this.hasMore = page.hasMore;
      this.failure = null;
      this.rpc.notify('history/updated', { target: context.target, entries: this.entries, hasMore: this.hasMore });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.logger.error('Не удалось построить историю файла', error);
      this.entries = [];
      this.hasMore = false;
      this.failure = toErrorPayload(error);
      this.rpc.notify('history/failed', this.failure);
    } finally {
      if (!controller.signal.aborted) {
        this.loading = false;
        this.rpc.notify('history/loading', { loading: false });
      }
    }
  }

  dispose(): void {
    if (HistoryPanel.current === this) {
      HistoryPanel.current = undefined;
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
