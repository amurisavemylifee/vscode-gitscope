import type { GitRepository } from '@core/git/GitRepository';
import type { CommitInfo, RefInfo } from '@core/git/types';
import type { Revision } from '@shared/model';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const ABBREVIATED_SHA = /^[0-9a-f]{7,40}$/i;

export interface DefaultRevisions {
  /** Что предложить как базу — обычно основная ветка. */
  readonly base?: string;
  /** Что предложить как сравниваемое — обычно текущая ветка. */
  readonly compare?: string;
}

/**
 * Ревизии для выбора: ссылки, история и разрешение произвольного revspec.
 *
 * Про `vscode` не знает, поэтому проверяется интеграционными тестами на
 * настоящем репозитории, без запуска редактора.
 */
export class RevisionService {
  constructor(private readonly repository: GitRepository) {}

  /** Разрешает `origin/main`, `HEAD~3`, `a1b2c3d` в конкретный коммит. */
  async resolve(spec: string, signal?: AbortSignal): Promise<Revision> {
    const commit = await this.repository.resolveCommit(spec, signal ? { signal } : {});
    return {
      spec,
      sha: commit.sha,
      // Голый SHA сокращаем: полные 40 символов в шапке нечитаемы.
      label: FULL_SHA.test(spec) ? commit.shortSha : spec,
      subject: commit.subject,
      authorName: commit.authorName,
      authoredAt: commit.authoredAt,
    };
  }

  listRefs(signal?: AbortSignal): Promise<RefInfo[]> {
    return this.repository.listRefs(signal ? { signal } : {});
  }

  listCommits(query: string | undefined, limit = 50, signal?: AbortSignal): Promise<CommitInfo[]> {
    return this.repository.listCommits({
      limit,
      ...(query ? { query } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  /** Похоже ли на SHA — по этому решаем, стоит ли пытаться разрешить ввод. */
  static looksLikeSha(value: string): boolean {
    return ABBREVIATED_SHA.test(value);
  }

  /**
   * Что подставить в пикеры при первом открытии.
   *
   * Самый частый вопрос — «чем моя ветка отличается от основной», поэтому базой
   * предлагаем основную ветку (по возможности с сервера, а не локальную копию),
   * а сравниваемым — текущую.
   */
  async suggestDefaults(signal?: AbortSignal): Promise<DefaultRevisions> {
    const [refs, current] = await Promise.all([
      this.listRefs(signal),
      this.repository.currentBranch(signal ? { signal } : {}),
    ]);

    const names = new Set(refs.map((ref) => ref.name));
    const mainCandidates = [
      'origin/main',
      'origin/master',
      'origin/develop',
      'main',
      'master',
      'develop',
    ];
    let base = mainCandidates.find((candidate) => names.has(candidate) && candidate !== current);

    // Если текущая ветка и есть основная, сравнивать её с собой бессмысленно —
    // предлагаем предыдущий коммит.
    if (base === undefined && current !== undefined) {
      base = `${current}~1`;
    }

    return {
      ...(base !== undefined ? { base } : {}),
      ...(current !== undefined ? { compare: current } : { compare: 'HEAD' }),
    };
  }
}
