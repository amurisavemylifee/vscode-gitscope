import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiffLine, Hunk } from '@shared/model';
import { ExpanderRow, HunkRow, LineRow, NoticeRow, SplitLineRow } from '../../webview/components/DiffLines';
import type { DiffRow } from '../../webview/diff/rows';

const line = (overrides: Partial<DiffLine> = {}): DiffLine => ({
  kind: 'context',
  text: 'const x = 1;',
  baseLine: 10,
  compareLine: 12,
  ...overrides,
});

describe('LineRow', () => {
  it('показывает номера строк с обеих сторон и текст', () => {
    render(<LineRow line={line()} tokens={undefined} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('у добавленной строки нет номера на базовой стороне', () => {
    const { container } = render(
      <LineRow line={{ kind: 'insert', text: 'новая', compareLine: 5 }} tokens={undefined} />,
    );
    const numbers = container.querySelectorAll('.gs-diff__num');

    expect(numbers[0]?.textContent).toBe('');
    expect(numbers[1]?.textContent).toBe('5');
  });

  it('подсвечивает изменённый кусок строки', () => {
    const { container } = render(
      <LineRow
        line={{ kind: 'insert', text: 'const x = 42;', compareLine: 1, inlineRanges: [{ start: 10, end: 12 }] }}
        tokens={undefined}
      />,
    );
    const changed = container.querySelector('.gs-diff__changed--insert');

    expect(changed).toHaveTextContent('42');
  });

  it('сообщает об отсутствии перевода строки в конце файла', () => {
    render(<LineRow line={line({ kind: 'delete', noNewlineAtEof: true })} tokens={undefined} />);

    expect(screen.getByText('в конце файла нет перевода строки')).toBeInTheDocument();
  });
});

describe('SplitLineRow', () => {
  it('ставит удалённую строку слева, добавленную справа', () => {
    const { container } = render(
      <SplitLineRow
        left={{ line: { kind: 'delete', text: 'было', baseLine: 3 }, index: 0 }}
        right={{ line: { kind: 'insert', text: 'стало', compareLine: 3 }, index: 1 }}
        leftTokens={undefined}
        rightTokens={undefined}
      />,
    );

    expect(container.querySelector('.gs-split__cell--delete')).toHaveTextContent('3');
    expect(screen.getByText('было')).toBeInTheDocument();
    expect(screen.getByText('стало')).toBeInTheDocument();
  });

  it('пустую сторону помечает отдельно — строки там просто нет', () => {
    const { container } = render(
      <SplitLineRow
        left={undefined}
        right={{ line: { kind: 'insert', text: 'дописано', compareLine: 7 }, index: 0 }}
        leftTokens={undefined}
        rightTokens={undefined}
      />,
    );

    expect(container.querySelectorAll('.gs-split__cell--empty')).toHaveLength(3);
  });
});

describe('HunkRow', () => {
  it('показывает диапазон и имя функции из заголовка хунка', () => {
    const hunk: Hunk = {
      baseStart: 10,
      baseCount: 4,
      compareStart: 12,
      compareCount: 5,
      header: 'export function run() {',
      lines: [],
    };
    render(<HunkRow hunk={hunk} />);

    expect(screen.getByText('@@ -10,4 +12,5 @@')).toBeInTheDocument();
    expect(screen.getByText('export function run() {')).toBeInTheDocument();
  });
});

describe('ExpanderRow', () => {
  const row = (compareStart: number, compareEnd: number): Extract<DiffRow, { kind: 'expander' }> => ({
    kind: 'expander',
    key: 'gap',
    fileIndex: 0,
    compareStart,
    compareEnd,
    baseOffset: 0,
  });

  it('короткий промежуток открывает одной кнопкой целиком', async () => {
    const onExpand = vi.fn();
    render(<ExpanderRow row={row(1, 5)} onExpand={onExpand} />);

    await userEvent.click(screen.getByRole('button', { name: /развернуть 5 строк/ }));

    expect(onExpand).toHaveBeenCalledWith(1, 5);
  });

  it('у длинного промежутка есть шаги сверху и снизу', async () => {
    const onExpand = vi.fn();
    render(<ExpanderRow row={row(1, 100)} onExpand={onExpand} />);

    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]!);
    expect(onExpand).toHaveBeenCalledWith(1, 20);

    await userEvent.click(buttons[2]!);
    expect(onExpand).toHaveBeenCalledWith(81, 100);
  });

  it('очень длинный промежуток не предлагает открыть целиком', () => {
    render(<ExpanderRow row={row(1, 5000)} onExpand={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /все 5000/ })).not.toBeInTheDocument();
    expect(screen.getByText('скрыто 5000 строк')).toBeInTheDocument();
  });
});

describe('NoticeRow', () => {
  it('кнопка повтора зовёт обработчик с типом действия', async () => {
    const onAction = vi.fn();
    render(
      <NoticeRow
        row={{
          kind: 'notice',
          key: 'n',
          fileIndex: 0,
          tone: 'error',
          text: 'git сломался',
          action: { label: 'Повторить', type: 'retry' },
        }}
        onAction={onAction}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onAction).toHaveBeenCalledWith('retry');
  });

  it('без действия рисует только текст', () => {
    render(<NoticeRow row={{ kind: 'notice', key: 'n', fileIndex: 0, tone: 'muted', text: 'Загружаем…' }} onAction={vi.fn()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
  });
});
