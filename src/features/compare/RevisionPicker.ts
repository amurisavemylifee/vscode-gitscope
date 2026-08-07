import * as vscode from 'vscode';
import type { CommitInfo, RefInfo } from '@core/git/types';
import type { Revision } from '@shared/model';
import { formatRelativeTime } from '@shared/time';
import { RevisionService } from '../../services/RevisionService';

interface RevisionItem extends vscode.QuickPickItem {
  /** Что передавать в git. У разделителей отсутствует. */
  readonly spec?: string;
}

export interface PickRevisionOptions {
  readonly title: string;
  /** Ревизия, выбранная сейчас: подсвечивается при открытии списка. */
  readonly current?: string;
}

const separator = (label: string): RevisionItem => ({ label, kind: vscode.QuickPickItemKind.Separator });

const SEARCH_DEBOUNCE_MS = 200;
const COMMIT_LIMIT = 50;

/**
 * Выбор точки истории.
 *
 * Намеренно нативный QuickPick, а не выпадающий список внутри панели: он даёт
 * нечёткий поиск, навигацию с клавиатуры и привычное поведение бесплатно, а
 * список из десятков тысяч коммитов в самодельный дропдаун всё равно не влез бы.
 *
 * Кроме готовых вариантов принимает любой ввод: сырой SHA, `HEAD~3`,
 * `origin/main@{yesterday}` — всё, что понимает `git rev-parse`.
 */
export async function pickRevision(
  service: RevisionService,
  options: PickRevisionOptions,
): Promise<Revision | undefined> {
  const quickPick = vscode.window.createQuickPick<RevisionItem>();
  quickPick.title = options.title;
  quickPick.placeholder = 'Ветка, тег, SHA или выражение вроде HEAD~3';
  quickPick.matchOnDescription = true;
  quickPick.busy = true;
  quickPick.ignoreFocusOut = true;

  const disposables: vscode.Disposable[] = [quickPick];
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchController: AbortController | undefined;

  try {
    return await new Promise<Revision | undefined>((resolve, reject) => {
      let staticItems: RevisionItem[] = [];

      const applyItems = (items: RevisionItem[]) => {
        // Сохраняем подсветку текущей ревизии при каждой перестройке списка.
        const active = items.find((item) => item.spec !== undefined && item.spec === options.current);
        quickPick.items = items;
        if (active) {
          quickPick.activeItems = [active];
        }
      };

      const runSearch = (query: string) => {
        searchController?.abort();
        const controller = new AbortController();
        searchController = controller;
        quickPick.busy = true;

        void (async () => {
          try {
            const [commits, direct] = await Promise.all([
              service.listCommits(query, COMMIT_LIMIT, controller.signal),
              resolveQuietly(service, query, controller.signal),
            ]);
            if (controller.signal.aborted) {
              return;
            }

            const items: RevisionItem[] = [];
            // Прямое совпадение поднимаем наверх: если человек вставил SHA,
            // он хочет именно его, а не похожие по тексту коммиты.
            if (direct && !staticItems.some((item) => item.spec === query)) {
              items.push(separator('Ввод'), {
                label: `$(arrow-right) Использовать «${query}»`,
                description: direct.subject ?? '',
                spec: query,
              });
            }
            if (commits.length > 0) {
              items.push(separator('Коммиты'), ...commits.map(toCommitItem));
            }
            items.push(...staticItems);
            applyItems(items);
          } catch {
            // Ошибка поиска не должна ронять пикер: остаются статические пункты.
          } finally {
            if (!controller.signal.aborted) {
              quickPick.busy = false;
            }
          }
        })();
      };

      disposables.push(
        quickPick.onDidChangeValue((value) => {
          if (searchTimer !== undefined) {
            clearTimeout(searchTimer);
          }
          const query = value.trim();
          if (query === '') {
            searchController?.abort();
            quickPick.busy = false;
            applyItems(staticItems);
            return;
          }
          searchTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
        }),

        quickPick.onDidAccept(() => {
          const spec = quickPick.selectedItems[0]?.spec ?? quickPick.value.trim();
          if (spec === '') {
            return;
          }
          quickPick.busy = true;
          service
            .resolve(spec)
            .then((revision) => resolve(revision))
            .catch((error: unknown) => {
              quickPick.busy = false;
              void vscode.window.showErrorMessage(
                error instanceof Error ? error.message : `Не удалось разрешить «${spec}»`,
              );
            });
        }),

        quickPick.onDidHide(() => resolve(undefined)),
      );

      quickPick.show();

      void (async () => {
        try {
          const [refs, commits] = await Promise.all([service.listRefs(), service.listCommits(undefined, COMMIT_LIMIT)]);
          staticItems = buildStaticItems(refs, commits, options.current);
          applyItems(staticItems);
        } catch (error) {
          reject(error);
        } finally {
          quickPick.busy = false;
        }
      })();
    });
  } finally {
    if (searchTimer !== undefined) {
      clearTimeout(searchTimer);
    }
    searchController?.abort();
    for (const disposable of disposables) {
      disposable.dispose();
    }
  }
}

function buildStaticItems(refs: readonly RefInfo[], commits: readonly CommitInfo[], current?: string): RevisionItem[] {
  const items: RevisionItem[] = [
    separator('Указатели'),
    { label: '$(target) HEAD', description: 'текущее состояние ветки', spec: 'HEAD' },
  ];

  const section = (title: string, kind: RefInfo['kind'], icon: string) => {
    const matching = refs.filter((ref) => ref.kind === kind);
    if (matching.length === 0) {
      return;
    }
    items.push(separator(title));
    items.push(
      ...matching.map((ref) => ({
        label: `$(${icon}) ${ref.name}`,
        description: describeRef(ref),
        spec: ref.name,
      })),
    );
  };

  // Удалённые ветки выше локальных: сравнение чаще всего идёт с тем, что на
  // сервере, а не с локальной копией.
  section('Ветки на сервере', 'remote', 'cloud');
  section('Локальные ветки', 'head', 'git-branch');
  section('Теги', 'tag', 'tag');

  if (commits.length > 0) {
    items.push(separator('Последние коммиты'), ...commits.map(toCommitItem));
  }

  // Подсвеченный пункт должен существовать: если текущая ревизия — выражение
  // вроде `main~1`, отдельного пункта для неё в списке нет.
  if (current !== undefined && !items.some((item) => item.spec === current)) {
    items.splice(1, 0, { label: `$(history) ${current}`, description: 'выбрано сейчас', spec: current });
  }

  return items;
}

function toCommitItem(commit: CommitInfo): RevisionItem {
  const when = formatRelativeTime(commit.authoredAt);
  return {
    label: `$(git-commit) ${commit.shortSha} · ${commit.subject}`,
    description: when === '' ? commit.authorName : `${commit.authorName} · ${when}`,
    spec: commit.sha,
  };
}

function describeRef(ref: RefInfo): string {
  const when = ref.committedAt === undefined ? '' : formatRelativeTime(ref.committedAt);
  return [ref.subject, when].filter((part) => part !== undefined && part !== '').join(' · ');
}

/** Разрешает ввод, но молча: несуществующая ревизия здесь — норма, а не ошибка. */
async function resolveQuietly(
  service: RevisionService,
  spec: string,
  signal: AbortSignal,
): Promise<Revision | undefined> {
  // Дёргать git на каждое слово из поиска незачем — пробуем только то, что
  // вообще похоже на ссылку или SHA.
  if (/\s/.test(spec)) {
    return undefined;
  }
  if (!RevisionService.looksLikeSha(spec) && !/^[\w./@{}~^-]+$/.test(spec)) {
    return undefined;
  }
  try {
    return await service.resolve(spec, signal);
  } catch {
    return undefined;
  }
}
