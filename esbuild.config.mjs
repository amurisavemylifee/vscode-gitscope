import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

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

const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  // vscode поставляется хостом, его нельзя бандлить
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  tsconfig: 'tsconfig.json',
  logLevel: 'silent',
  plugins: [reportPlugin],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
