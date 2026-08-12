import type * as vscode from 'vscode';
import type { Logger } from '@shared/logger';
import { RevisionService } from '../../services/RevisionService';
import type { RepositoryLocator } from '../../services/RepositoryLocator';
import { ComparePanel } from './ComparePanel';
import { pickRevision } from '../revisions/RevisionPicker';

/**
 * Аргументы команды. Все необязательные: без них расширение спрашивает само.
 *
 * Аргументы делают команду вызываемой из сочетаний клавиш, задач и других
 * расширений — и заодно позволяют e2e-тестам пройти сценарий целиком, не
 * пытаясь кликать по QuickPick.
 */
export interface CompareCommandArgs {
  readonly repositoryRoot?: string;
  readonly base?: string;
  readonly compare?: string;
}

/**
 * Команда «Сравнить ревизии…»: выбрать репозиторий, выбрать две точки истории,
 * открыть панель.
 *
 * Ревизии спрашиваются до открытия панели: пустая панель с предложением
 * что-нибудь выбрать — лишний экран на пути к результату.
 */
export async function runCompareCommand(
  extensionUri: vscode.Uri,
  locator: RepositoryLocator,
  logger: Logger,
  args: CompareCommandArgs = {},
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

  const revisions = new RevisionService(repository);
  const defaults = args.base === undefined || args.compare === undefined ? await revisions.suggestDefaults() : {};

  const base =
    args.base === undefined
      ? await pickRevision(revisions, {
          title: 'Базовая ревизия — с чем сравниваем',
          ...(defaults.base !== undefined ? { current: defaults.base } : {}),
        })
      : await revisions.resolve(args.base);
  if (!base) {
    return;
  }

  const compare =
    args.compare === undefined
      ? await pickRevision(revisions, {
          title: `Сравниваемая ревизия — что сравниваем с «${base.label}»`,
          ...(defaults.compare !== undefined ? { current: defaults.compare } : {}),
        })
      : await revisions.resolve(args.compare);
  if (!compare) {
    return;
  }

  logger.info(`Сравнение ${base.label} → ${compare.label} в ${repository.root}`);
  await ComparePanel.show(extensionUri, logger).setComparison(repository, base, compare);
}
