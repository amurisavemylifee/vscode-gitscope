import { describe, expect, it } from 'vitest';
import { parseStashList } from '@core/git/parsers/parseStashList';

/** Запись в том виде, в каком её печатает `git stash list --format=STASH_FORMAT`. */
const record = (fields: {
  sha?: string;
  shortSha?: string;
  parents?: string;
  ref?: string;
  subject?: string;
  createdAt?: string;
  authorName?: string;
}) =>
  [
    fields.sha ?? 'a'.repeat(40),
    fields.shortSha ?? 'aaaaaaa',
    fields.parents ?? `${'b'.repeat(40)} ${'c'.repeat(40)}`,
    fields.ref ?? 'stash@{0}',
    fields.subject ?? 'WIP on main: bbbbbbb тема базового коммита',
    fields.createdAt ?? '2026-08-18T14:20:00+03:00',
    fields.authorName ?? 'Тарас',
  ].join('\0') + '\x01\n';

describe('parseStashList', () => {
  it('разбирает запись целиком', () => {
    const output = record({});

    expect(parseStashList(output)).toEqual([
      {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        parents: ['b'.repeat(40), 'c'.repeat(40)],
        ref: 'stash@{0}',
        message: '',
        automatic: true,
        branch: 'main',
        createdAt: '2026-08-18T14:20:00+03:00',
        authorName: 'Тарас',
      },
    ]);
  });

  it('у стеша со своим сообщением берёт его, а не тему базового коммита', () => {
    const output = record({ subject: 'On feature/api: правки формы логина' });

    expect(parseStashList(output)[0]).toMatchObject({
      message: 'правки формы логина',
      automatic: false,
      branch: 'feature/api',
    });
  });

  it('у автоматического стеша сообщения нет: в reflog лежит тема базового коммита', () => {
    const output = record({ subject: 'WIP on main: bbbbbbb Fix login redirect' });

    expect(parseStashList(output)[0]).toMatchObject({ message: '', automatic: true });
  });

  it('в detached HEAD ветки нет — «(no branch)» это не имя', () => {
    const output = record({ subject: 'WIP on (no branch): bbbbbbb тема' });

    expect(parseStashList(output)[0]?.branch).toBeUndefined();
  });

  it('сообщение с двоеточиями остаётся целым', () => {
    const output = record({ subject: 'On main: fix: гонка при загрузке: вторая попытка' });

    expect(parseStashList(output)[0]?.message).toBe('fix: гонка при загрузке: вторая попытка');
  });

  it('третий родитель — признак того, что в стеше есть файлы вне git', () => {
    const output = record({ parents: `${'b'.repeat(40)} ${'c'.repeat(40)} ${'d'.repeat(40)}` });

    expect(parseStashList(output)[0]?.parents).toHaveLength(3);
  });

  it('строку незнакомой формы показывает как есть', () => {
    const output = record({ subject: 'сделано чужим инструментом' });

    expect(parseStashList(output)[0]).toMatchObject({ message: 'сделано чужим инструментом', automatic: false });
    expect(parseStashList(output)[0]?.branch).toBeUndefined();
  });

  it('разбирает несколько стешей подряд', () => {
    const output =
      record({ ref: 'stash@{0}' }) +
      record({ sha: 'e'.repeat(40), shortSha: 'eeeeeee', ref: 'stash@{1}', subject: 'On main: второй' });

    expect(parseStashList(output).map((stash) => [stash.ref, stash.message])).toEqual([
      ['stash@{0}', ''],
      ['stash@{1}', 'второй'],
    ]);
  });

  it('пропускает мусорные записи и переживает пустой вывод', () => {
    expect(parseStashList('')).toEqual([]);
    expect(parseStashList('\0\0\x01\n')).toEqual([]);
  });
});
