/**
 * Общая обвязка для webview-панелей: HTML-каркас со строгим CSP и транспорт
 * для RPC. Никакой логики сравнения здесь нет — файл рассчитан на то, что
 * будущие панели (граф коммитов, blame) поднимутся на нём же.
 */

import * as vscode from 'vscode';
import type { Transport } from '@shared/messaging';

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createNonce(): string {
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += NONCE_ALPHABET[Math.floor(Math.random() * NONCE_ALPHABET.length)];
  }
  return nonce;
}

/**
 * Собирает HTML панели.
 *
 * CSP намеренно жёсткий: содержимое чужого репозитория — недоверенный ввод,
 * и оно попадает в эту страницу. `default-src 'none'` плюс nonce на скрипты
 * означают, что даже если в diff попадёт `<script>`, он не выполнится.
 * `'unsafe-inline'` оставлен только для стилей — без него не работают
 * инлайновые `style`-атрибуты виртуализатора.
 */
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  title: string,
  entry: 'main' | 'graph' = 'main',
): string {
  const nonce = createNonce();
  const assetUri = (...segments: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', ...segments));

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    // 'strict-dynamic' нужен для грамматик подсветки: они догружаются
    // динамическим import(), а nonce на такие модули навесить нельзя.
    // Доверие при этом не размывается — грузить их может только наш же
    // стартовый скрипт, помеченный nonce.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${assetUri(`${entry}.css`).toString()}" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${assetUri(`${entry}.js`).toString()}"></script>
  </body>
</html>`;
}

/** Оборачивает `vscode.Webview` в транспорт, понятный `createRpcServer`. */
export function createWebviewTransport(webview: vscode.Webview, disposables: vscode.Disposable[]): Transport {
  return {
    post(message) {
      void webview.postMessage(message);
    },
    subscribe(handler) {
      const subscription = webview.onDidReceiveMessage(handler);
      disposables.push(subscription);
      return () => subscription.dispose();
    },
  };
}
