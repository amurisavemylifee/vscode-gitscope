import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StashEntry } from '@shared/stashModel';
import type { StashSummaryResult } from '@shared/stashProtocol';
import { StashCard, stashCardId, stashTitle } from '../../webview/stashes/components/StashCard';

const stash = (overrides: Partial<StashEntry> = {}): StashEntry => ({
  sha: 'a'.repeat(40),
  shortSha: 'aaaaaaa',
  ref: 'stash@{0}',
  message: 'правки формы логина',
  automatic: false,
  branch: 'main',
  authorName: 'Аня Петрова',
  createdAt: '2026-08-12T01:19:02+02:00',
  base: { sha: 'b'.repeat(40), shortSha: 'bbbbbbb', subject: 'Fix login redirect' },
  indexSha: 'c'.repeat(40),
  ...overrides,
});

const summary = (overrides: Partial<StashSummaryResult> = {}): StashSummaryResult => ({
  sha: 'a'.repeat(40),
  summary: { sha: 'a'.repeat(40), files: [], insertions: 42, deletions: 7 },
  error: null,
  ...overrides,
});

const renderCard = (entry: StashEntry, overrides: Partial<Parameters<typeof StashCard>[0]> = {}) =>
  render(
    <StashCard
      entry={entry}
      summary={summary({
        summary: {
          sha: 'a'.repeat(40),
          files: [
            { path: 'src/app.ts', status: 'modified', insertions: 42, deletions: 7, binary: false },
            { path: 'notes.md', status: 'added', insertions: 8, deletions: 0, binary: false, untracked: true },
          ],
          insertions: 42,
          deletions: 7,
        },
      })}
      selected={false}
      first={false}
      last={false}
      onSelect={() => undefined}
      onCopySha={() => Promise.resolve()}
      {...overrides}
    />,
  );

describe('StashCard', () => {
  it('показывает сообщение, ссылку, ветку, обе даты, автора и SHA', () => {
    renderCard(stash());

    expect(screen.getByText('правки формы логина')).toBeInTheDocument();
    expect(screen.getByText('stash@{0}')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('Аня Петрова')).toBeInTheDocument();
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument();
    // Относительное время отвечает «когда примерно», абсолютное — «когда точно».
    expect(screen.getByText('12 авг 2026, 01:19')).toBeInTheDocument();
  });

  it('показывает коммит, поверх которого сделан стеш', () => {
    renderCard(stash());

    expect(screen.getByText('bbbbbbb')).toBeInTheDocument();
    expect(screen.getByText('Fix login redirect')).toBeInTheDocument();
    expect(screen.getByTitle(`Стеш сделан поверх коммита ${'b'.repeat(40)}`)).toBeInTheDocument();
  });

  it('стеш без сообщения называет по ветке, а не темой базового коммита', () => {
    renderCard(stash({ message: '', automatic: true }));

    expect(screen.getByText('WIP на main')).toBeInTheDocument();
    // Тема базового коммита остаётся на своём месте, отдельной строкой.
    expect(screen.getByText('Fix login redirect')).toBeInTheDocument();
  });

  it('стеш без сообщения и без ветки не выдумывает себе названия', () => {
    expect(stashTitle(stash({ message: '', automatic: true, branch: undefined }))).toBe('Без сообщения');
  });

  it('отмечает стеш, в котором есть файлы вне git', () => {
    const { unmount } = renderCard(stash({ untrackedSha: 'd'.repeat(40) }));
    expect(screen.getByTitle('В стеше есть файлы, которых не было в git')).toBeInTheDocument();
    unmount();

    renderCard(stash());
    expect(screen.queryByTitle('В стеше есть файлы, которых не было в git')).not.toBeInTheDocument();
  });

  it('показывает числа файлов и строк, когда содержимое посчитано', () => {
    renderCard(stash());

    expect(screen.getByText('2 файла')).toBeInTheDocument();
    expect(screen.getByText('+42')).toBeInTheDocument();
    expect(screen.getByText('−7')).toBeInTheDocument();
  });

  it('пока содержимое считается, чисел не выдумывает', () => {
    renderCard(stash(), { summary: undefined });

    expect(screen.getByText('считаем…')).toBeInTheDocument();
    expect(screen.queryByText('+42')).not.toBeInTheDocument();
  });

  it('о непрочитанном стеше говорит прямо и держит причину под рукой', () => {
    renderCard(stash(), { summary: summary({ summary: null, error: { message: 'объект повреждён' } }) });

    expect(screen.getByText('не прочитан')).toBeInTheDocument();
    expect(screen.getByTitle('объект повреждён')).toBeInTheDocument();
  });

  it('копирует SHA по клику на него, не трогая выбор стеша', async () => {
    const onCopySha = vi.fn(() => Promise.resolve());
    const onSelect = vi.fn();
    renderCard(stash(), { onCopySha, onSelect });

    await userEvent.click(screen.getByTitle('Скопировать SHA стеша'));

    expect(onCopySha).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('сообщает о выборе и отмечает выделение для чтения с экрана', async () => {
    const onSelect = vi.fn();
    renderCard(stash(), { onSelect, selected: true });

    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).toHaveAttribute('id', stashCardId('a'.repeat(40)));

    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
