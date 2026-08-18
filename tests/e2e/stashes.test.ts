import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'amurisavemylifee.vscode-gitscope';

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

const workspaceRoot = () => vscode.workspace.workspaceFolders![0]!.uri.fsPath;

/**
 * Панель стешей в настоящем VS Code: что команда зарегистрирована, что панель
 * открывается на репозитории воркспейса — в нём заранее сделаны два стеша — и
 * что чужой репозиторий она честно отвергает.
 */
suite('GitScope: стеши', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Расширение ${EXTENSION_ID} не найдено`);
    await extension.activate();
  });

  teardown(closeAllTabs);

  test('команда стешей зарегистрирована', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('gitscope.stashes'), 'команды gitscope.stashes нет в палитре');
  });

  test('открывает панель с именем репозитория в заголовке', async () => {
    await vscode.commands.executeCommand('gitscope.stashes', { repositoryRoot: workspaceRoot() });

    await waitFor(
      () => webviewTabs()[0]?.label.includes('стеши workspace') ?? false,
      `панель не открылась с ожидаемым заголовком, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );

    assert.equal(webviewTabs().length, 1);
  });

  test('повторный вызов переиспользует открытую панель, а не плодит вкладки', async () => {
    await vscode.commands.executeCommand('gitscope.stashes', { repositoryRoot: workspaceRoot() });
    await waitFor(() => webviewTabs().length === 1, 'первая панель не открылась');

    await vscode.commands.executeCommand('gitscope.stashes', { repositoryRoot: workspaceRoot() });

    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(webviewTabs().length, 1, 'открылась вторая панель вместо переиспользования');
  });

  test('репозиторий вне окна панель не открывает', async () => {
    await vscode.commands.executeCommand('gitscope.stashes', { repositoryRoot: '/точно/не/репозиторий' });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(webviewTabs().length, 0, 'панель открылась на чужом репозитории');
  });
});
