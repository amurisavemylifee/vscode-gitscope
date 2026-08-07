import type * as vscode from 'vscode';
import type { Logger } from '@shared/logger';
import { RevisionService } from '../../services/RevisionService';
import type { RepositoryLocator } from '../../services/RepositoryLocator';
import { ComparePanel } from './ComparePanel';
import { pickRevision } from './RevisionPicker';

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
): Promise<void> {
  const repository = await locator.pick();
  if (!repository) {
    return;
  }

  const revisions = new RevisionService(repository);
  const defaults = await revisions.suggestDefaults();

  const base = await pickRevision(revisions, {
    title: 'Базовая ревизия — с чем сравниваем',
    ...(defaults.base !== undefined ? { current: defaults.base } : {}),
  });
  if (!base) {
    return;
  }

  const compare = await pickRevision(revisions, {
    title: `Сравниваемая ревизия — что сравниваем с «${base.label}»`,
    ...(defaults.compare !== undefined ? { current: defaults.compare } : {}),
  });
  if (!compare) {
    return;
  }

  logger.info(`Сравнение ${base.label} → ${compare.label} в ${repository.root}`);
  await ComparePanel.show(extensionUri, logger).setComparison(repository, base, compare);
}
