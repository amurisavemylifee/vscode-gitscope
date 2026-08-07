import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileChange } from '@shared/model';
import { FileTree } from '../../webview/components/FileTree';

const file = (path: string, overrides: Partial<FileChange> = {}): FileChange => ({
  path,
  status: 'modified',
  insertions: 3,
  deletions: 1,
  binary: false,
  ...overrides,
});

describe('FileTree', () => {
  it('раскладывает файлы по папкам', () => {
    render(<FileTree files={[file('src/a.ts'), file('src/b.ts'), file('README.md')]} activePath={null} onSelect={vi.fn()} />);

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('сворачивает папку по клику', async () => {
    render(<FileTree files={[file('src/a.ts')]} activePath={null} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /src/ }));

    expect(screen.queryByText('a.ts')).not.toBeInTheDocument();
  });

  it('сообщает о выборе файла его полным путём', async () => {
    const onSelect = vi.fn();
    render(<FileTree files={[file('src/api/client.ts')]} activePath={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('client.ts'));

    expect(onSelect).toHaveBeenCalledWith('src/api/client.ts');
  });

  it('подсвечивает активный файл', () => {
    const { container } = render(
      <FileTree files={[file('a.ts'), file('b.ts')]} activePath="b.ts" onSelect={vi.fn()} />,
    );

    expect(container.querySelector('.gs-tree__row--active')).toHaveTextContent('b.ts');
  });

  it('у двоичного файла показывает пометку вместо счётчиков строк', () => {
    render(<FileTree files={[file('logo.png', { binary: true })]} activePath={null} onSelect={vi.fn()} />);

    expect(screen.getByText('bin')).toBeInTheDocument();
    expect(screen.queryByText('+3')).not.toBeInTheDocument();
  });

  it('у переименованного файла в подсказке виден прежний путь', () => {
    render(
      <FileTree
        files={[file('src/after.ts', { status: 'renamed', previousPath: 'src/before.ts' })]}
        activePath={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTitle('src/before.ts → src/after.ts')).toBeInTheDocument();
  });
});
