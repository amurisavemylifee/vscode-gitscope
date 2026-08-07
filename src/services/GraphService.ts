import type { GitRepository } from '@core/git/GitRepository';
import type { GraphCommitInfo, RefInfo, StashInfo } from '@core/git/types';
import { attachDecorations } from '@shared/graph/decorate';
import { layoutCommits } from '@shared/graph/layout';
import type { GraphCommit, GraphRef, GraphStash } from '@shared/graph/model';
import type { GraphRefFilter, GraphSnapshot } from '@shared/graphProtocol';

/**
 * Сколько локальных веток брать по умолчанию (без `showAll`).
 *
 * Ограничивает граф недавно живыми ветками — иначе репозиторий с сотнями веток
 * закрытых фич превращается в кашу из дорожек ещё до того, как пользователь что-то
 * успел рассмотреть.
 */
const DEFAULT_BRANCH_COUNT = 30;

export interface AbortOption {
  readonly signal?: AbortSignal;
}

/**
 * Строит снимок графа коммитов: раскладку по дорожкам плюс развешанные ветки,
 * теги и стеши.
 *
 * Про `vscode` не знает — тестируется как и `ComparisonService`, обычным Vitest.
 */
export class GraphService {
  constructor(private readonly repository: GitRepository) {}

  async loadSnapshot(filter: GraphRefFilter, limit: number, { signal }: AbortOption = {}): Promise<GraphSnapshot> {
    const options = signal ? { signal } : {};
    const [allRefs, currentBranch] = await Promise.all([
      this.repository.listRefs(options),
      this.repository.currentBranch(options),
    ]);
    const graphRefs = allRefs.map((ref) => toGraphRef(ref, currentBranch));

    const includedRefs = await this.resolveIncludedRefs(filter, currentBranch, graphRefs, options);
    // При `all` историю всё равно ограничивает `--all`, а не список имён —
    // includedRefs здесь только для отображения в панели фильтра.
    const gitRevArgs = filter.mode === 'all' ? ['--all'] : includedRefs;

    // Берём на один коммит больше запрошенного — только чтобы узнать, есть ли
    // ещё история за пределами лимита, без отдельного round-trip к git.
    const [rawCommits, rawStashes] = await Promise.all([
      this.repository.listGraphCommits({ refs: gitRevArgs, limit: limit + 1, ...options }),
      this.repository.listStashes(options),
    ]);

    const hasMore = rawCommits.length > limit;
    const commits = hasMore ? rawCommits.slice(0, limit) : rawCommits;

    const nodes = attachDecorations(
      layoutCommits(commits.map(toGraphCommit)),
      graphRefs,
      rawStashes.map(toGraphStash),
    );

    return {
      repositoryRoot: this.repository.root,
      repositoryName: basename(this.repository.root),
      nodes,
      availableRefs: graphRefs,
      includedRefs,
      filter,
      hasMore,
    };
  }

  /** Какие ветки реально идут в граф — в зависимости от режима фильтра. */
  private async resolveIncludedRefs(
    filter: GraphRefFilter,
    currentBranch: string | undefined,
    graphRefs: readonly GraphRef[],
    options: AbortOption,
  ): Promise<string[]> {
    if (filter.mode === 'all') {
      return graphRefs.filter((ref) => ref.kind !== 'tag').map((ref) => ref.name);
    }
    if (filter.mode === 'custom') {
      return filter.selectedRefs.length > 0 ? [...filter.selectedRefs] : currentBranch !== undefined ? [currentBranch] : [];
    }

    const recent = await this.repository.listBranchesByRecency(DEFAULT_BRANCH_COUNT, options);
    const names = new Set(recent.map((ref) => ref.name));
    if (currentBranch !== undefined) {
      names.add(currentBranch);
    }
    return [...names];
  }
}

function toGraphCommit(commit: GraphCommitInfo): GraphCommit {
  return {
    sha: commit.sha,
    shortSha: commit.shortSha,
    subject: commit.subject,
    authorName: commit.authorName,
    authoredAt: commit.authoredAt,
    parents: commit.parents,
  };
}

function toGraphRef(ref: RefInfo, currentBranch: string | undefined): GraphRef {
  return {
    kind: ref.kind,
    name: ref.name,
    sha: ref.sha,
    isCurrent: ref.kind === 'head' && ref.name === currentBranch,
    ...(ref.subject !== undefined ? { subject: ref.subject } : {}),
    ...(ref.authorName !== undefined ? { authorName: ref.authorName } : {}),
    ...(ref.committedAt !== undefined ? { authoredAt: ref.committedAt } : {}),
  };
}

function toGraphStash(stash: StashInfo): GraphStash {
  return {
    index: stash.index,
    ref: stash.ref,
    sha: stash.sha,
    baseSha: stash.parents[0],
    message: stash.message,
    authorName: stash.authorName,
    authoredAt: stash.authoredAt,
  };
}

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
