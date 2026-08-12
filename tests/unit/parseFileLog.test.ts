import { describe, expect, it } from 'vitest';
import { FILE_LOG_FORMAT, parseFileLog } from '../../src/core/git/parsers/parseFileLog';

/**
 * Собирает вывод `git log --raw --numstat -z` так же, как это делает git:
 * заголовок, `\x01`, NUL, перевод строки, записи об изменении через NUL.
 */
const header = (sha: string, refs = '', subject = 'тема', parents = 'p1') =>
  [
    sha.repeat(40).slice(0, 40),
    sha.repeat(7).slice(0, 7),
    'Аня',
    '2026-08-12T01:19:02+02:00',
    refs,
    parents,
    subject,
  ].join('\0') + '\x01\0\n';

const raw = (status: string, ...paths: string[]) =>
  `:100644 100644 aaaaaaa bbbbbbb ${status}\0${paths.join('\0')}\0`;

const numstat = (insertions: string, deletions: string, ...paths: string[]) =>
  `${insertions}\t${deletions}\t${paths.length === 1 ? paths[0] : ''}\0${paths.length === 1 ? '' : `${paths.join('\0')}\0`}`;

describe('FILE_LOG_FORMAT', () => {
  it('перечисляет поля через NUL и закрывает запись \\x01', () => {
    expect(FILE_LOG_FORMAT).toBe('%H%x00%h%x00%an%x00%aI%x00%D%x00%P%x00%s%x01');
  });
});

describe('parseFileLog', () => {
  it('на пустом выводе возвращает пустой список', () => {
    expect(parseFileLog('')).toEqual([]);
  });

  it('разбирает обычный коммит с числами изменённых строк', () => {
    const output = header('a', '', 'fix: гонка') + raw('M', 'app.ts') + numstat('12', '3', 'app.ts');

    const [commit] = parseFileLog(output);

    expect(commit).toMatchObject({
      sha: 'a'.repeat(40),
      shortSha: 'aaaaaaa',
      authorName: 'Аня',
      authoredAt: '2026-08-12T01:19:02+02:00',
      subject: 'fix: гонка',
    });
    expect(commit?.change).toEqual({
      status: 'modified',
      path: 'app.ts',
      insertions: 12,
      deletions: 3,
      binary: false,
    });
  });

  it('разбирает несколько коммитов подряд', () => {
    const output =
      header('a', '', 'второй') +
      raw('M', 'app.ts') +
      numstat('1', '0', 'app.ts') +
      header('b', '', 'первый') +
      raw('A', 'app.ts') +
      numstat('30', '0', 'app.ts');

    const commits = parseFileLog(output);

    expect(commits).toHaveLength(2);
    expect(commits.map((commit) => commit.subject)).toEqual(['второй', 'первый']);
    expect(commits[1]?.change?.status).toBe('added');
    expect(commits[1]?.change?.insertions).toBe(30);
  });

  it('у переименования запоминает оба имени и процент схожести', () => {
    const output = header('a') + raw('R100', 'old.ts', 'new.ts') + numstat('0', '0', 'old.ts', 'new.ts');

    const [commit] = parseFileLog(output);

    expect(commit?.change).toEqual({
      status: 'renamed',
      path: 'new.ts',
      previousPath: 'old.ts',
      similarity: 100,
      insertions: 0,
      deletions: 0,
      binary: false,
    });
  });

  it('удаление файла остаётся точкой истории', () => {
    const output = header('a', '', 'удаление') + raw('D', 'app.ts') + numstat('0', '5', 'app.ts');

    expect(parseFileLog(output)[0]?.change).toMatchObject({ status: 'deleted', deletions: 5 });
  });

  it('у двоичного файла вместо чисел стоят дефисы', () => {
    const output = header('a') + raw('M', 'logo.png') + numstat('-', '-', 'logo.png');

    expect(parseFileLog(output)[0]?.change).toMatchObject({ binary: true, insertions: 0, deletions: 0 });
  });

  it('слияние без diff не теряется, а приходит без изменений', () => {
    const output =
      header('a', '', 'merge', 'p1 p2') + header('b', '', 'обычный') + raw('M', 'app.ts') + numstat('1', '1', 'app.ts');

    const commits = parseFileLog(output);

    expect(commits).toHaveLength(2);
    expect(commits[0]?.subject).toBe('merge');
    expect(commits[0]?.change).toBeUndefined();
    expect(commits[1]?.change?.path).toBe('app.ts');
  });

  it('слияние отличает по числу родителей', () => {
    const merged = parseFileLog(header('a', '', 'слияние', 'p1 p2'));
    const usual = parseFileLog(header('b', '', 'обычный', 'p1') + raw('M', 'app.ts') + numstat('1', '0', 'app.ts'));
    const root = parseFileLog(header('c', '', 'первый коммит', '') + raw('A', 'app.ts') + numstat('3', '0', 'app.ts'));

    expect(merged[0]?.merge).toBe(true);
    expect(usual[0]?.merge).toBe(false);
    expect(root[0]?.merge).toBe(false);
  });

  it('разбирает ветки, теги и текущую ветку из %D', () => {
    const output =
      header('a', 'HEAD -> main, tag: v1.0, origin/main, feature') + raw('M', 'app.ts') + numstat('1', '0', 'app.ts');

    expect(parseFileLog(output)[0]?.refs).toEqual([
      { kind: 'head', name: 'main' },
      { kind: 'tag', name: 'v1.0' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'branch', name: 'feature' },
    ]);
  });

  it('в отсоединённом HEAD ссылка так и называется', () => {
    const output = header('a', 'HEAD') + raw('M', 'app.ts') + numstat('1', '0', 'app.ts');

    expect(parseFileLog(output)[0]?.refs).toEqual([{ kind: 'head', name: 'HEAD' }]);
  });

  it('у коммита без ссылок список ссылок пуст', () => {
    const output = header('a') + raw('M', 'app.ts') + numstat('1', '0', 'app.ts');

    expect(parseFileLog(output)[0]?.refs).toEqual([]);
  });

  it('путь с пробелами и табуляцией не разваливается на части', () => {
    const path = 'папка/файл с\tтабом.ts';
    const output = header('a') + raw('M', path) + numstat('2', '1', path);

    expect(parseFileLog(output)[0]?.change?.path).toBe(path);
  });
});
