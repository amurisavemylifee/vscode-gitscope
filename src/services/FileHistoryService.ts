import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describeContent, type GitRepository } from '@core/git/GitRepository';
import { annotateHunkWithWordDiff } from '@shared/diff/wordDiff';
import type { FileVersion, HistoryEntry } from '@shared/historyModel';
import { WORKING_ENTRY_ID, type HistoryPage } from '@shared/historyProtocol';
import type { FilePatch } from '@shared/model';

/** Сколько коммитов забирать за один заход. */
export const HISTORY_PAGE_SIZE = 60;

/**
 * Предел на содержимое одной версии. Всё, что больше, приходит обрезанным:
 * панель об этом честно сообщает, а extension host остаётся живым.
 */
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;

/** Пустое дерево git — с ним сравнивается первый коммит, у которого нет родителя. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Откуда продолжать историю: последний показанный коммит и имя файла на нём.
 *
 * Имени мало одного пути панели: ниже коммита переименования файл назывался
 * иначе, и продолжать обход надо уже с прежним именем.
 */
export interface HistoryCursor {
  readonly sha: string;
  readonly path: string;
}

/**
 * История одного файла: версии, их содержимое и разница с предыдущей версией.
 *
 * Загрузка, как и у сравнения, двухфазная. Список версий дешёвый и приходит
 * страницами, а содержимое запрашивается по одной версии — той, на которую
 * пользователь кликнул. Иначе открытие истории файла с тысячей коммитов
 * означало бы вычитать из git тысячу копий файла.
 */
export class FileHistoryService {
  constructor(
    private readonly repository: GitRepository,
    /** Путь файла относительно корня репозитория, каким он стал сейчас. */
    private readonly path: string,
  ) {}

  /**
   * Страница истории от точки `base`. Без курсора — самая свежая, с курсором —
   * то, что было до указанного коммита.
   */
  async page(base: string, cursor: HistoryCursor | undefined, signal?: AbortSignal): Promise<HistoryPage> {
    const options = signal ? { signal } : {};
    let revision = base;
    let path = this.path;

    if (cursor !== undefined) {
      const parent = await this.repository.firstParent(cursor.sha, options);
      if (parent === undefined) {
        // Дошли до корневого коммита: под ним истории нет.
        return { entries: [], hasMore: false };
      }
      revision = parent;
      path = cursor.path;
    }

    const commits = await this.repository.listFileHistory(path, {
      limit: HISTORY_PAGE_SIZE,
      revision,
      ...options,
    });

    const entries = commits.map((commit): HistoryEntry => {
      const { change } = commit;
      return {
        id: commit.sha,
        kind: 'commit',
        // У слияния git не печатает diff, поэтому имя файла берём то, под
        // которым он известен на этой странице: слиянием файл не переименуешь.
        path: change?.path ?? path,
        status: change?.status ?? 'modified',
        insertions: change?.insertions ?? 0,
        deletions: change?.deletions ?? 0,
        binary: change?.binary ?? false,
        sha: commit.sha,
        shortSha: commit.shortSha,
        subject: commit.subject,
        authorName: commit.authorName,
        authoredAt: commit.authoredAt,
        ...(change?.previousPath !== undefined ? { previousPath: change.previousPath } : {}),
        ...(change?.similarity !== undefined ? { similarity: change.similarity } : {}),
        ...(commit.refs.length > 0 ? { refs: commit.refs } : {}),
      };
    });

    // Полная страница почти наверняка означает, что история на этом не
    // кончилась. Проверять точно — ещё один обход истории ради одного бита.
    return { entries, hasMore: entries.length === HISTORY_PAGE_SIZE };
  }

  /**
   * Несохранённое в git состояние файла на диске.
   *
   * `undefined` — рабочая копия совпадает с HEAD, и показывать отдельную
   * карточку не о чем.
   */
  async workingEntry(signal?: AbortSignal): Promise<HistoryEntry | undefined> {
    const options = signal ? { signal } : {};
    const change = await this.repository.worktreeChange(this.path, options);
    if (change === undefined) {
      return undefined;
    }

    const counts = change.untracked
      ? await this.countUntrackedLines()
      : (await this.repository.diffWorktreeNumstat(this.path, options))[0];

    return {
      id: WORKING_ENTRY_ID,
      kind: 'working',
      path: this.path,
      status: change.status,
      insertions: counts?.insertions ?? 0,
      deletions: counts?.deletions ?? 0,
      binary: counts?.binary ?? false,
      ...(change.untracked ? { untracked: true } : {}),
    };
  }

  /** Содержимое файла на выбранной версии. */
  async version(entry: HistoryEntry, signal?: AbortSignal): Promise<FileVersion> {
    // Версия, которая файл удалила, содержимого не имеет: показывать нечего, и
    // это не ошибка, а нормальная точка истории.
    if (entry.status === 'deleted') {
      return { entryId: entry.id, path: entry.path, lines: [], truncated: false, binary: false, missing: true, bytes: 0 };
    }

    const content =
      entry.kind === 'working'
        ? await this.readWorkingCopy()
        : await this.repository.readFile(entry.sha ?? entry.id, entry.path, {
            maxBytes: MAX_CONTENT_BYTES,
            ...(signal ? { signal } : {}),
          });

    return {
      entryId: entry.id,
      path: entry.path,
      lines: content.binary ? [] : splitLines(content.text),
      truncated: content.truncated,
      binary: content.binary,
      missing: false,
      bytes: content.bytes,
    };
  }

  /** Что эта версия изменила в файле по сравнению с предыдущей. */
  async patch(entry: HistoryEntry, contextLines: number, signal?: AbortSignal): Promise<FilePatch> {
    const empty: FilePatch = { path: entry.path, status: entry.status, binary: entry.binary, hunks: [], truncated: false };

    // Файла ещё нет в git — сравнивать его версию не с чем.
    if (entry.untracked === true) {
      return empty;
    }

    const options = { contextLines, maxBytes: MAX_CONTENT_BYTES, ...(signal ? { signal } : {}) };

    const { files, truncated } =
      entry.kind === 'working'
        ? await this.repository.diffWorktreePatch(this.path, options)
        : await this.repository.diffPatch(
            (await this.repository.firstParent(entry.sha ?? entry.id, signal ? { signal } : {})) ?? EMPTY_TREE,
            entry.sha ?? entry.id,
            // Переименованному файлу нужны оба пути: увидев только новое имя,
            // git не найдёт пары и покажет добавление вместо переименования.
            entry.previousPath !== undefined ? [entry.path, entry.previousPath] : [entry.path],
            options,
          );

    const diff = files.find((candidate) => candidate.path === entry.path) ?? files[0];
    if (diff === undefined) {
      return empty;
    }

    return {
      path: entry.path,
      status: entry.status,
      binary: diff.binary,
      // Интра-строчная разметка считается здесь, один раз на версию: в webview
      // она пересчитывалась бы на каждой перерисовке.
      hunks: diff.hunks.map(annotateHunkWithWordDiff),
      truncated,
    };
  }

  private async readWorkingCopy() {
    const bytes = await readFile(join(this.repository.root, this.path));
    const truncated = bytes.length > MAX_CONTENT_BYTES;
    return describeContent(truncated ? bytes.subarray(0, MAX_CONTENT_BYTES) : bytes, truncated);
  }

  /**
   * Сколько строк в файле, которого ещё нет в git.
   *
   * `git diff` про такой файл ничего не скажет, а карточка без чисел выглядит
   * сломанной, поэтому считаем строки сами — файл в любом случае придётся
   * прочитать, когда его выберут.
   */
  private async countUntrackedLines(): Promise<{ insertions: number; deletions: number; binary: boolean } | undefined> {
    try {
      const { size } = await stat(join(this.repository.root, this.path));
      if (size > MAX_CONTENT_BYTES) {
        return undefined;
      }
      const content = await this.readWorkingCopy();
      return { insertions: content.binary ? 0 : splitLines(content.text).length, deletions: 0, binary: content.binary };
    } catch {
      // Файл мог исчезнуть между вызовом git status и чтением — не повод
      // ронять всю панель.
      return undefined;
    }
  }
}

/** Файл, оканчивающийся переводом строки, даёт лишний пустой элемент. */
function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}
