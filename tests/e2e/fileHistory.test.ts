import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'amurisavemylifee.revisor';

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

const workspaceRoot = () => vscode.workspace.workspaceFolders![0]!.uri;

/**
 * История файла в настоящем VS Code: что команда зарегистрирована, что панель
 * открывается на файле из воркспейса и переиспользуется при переходе к другому
 * файлу, и что чужой файл честно отвергается.
 */
suite('GitScope: история файла', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Расширение ${EXTENSION_ID} не найдено`);
    await extension.activate();
  });

  teardown(closeAllTabs);

  test('команда истории зарегистрирована', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('gitscope.fileHistory'), 'команды gitscope.fileHistory нет в палитре');
  });

  test('открывает панель с именем файла в заголовке', async () => {
    await vscode.commands.executeCommand('gitscope.fileHistory', { path: 'README.md' });

    await waitFor(
      () => webviewTabs()[0]?.label.includes('история README.md') ?? false,
      `панель не открылась с ожидаемым заголовком, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );

    assert.equal(webviewTabs().length, 1);
  });

  test('команда принимает Uri файла — так её зовут из контекстного меню', async () => {
    await vscode.commands.executeCommand(
      'gitscope.fileHistory',
      vscode.Uri.joinPath(workspaceRoot(), 'only-on-main.txt'),
    );

    await waitFor(
      () => webviewTabs()[0]?.label.includes('история only-on-main.txt') ?? false,
      `панель не открылась по Uri, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );
  });

  test('повторный вызов переиспользует открытую панель, а не плодит вкладки', async () => {
    await vscode.commands.executeCommand('gitscope.fileHistory', { path: 'README.md' });
    await waitFor(() => webviewTabs().length === 1, 'первая панель не открылась');

    await vscode.commands.executeCommand('gitscope.fileHistory', { path: 'only-on-main.txt' });
    await waitFor(
      () => webviewTabs().some((tab) => tab.label.includes('only-on-main.txt')),
      'заголовок не сменился на другой файл',
    );

    assert.equal(webviewTabs().length, 1, 'открылась вторая панель вместо переиспользования');
  });

  test('файл вне репозитория панель не открывает', async () => {
    await vscode.commands.executeCommand('gitscope.fileHistory', { path: '/точно/не/в/репозитории.txt' });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(webviewTabs().length, 0, 'панель открылась на файле вне репозитория');
  });
});
