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
import type { PanelSettings } from '@shared/protocol';
import type { StashEntry, StashFile, StashTarget } from '@shared/stashModel';
import {
  STASH_PANEL_VIEW_TYPE,
  type StashNotifications,
  type StashPanelState,
  type StashRequests,
  type StashSummaryResult,
} from '@shared/stashProtocol';
import { emptyVersionUri, fileVersionUri } from '../../services/FileVersionDocuments';
import { applyDiffLayout, onPanelSettingsChanged, readPanelSettings } from '../../services/settings';
import { StashService } from '../../services/StashService';
import { buildWebviewHtml, createWebviewTransport } from '../webview/host';

interface StashContext {
  readonly repository: GitRepository;
  readonly service: StashService;
}

/**
 * Сколько стешей считаем разом.
 *
 * Содержимое каждого — несколько процессов git, и на списке из полусотни
 * стешей запуск их всех сразу кладёт машину раньше, чем панель что-то покажет.
 */
const SUMMARY_CONCURRENCY = 4;

/**
 * Панель стешей: слева список стешей, справа содержимое выбранного.
 *
 * Как и остальные панели, живёт в единственном экземпляре и переезжает на
 * другой репозиторий вместо того, чтобы плодить вкладки.
 *
 * Панель ничего не меняет: ни создать, ни применить, ни удалить стеш отсюда
 * нельзя. Это читалка — и по этой же причине список перечитывается сам, когда
 * панель снова оказывается активной: стеши двигают из терминала, и показывать
 * снятый полчаса назад стеш как существующий нельзя.
 */
export class StashPanel implements vscode.Disposable {
  private static current: StashPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly rpc: RpcServer<StashNotifications>;

  private settings: PanelSettings;
  private context: StashContext | null = null;
  private entries: StashEntry[] = [];
  /** Содержимое стешей по SHA. Коммит стеша неизменен, поэтому кэш не протухает. */
  private readonly summaries = new Map<string, StashSummaryResult>();
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
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, extensionUri, 'GitScope', 'stashes');

    const transport = createWebviewTransport(this.panel.webview, this.disposables);
    this.rpc = createRpcServer<StashRequests, StashNotifications>(transport, this.createHandlers(), (error) =>
      this.logger.error('Необработанная ошибка в обработчике RPC', error),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      onPanelSettingsChanged((settings) => {
        // Число строк контекста меняет содержимое патчей, но перечитывать
        // список стешей ради этого незачем: webview держит патчи в кэше,
        // ключом которого это число и является.
        this.settings = settings;
        this.rpc.notify('settings/updated', settings);
      }),
      this.panel.onDidChangeViewState(() => {
        if (this.panel.active) {
          void this.reload();
        }
      }),
    );
  }

  static show(extensionUri: vscode.Uri, logger: Logger): StashPanel {
    if (StashPanel.current) {
      StashPanel.current.panel.reveal(StashPanel.current.panel.viewColumn);
      return StashPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      STASH_PANEL_VIEW_TYPE,
      'GitScope: стеши',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: false },
    );
    StashPanel.current = new StashPanel(panel, extensionUri, logger);
    return StashPanel.current;
  }

  /** Восстановление после перезапуска VS Code. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, logger: Logger): void {
    StashPanel.current?.dispose();
    StashPanel.current = new StashPanel(panel, extensionUri, logger);
  }

  /** Задаёт, стеши какого репозитория показывать, и запускает загрузку. */
  async setRepository(repository: GitRepository): Promise<void> {
    this.context = { repository, service: new StashService(repository) };
    this.entries = [];
    this.summaries.clear();
    await this.reload();
  }

  private createHandlers(): RpcHandlers<StashRequests> {
    return {
      'stashes/ready': (): StashPanelState => this.snapshot(),

      'stashes/patch': async ({ sha, path }, signal) => {
        const { context, entry, file } = await this.requireFile(sha, path, signal);
        return context.service.patch(entry, file, this.settings.contextLines, signal);
      },

      'stashes/context': async ({ sha, path, startLine, endLine }, signal) => {
        const { context, entry, file } = await this.requireFile(sha, path, signal);
        return context.service.readLines(entry, file, startLine, endLine, signal);
      },

      'stashes/open': async ({ sha, path }, signal) => {
        const { context, entry, file } = await this.requireFile(sha, path, signal);
        const { left, right } = this.diffSides(context, entry, file);
        // Показываем ту сторону, которая в стеше и есть: у удалённого файла это
        // его состояние в базе — только оно и осталось.
        await vscode.window.showTextDocument(file.status === 'deleted' ? left : right, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        });
        return null;
      },

      'stashes/openDiff': async ({ sha, path, viewMode }, signal) => {
        const { context, entry, file } = await this.requireFile(sha, path, signal);
        const { left, right } = this.diffSides(context, entry, file);
        // Раскладку задаём до открытия: вкладка читает настройку, когда рисуется.
        await applyDiffLayout(viewMode);
        await vscode.commands.executeCommand(
          'vscode.diff',
          left,
          right,
          `${basename(file.path)}: изменения в ${entry.ref}`,
          { viewColumn: vscode.ViewColumn.Beside, preview: true },
        );
        return null;
      },

      'stashes/copySha': async ({ sha }) => {
        await vscode.env.clipboard.writeText(this.requireEntry(sha).sha);
        return null;
      },

      'stashes/pickRepository': () => {
        // Через саму команду: она уже умеет спрашивать репозиторий и знает, что
        // панель в окне одна, — эта же и получит выбранный.
        void vscode.commands.executeCommand('gitscope.stashes');
        return null;
      },

      'stashes/reload': () => {
        void this.reload();
        return null;
      },
    };
  }

  private snapshot(): StashPanelState {
    return {
      settings: this.settings,
      target: this.target(),
      entries: this.entries,
      summaries: [...this.summaries.values()],
      error: this.failure,
      loading: this.loading,
    };
  }

  private target(): StashTarget | null {
    const context = this.context;
    if (!context) {
      return null;
    }
    return { repositoryRoot: context.repository.root, repositoryName: basename(context.repository.root) };
  }

  private requireContext(): StashContext {
    if (!this.context) {
      throw new Error('Репозиторий ещё не выбран');
    }
    return this.context;
  }

  private requireEntry(sha: string): StashEntry {
    const entry = this.entries.find((candidate) => candidate.sha === sha);
    if (!entry) {
      throw new Error('Этого стеша нет в списке — обновите панель');
    }
    return entry;
  }

  /**
   * Стеш и файл внутри него.
   *
   * Содержимое стеша обычно уже посчитано — панель считает его сама, — но
   * запрос может прийти и раньше, чем очередь дойдёт до этого стеша.
   */
  private async requireFile(
    sha: string,
    path: string,
    signal: AbortSignal,
  ): Promise<{ context: StashContext; entry: StashEntry; file: StashFile }> {
    const context = this.requireContext();
    const entry = this.requireEntry(sha);
    const cached = this.summaries.get(sha)?.summary;
    const summary = cached ?? (await context.service.summary(entry, signal));

    const file = summary.files.find((candidate) => candidate.path === path);
    if (!file) {
      throw new Error(`Файла «${path}» нет в этом стеше`);
    }
    return { context, entry, file };
  }

  /**
   * Стороны сравнения для файла из стеша.
   *
   * Сторона, где файла нет — он в стеше появился или, наоборот, был удалён, —
   * заменяется пустой ссылкой: вкладке сравнения нужны два документа, и
   * «файла тут нет» показывается пустой половиной, а не ошибкой.
   */
  private diffSides(
    context: StashContext,
    entry: StashEntry,
    file: StashFile,
  ): { left: vscode.Uri; right: vscode.Uri } {
    const root = context.repository.root;
    const { base, compare } = context.service.sides(entry, file);
    const previousPath = file.previousPath ?? file.path;

    return {
      left:
        file.status === 'added' || file.untracked === true
          ? emptyVersionUri(root, previousPath)
          : fileVersionUri(root, previousPath, base.sha, entry.base.shortSha),
      right:
        file.status === 'deleted'
          ? emptyVersionUri(root, file.path)
          : fileVersionUri(root, file.path, compare.sha, entry.shortSha),
    };
  }

  private async reload(): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    this.loadController?.abort(new Error('Началась новая загрузка списка стешей'));
    const controller = new AbortController();
    this.loadController = controller;

    this.loading = true;
    this.rpc.notify('stashes/loading', { loading: true });
    this.panel.title = `GitScope: стеши ${basename(context.repository.root)}`;

    try {
      const entries = await context.service.list(controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.entries = entries;
      this.failure = null;
      this.rpc.notify('stashes/updated', { target: this.target(), entries });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.logger.error('Не удалось прочитать список стешей', error);
      this.entries = [];
      this.failure = toErrorPayload(error);
      this.rpc.notify('stashes/failed', this.failure);
      return;
    } finally {
      if (!controller.signal.aborted) {
        this.loading = false;
        this.rpc.notify('stashes/loading', { loading: false });
      }
    }

    // Содержимое считается после списка и приходит по стешу за раз: список
    // должен появиться сразу, а не ждать, пока git разберёт все стеши.
    await this.loadSummaries(context, controller.signal);
  }

  private async loadSummaries(context: StashContext, signal: AbortSignal): Promise<void> {
    const queue = this.entries.filter((entry) => !this.summaries.has(entry.sha));
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < queue.length && !signal.aborted) {
        const entry = queue[next] as StashEntry;
        next += 1;

        const result = await context.service
          .summary(entry, signal)
          .then((summary): StashSummaryResult => ({ sha: entry.sha, summary, error: null }))
          .catch((error: unknown): StashSummaryResult | undefined => {
            if (signal.aborted) {
              return undefined;
            }
            this.logger.error(`Не удалось прочитать содержимое стеша ${entry.ref}`, error);
            return { sha: entry.sha, summary: null, error: toErrorPayload(error) };
          });

        if (result === undefined || signal.aborted) {
          return;
        }
        this.summaries.set(entry.sha, result);
        this.rpc.notify('stashes/summary', result);
      }
    };

    await Promise.all(Array.from({ length: Math.min(SUMMARY_CONCURRENCY, queue.length) }, worker));
  }

  dispose(): void {
    if (StashPanel.current === this) {
      StashPanel.current = undefined;
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
