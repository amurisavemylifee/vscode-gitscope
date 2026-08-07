import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolvePath('./src/shared'),
    },
  },
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    target: 'es2022',
    // В .vsix карты исходников не едут: они больше самого кода, а отлаживать
    // сборку всё равно приходится в watch-режиме.
    sourcemap: mode === 'development',
    // Самая крупная грамматика подсветки весит под мегабайт, но грузится
    // только если в сравнении реально встретился такой файл.
    chunkSizeWarningLimit: 1024,
    // Имена без хешей: панель собирает ссылки на ассеты вручную, в webview нет
    // манифеста, по которому можно было бы разрешить хешированное имя.
    rollupOptions: {
      // Каждая панель — свой вход: у графа своё React-приложение, общего рантайма
      // с сравнением нет, а делить один бандл на несколько панелей незачем.
      input: {
        main: resolvePath('./webview/main.tsx'),
        graph: resolvePath('./webview/graph/main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
}));
