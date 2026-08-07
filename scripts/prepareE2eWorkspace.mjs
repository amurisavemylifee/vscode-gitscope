import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Готовит репозиторий, в котором работают e2e-тесты.
 *
 * История здесь та же по форме, что и в интеграционных тестах: ветка
 * расходится с main, и в main после этого появляется свой файл. Так e2e
 * проверяет не только «панель открылась», но и что открылась она на настоящем
 * двухточечном сравнении.
 */
const root = resolve(process.cwd(), '.vscode-test', 'workspace');

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const write = (path, content) => {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
};

git('init', '--quiet', '--initial-branch=main');
git('config', 'user.name', 'GitScope E2E');
git('config', 'user.email', 'e2e@gitscope.local');
git('config', 'commit.gpgsign', 'false');

write('src/app.ts', ['export function run() {', '  return 1;', '}', ''].join('\n'));
write('README.md', '# Тестовый репозиторий\n');
git('add', '--all');
git('commit', '--quiet', '--message', 'первый коммит');

git('branch', 'feature');

write('only-on-main.txt', 'этот файл есть только на main\n');
git('add', '--all');
git('commit', '--quiet', '--message', 'коммит только на main');

git('checkout', '--quiet', 'feature');
write('src/app.ts', ['export function run() {', '  return 42;', '}', ''].join('\n'));
write('src/added.ts', 'export const added = true;\n');
git('add', '--all');
git('commit', '--quiet', '--message', 'коммит в ветке');
git('checkout', '--quiet', 'main');

console.log(`Репозиторий для e2e готов: ${root}`);
