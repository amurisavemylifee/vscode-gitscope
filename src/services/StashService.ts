import { EMPTY_TREE, type GitRepository } from '@core/git/GitRepository';
import type { FilePatch, Revision } from '@shared/model';
import type { StashEntry, StashFile, StashSummary } from '@shared/stashModel';
import { ComparisonService } from './ComparisonService';

/**
 * Стеши репозитория: список, содержимое каждого и патчи его файлов.
 *
 * Стеш — обычный коммит, поэтому всё, что показывается справа, считает
 * `ComparisonService`: пара «база стеша → стеш» для него ничем не отличается от
 * пары ревизий. Здесь остаётся только то, что есть у стеша и чего нет у
 * сравнения: разбор списка, файлы из индекса и файлы, которых в git не было.
 */
export class StashService {
  private readonly comparison: ComparisonService;

  constructor(private readonly repository: GitRepository) {
    this.comparison = new ComparisonService(repository);
  }

  /**
   * Список стешей, свежий первым.
   *
   * Двумя вызовами git независимо от числа стешей: один за самим списком,
   * второй — за темами базовых коммитов сразу для всех карточек.
   */
  async list(signal?: AbortSignal): Promise<StashEntry[]> {
    const options = signal ? { signal } : {};
    const records = await this.repository.listStashes(options);

    const baseShas = [
      ...new Set(records.map((record) => record.parents[0]).filter((sha): sha is string => sha !== undefined)),
    ];
    const bases = new Map((await this.repository.describeCommits(baseShas, options)).map((base) => [base.sha, base]));

    return records.flatMap((record): StashEntry[] => {
      const baseSha = record.parents[0];
      // Коммит без родителя стешем быть не может: у стеша всегда есть база.
      if (baseSha === undefined) {
        return [];
      }
      const base = bases.get(baseSha);

      return [
        {
          sha: record.sha,
          shortSha: record.shortSha,
          ref: record.ref,
          message: record.message,
          automatic: record.automatic,
          ...(record.branch !== undefined ? { branch: record.branch } : {}),
          authorName: record.authorName,
          createdAt: record.createdAt,
          base: {
            sha: baseSha,
            shortSha: base?.shortSha ?? baseSha.slice(0, 7),
            subject: base?.subject ?? '',
          },
          ...(record.parents[1] !== undefined ? { indexSha: record.parents[1] } : {}),
          ...(record.parents[2] !== undefined ? { untrackedSha: record.parents[2] } : {}),
        },
      ];
    });
  }

  /**
   * Что лежит внутри стеша.
   *
   * Три источника в одном списке: изменения отслеживаемых файлов, пометка о
   * том, что изменение было в индексе, и файлы из третьего родителя — те, что
   * в git ещё не попадали. Разложить их по трём спискам значило бы заставить
   * человека складывать их обратно глазами.
   */
  async summary(entry: StashEntry, signal?: AbortSignal): Promise<StashSummary> {
    const options = signal ? { signal } : {};

    const [changes, staged, untracked] = await Promise.all([
      this.comparison.buildSummary(revision(entry.base.sha), revision(entry.sha), signal),
      entry.indexSha === undefined
        ? Promise.resolve([])
        : this.repository.diffNameStatus(entry.base.sha, entry.indexSha, options),
      entry.untrackedSha === undefined
        ? Promise.resolve([])
        : this.repository.diffNumstat(EMPTY_TREE, entry.untrackedSha, options),
    ]);

    const stagedPaths = new Set(staged.map((change) => change.path));

    const files: StashFile[] = [
      ...changes.files.map((file) => (stagedPaths.has(file.path) ? { ...file, staged: true } : file)),
      // Неотслеживаемые файлы лежат отдельным коммитом, и в diff с базой их
      // нет: для git они появились из ниоткуда, целиком.
      ...untracked.map((file): StashFile => ({
        path: file.path,
        status: 'added',
        insertions: file.insertions,
        deletions: file.deletions,
        binary: file.binary,
        untracked: true,
      })),
    ];

    return {
      sha: entry.sha,
      files,
      insertions: files.reduce((total, file) => total + file.insertions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
    };
  }

  /** Патч одного файла стеша. */
  patch(entry: StashEntry, file: StashFile, contextLines: number, signal?: AbortSignal): Promise<FilePatch> {
    const { base, compare } = this.sides(entry, file);
    return this.comparison.buildPatch(base, compare, file, contextLines, signal);
  }

  /**
   * Строки файла в стеше — источник для разворачивания свёрнутого контекста.
   * Нумерация с 1, границы включительно.
   */
  readLines(
    entry: StashEntry,
    file: StashFile,
    startLine: number,
    endLine: number,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const { compare } = this.sides(entry, file);
    return this.comparison.readLines(compare.sha, file.path, startLine, endLine, signal);
  }

  /**
   * Что с чем сравнивать, чтобы получить этот файл.
   *
   * Обычный файл — это разница между базой и стешем. Файл, которого в git не
   * было, лежит в отдельном коммите и сравнивается с пустотой: показать его
   * иначе как «добавлен целиком» невозможно, да и незачем.
   */
  sides(entry: StashEntry, file: StashFile): { base: Revision; compare: Revision } {
    if (file.untracked === true && entry.untrackedSha !== undefined) {
      return { base: revision(EMPTY_TREE), compare: revision(entry.untrackedSha) };
    }
    return { base: revision(entry.base.sha), compare: revision(entry.sha) };
  }
}

/** Стеш и его база — обычные коммиты, и сравнению от них нужен только SHA. */
const revision = (sha: string): Revision => ({ spec: sha, sha, label: sha.slice(0, 7) });
