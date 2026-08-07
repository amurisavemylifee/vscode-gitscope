import * as vscode from 'vscode';

/**
 * Минимальный срез публичного API встроенного расширения `vscode.git`.
 *
 * Полный d.ts тянуть не стоит: нам нужны ровно две вещи — где лежат
 * репозитории воркспейса и каким бинарём git пользуется сам VS Code.
 * Сравнение мы всё равно считаем сами, потому что это API не умеет diff по
 * произвольной паре ревизий.
 */
export interface BuiltInRepository {
  readonly rootUri: vscode.Uri;
}

export interface BuiltInGitApi {
  readonly repositories: readonly BuiltInRepository[];
  readonly git: { readonly path: string };
}

interface GitExtensionExports {
  readonly enabled: boolean;
  getAPI(version: 1): BuiltInGitApi;
}

/** Возвращает API встроенного git-расширения или `undefined`, если оно выключено. */
export async function getBuiltInGitApi(): Promise<BuiltInGitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!extension) {
    return undefined;
  }

  const exports = extension.isActive ? extension.exports : await extension.activate();
  if (!exports.enabled) {
    return undefined;
  }

  return exports.getAPI(1);
}
