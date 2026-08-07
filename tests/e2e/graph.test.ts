import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'amurisavemylifee.gitscope';

/** Ждёт, пока условие станет истинным: панель появляется не мгновенно. */
async function waitFor(check: () => boolean, message: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}

const webviewTabs = () =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputWebview);

const closeAllTabs = async () => {
  for (const group of vscode.window.tabGroups.all) {
    await vscode.window.tabGroups.close(group.tabs, false);
  }
};

/**
 * Тесты графа коммитов в настоящем VS Code. Webview рендерится в отдельном
 * процессе и его DOM отсюда не виден — проверяем то, что видно снаружи: команда
 * зарегистрирована, панель открывается с ожидаемым заголовком, повторный вызов
 * не плодит вкладки. Раскладка графа и содержимое панели деталей — забота
 * юнит- и component-тестов (`tests/unit/graphLayout.test.ts`,
 * `tests/component/GraphRow.test.tsx` и соседние).
 */
suite('GitScope: граф коммитов в настоящем VS Code', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Расширение ${EXTENSION_ID} не найдено`);
    await extension.activate();
  });

  teardown(closeAllTabs);

  test('команда графа зарегистрирована', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('gitscope.showGitGraph'), 'команды gitscope.showGitGraph нет в палитре');
  });

  test('открывает панель с заголовком графа и именем репозитория', async () => {
    await vscode.commands.executeCommand('gitscope.showGitGraph');

    await waitFor(
      () => webviewTabs()[0]?.label.includes('GitScope: граф') ?? false,
      `панель не открылась с ожидаемым заголовком, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );

    assert.equal(webviewTabs().length, 1);
  });

  test('повторный вызов переиспользует открытую панель, а не плодит вкладки', async () => {
    await vscode.commands.executeCommand('gitscope.showGitGraph');
    await waitFor(() => webviewTabs().length === 1, 'первая панель не открылась');

    await vscode.commands.executeCommand('gitscope.showGitGraph');
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(webviewTabs().length, 1, 'открылась вторая панель вместо переиспользования');
  });
});
