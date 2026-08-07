import type { GraphEntity } from '@shared/graph/model';
import type { GraphRefFilter } from '@shared/graphProtocol';

/**
 * Чистые хелперы вокруг `GraphEntity`/`GraphRefFilter`, вынесенные из `App.tsx`.
 *
 * Не JSX и не зависят от рендера — поэтому проверяются напрямую юнит-тестами,
 * а не через монтирование всего приложения (которое в jsdom не виртуализирует
 * список коммитов и не даёт добраться до выбора конкретной сущности).
 */

/** SHA коммита, к которому относится сущность — для подсветки её строки в графе. */
export function entitySha(entity: GraphEntity | null): string | null {
  if (!entity) {
    return null;
  }
  switch (entity.kind) {
    case 'commit':
      return entity.commit.sha;
    case 'branch':
    case 'tag':
      return entity.ref.sha;
    case 'stash':
      return entity.stash.baseSha ?? null;
  }
}

export function filterModeLabel(mode: GraphRefFilter['mode']): string {
  switch (mode) {
    case 'default':
      return 'Ветки: по умолчанию';
    case 'custom':
      return 'Ветки: вручную';
    case 'all':
      return 'Ветки: все';
  }
}
