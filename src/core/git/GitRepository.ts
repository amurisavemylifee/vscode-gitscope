import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { ChangeStatus } from '@shared/model';
import type { GitExecutor } from './GitExecutor';
import { GitError, RevisionNotFoundError } from './errors';
import { FILE_LOG_FORMAT, parseFileLog, type FileLogCommit } from './parsers/parseFileLog';
import { LOG_FORMAT, parseLog } from './parsers/parseLog';
import { parseNameStatus, type NameStatusEntry } from './parsers/parseNameStatus';
import { parseNumstat, type NumstatEntry } from './parsers/parseNumstat';
import { REF_FORMAT, parseRefs } from './parsers/parseRefs';
import { STASH_FORMAT, parseStashList, type StashRecord } from './parsers/parseStashList';
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

export interface FileHistoryOptions extends AbortOption {
  readonly limit?: number;
  /** Откуда начинать обход истории. По умолчанию — текущая ветка. */
  readonly revision?: string;
}

export interface ReadFileOptions extends AbortOption {
  readonly maxBytes?: number;
}

/** Содержимое файла на ревизии. */
export interface FileContent {
  /** Пусто у двоичного файла: декодировать его как UTF-8 бессмысленно. */
  readonly text: string;
  readonly truncated: boolean;
  readonly binary: boolean;
  readonly bytes: number;
}

/** Состояние файла в рабочем дереве относительно HEAD. */
export interface WorktreeChange {
  readonly status: ChangeStatus;
  /** Файла нет в git вовсе, поэтому и diff с HEAD у него не существует. */
  readonly untracked: boolean;
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

  /**
   * Стеши репозитория, свежий первым — в том же порядке, что у `git stash list`.
   *
   * Позиционная ссылка `stash@{n}` попадает в запись только чтобы её показать:
   * она сдвигается, как только какой-нибудь стеш снимут, поэтому дальше в
   * git-команды уходит SHA.
   */
  async listStashes(options: AbortOption = {}): Promise<StashRecord[]> {
    const output = await this.git.text(['stash', 'list', `--format=${STASH_FORMAT}`], {
      cwd: this.root,
      ...options,
    });
    return parseStashList(output);
  }

  /**
   * Описания нескольких коммитов одним вызовом.
   *
   * Спрашивать про каждый отдельно — это отдельный процесс git на коммит, а
   * списку стешей тема базового коммита нужна сразу у всех карточек.
   */
  async describeCommits(shas: readonly string[], options: AbortOption = {}): Promise<CommitInfo[]> {
    if (shas.length === 0) {
      return [];
    }
    const output = await this.git.text(['show', '--no-patch', `--format=${LOG_FORMAT}`, ...shas], {
      cwd: this.root,
      ...options,
    });
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

  /**
   * История одного файла — коммиты, которые его меняли.
   *
   * Без `--follow`: он ведёт историю через переименования, но взамен молча
   * выбрасывает слияния, а правка, приехавшая в ветку разрешением конфликта,
   * живёт именно в merge-коммите. Переименования отслеживаются на слой выше —
   * через `changesIn`, который видит коммит целиком и потому находит пары
   * «удалено там, добавлено тут» даже когда `--follow` их не показывает.
   */
  async listFileHistory(
    path: string,
    { limit = 60, revision = 'HEAD', signal }: FileHistoryOptions = {},
  ): Promise<FileLogCommit[]> {
    const output = await this.git.text(
      [
        'log',
        `--format=${FILE_LOG_FORMAT}`,
        // --raw даёт статус, --numstat — числа строк; вместе они работают, в
        // отличие от пары --name-status и --numstat, где побеждает последний.
        '--raw',
        '--numstat',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        `--max-count=${limit}`,
        revision,
        '--',
        path,
      ],
      { cwd: this.root, ...(signal ? { signal } : {}) },
    );
    return parseFileLog(output);
  }

  /**
   * Что коммит сделал с деревом целиком, с определением переименований.
   *
   * Спрашивать без ограничения по пути обязательно: пара «удалено старое имя,
   * добавлено новое» видна только когда git смотрит на весь коммит. С фильтром
   * по одному пути переименование выглядит просто добавлением файла.
   */
  async changesIn(sha: string, options: AbortOption = {}): Promise<NameStatusEntry[]> {
    const parent = (await this.firstParent(sha, options)) ?? EMPTY_TREE;
    return this.diffNameStatus(parent, sha, options);
  }

  /**
   * Последний коммит на пути к `revision`, в котором файл по этому пути исчез.
   *
   * Отсюда начинается поиск нового имени: если путь до ревизии не дожил, значит
   * файл либо переименовали, либо удалили, и различить это можно только заглянув
   * в сам коммит.
   */
  lastCommitRemoving(revision: string, path: string, options: AbortOption = {}): Promise<string | undefined> {
    return this.lastCommitFiltered('D', revision, path, options);
  }

  /**
   * Последний коммит на пути к `revision`, в котором файл по этому пути появился.
   *
   * Обратная сторона поиска: чтобы узнать, как файл назывался раньше, надо
   * найти коммит, где нынешнее имя возникло, и посмотреть, не переезд ли это.
   */
  lastCommitAdding(revision: string, path: string, options: AbortOption = {}): Promise<string | undefined> {
    return this.lastCommitFiltered('A', revision, path, options);
  }

  private async lastCommitFiltered(
    filter: 'A' | 'D',
    revision: string,
    path: string,
    options: AbortOption,
  ): Promise<string | undefined> {
    const sha = await this.git.line(
      ['log', '--format=%H', '--max-count=1', `--diff-filter=${filter}`, revision, '--', path],
      { cwd: this.root, ...options },
    );
    return sha === '' ? undefined : sha;
  }

  /** Есть ли файл по такому пути на ревизии. */
  async hasPath(revision: string, path: string, options: AbortOption = {}): Promise<boolean> {
    return (await this.fileSize(revision, path, options)) !== undefined;
  }

  /** Родитель коммита; `undefined` у самого первого коммита в истории. */
  async firstParent(sha: string, options: AbortOption = {}): Promise<string | undefined> {
    try {
      const parent = await this.git.line(['rev-parse', '--verify', '--quiet', `${sha}^`], {
        cwd: this.root,
        ...options,
      });
      return parent === '' ? undefined : parent;
    } catch (error) {
      // У корневого коммита родителя нет, и git выходит с ненулевым кодом.
      // Это не поломка, а ответ «нет».
      if (error instanceof GitError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Что рабочее дерево делает с файлом по сравнению с HEAD.
   *
   * `undefined` — файл совпадает с HEAD, показывать отдельную версию «рабочая
   * копия» не о чем.
   */
  async worktreeChange(path: string, options: AbortOption = {}): Promise<WorktreeChange | undefined> {
    const output = await this.git.text(['status', '--porcelain', '-z', '--', path], {
      cwd: this.root,
      ...options,
    });
    // Запись с -z: две буквы состояния, пробел и путь. Первой идёт интересующий
    // нас файл — пути к другим сюда попасть не могут, git отфильтровал их сам.
    const record = output.split('\0').find((entry) => entry !== '');
    if (record === undefined) {
      return undefined;
    }

    const code = record.slice(0, 2);
    if (code === '??') {
      return { status: 'added', untracked: true };
    }
    if (code.includes('D')) {
      return { status: 'deleted', untracked: false };
    }
    if (code.includes('A')) {
      return { status: 'added', untracked: false };
    }
    return { status: 'modified', untracked: false };
  }

  /** Количества изменённых строк между HEAD и рабочим деревом. */
  async diffWorktreeNumstat(path: string, options: AbortOption = {}): Promise<NumstatEntry[]> {
    const output = await this.git.text([...this.diffBaseArgs(), '--numstat', '-z', 'HEAD', '--', path], {
      cwd: this.root,
      ...options,
    });
    return parseNumstat(output);
  }

  /** Патч между HEAD и рабочим деревом — то, что ещё не попало в git. */
  async diffWorktreePatch(
    path: string,
    { contextLines = 3, maxBytes, signal }: PatchOptions = {},
  ): Promise<PatchResult> {
    const { stdout, truncated } = await this.git.run(
      [...this.diffBaseArgs(), '--patch', `--unified=${contextLines}`, 'HEAD', '--', path],
      {
        cwd: this.root,
        ...(maxBytes !== undefined ? { maxBytes } : {}),
        ...(signal ? { signal } : {}),
      },
    );
    return { files: parseUnifiedDiff(stdout.toString('utf8')), truncated };
  }

  /**
   * Содержимое файла на ревизии целиком.
   *
   * В отличие от `showFileLines` умеет останавливаться на пределе размера и
   * распознавать двоичный файл: панель истории показывает файл целиком, и
   * гигабайтный дамп в webview отправлять нельзя.
   */
  async readFile(revision: string, path: string, { maxBytes, signal }: ReadFileOptions = {}): Promise<FileContent> {
    const { stdout, truncated } = await this.git.run(['show', `${revision}:${path}`], {
      cwd: this.root,
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(signal ? { signal } : {}),
    });
    return describeContent(stdout, truncated);
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

/**
 * Пустое дерево git. С ним сравнивается первый коммит репозитория: родителя у
 * него нет, а показать, что он добавил, всё равно надо.
 */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Сколько байт от начала файла нюхать в поисках нуля. Столько же смотрит сам git. */
const BINARY_SNIFF_BYTES = 8000;

/**
 * Описывает прочитанный файл: текст, размер и двоичный он или нет.
 *
 * Признак двоичности — нулевой байт в начале файла: та же эвристика, по которой
 * git решает печатать «Binary files differ» вместо патча. Экспортируется, потому
 * что файл рабочей копии читается с диска, а не через git, а трактовать
 * содержимое надо одинаково.
 */
export function describeContent(bytes: Buffer, truncated: boolean): FileContent {
  const binary = bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
  return {
    text: binary ? '' : bytes.toString('utf8'),
    truncated,
    binary,
    bytes: bytes.length,
  };
}
