import type * as vscode from 'vscode';
import type { Logger } from '@shared/logger';
import type { RepositoryLocator } from '../../services/RepositoryLocator';
import { GraphPanel } from './GraphPanel';

/** Необязательный аргумент — репозиторий, если команда вызвана не из палитры. */
export interface GraphCommandArgs {
  readonly repositoryRoot?: string;
}

/** Команда «Открыть граф коммитов…»: выбрать репозиторий, открыть панель. */
export async function runGraphCommand(
  extensionUri: vscode.Uri,
  locator: RepositoryLocator,
  logger: Logger,
  args: GraphCommandArgs = {},
): Promise<void> {
  const repository =
    args.repositoryRoot === undefined
      ? await locator.pick()
      : (await locator.list()).find((candidate) => candidate.root === args.repositoryRoot);

  if (!repository) {
    if (args.repositoryRoot !== undefined) {
      throw new Error(`Репозиторий «${args.repositoryRoot}» не найден в этом окне`);
    }
    return;
  }

  logger.info(`Граф коммитов: ${repository.root}`);
  await GraphPanel.show(extensionUri, logger).load(repository);
}
