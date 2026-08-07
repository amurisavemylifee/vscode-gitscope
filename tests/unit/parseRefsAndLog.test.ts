import { describe, expect, it } from 'vitest';
import { parseRefs } from '@core/git/parsers/parseRefs';
import { parseLog } from '@core/git/parsers/parseLog';

const record = (...fields: string[]) => fields.join('\0') + '\x01\n';

describe('parseRefs', () => {
  it('различает локальные ветки, удалённые ветки и теги', () => {
    const output = [
      record('refs/heads/main', 'main', 'aaa', '', '2026-01-01T10:00:00+03:00', 'Автор', 'первый коммит'),
      record('refs/remotes/origin/main', 'origin/main', 'bbb', '', '2026-01-02T10:00:00+03:00', 'Автор', 'второй'),
      record('refs/tags/v1.0.0', 'v1.0.0', 'ccc', '', '2026-01-03T10:00:00+03:00', 'Автор', 'релиз'),
    ].join('');

    expect(parseRefs(output).map((ref) => [ref.kind, ref.name, ref.sha])).toEqual([
      ['head', 'main', 'aaa'],
      ['remote', 'origin/main', 'bbb'],
      ['tag', 'v1.0.0', 'ccc'],
    ]);
  });

  it('у аннотированного тега берёт коммит, а не сам объект тега', () => {
    const output = record('refs/tags/v2.0.0', 'v2.0.0', 'tagobject', 'commitsha', '', '', '');

    expect(parseRefs(output)[0]?.sha).toBe('commitsha');
  });

  it('пропускает мусорные и неизвестные записи', () => {
    const output = record('refs/stash', 'stash', 'ddd', '', '', '', '') + record('', '', '');

    expect(parseRefs(output)).toEqual([]);
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseRefs('')).toEqual([]);
  });
});

describe('parseLog', () => {
  it('разбирает коммиты', () => {
    const output = [
      record('a'.repeat(40), 'aaaaaaa', 'Тарас', '2026-08-01T12:00:00+03:00', 'починил парсер'),
      record('b'.repeat(40), 'bbbbbbb', 'Тарас', '2026-08-02T12:00:00+03:00', 'добавил тесты'),
    ].join('');

    expect(parseLog(output)).toEqual([
      {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        authorName: 'Тарас',
        authoredAt: '2026-08-01T12:00:00+03:00',
        subject: 'починил парсер',
      },
      {
        sha: 'b'.repeat(40),
        shortSha: 'bbbbbbb',
        authorName: 'Тарас',
        authoredAt: '2026-08-02T12:00:00+03:00',
        subject: 'добавил тесты',
      },
    ]);
  });

  it('переживает коммит с пустой темой', () => {
    const output = record('c'.repeat(40), 'ccccccc', 'Автор', '2026-08-03T12:00:00+03:00', '');

    expect(parseLog(output)[0]?.subject).toBe('');
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseLog('')).toEqual([]);
  });
});
