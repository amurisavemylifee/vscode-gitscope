import { access } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import * as vscode from 'vscode';
import type { GitRepository } from '@core/git/GitRepository';
import type { Logger } from '@shared/logger';
import type { RepositoryLocator } from '../../services/RepositoryLocator';
import { HistoryPanel } from './HistoryPanel';

/**
 * Аргументы команды. Из меню VS Code передаёт `Uri` файла, из палитры — ничего,
 * а явные аргументы нужны сочетаниям клавиш, другим расширениям и e2e-тестам.
 */
export interface FileHistoryCommandArgs {
  /** Путь к файлу: абсолютный или относительно корня репозитория. */
  readonly path?: string;
  readonly repositoryRoot?: string;
}

interface Target {
  readonly repository: GitRepository;
  /** Путь от корня репозитория, всегда со слешами: git других не понимает. */
  readonly path: string;
}

/**
 * Команда «История файла…»: понять, о каком файле речь, найти его репозиторий,
 * открыть панель.
 */
export async function runFileHistoryCommand(
  extensionUri: vscode.Uri,
  locator: RepositoryLocator,
  logger: Logger,
  arg?: vscode.Uri | FileHistoryCommandArgs,
): Promise<void> {
  const args: FileHistoryCommandArgs = arg instanceof vscode.Uri ? { path: arg.fsPath } : (arg ?? {});
  const requested = args.path ?? activeFilePath();

  if (requested === undefined) {
    void vscode.window.showErrorMessage('GitScope: откройте файл, историю которого нужно посмотреть.');
    return;
  }

  const target = await findTarget(await locator.list(), requested, args.repositoryRoot);

  if (!target) {
    void vscode.window.showErrorMessage(`GitScope: файл «${requested}» не принадлежит ни одному git-репозиторию окна.`);
    return;
  }

  logger.info(`История файла ${target.path} в ${target.repository.root}`);
  await HistoryPanel.show(extensionUri, logger).setTarget(target.repository, target.path);
}

/** Файл в активном редакторе. Виртуальные документы игнорируем: истории у них нет. */
function activeFilePath(): string | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri?.scheme === 'file' ? uri.fsPath : undefined;
}

/**
 * Репозиторий, которому принадлежит файл, и путь от его корня.
 *
 * Путь бывает и относительным — так команду удобнее звать из сочетания клавиш
 * или задачи. Без указанного корня относительный путь примеряется к каждому
 * репозиторию окна: правильный тот, где такой файл действительно лежит.
 */
async function findTarget(
  repositories: readonly GitRepository[],
  requested: string,
  requestedRoot: string | undefined,
): Promise<Target | undefined> {
  if (requestedRoot !== undefined) {
    const repository = repositories.find((candidate) => candidate.root === requestedRoot);
    return repository ? { repository, path: toRepositoryPath(repository, resolve(requestedRoot, requested)) } : undefined;
  }

  if (isAbsolute(requested)) {
    // Побеждает самый длинный подходящий корень: у вложенного репозитория и его
    // родителя общий префикс пути, и файл всегда относится к вложенному.
    const repository = repositories
      .filter((candidate) => requested.startsWith(candidate.root))
      .sort((left, right) => right.root.length - left.root.length)[0];
    return repository ? { repository, path: toRepositoryPath(repository, requested) } : undefined;
  }

  for (const repository of repositories) {
    const absolute = resolve(repository.root, requested);
    if (await exists(absolute)) {
      return { repository, path: toRepositoryPath(repository, absolute) };
    }
  }
  return undefined;
}

const toRepositoryPath = (repository: GitRepository, absolute: string): string =>
  relative(repository.root, absolute).split(sep).join('/');

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );
