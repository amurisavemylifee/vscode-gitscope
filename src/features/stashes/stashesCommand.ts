import type * as vscode from 'vscode';
import type { Logger } from '@shared/logger';
import type { RepositoryLocator } from '../../services/RepositoryLocator';
import { StashPanel } from './StashPanel';

/**
 * Аргументы команды. Репозиторий необязателен: без него расширение спросит
 * само — и только если репозиториев в окне больше одного.
 *
 * Явный аргумент делает команду вызываемой из сочетаний клавиш, задач и других
 * расширений, а заодно позволяет e2e-тестам пройти сценарий целиком, не пытаясь
 * кликать по QuickPick.
 */
export interface StashesCommandArgs {
  readonly repositoryRoot?: string;
}

/** Команда «Стеши…»: выбрать репозиторий и открыть панель. */
export async function runStashesCommand(
  extensionUri: vscode.Uri,
  locator: RepositoryLocator,
  logger: Logger,
  args: StashesCommandArgs = {},
): Promise<void> {
  const repository =
    args.repositoryRoot === undefined
      ? await locator.pick({ title: 'GitScope: в каком репозитории смотреть стеши?' })
      : (await locator.list()).find((candidate) => candidate.root === args.repositoryRoot);

  if (!repository) {
    if (args.repositoryRoot !== undefined) {
      throw new Error(`Репозиторий «${args.repositoryRoot}» не найден в этом окне`);
    }
    return;
  }

  logger.info(`Стеши репозитория ${repository.root}`);
  await StashPanel.show(extensionUri, logger).setRepository(repository);
}
