import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Настоящий git-репозиторий во временной папке.
 *
 * Интеграционные тесты гоняют код через реальный git, а не через моки: почти
 * все ошибки этого слоя — про то, как git на самом деле форматирует вывод,
 * и мок бы их воспроизвёл ровно так же неправильно, как код.
 */
export class TestRepo {
  private constructor(readonly root: string) {}

  static create(): TestRepo {
    const root = mkdtempSync(join(tmpdir(), 'gitscope-test-'));
    const repo = new TestRepo(root);
    repo.git('init', '--quiet', '--initial-branch=main');
    repo.git('config', 'user.name', 'GitScope Test');
    repo.git('config', 'user.email', 'test@gitscope.local');
    repo.git('config', 'commit.gpgsign', 'false');
    return repo;
  }

  git(...args: string[]): string {
    return execFileSync('git', args, { cwd: this.root, encoding: 'utf8' }).trim();
  }

  write(path: string, content: string): void {
    const absolute = join(this.root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }

  writeBinary(path: string, bytes: Buffer): void {
    const absolute = join(this.root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }

  remove(path: string): void {
    unlinkSync(join(this.root, path));
  }

  /**
   * Коммитит всё содержимое рабочего дерева и возвращает SHA.
   *
   * `date`, если передан, идёт и автору, и коммиттеру — нужно тестам сортировки
   * веток по committerdate, где реальное системное время слишком грубое.
   */
  commit(message: string, date?: string): string {
    this.git('add', '--all');
    if (date === undefined) {
      this.git('commit', '--quiet', '--allow-empty', '--message', message);
    } else {
      execFileSync('git', ['commit', '--quiet', '--allow-empty', '--message', message], {
        cwd: this.root,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    }
    return this.git('rev-parse', 'HEAD');
  }

  branch(name: string): void {
    this.git('branch', name);
  }

  checkout(name: string, create = false): void {
    if (create) {
      this.git('checkout', '--quiet', '-b', name);
    } else {
      this.git('checkout', '--quiet', name);
    }
  }

  tag(name: string, message?: string): void {
    if (message === undefined) {
      this.git('tag', name);
    } else {
      this.git('tag', '--annotate', name, '--message', message);
    }
  }

  /** Мерджит ветку в текущую без fast-forward — гарантированно даёт merge-коммит. */
  merge(branch: string, message: string): string {
    this.git('merge', '--no-ff', '--quiet', '--no-edit', '-m', message, branch);
    return this.git('rev-parse', 'HEAD');
  }

  /** Стешит незакоммиченные изменения. Файл должен быть уже изменён на диске. */
  stash(message?: string): void {
    if (message === undefined) {
      this.git('stash', 'push', '--quiet');
    } else {
      this.git('stash', 'push', '--quiet', '--message', message);
    }
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}
