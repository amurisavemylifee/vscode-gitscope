import * as vscode from 'vscode';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitRepository } from '@core/git/GitRepository';
import type { Logger } from '@shared/logger';
import { getBuiltInGitApi } from './gitExtensionApi';

/**
 * Находит git-репозитории, с которыми можно работать.
 *
 * Сначала спрашивает встроенное расширение `vscode.git` — оно уже просканировало
 * воркспейс и учло настройки автоопределения. Если оно выключено, обходим папки
 * воркспейса сами.
 */
export class RepositoryLocator {
  private executor: GitExecutor | undefined;

  constructor(private readonly logger: Logger) {}

  /** Исполнитель git с тем же бинарём, которым пользуется сам VS Code. */
  async getExecutor(): Promise<GitExecutor> {
    if (!this.executor) {
      const api = await getBuiltInGitApi();
      const gitPath = api?.git.path ?? 'git';
      this.logger.debug(`Используется git: ${gitPath}`);
      this.executor = new GitExecutor(gitPath, this.logger);
    }
    return this.executor;
  }

  async list(signal?: AbortSignal): Promise<GitRepository[]> {
    const executor = await this.getExecutor();
    const api = await getBuiltInGitApi();

    const roots = api
      ? api.repositories.map((repository) => repository.rootUri.fsPath)
      : (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

    const repositories: GitRepository[] = [];
    const seen = new Set<string>();

    for (const root of roots) {
      try {
        const repository = await GitRepository.open(root, executor, signal ? { signal } : {});
        if (!seen.has(repository.root)) {
          seen.add(repository.root);
          repositories.push(repository);
        }
      } catch (error) {
        this.logger.debug(`Папка ${root} не является git-репозиторием`, error);
      }
    }

    return repositories;
  }

  /**
   * Выбирает репозиторий: молча, если он один, иначе спрашивает.
   * По умолчанию предлагает тот, которому принадлежит открытый файл.
   */
  async pick(signal?: AbortSignal): Promise<GitRepository | undefined> {
    const repositories = await this.list(signal);

    if (repositories.length === 0) {
      void vscode.window.showErrorMessage(
        'GitScope: в этом окне нет git-репозитория. Откройте папку с репозиторием и повторите.',
      );
      return undefined;
    }
    if (repositories.length === 1) {
      return repositories[0];
    }

    const preferred = this.findRepositoryOfActiveEditor(repositories);
    const ordered = preferred ? [preferred, ...repositories.filter((item) => item !== preferred)] : repositories;

    const picked = await vscode.window.showQuickPick(
      ordered.map((repository) => ({
        label: basename(repository.root),
        description: repository.root,
        repository,
      })),
      { title: 'GitScope: в каком репозитории сравнивать?', matchOnDescription: true },
    );

    return picked?.repository;
  }

  private findRepositoryOfActiveEditor(repositories: readonly GitRepository[]): GitRepository | undefined {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activePath) {
      return undefined;
    }
    // Самый длинный подходящий корень: вложенные репозитории должны выигрывать
    // у внешнего.
    return repositories
      .filter((repository) => activePath.startsWith(repository.root))
      .sort((left, right) => right.root.length - left.root.length)[0];
  }
}

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
