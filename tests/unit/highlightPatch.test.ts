import { describe, expect, it } from 'vitest';
import type { FilePatch, Hunk } from '@shared/model';
import { highlightPatch } from '../../webview/syntax/highlighter';

/**
 * Самое хрупкое место подсветки — выравнивание.
 *
 * Каждая сторона хунка токенизируется целиком (иначе разваливаются блочные
 * комментарии), а потом токены надо разложить обратно по строкам в исходном
 * порядке: удалённые берутся с базовой стороны, добавленные — со сравниваемой,
 * контекст присутствует на обеих. Сдвиг на строку здесь означает, что код
 * подсвечен чужими цветами.
 */
const patch = (hunks: Hunk[], path = 'src/a.ts'): FilePatch => ({
  path,
  status: 'modified',
  binary: false,
  truncated: false,
  hunks,
});

const text = (tokens: readonly { content: string }[]) => tokens.map((token) => token.content).join('');

describe('highlightPatch', () => {
  it('раскладывает токены ровно по строкам хунка', async () => {
    const hunk: Hunk = {
      baseStart: 1,
      baseCount: 3,
      compareStart: 1,
      compareCount: 3,
      header: '',
      lines: [
        { kind: 'context', text: 'const a = 1;', baseLine: 1, compareLine: 1 },
        { kind: 'delete', text: 'const b = 2;', baseLine: 2 },
        { kind: 'insert', text: 'const b = 22;', compareLine: 2 },
        { kind: 'context', text: 'const c = 3;', baseLine: 3, compareLine: 3 },
      ],
    };

    const result = await highlightPatch(patch([hunk]), 'dark-plus');
    const lines = result?.hunks[0];

    expect(lines).toHaveLength(4);
    expect(lines?.map((tokens) => text(tokens))).toEqual([
      'const a = 1;',
      'const b = 2;',
      'const b = 22;',
      'const c = 3;',
    ]);
  });

  it('красит ключевые слова', async () => {
    const hunk: Hunk = {
      baseStart: 1,
      baseCount: 1,
      compareStart: 1,
      compareCount: 1,
      header: '',
      lines: [{ kind: 'insert', text: 'const answer = 42;', compareLine: 1 }],
    };

    const tokens = (await highlightPatch(patch([hunk]), 'dark-plus'))?.hunks[0]?.[0] ?? [];

    expect(tokens.find((token) => token.content === 'const')?.color).toBeTruthy();
    expect(tokens.find((token) => token.content === 'const')?.color).not.toBe(
      tokens.find((token) => token.content.includes('42'))?.color,
    );
  });

  it('переживает хунк, состоящий только из удалений', async () => {
    const hunk: Hunk = {
      baseStart: 1,
      baseCount: 2,
      compareStart: 1,
      compareCount: 0,
      header: '',
      lines: [
        { kind: 'delete', text: 'let x = 1;', baseLine: 1 },
        { kind: 'delete', text: 'let y = 2;', baseLine: 2 },
      ],
    };

    const lines = (await highlightPatch(patch([hunk]), 'dark-plus'))?.hunks[0];

    expect(lines?.map((tokens) => text(tokens))).toEqual(['let x = 1;', 'let y = 2;']);
  });

  it('отдаёт undefined для языка, которого нет в списке', async () => {
    const hunk: Hunk = {
      baseStart: 1,
      baseCount: 1,
      compareStart: 1,
      compareCount: 1,
      header: '',
      lines: [{ kind: 'context', text: 'что-то', baseLine: 1, compareLine: 1 }],
    };

    await expect(highlightPatch(patch([hunk], 'заметки.неизвестно'), 'dark-plus')).resolves.toBeUndefined();
  });

  it('светлая тема даёт другие цвета, чем тёмная', async () => {
    const hunk: Hunk = {
      baseStart: 1,
      baseCount: 1,
      compareStart: 1,
      compareCount: 1,
      header: '',
      lines: [{ kind: 'context', text: 'const a = 1;', baseLine: 1, compareLine: 1 }],
    };

    const dark = (await highlightPatch(patch([hunk]), 'dark-plus'))?.hunks[0]?.[0]?.[0]?.color;
    const light = (await highlightPatch(patch([hunk]), 'light-plus'))?.hunks[0]?.[0]?.[0]?.color;

    expect(dark).toBeTruthy();
    expect(light).toBeTruthy();
    expect(dark).not.toBe(light);
  });
});
