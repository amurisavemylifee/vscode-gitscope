import { describe, expect, it } from 'vitest';
import { parseGraphLog } from '@core/git/parsers/parseGraphLog';

const record = (...fields: string[]) => fields.join('\0') + '\x01\n';

describe('parseGraphLog', () => {
  it('разбирает коммит с одним родителем', () => {
    const output = record(
      'b'.repeat(40),
      'bbbbbbb',
      'Тарас',
      '2026-08-02T12:00:00+03:00',
      'второй коммит',
      'a'.repeat(40),
    );

    expect(parseGraphLog(output)).toEqual([
      {
        sha: 'b'.repeat(40),
        shortSha: 'bbbbbbb',
        authorName: 'Тарас',
        authoredAt: '2026-08-02T12:00:00+03:00',
        subject: 'второй коммит',
        parents: ['a'.repeat(40)],
      },
    ]);
  });

  it('у корневого коммита список родителей пуст', () => {
    const output = record('a'.repeat(40), 'aaaaaaa', 'Тарас', '2026-08-01T12:00:00+03:00', 'первый коммит', '');

    expect(parseGraphLog(output)[0]?.parents).toEqual([]);
  });

  it('у merge-коммита несколько родителей через пробел', () => {
    const output = record(
      'c'.repeat(40),
      'ccccccc',
      'Тарас',
      '2026-08-03T12:00:00+03:00',
      'merge',
      `${'a'.repeat(40)} ${'b'.repeat(40)}`,
    );

    expect(parseGraphLog(output)[0]?.parents).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseGraphLog('')).toEqual([]);
  });
});
