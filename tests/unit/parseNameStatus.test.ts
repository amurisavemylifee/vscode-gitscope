import { describe, expect, it } from 'vitest';
import { parseNameStatus } from '@core/git/parsers/parseNameStatus';
import { GitParseError } from '@core/git/errors';

const nul = '\0';

describe('parseNameStatus', () => {
  it('разбирает добавление, изменение и удаление', () => {
    const output = ['A', 'src/new.ts', 'M', 'src/old.ts', 'D', 'src/gone.ts', ''].join(nul);

    expect(parseNameStatus(output)).toEqual([
      { status: 'added', path: 'src/new.ts' },
      { status: 'modified', path: 'src/old.ts' },
      { status: 'deleted', path: 'src/gone.ts' },
    ]);
  });

  it('читает у переименования оба пути и процент схожести', () => {
    const output = ['R096', 'src/before.ts', 'src/after.ts', ''].join(nul);

    expect(parseNameStatus(output)).toEqual([
      { status: 'renamed', path: 'src/after.ts', previousPath: 'src/before.ts', similarity: 96 },
    ]);
  });

  it('читает копирование', () => {
    const output = ['C075', 'src/source.ts', 'src/copy.ts', ''].join(nul);

    expect(parseNameStatus(output)).toEqual([
      { status: 'copied', path: 'src/copy.ts', previousPath: 'src/source.ts', similarity: 75 },
    ]);
  });

  it('не ломается на путях с пробелами, кавычками и кириллицей', () => {
    const path = 'docs/мой файл "с кавычками".md';
    const output = ['M', path, ''].join(nul);

    expect(parseNameStatus(output)).toEqual([{ status: 'modified', path }]);
  });

  it('показывает файл с неизвестной буквой статуса как изменённый', () => {
    // U — конфликт слияния: в сравнении двух деревьев не встречается, но
    // спрятать файл из списка хуже, чем поставить ему приблизительный статус.
    const output = ['U', 'src/conflict.ts', ''].join(nul);

    expect(parseNameStatus(output)).toEqual([{ status: 'modified', path: 'src/conflict.ts' }]);
  });

  it('распознаёт смену типа файла', () => {
    const output = ['T', 'link', ''].join(nul);

    expect(parseNameStatus(output)).toEqual([{ status: 'type-changed', path: 'link' }]);
  });

  it('возвращает пустой список на пустом выводе', () => {
    expect(parseNameStatus('')).toEqual([]);
  });

  it('сообщает об обрыве записи на середине', () => {
    expect(() => parseNameStatus('R100\0only-one-path')).toThrow(GitParseError);
  });
});
