import { describe, expect, it } from 'vitest';
import type { GraphEntity } from '@shared/graph/model';
import type { GraphRefFilter } from '@shared/graphProtocol';
import { entitySha, filterModeLabel } from '../../webview/graph/entity';

describe('entitySha', () => {
  it('null для отсутствующего выбора', () => {
    expect(entitySha(null)).toBeNull();
  });

  it('коммит — свой sha', () => {
    const entity: GraphEntity = {
      kind: 'commit',
      commit: { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: '', authorName: '', authoredAt: '', parents: [] },
    };
    expect(entitySha(entity)).toBe('a'.repeat(40));
  });

  it('ветка и тег — sha, на который указывает ссылка', () => {
    const branch: GraphEntity = {
      kind: 'branch',
      ref: { kind: 'head', name: 'main', sha: 'b'.repeat(40), isCurrent: true },
    };
    const tag: GraphEntity = { kind: 'tag', ref: { kind: 'tag', name: 'v1', sha: 'c'.repeat(40), isCurrent: false } };

    expect(entitySha(branch)).toBe('b'.repeat(40));
    expect(entitySha(tag)).toBe('c'.repeat(40));
  });

  it('стеш с базовым коммитом — sha этого коммита', () => {
    const entity: GraphEntity = {
      kind: 'stash',
      stash: {
        index: 0,
        ref: 'stash@{0}',
        sha: 'd'.repeat(40),
        baseSha: 'e'.repeat(40),
        message: '',
        authorName: '',
        authoredAt: '',
      },
    };
    expect(entitySha(entity)).toBe('e'.repeat(40));
  });

  it('стеш без базового коммита — null', () => {
    const entity: GraphEntity = {
      kind: 'stash',
      stash: {
        index: 0,
        ref: 'stash@{0}',
        sha: 'd'.repeat(40),
        baseSha: undefined,
        message: '',
        authorName: '',
        authoredAt: '',
      },
    };
    expect(entitySha(entity)).toBeNull();
  });
});

describe('filterModeLabel', () => {
  const cases: readonly [GraphRefFilter['mode'], string][] = [
    ['default', 'Ветки: по умолчанию'],
    ['custom', 'Ветки: вручную'],
    ['all', 'Ветки: все'],
  ];

  it.each(cases)('%s → %s', (mode, expected) => {
    expect(filterModeLabel(mode)).toBe(expected);
  });
});
