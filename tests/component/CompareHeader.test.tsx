import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComparisonSummary } from '@shared/model';
import type { FetchInfo } from '@shared/protocol';
import { CompareHeader } from '../../webview/components/CompareHeader';

const summary = (overrides: Partial<ComparisonSummary> = {}): ComparisonSummary => ({
  base: { spec: 'origin/main', sha: 'a'.repeat(40), label: 'origin/main', subject: 'база' },
  compare: { spec: 'feature', sha: 'b'.repeat(40), label: 'feature', subject: 'ветка' },
  files: [],
  insertions: 120,
  deletions: 12,
  repositoryRoot: '/repo',
  repositoryName: 'repo',
  ...overrides,
});

const noFetch: FetchInfo = { inProgress: false, hasRemote: false };

const renderHeader = (props: Partial<Parameters<typeof CompareHeader>[0]> = {}) => {
  const handlers = {
    onViewModeChange: vi.fn(),
    onCollapseAll: vi.fn(),
    onExpandAll: vi.fn(),
    onPickRevision: vi.fn(),
    onSwap: vi.fn(),
    onReload: vi.fn(),
    onFetch: vi.fn(),
  };
  render(
    <CompareHeader
      summary={summary()}
      fetch={noFetch}
      loading={false}
      viewMode="unified"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe('CompareHeader', () => {
  it('показывает обе ревизии и общую статистику', () => {
    renderHeader();

    expect(screen.getByText('origin/main')).toBeInTheDocument();
    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.getByText('+120')).toBeInTheDocument();
    expect(screen.getByText('−12')).toBeInTheDocument();
  });

  it('склоняет количество файлов', () => {
    renderHeader({ summary: summary({ files: Array.from({ length: 3 }, () => null) as never }) });

    expect(screen.getByText('3 файла')).toBeInTheDocument();
  });

  it('клик по ревизии просит открыть пикер нужной стороны', async () => {
    const handlers = renderHeader();

    await userEvent.click(screen.getByText('origin/main'));
    expect(handlers.onPickRevision).toHaveBeenCalledWith('base');

    await userEvent.click(screen.getByText('feature'));
    expect(handlers.onPickRevision).toHaveBeenCalledWith('compare');
  });

  it('переключает режим отображения', async () => {
    const handlers = renderHeader();

    await userEvent.click(screen.getByRole('button', { name: 'Двумя колонками' }));

    expect(handlers.onViewModeChange).toHaveBeenCalledWith('split');
  });

  it('текущий режим помечен как нажатый', () => {
    renderHeader({ viewMode: 'split' });

    expect(screen.getByRole('button', { name: 'Двумя колонками' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('во время загрузки кнопка обновления заблокирована', () => {
    renderHeader({ loading: true });

    expect(screen.getByRole('button', { name: 'Перечитать сравнение' })).toBeDisabled();
  });

  it('сворачивает и разворачивает все файлы разом', async () => {
    const handlers = renderHeader({ summary: summary({ files: Array.from({ length: 3 }, () => null) as never }) });

    await userEvent.click(screen.getByRole('button', { name: 'Свернуть все файлы' }));
    await userEvent.click(screen.getByRole('button', { name: 'Развернуть все файлы' }));

    expect(handlers.onCollapseAll).toHaveBeenCalledTimes(1);
    expect(handlers.onExpandAll).toHaveBeenCalledTimes(1);
  });

  it('без файлов сворачивать нечего — кнопки заблокированы', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Свернуть все файлы' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Развернуть все файлы' })).toBeDisabled();
  });

  it('без remote про свежесть ссылок не пишет', () => {
    renderHeader();

    expect(screen.queryByText(/ссылки с сервера/)).not.toBeInTheDocument();
  });

  it('предупреждает, что ссылки с сервера давно не обновлялись', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const { container } = render(
      <CompareHeader
        summary={summary()}
        fetch={{ inProgress: false, hasRemote: true, lastFetchedAt: twoDaysAgo }}
        loading={false}
        viewMode="unified"
        onViewModeChange={vi.fn()}
        onCollapseAll={vi.fn()}
        onExpandAll={vi.fn()}
        onPickRevision={vi.fn()}
        onSwap={vi.fn()}
        onReload={vi.fn()}
        onFetch={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 дня назад/)).toBeInTheDocument();
    expect(container.querySelector('.gs-fetch--stale')).toBeInTheDocument();
  });

  it('во время fetch кнопка заблокирована и говорит о процессе', () => {
    render(
      <CompareHeader
        summary={summary()}
        fetch={{ inProgress: true, hasRemote: true }}
        loading={false}
        viewMode="unified"
        onViewModeChange={vi.fn()}
        onCollapseAll={vi.fn()}
        onExpandAll={vi.fn()}
        onPickRevision={vi.fn()}
        onSwap={vi.fn()}
        onReload={vi.fn()}
        onFetch={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /обновляем/ })).toBeDisabled();
  });

  it('меняет ревизии местами', async () => {
    const handlers = renderHeader();

    await userEvent.click(screen.getByRole('button', { name: 'Поменять ревизии местами' }));

    expect(handlers.onSwap).toHaveBeenCalled();
  });

  it('без сравнения предлагает выбрать ревизии', () => {
    renderHeader({ summary: null });

    expect(screen.getAllByText('выбрать…')).toHaveLength(2);
  });
});
