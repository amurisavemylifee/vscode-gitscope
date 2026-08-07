import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
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
    sourcemap: true,
    // Имена без хешей: панель собирает ссылки на ассеты вручную, в webview нет
    // манифеста, по которому можно было бы разрешить хешированное имя.
    rollupOptions: {
      input: resolvePath('./webview/main.tsx'),
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
