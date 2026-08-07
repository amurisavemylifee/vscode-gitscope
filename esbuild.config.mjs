import esbuild from 'esbuild';

import { globSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
// e2e-тесты запускаются внутри настоящего VS Code и должны быть обычным JS.
const e2e = process.argv.includes('--e2e');

/**
 * Плагин печатает результат каждой пересборки одной строкой — в watch-режиме
 * это единственный сигнал в терминале, что F5 подхватит свежий код.
 */
const reportPlugin = {
  name: 'report',
  setup(build) {
    build.onStart(() => {
      console.log('[esbuild] сборка…');
    });
    build.onEnd((result) => {
      for (const error of result.errors) {
        console.error(`✘ ${error.location?.file}:${error.location?.line} ${error.text}`);
      }
      console.log(`[esbuild] ${result.errors.length ? 'сборка упала' : 'готово'} · ${new Date().toLocaleTimeString()}`);
    });
  },
};

const shared = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  // vscode поставляется хостом, его нельзя бандлить
  external: ['vscode'],
  tsconfig: 'tsconfig.json',
  logLevel: 'silent',
  plugins: [reportPlugin],
};

const context = await esbuild.context(
  e2e
    ? {
        ...shared,
        entryPoints: globSync('tests/e2e/**/*.test.ts'),
        outdir: 'dist/tests/e2e',
        sourcemap: true,
      }
    : {
        ...shared,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension.js',
        sourcemap: !production,
        minify: production,
      },
);

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
