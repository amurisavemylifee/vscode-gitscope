import { describe, expect, it } from 'vitest';
import { parseStashes } from '@core/git/parsers/parseStashes';

const record = (...fields: string[]) => fields.join('\0') + '\x01\n';

describe('parseStashes', () => {
  it('разбирает индекс, sha, родителя и сообщение', () => {
    const output = record(
      'stash@{0}',
      's'.repeat(40),
      'a'.repeat(40),
      'WIP on main: правки',
      'Тарас',
      '2026-08-05T12:00:00+03:00',
    );

    expect(parseStashes(output)).toEqual([
      {
        index: 0,
        ref: 'stash@{0}',
        sha: 's'.repeat(40),
        parents: ['a'.repeat(40)],
        message: 'WIP on main: правки',
        authorName: 'Тарас',
        authoredAt: '2026-08-05T12:00:00+03:00',
      },
    ]);
  });

  it('читает индекс больше нуля из stash@{N}', () => {
    const output = record('stash@{2}', 's'.repeat(40), 'a'.repeat(40), 'сообщение', 'Автор', '');

    expect(parseStashes(output)[0]?.index).toBe(2);
  });

  it('пропускает записи с нераспознаваемой ссылкой', () => {
    const output = record('refs/stash', 's'.repeat(40), 'a'.repeat(40), 'сообщение', 'Автор', '');

    expect(parseStashes(output)).toEqual([]);
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseStashes('')).toEqual([]);
  });
});
