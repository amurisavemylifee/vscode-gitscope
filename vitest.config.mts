import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
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
    projects: [
      {
        // Чистая логика обеих сторон канала: git-слой, модель, сборка строк.
        extends: true,
        test: {
          name: 'логика',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/webview/**/*.test.ts'],
          // Интеграционные тесты создают настоящие git-репозитории во временной
          // папке — им нужен запас по времени на медленной файловой системе.
          testTimeout: 20_000,
        },
      },
      {
        // React-компоненты панели.
        extends: true,
        plugins: [react()],
        test: {
          name: 'компоненты',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.ts', 'tests/component/**/*.test.tsx'],
          setupFiles: ['tests/component/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/shared/**', 'webview/**'],
      // Таблица грамматик — сорок ленивых import(), которые в тестах никто не
      // выполняет: они утянули бы покрытие функций вниз, ничего не измеряя.
      // Сама логика сопоставления расширений тестируется отдельно.
      exclude: ['webview/syntax/languages.ts', 'webview/main.tsx', 'webview/vite-env.d.ts'],
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
