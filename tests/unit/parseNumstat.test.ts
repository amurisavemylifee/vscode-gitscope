import { describe, expect, it } from 'vitest';
import { parseNumstat } from '@core/git/parsers/parseNumstat';
import { GitParseError } from '@core/git/errors';

const nul = '\0';

describe('parseNumstat', () => {
  it('считает добавленные и удалённые строки', () => {
    const output = ['12\t3\tsrc/a.ts', '0\t7\tsrc/b.ts', ''].join(nul);

    expect(parseNumstat(output)).toEqual([
      { path: 'src/a.ts', insertions: 12, deletions: 3, binary: false },
      { path: 'src/b.ts', insertions: 0, deletions: 7, binary: false },
    ]);
  });

  it('помечает бинарные файлы и обнуляет им счётчики', () => {
    const output = ['-\t-\tassets/logo.png', ''].join(nul);

    expect(parseNumstat(output)).toEqual([
      { path: 'assets/logo.png', insertions: 0, deletions: 0, binary: true },
    ]);
  });

  it('читает переименование как три отдельных поля', () => {
    // У переименования путь внутри записи пустой, а старое и новое имя идут
    // следующими NUL-полями.
    const output = ['4\t2\t', 'src/before.ts', 'src/after.ts', ''].join(nul);

    expect(parseNumstat(output)).toEqual([
      { path: 'src/after.ts', previousPath: 'src/before.ts', insertions: 4, deletions: 2, binary: false },
    ]);
  });

  it('не режет путь, в котором есть табуляция', () => {
    const path = 'weird\tname.txt';
    const output = [`1\t1\t${path}`, ''].join(nul);

    expect(parseNumstat(output)).toEqual([{ path, insertions: 1, deletions: 1, binary: false }]);
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseNumstat('')).toEqual([]);
  });

  it('сообщает о записи без табуляций', () => {
    expect(() => parseNumstat('мусор\0')).toThrow(GitParseError);
  });
});
