import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolvePath('./src/shared'),
      '@core': resolvePath('./src/core'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/webview/**/*.test.ts'],
    environment: 'node',
    // Интеграционные тесты создают настоящие git-репозитории во временной
    // папке — им нужен запас по времени на медленной файловой системе.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      // React-компоненты появятся здесь вместе с компонентными тестами;
      // пока порог считается по чистой логике обеих сторон канала.
      include: ['src/core/**', 'src/shared/**', 'webview/diff/**', 'webview/format.ts'],
      // Таблица грамматик — сорок ленивых import(), которые в тестах никто не
      // выполняет: они утянули бы покрытие функций вниз, ничего не измеряя.
      // Сама логика сопоставления расширений тестируется отдельно.
      exclude: ['webview/syntax/languages.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
