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
    // Один файл стилей на все панели. При разделении по входам общие стили
    // (токены темы, строки кода) уезжают в отдельный чанк, а ссылку на него
    // взять неоткуда: HTML панели собирается вручную, манифеста в webview нет.
    // Лишние пару килобайт чужих правил дешевле такой связи со сборщиком.
    cssCodeSplit: false,
    // Имена без хешей: панель собирает ссылки на ассеты вручную, в webview нет
    // манифеста, по которому можно было бы разрешить хешированное имя.
    rollupOptions: {
      // Каждая панель — свой вход: общего состояния у них нет, а один бандл на
      // всех означал бы, что панель истории тянет за собой код сравнения.
      input: {
        main: resolvePath('./webview/main.tsx'),
        history: resolvePath('./webview/history/main.tsx'),
        stashes: resolvePath('./webview/stashes/main.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
}));
