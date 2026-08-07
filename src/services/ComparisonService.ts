import type { GitRepository } from '@core/git/GitRepository';
import { annotateHunkWithWordDiff } from '@shared/diff/wordDiff';
import type { ComparisonSummary, FileChange, FilePatch, Revision } from '@shared/model';
import { FileContentCache } from './FileContentCache';

/**
 * Предел на размер патча одного файла. Всё, что больше, приходит обрезанным —
 * панель об этом честно сообщает, а extension host остаётся живым.
 */
const MAX_PATCH_BYTES = 4 * 1024 * 1024;

/**
 * Сравнение двух ревизий: список файлов, патчи и содержимое для контекста.
 *
 * Загрузка двухфазная. Список файлов считается сразу и целиком — он дешёвый
 * даже на тысячах файлов. Патчи запрашиваются по одному, когда файл
 * действительно нужен: иначе открытие большого сравнения упиралось бы в
 * несколько секунд ожидания и десятки мегабайт в канале.
 */
export class ComparisonService {
  private readonly contents: FileContentCache;

  constructor(private readonly repository: GitRepository) {
    this.contents = new FileContentCache(repository);
  }

  /** Первая фаза: что изменилось, без содержимого. */
  async buildSummary(base: Revision, compare: Revision, signal?: AbortSignal): Promise<ComparisonSummary> {
    const options = signal ? { signal } : {};
    const [statuses, counts] = await Promise.all([
      this.repository.diffNameStatus(base.sha, compare.sha, options),
      this.repository.diffNumstat(base.sha, compare.sha, options),
    ]);

    const countsByPath = new Map(counts.map((entry) => [entry.path, entry]));

    const files: FileChange[] = statuses.map((entry) => {
      const numbers = countsByPath.get(entry.path);
      return {
        path: entry.path,
        status: entry.status,
        insertions: numbers?.insertions ?? 0,
        deletions: numbers?.deletions ?? 0,
        binary: numbers?.binary ?? false,
        ...(entry.previousPath !== undefined ? { previousPath: entry.previousPath } : {}),
        ...(entry.similarity !== undefined ? { similarity: entry.similarity } : {}),
      };
    });

    return {
      base,
      compare,
      files,
      insertions: files.reduce((total, file) => total + file.insertions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
      repositoryRoot: this.repository.root,
      repositoryName: basename(this.repository.root),
    };
  }

  /** Вторая фаза: патч одного файла. */
  async buildPatch(
    base: Revision,
    compare: Revision,
    file: FileChange,
    contextLines: number,
    signal?: AbortSignal,
  ): Promise<FilePatch> {
    if (file.binary) {
      return this.buildBinaryPatch(base, compare, file, signal);
    }

    // Переименованному файлу нужны оба пути: увидев только новое имя, git не
    // найдёт пару и покажет добавление вместо переименования.
    const paths = file.previousPath !== undefined ? [file.path, file.previousPath] : [file.path];

    const { files: parsed, truncated } = await this.repository.diffPatch(base.sha, compare.sha, paths, {
      contextLines,
      maxBytes: MAX_PATCH_BYTES,
      ...(signal ? { signal } : {}),
    });

    const diff = parsed.find((candidate) => candidate.path === file.path) ?? parsed[0];

    const [baseTotalLines, compareTotalLines] = await Promise.all([
      this.countLines(base.sha, file.previousPath ?? file.path, file.status === 'added', signal),
      this.countLines(compare.sha, file.path, file.status === 'deleted', signal),
    ]);

    return {
      path: file.path,
      status: file.status,
      binary: diff?.binary ?? false,
      // Интра-строчная разметка считается здесь, один раз на файл: в webview
      // она пересчитывалась бы на каждой перерисовке списка.
      hunks: (diff?.hunks ?? []).map(annotateHunkWithWordDiff),
      truncated,
      baseTotalLines,
      compareTotalLines,
    };
  }

  /**
   * Строки файла на ревизии — источник для разворачивания свёрнутого контекста.
   * Нумерация с 1, границы включительно.
   */
  async readLines(revision: string, path: string, startLine: number, endLine: number, signal?: AbortSignal): Promise<string[]> {
    const lines = await this.contents.lines(revision, path, signal);
    return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine));
  }

  /** Сбрасывает кэш содержимого — вызывается при смене сравниваемых ревизий. */
  clearCache(): void {
    this.contents.clear();
  }

  private async buildBinaryPatch(
    base: Revision,
    compare: Revision,
    file: FileChange,
    signal?: AbortSignal,
  ): Promise<FilePatch> {
    const options = signal ? { signal } : {};
    const [baseSize, compareSize] = await Promise.all([
      file.status === 'added'
        ? Promise.resolve(undefined)
        : this.repository.fileSize(base.sha, file.previousPath ?? file.path, options),
      file.status === 'deleted' ? Promise.resolve(undefined) : this.repository.fileSize(compare.sha, file.path, options),
    ]);

    return {
      path: file.path,
      status: file.status,
      binary: true,
      hunks: [],
      truncated: false,
      ...(baseSize !== undefined ? { baseSize } : {}),
      ...(compareSize !== undefined ? { compareSize } : {}),
    };
  }

  /**
   * Сколько строк в файле на ревизии. Нужно, чтобы знать, есть ли что
   * разворачивать после последнего хунка.
   */
  private async countLines(revision: string, path: string, absent: boolean, signal?: AbortSignal): Promise<number> {
    if (absent) {
      return 0;
    }
    return (await this.contents.lines(revision, path, signal)).length;
  }
}

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
