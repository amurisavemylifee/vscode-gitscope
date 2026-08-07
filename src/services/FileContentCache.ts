import type { GitRepository } from '@core/git/GitRepository';
import { GitError } from '@core/git/errors';

/**
 * Содержимое файлов на конкретных ревизиях.
 *
 * Нужно для разворачивания свёрнутого контекста: чтобы показать строки, которых
 * нет в патче, приходится читать файл целиком. Кэш держит только последние
 * открытые файлы — иначе просмотр большого сравнения незаметно утащил бы весь
 * репозиторий в память extension host.
 */
export class FileContentCache {
  private readonly entries = new Map<string, string[]>();

  constructor(
    private readonly repository: GitRepository,
    private readonly maxEntries = 40,
  ) {}

  async lines(revision: string, path: string, signal?: AbortSignal): Promise<string[]> {
    const key = `${revision}:${path}`;

    const cached = this.entries.get(key);
    if (cached) {
      // Перекладываем в конец: Map хранит порядок вставки, и это делает из него
      // LRU без отдельной структуры.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    let lines: string[];
    try {
      lines = await this.repository.showFileLines(revision, path, signal ? { signal } : {});
    } catch (error) {
      if (error instanceof GitError) {
        // На этой ревизии файла нет — например, он только что добавлен.
        lines = [];
      } else {
        throw error;
      }
    }

    this.entries.set(key, lines);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    return lines;
  }

  clear(): void {
    this.entries.clear();
  }
}
