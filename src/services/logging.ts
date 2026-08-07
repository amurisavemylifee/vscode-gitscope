import * as vscode from 'vscode';
import type { Logger } from '@shared/logger';

/** Логгер поверх канала вывода VS Code — видно в панели Output → GitScope. */
export function createOutputChannelLogger(name: string): Logger & vscode.Disposable {
  const channel = vscode.window.createOutputChannel(name, { log: true });
  return {
    debug: (message, ...args) => channel.debug(message, ...args),
    info: (message, ...args) => channel.info(message, ...args),
    warn: (message, ...args) => channel.warn(message, ...args),
    error: (message, ...args) => channel.error(message, ...args),
    dispose: () => channel.dispose(),
  };
}
