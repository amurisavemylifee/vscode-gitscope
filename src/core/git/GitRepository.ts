import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { GitExecutor } from './GitExecutor';
import { GitError, RevisionNotFoundError } from './errors';
import { LOG_FORMAT, parseLog } from './parsers/parseLog';
import { parseNameStatus, type NameStatusEntry } from './parsers/parseNameStatus';
import { parseNumstat, type NumstatEntry } from './parsers/parseNumstat';
import { REF_FORMAT, parseRefs } from './parsers/parseRefs';
import { parseUnifiedDiff, type ParsedFileDiff } from './parsers/parseUnifiedDiff';
import type { CommitInfo, RefInfo } from './types';

export interface AbortOption {
  readonly signal?: AbortSignal;
}

export interface ListCommitsOptions extends AbortOption {
  readonly limit?: number;
  /** Подстрока для поиска по теме коммита и автору. */
  readonly query?: string;
  /** Ограничить историю этой ревизией. По умолчанию — все ссылки. */
  readonly revision?: string;
}

export interface PatchOptions extends AbortOption {
  readonly contextLines?: number;
  readonly maxBytes?: number;
}

export interface PatchResult {
  readonly files: readonly ParsedFileDiff[];
  readonly truncated: boolean;
}

/**
 * Один git-репозиторий. Всё общение с git идёт отсюда.
 *
 * Про VS Code и про модель панели не знает, поэтому проверяется обычными
 * интеграционными тестами на временном репозитории.
 */
export class GitRepository {
  constructor(
    readonly root: string,
    private readonly git: GitExecutor,
  ) {}

  /** Находит корень репозитория, которому принадлежит путь. */
  static async open(cwd: string, git: GitExecutor, options: AbortOption = {}): Promise<GitRepository> {
    const root = await git.line(['rev-parse', '--show-toplevel'], { cwd, ...options });
    return new GitRepository(root, git);
  }

  /** Разрешает произвольный revspec (ветку, тег, SHA, `HEAD~3`) в коммит. */
  async resolveCommit(spec: string, options: AbortOption = {}): Promise<CommitInfo> {
    let sha: string;
    try {
      sha = await this.git.line(['rev-parse', '--verify', '--quiet', '--end-of-options', `${spec}^{commit}`], {
        cwd: this.root,
        ...options,
      });
    } catch (error) {
      if (error instanceof GitError) {
        throw new RevisionNotFoundError(spec);
      }
      throw error;
    }

    if (sha === '') {
      throw new RevisionNotFoundError(spec);
    }

    const output = await this.git.text(['show', '--no-patch', `--format=${LOG_FORMAT}`, sha], {
      cwd: this.root,
      ...options,
    });
    const commit = parseLog(output)[0];
    if (!commit) {
      throw new RevisionNotFoundError(spec);
    }
    return commit;
  }

  /** Имя текущей ветки; `undefined` в detached HEAD или в пустом репозитории. */
  async currentBranch(options: AbortOption = {}): Promise<string | undefined> {
    try {
      const name = await this.git.line(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.root, ...options });
      return name === 'HEAD' || name === '' ? undefined : name;
    } catch (error) {
      if (error instanceof GitError) {
        return undefined;
      }
      throw error;
    }
  }

  /** Все локальные и удалённые ветки и теги. */
  async listRefs(options: AbortOption = {}): Promise<RefInfo[]> {
    const output = await this.git.text(
      ['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags'],
      { cwd: this.root, ...options },
    );
    // refs/remotes/<remote>/HEAD — символическая ссылка на дефолтную ветку,
    // в списке для выбора она только дублирует настоящую ветку.
    return parseRefs(output).filter((ref) => !/^refs\/remotes\/[^/]+\/HEAD$/.test(ref.fullName));
  }

  /** История коммитов для пикера. */
  async listCommits({ limit = 50, query, revision, signal }: ListCommitsOptions = {}): Promise<CommitInfo[]> {
    const args = ['log', `--format=${LOG_FORMAT}`, `--max-count=${limit}`];
    if (query) {
      // Только по теме коммита: git объединяет --grep и --author по И, так что
      // добавить поиск по автору сюда же нельзя — выдача станет пустой.
      args.push('--regexp-ignore-case', '--fixed-strings', `--grep=${query}`);
    }
    args.push(revision ?? '--all', '--');

    const output = await this.git.text(args, { cwd: this.root, ...(signal ? { signal } : {}) });
    return parseLog(output);
  }

  /** Список изменённых файлов: статусы, переименования, копирования. */
  async diffNameStatus(base: string, compare: string, options: AbortOption = {}): Promise<NameStatusEntry[]> {
    const output = await this.git.text([...this.diffBaseArgs(), '--name-status', '-z', base, compare, '--'], {
      cwd: this.root,
      ...options,
    });
    return parseNameStatus(output);
  }

  /** Количества добавленных и удалённых строк по файлам. */
  async diffNumstat(base: string, compare: string, options: AbortOption = {}): Promise<NumstatEntry[]> {
    const output = await this.git.text([...this.diffBaseArgs(), '--numstat', '-z', base, compare, '--'], {
      cwd: this.root,
      ...options,
    });
    return parseNumstat(output);
  }

  /**
   * Патч для указанных путей.
   *
   * Путей может быть несколько: у переименованного файла надо передать и новое,
   * и старое имя, иначе git не увидит пары и покажет добавление вместо
   * переименования.
   */
  async diffPatch(
    base: string,
    compare: string,
    paths: readonly string[],
    { contextLines = 3, maxBytes, signal }: PatchOptions = {},
  ): Promise<PatchResult> {
    const { stdout, truncated } = await this.git.run(
      [...this.diffBaseArgs(), '--patch', `--unified=${contextLines}`, base, compare, '--', ...paths],
      {
        cwd: this.root,
        ...(maxBytes !== undefined ? { maxBytes } : {}),
        ...(signal ? { signal } : {}),
      },
    );
    return { files: parseUnifiedDiff(stdout.toString('utf8')), truncated };
  }

  /** Содержимое файла на ревизии, разбитое на строки. */
  async showFileLines(revision: string, path: string, options: AbortOption = {}): Promise<string[]> {
    const text = await this.git.text(['show', `${revision}:${path}`], { cwd: this.root, ...options });
    const lines = text.split('\n');
    // Файл, оканчивающийся переводом строки, даёт лишний пустой элемент.
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  }

  /** Размер файла в байтах на ревизии; `undefined`, если файла там нет. */
  async fileSize(revision: string, path: string, options: AbortOption = {}): Promise<number | undefined> {
    try {
      const raw = await this.git.line(['cat-file', '-s', `${revision}:${path}`], { cwd: this.root, ...options });
      const size = Number.parseInt(raw, 10);
      return Number.isFinite(size) ? size : undefined;
    } catch (error) {
      if (error instanceof GitError) {
        return undefined;
      }
      throw error;
    }
  }

  async hasRemote(options: AbortOption = {}): Promise<boolean> {
    const output = await this.git.line(['remote'], { cwd: this.root, ...options });
    return output !== '';
  }

  /**
   * Когда последний раз обновлялись remote-ссылки.
   *
   * Смотрим на время изменения FETCH_HEAD: если fetch был неделю назад,
   * сравнение с `origin/main` показывает неправду, и об этом надо предупредить.
   */
  async lastFetchAt(options: AbortOption = {}): Promise<number | undefined> {
    try {
      const gitDir = await this.git.line(['rev-parse', '--git-dir'], { cwd: this.root, ...options });
      const absoluteGitDir = isAbsolute(gitDir) ? gitDir : resolve(this.root, gitDir);
      const stats = await stat(resolve(absoluteGitDir, 'FETCH_HEAD'));
      return stats.mtimeMs;
    } catch {
      return undefined;
    }
  }

  async fetch(options: AbortOption = {}): Promise<void> {
    await this.git.run(['fetch', '--all', '--prune'], { cwd: this.root, ...options });
  }

  /**
   * Аргументы, общие для всех diff-вызовов.
   *
   * `-M -C` включают поиск переименований и копий; без них переименованный файл
   * выглядит как удаление плюс создание. `--no-ext-diff` и `--no-textconv`
   * отключают пользовательские difftool и фильтры: панель должна показывать
   * настоящее содержимое, совпадающее с тем, что отдаёт `git show`.
   */
  private diffBaseArgs(): string[] {
    return ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-C'];
  }
}
