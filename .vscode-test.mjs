import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/tests/e2e/**/*.test.js',
  workspaceFolder: './.vscode-test/workspace',
  launchArgs: ['--disable-workspace-trust'],
  mocha: {
    ui: 'tdd',
    // Первый запуск скачивает VS Code, а активация расширения в headless-среде
    // под xvfb заметно медленнее обычной.
    timeout: 120_000,
  },
});
