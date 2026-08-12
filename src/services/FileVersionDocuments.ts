import * as vscode from 'vscode';
import { EMPTY_TREE, GitRepository } from '@core/git/GitRepository';
import type { Logger } from '@shared/logger';
import type { RepositoryLocator } from './RepositoryLocator';

/** Схема виртуальных документов «файл на такой-то ревизии». */
export const FILE_VERSION_SCHEME = 'gitscope-version';

interface VersionQuery {
  readonly root: string;
  readonly path: string;
  readonly sha: string;
}

/**
 * Ссылка на версию файла для вкладки редактора.
 *
 * Имя в пути — `App@a1b2c3d.tsx`: по нему подписывается вкладка, а расширение
 * остаётся последним, поэтому VS Code определяет язык и подсвечивает код.
 * Настоящий путь и ревизия едут в query — из имени их восстановить нельзя,
 * если в репозитории есть два файла с одинаковым именем.
 */
export function fileVersionUri(root: string, path: string, sha: string, shortSha: string): vscode.Uri {
  const segments = path.split('/');
  const name = segments.pop() ?? path;
  const dot = name.lastIndexOf('.');
  const label = dot > 0 ? `${name.slice(0, dot)}@${shortSha}${name.slice(dot)}` : `${name}@${shortSha}`;

  return vscode.Uri.from({
    scheme: FILE_VERSION_SCHEME,
    path: `/${[...segments, label].join('/')}`,
    query: JSON.stringify({ root, path, sha } satisfies VersionQuery),
  });
}

/**
 * Сторона сравнения, где файла нет: он в этой версии ещё не появился или уже
 * удалён.
 *
 * Отдельная ссылка, а не отсутствующая сторона: вкладке diff нужны два
 * документа, и «файла тут нет» показывается пустой половиной, а не ошибкой.
 */
export function emptyVersionUri(root: string, path: string): vscode.Uri {
  return fileVersionUri(root, path, EMPTY_TREE, 'пусто');
}

/**
 * Отдаёт содержимое версии файла редактору.
 *
 * Документ этой схемы редактор открывает только для чтения, поэтому случайно
 * записать поверх истории нельзя — а искать, где живёт временный файл, не
 * нужно: его нет.
 */
export class FileVersionContentProvider implements vscode.TextDocumentContentProvider {
  constructor(
    private readonly locator: RepositoryLocator,
    private readonly logger: Logger,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const query = JSON.parse(uri.query) as VersionQuery;
    // Пустое дерево — сторона сравнения без файла. Спрашивать про него git
    // бессмысленно: он ответит ошибкой на то, что ошибкой не является.
    if (query.sha === EMPTY_TREE) {
      return '';
    }
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort(new Error('Открытие версии отменено')));

    try {
      const repository = new GitRepository(query.root, await this.locator.getExecutor());
      const { text, binary } = await repository.readFile(query.sha, query.path, { signal: controller.signal });
      return binary ? 'Двоичный файл — показать его текстом нельзя.' : text;
    } catch (error) {
      this.logger.error(`Не удалось прочитать ${query.path} на ${query.sha}`, error);
      throw error;
    }
  }
}
