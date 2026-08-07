import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileChange } from '@shared/model';
import { DiffStat } from '../../webview/components/DiffStat';
import { EmptyState } from '../../webview/components/EmptyState';
import { FileHeaderRow } from '../../webview/components/FileHeaderRow';
import { Icon } from '../../webview/components/Icon';
import { StatusBadge } from '../../webview/components/StatusBadge';

const file = (overrides: Partial<FileChange> = {}): FileChange => ({
  path: 'src/api/client.ts',
  status: 'modified',
  insertions: 12,
  deletions: 3,
  binary: false,
  ...overrides,
});

describe('EmptyState', () => {
  it('показывает заголовок, описание и действие', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Ревизии не выбраны"
        description="Выберите две точки истории"
        action={<button onClick={onClick}>Выбрать</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ревизии не выбраны' })).toBeInTheDocument();
    expect(screen.getByText('Выберите две точки истории')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Выбрать' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('ошибку объявляет как alert — её должен озвучить скринридер', () => {
    render(<EmptyState tone="error" title="Всё сломалось" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('без описания и действия рисует только заголовок', () => {
    const { container } = render(<EmptyState title="Загрузка…" />);

    expect(container.querySelector('.gs-empty__description')).toBeNull();
    expect(container.querySelector('.gs-empty__action')).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('каждому статусу даёт свою букву и подпись', () => {
    const cases = [
      ['added', 'A', 'Файл добавлен'],
      ['modified', 'M', 'Файл изменён'],
      ['deleted', 'D', 'Файл удалён'],
      ['renamed', 'R', 'Файл переименован'],
      ['copied', 'C', 'Файл скопирован'],
      ['type-changed', 'T', 'Изменился тип файла'],
    ] as const;

    for (const [status, letter, title] of cases) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByLabelText(title)).toHaveTextContent(letter);
      unmount();
    }
  });
});

describe('DiffStat', () => {
  it('показывает числа со знаками', () => {
    render(<DiffStat insertions={120} deletions={12} />);

    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.getByText('−12')).toBeInTheDocument();
  });

  it('полоска показывает соотношение добавленного и удалённого', () => {
    const { container } = render(<DiffStat insertions={80} deletions={20} withBar />);

    expect(container.querySelectorAll('.gs-diffstat__cell--added')).toHaveLength(4);
    expect(container.querySelectorAll('.gs-diffstat__cell--removed')).toHaveLength(1);
  });

  it('при нулевых изменениях полоска нейтральна', () => {
    const { container } = render(<DiffStat insertions={0} deletions={0} withBar />);

    expect(container.querySelectorAll('.gs-diffstat__cell--added')).toHaveLength(0);
    expect(container.querySelectorAll('.gs-diffstat__cell--removed')).toHaveLength(0);
  });

  it('без полоски рисует только числа', () => {
    const { container } = render(<DiffStat insertions={1} deletions={1} />);

    expect(container.querySelector('.gs-diffstat__bar')).toBeNull();
  });
});

describe('FileHeaderRow', () => {
  it('показывает путь, статус и статистику', () => {
    render(<FileHeaderRow file={file()} collapsed={false} onToggle={vi.fn()} />);

    expect(screen.getByText('src/api/client.ts')).toBeInTheDocument();
    expect(screen.getByLabelText('Файл изменён')).toBeInTheDocument();
    expect(screen.getByText('+12')).toBeInTheDocument();
  });

  it('у переименованного показывает прежний путь и процент совпадения', () => {
    render(
      <FileHeaderRow
        file={file({ status: 'renamed', previousPath: 'src/api/old.ts', similarity: 92 })}
        collapsed={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('src/api/old.ts')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('у двоичного файла нет счётчиков строк', () => {
    render(<FileHeaderRow file={file({ binary: true })} collapsed={false} onToggle={vi.fn()} />);

    expect(screen.getByText('двоичный')).toBeInTheDocument();
    expect(screen.queryByText('+12')).not.toBeInTheDocument();
  });

  it('кнопка сворачивания отражает состояние и зовёт обработчик', async () => {
    const onToggle = vi.fn();
    render(<FileHeaderRow file={file()} collapsed onToggle={onToggle} />);

    const toggle = screen.getByRole('button', { name: 'Развернуть файл' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });
});

describe('Icon', () => {
  it('скрыт от скринридеров — это украшение рядом с текстом', () => {
    const { container } = render(<Icon name="branch" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path')).toBeInTheDocument();
  });

  it('уважает заданный размер', () => {
    const { container } = render(<Icon name="tag" size={24} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
  });
});
