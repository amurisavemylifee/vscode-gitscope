import * as vscode from 'vscode';
import type { GitRepository } from '@core/git/GitRepository';
import type { Logger } from '@shared/logger';
import {
  createRpcServer,
  toErrorPayload,
  type RpcErrorPayload,
  type RpcHandlers,
  type RpcServer,
} from '@shared/messaging';
import type { ComparisonSummary, FileChange, Revision, Side } from '@shared/model';
import {
  COMPARE_PANEL_VIEW_TYPE,
  type FetchInfo,
  type GitScopeNotifications,
  type GitScopeRequests,
  type PanelSettings,
  type PanelState,
} from '@shared/protocol';
import { ComparisonService } from '../../services/ComparisonService';
import { RevisionService } from '../../services/RevisionService';
import { onPanelSettingsChanged, readPanelSettings } from '../../services/settings';
import { buildWebviewHtml, createWebviewTransport } from '../webview/host';
import { pickRevision } from './RevisionPicker';

interface ComparisonContext {
  readonly repository: GitRepository;
  readonly revisions: RevisionService;
  readonly comparison: ComparisonService;
  base: Revision;
  compare: Revision;
}

/**
 * Панель сравнения: владеет webview, роутит RPC и держит текущее сравнение.
 *
 * В окне живёт максимум одна панель — сравнение это рабочий стол, а не
 * документ, поэтому повторный вызов команды переиспользует открытую.
 */
export class ComparePanel implements vscode.Disposable {
  private static current: ComparePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rpc: RpcServer<GitScopeNotifications>;

  private settings: PanelSettings;
  private context: ComparisonContext | null = null;
  private summary: ComparisonSummary | null = null;
  private failure: RpcErrorPayload | null = null;
  private fetchInfo: FetchInfo = { inProgress: false, hasRemote: false };
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
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri, 'GitScope');

    const transport = createWebviewTransport(this.panel.webview, this.disposables);
    this.rpc = createRpcServer<GitScopeRequests, GitScopeNotifications>(transport, this.createHandlers(), (error) =>
      this.logger.error('Необработанная ошибка в обработчике RPC', error),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      onPanelSettingsChanged((settings) => {
        const contextLinesChanged = settings.contextLines !== this.settings.contextLines;
        this.settings = settings;
        this.rpc.notify('settings/updated', settings);
        // Количество строк контекста меняет содержимое патчей, а они уже
        // загружены в панели — проще перечитать сравнение целиком.
        if (contextLinesChanged) {
          void this.reload();
        }
      }),
    );
  }

  static show(extensionUri: vscode.Uri, logger: Logger): ComparePanel {
    if (ComparePanel.current) {
      ComparePanel.current.panel.reveal(ComparePanel.current.panel.viewColumn);
      return ComparePanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      COMPARE_PANEL_VIEW_TYPE,
      'GitScope: сравнение',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    ComparePanel.current = new ComparePanel(panel, extensionUri, logger);
    return ComparePanel.current;
  }

  /** Восстановление после перезапуска VS Code. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logger: Logger): void {
    ComparePanel.current?.dispose();
    ComparePanel.current = new ComparePanel(panel, extensionUri, logger);
  }

  /** Задаёт, что с чем сравнивать, и запускает загрузку. */
  async setComparison(repository: GitRepository, base: Revision, compare: Revision): Promise<void> {
    this.context = {
      repository,
      revisions: new RevisionService(repository),
      comparison: new ComparisonService(repository),
      base,
      compare,
    };
    await this.reload();
  }

  private createHandlers(): RpcHandlers<GitScopeRequests> {
    return {
      'panel/ready': (): PanelState => this.snapshot(),

      'comparison/patch': async ({ path }, signal) => {
        const { context, file } = this.requireFile(path);
        return context.comparison.buildPatch(context.base, context.compare, file, this.settings.contextLines, signal);
      },

      'comparison/context': async ({ path, side, startLine, endLine }, signal) => {
        const { context, file } = this.requireFile(path);
        // У переименованного файла базовая сторона живёт под прежним именем.
        const revision = side === 'base' ? context.base.sha : context.compare.sha;
        const filePath = side === 'base' ? (file.previousPath ?? file.path) : file.path;
        return context.comparison.readLines(revision, filePath, startLine, endLine, signal);
      },

      'revision/pick': ({ side }) => {
        // Не держим RPC открытым, пока пользователь думает над списком:
        // результат придёт уведомлением об обновлении сравнения.
        void this.pickAndApply(side);
        return null;
      },

      'revision/swap': () => {
        if (this.context) {
          const { base, compare } = this.context;
          this.context.base = compare;
          this.context.compare = base;
          void this.reload();
        }
        return null;
      },

      'comparison/reload': () => {
        void this.reload();
        return null;
      },

      'repository/fetch': () => {
        void this.fetch();
        return null;
      },
    };
  }

  private snapshot(): PanelState {
    return {
      settings: this.settings,
      summary: this.summary,
      fetch: this.fetchInfo,
      error: this.failure,
      loading: this.loading,
    };
  }

  private requireFile(path: string): { context: ComparisonContext; file: FileChange } {
    const context = this.context;
    if (!context || !this.summary) {
      throw new Error('Сравнение ещё не построено');
    }
    const file = this.summary.files.find((candidate) => candidate.path === path);
    if (!file) {
      throw new Error(`Файла «${path}» нет в этом сравнении`);
    }
    return { context, file };
  }

  private async pickAndApply(side: Side): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    const current = side === 'base' ? context.base : context.compare;
    const picked = await pickRevision(context.revisions, {
      title: side === 'base' ? 'Базовая ревизия — с чем сравниваем' : 'Сравниваемая ревизия — что сравниваем',
      current: current.spec,
    });

    if (!picked) {
      return;
    }
    if (side === 'base') {
      context.base = picked;
    } else {
      context.compare = picked;
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    this.loadController?.abort(new Error('Началась новая загрузка сравнения'));
    const controller = new AbortController();
    this.loadController = controller;

    this.loading = true;
    this.rpc.notify('comparison/loading', { loading: true });
    this.panel.title = `GitScope: ${context.base.label} → ${context.compare.label}`;

    try {
      // Содержимое файлов на прежних ревизиях больше не пригодится.
      context.comparison.clearCache();
      const summary = await context.comparison.buildSummary(context.base, context.compare, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.summary = summary;
      this.failure = null;
      this.rpc.notify('comparison/updated', summary);
      void this.refreshFetchInfo();
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.logger.error('Не удалось построить сравнение', error);
      this.summary = null;
      this.failure = toErrorPayload(error);
      this.rpc.notify('comparison/failed', this.failure);
    } finally {
      if (!controller.signal.aborted) {
        this.loading = false;
        this.rpc.notify('comparison/loading', { loading: false });
      }
    }
  }

  private async fetch(): Promise<void> {
    const context = this.context;
    if (!context || this.fetchInfo.inProgress) {
      return;
    }

    this.updateFetchInfo({ inProgress: true });
    try {
      await context.repository.fetch();
      await this.refreshFetchInfo();
      await this.reload();
    } catch (error) {
      this.logger.error('git fetch не удался', error);
      void vscode.window.showErrorMessage(
        `GitScope: не удалось обновить ссылки с сервера. ${toErrorPayload(error).message}`,
      );
    } finally {
      this.updateFetchInfo({ inProgress: false });
    }
  }

  private async refreshFetchInfo(): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }
    const [hasRemote, lastFetchedAt] = await Promise.all([
      context.repository.hasRemote(),
      context.repository.lastFetchAt(),
    ]);
    this.updateFetchInfo({ hasRemote, ...(lastFetchedAt !== undefined ? { lastFetchedAt } : {}) });
  }

  private updateFetchInfo(patch: Partial<FetchInfo>): void {
    this.fetchInfo = { ...this.fetchInfo, ...patch };
    this.rpc.notify('fetch/updated', this.fetchInfo);
  }

  dispose(): void {
    if (ComparePanel.current === this) {
      ComparePanel.current = undefined;
    }
    this.loadController?.abort(new Error('Панель закрыта'));
    this.rpc.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}
