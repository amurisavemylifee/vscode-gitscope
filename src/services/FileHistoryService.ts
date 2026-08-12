import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describeContent, EMPTY_TREE, type GitRepository } from '@core/git/GitRepository';
import type { FileLogCommit } from '@core/git/parsers/parseFileLog';
import { annotateHunkWithWordDiff } from '@shared/diff/wordDiff';
import type { FileVersion, HistoryEntry } from '@shared/historyModel';
import { WORKING_ENTRY_ID, type HistoryPage } from '@shared/historyProtocol';
import type { FilePatch } from '@shared/model';
import { FileContentCache } from './FileContentCache';

/** Сколько коммитов забирать за один заход. */
export const HISTORY_PAGE_SIZE = 60;

/**
 * Предел на содержимое одной версии. Всё, что больше, приходит обрезанным:
 * панель об этом честно сообщает, а extension host остаётся живым.
 */
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;

/**
 * Сколько переименований подряд готовы отследить в одну сторону. Файл,
 * переезжавший десять раз, — уже экзотика, а предел защищает от зацикливания на
 * истории, где имена ходят по кругу.
 */
const MAX_RENAME_HOPS = 10;

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
  /** Содержимое версий: по нему разворачивают свёрнутый контекст между хунками. */
  private readonly contents: FileContentCache;

  constructor(
    private readonly repository: GitRepository,
    /** Путь файла относительно корня репозитория, каким он стал сейчас. */
    private readonly path: string,
  ) {
    this.contents = new FileContentCache(repository);
  }

  /**
   * Страница истории от точки `base`. Без курсора — самая свежая, с курсором —
   * то, что было до указанного коммита.
   *
   * Переименования отслеживаются здесь, а не флагом `--follow` у git: страница
   * набирается по кускам, и когда очередной кусок обрывается на коммите, где
   * файл появился, мы заглядываем в этот коммит целиком и, если он оказался
   * переименованием, продолжаем обход уже с прежним именем.
   */
  async page(base: string, cursor: HistoryCursor | undefined, signal?: AbortSignal): Promise<HistoryPage> {
    const options = signal ? { signal } : {};

    let revision = base;
    let path = cursor?.path ?? (await this.pathAt(base, options));
    // Коммит, ниже которого сейчас ищем: у него и спрашиваем прежнее имя, если
    // история под ним оборвалась.
    let boundary = cursor?.sha;

    if (cursor !== undefined) {
      const parent = await this.repository.firstParent(cursor.sha, options);
      if (parent === undefined) {
        // Дошли до корневого коммита: под ним истории нет.
        return { entries: [], hasMore: false };
      }
      revision = parent;
    }

    const entries: HistoryEntry[] = [];

    for (let hop = 0; hop < MAX_RENAME_HOPS && entries.length < HISTORY_PAGE_SIZE; hop += 1) {
      const commits = await this.repository.listFileHistory(path, {
        limit: HISTORY_PAGE_SIZE - entries.length,
        revision,
        ...options,
      });
      entries.push(...commits.map((commit) => this.toEntry(commit, path)));

      const oldest = commits[commits.length - 1];
      if (oldest !== undefined) {
        boundary = oldest.sha;
        path = oldest.change?.path ?? path;
      }
      if (boundary === undefined) {
        break;
      }

      // В логе с фильтром по пути переименование выглядит добавлением файла:
      // пару «удалено там, добавлено тут» видно, только если смотреть коммит
      // целиком. Поэтому у каждого «добавления» переспрашиваем, не переезд ли это.
      const addedHere = oldest === undefined || oldest.change?.status === 'added';
      const rename = addedHere ? await this.renameSourceOf(boundary, path, options) : undefined;

      // Возвращаем карточке правду: это переименование, а не рождение файла.
      const last = entries[entries.length - 1];
      if (rename !== undefined && oldest !== undefined && last !== undefined) {
        entries[entries.length - 1] = {
          ...last,
          status: 'renamed',
          previousPath: rename.previousPath,
          ...(rename.similarity !== undefined ? { similarity: rename.similarity } : {}),
        };
      }

      const parent = rename === undefined ? undefined : await this.repository.firstParent(boundary, options);
      if (rename === undefined || parent === undefined || entries.length >= HISTORY_PAGE_SIZE) {
        // Файл здесь и правда создан, а не переименован: история кончилась.
        // Либо страница набралась — остальное догрузится по курсору.
        break;
      }
      revision = parent;
      path = rename.previousPath;
    }

    // Неполная страница означает, что история действительно кончилась: обрыв на
    // переименовании мы бы уже перешагнули.
    return { entries, hasMore: entries.length >= HISTORY_PAGE_SIZE };
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
      // По длине файла видно, есть ли что разворачивать после последнего хунка.
      // У обрезанного патча промежутки не считаются вовсе — его хунки не
      // описывают файл целиком, — а у двоичного их не бывает.
      ...(diff.binary || truncated ? {} : { compareTotalLines: (await this.versionLines(entry, signal)).length }),
    };
  }

  /**
   * Строки версии — источник для разворачивания свёрнутого контекста.
   * Нумерация с 1, границы включительно.
   */
  async readLines(entry: HistoryEntry, startLine: number, endLine: number, signal?: AbortSignal): Promise<string[]> {
    const lines = await this.versionLines(entry, signal);
    return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine));
  }

  /**
   * Файл целиком на этой версии, построчно.
   *
   * Коммиты кэшируются: по промежуткам кликают несколько раз подряд, и каждый
   * клик иначе означал бы новый `git show` того же файла. Рабочая копия читается
   * с диска каждый раз — она меняется под руками.
   */
  private async versionLines(entry: HistoryEntry, signal?: AbortSignal): Promise<readonly string[]> {
    // Версия, которая файл удалила, содержимого не имеет: разворачивать нечего.
    if (entry.status === 'deleted') {
      return [];
    }
    if (entry.kind === 'working') {
      const content = await this.readWorkingCopy();
      return content.binary ? [] : splitLines(content.text);
    }
    return this.contents.lines(entry.sha ?? entry.id, entry.path, signal);
  }

  private toEntry(commit: FileLogCommit, path: string): HistoryEntry {
    const { change } = commit;
    return {
      id: commit.sha,
      kind: 'commit',
      // У слияния git не печатает diff, поэтому имя файла берём то, под которым
      // он известен на этом куске истории: слиянием файл не переименуешь.
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
      ...(commit.merge ? { merge: true } : {}),
      ...(change?.previousPath !== undefined ? { previousPath: change.previousPath } : {}),
      ...(change?.similarity !== undefined ? { similarity: change.similarity } : {}),
      ...(commit.refs.length > 0 ? { refs: commit.refs } : {}),
    };
  }

  /**
   * Как файл называется на этой ревизии.
   *
   * Панель открывают на файле из рабочей копии, а смотреть историю можно от
   * любой точки — и там файл вполне может лежать под другим именем. Спрашивать
   * git про сегодняшний путь в таком случае бессмысленно: истории по нему там
   * нет, и панель скажет «файл ни разу не попадал в коммиты», хотя файл тот же.
   *
   * Искать приходится в обе стороны и обе уметь сочетать. Ревизия новее
   * переименования — имя ведём вперёд, к тому, во что файл переехал. Ревизия
   * старше — назад, к тому, как он назывался тогда. А если файл переименовали
   * по-разному в двух ветках, общего имени у веток нет вовсе: надо отойти назад
   * до имени, которое было до обоих переездов, и от него пойти вперёд уже по
   * выбранной ветке.
   */
  private async pathAt(revision: string, options: { signal?: AbortSignal }): Promise<string> {
    if (await this.repository.hasPath(revision, this.path, options)) {
      return this.path;
    }
    return (
      (await this.pathRenamedTo(revision, this.path, options)) ??
      (await this.pathRenamedFrom(revision, options)) ??
      this.path
    );
  }

  /**
   * Во что переехало имя `start` по пути к этой ревизии.
   *
   * `undefined` — такого пути в её истории не было вовсе. Если же файл по нему
   * был и его просто удалили, возвращается само имя: история до удаления — это
   * ровно то, что нужно показать.
   */
  private async pathRenamedTo(
    revision: string,
    start: string,
    options: { signal?: AbortSignal },
  ): Promise<string | undefined> {
    let current = start;

    for (let hop = 0; hop < MAX_RENAME_HOPS; hop += 1) {
      const removedAt = await this.repository.lastCommitRemoving(revision, current, options);
      if (removedAt === undefined) {
        return undefined;
      }
      const renamedTo = (await this.repository.changesIn(removedAt, options)).find(
        (entry) => entry.previousPath === current,
      )?.path;
      if (renamedTo === undefined) {
        return current;
      }
      if (await this.repository.hasPath(revision, renamedTo, options)) {
        return renamedTo;
      }
      current = renamedTo;
    }

    return undefined;
  }

  /**
   * Как файл назывался до переезда: выбранная ревизия старше переименования.
   *
   * Идём от текущей ветки — там нынешнее имя и появилось, — и спускаемся по
   * коммитам, где оно возникало, пока не найдём имя, живущее на этой ревизии.
   */
  private async pathRenamedFrom(revision: string, options: { signal?: AbortSignal }): Promise<string | undefined> {
    let current = this.path;
    let from = 'HEAD';

    for (let hop = 0; hop < MAX_RENAME_HOPS; hop += 1) {
      const addedAt = await this.repository.lastCommitAdding(from, current, options);
      if (addedAt === undefined) {
        return undefined;
      }
      const parent = await this.repository.firstParent(addedAt, options);
      const renamedFrom = (await this.repository.changesIn(addedAt, options)).find(
        (entry) => entry.path === current,
      )?.previousPath;

      if (parent === undefined) {
        return undefined;
      }
      if (renamedFrom === undefined) {
        // Файл здесь просто восстановили под тем же именем — переезд, если он
        // был, надо искать глубже.
        from = parent;
        continue;
      }
      if (await this.repository.hasPath(revision, renamedFrom, options)) {
        return renamedFrom;
      }
      // Прежнее имя до выбранной ревизии тоже не дожило: в её ветке файл
      // переименовали по-своему. Идём от общего имени вперёд, но уже по ней.
      const renamedThere = await this.pathRenamedTo(revision, renamedFrom, options);
      if (renamedThere !== undefined) {
        return renamedThere;
      }
      current = renamedFrom;
      from = parent;
    }

    return undefined;
  }

  /** Откуда файл переехал в этом коммите; `undefined` — он здесь и правда создан. */
  private async renameSourceOf(
    sha: string,
    path: string,
    options: { signal?: AbortSignal },
  ): Promise<{ previousPath: string; similarity?: number } | undefined> {
    const change = (await this.repository.changesIn(sha, options)).find((entry) => entry.path === path);
    if (change?.previousPath === undefined) {
      return undefined;
    }
    return {
      previousPath: change.previousPath,
      ...(change.similarity !== undefined ? { similarity: change.similarity } : {}),
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
