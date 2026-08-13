import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'amurisavemylifee.git-scope';

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
 * Тесты в настоящем VS Code. Проверяют то, чего не видно из юнит-тестов:
 * что расширение вообще активируется, что команда зарегистрирована, что
 * репозиторий воркспейса находится и что панель открывается с правильным
 * заголовком.
 */
suite('GitScope в настоящем VS Code', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Расширение ${EXTENSION_ID} не найдено`);
    await extension.activate();
  });

  teardown(closeAllTabs);

  test('расширение активируется', () => {
    assert.equal(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  test('команда сравнения зарегистрирована', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('gitscope.compareRevisions'), 'команды gitscope.compareRevisions нет в палитре');
  });

  test('настройки читаются со значениями по умолчанию из манифеста', () => {
    const config = vscode.workspace.getConfiguration('gitscope');

    assert.equal(config.get('diff.contextLines'), 3);
    assert.equal(config.get('diff.defaultViewMode'), 'unified');
    assert.equal(config.get('diff.collapseFilesOverLines'), 1500);
  });

  test('сравнение веток открывает панель с обеими ревизиями в заголовке', async () => {
    await vscode.commands.executeCommand('gitscope.compareRevisions', { base: 'main', compare: 'feature' });

    // Заголовок вкладки в модели окна обновляется не в тот же тик, что
    // panel.title, поэтому ждём именно его, а не просто появления вкладки.
    await waitFor(
      () => webviewTabs()[0]?.label.includes('main → feature') ?? false,
      `панель не открылась с ожидаемым заголовком, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );

    assert.equal(webviewTabs().length, 1);
  });

  test('повторный вызов переиспользует открытую панель, а не плодит вкладки', async () => {
    await vscode.commands.executeCommand('gitscope.compareRevisions', { base: 'main', compare: 'feature' });
    await waitFor(() => webviewTabs().length === 1, 'первая панель не открылась');

    await vscode.commands.executeCommand('gitscope.compareRevisions', { base: 'feature', compare: 'main' });
    await waitFor(
      () => webviewTabs().some((tab) => tab.label.includes('feature →')),
      'заголовок не обновился под новые ревизии',
    );

    assert.equal(webviewTabs().length, 1, 'открылась вторая панель вместо переиспользования');
  });

  test('сравнение по SHA работает так же, как по имени ветки', async () => {
    const sha = (
      await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0]!.uri, '.git', 'refs', 'heads', 'feature'),
      )
    )
      .toString()
      .trim();

    await vscode.commands.executeCommand('gitscope.compareRevisions', { base: 'main', compare: sha });

    // Полный SHA в заголовке сокращается до семи символов.
    await waitFor(
      () => webviewTabs()[0]?.label.includes(sha.slice(0, 7)) ?? false,
      `в заголовке нет короткого SHA ${sha.slice(0, 7)}, было: ${webviewTabs()[0]?.label ?? '<нет вкладки>'}`,
    );
  });

  test('несуществующая ревизия не открывает панель', async () => {
    await vscode.commands.executeCommand('gitscope.compareRevisions', {
      base: 'main',
      compare: 'такой-ветки-точно-нет',
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(webviewTabs().length, 0, 'панель открылась на несуществующей ревизии');
  });
});
