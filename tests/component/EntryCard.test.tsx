import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HistoryEntry } from '@shared/historyModel';
import { EntryCard, entryCardHeight, entryCardId } from '../../webview/history/components/EntryCard';

const commit = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'a'.repeat(40),
  kind: 'commit',
  path: 'src/app.ts',
  status: 'modified',
  insertions: 12,
  deletions: 3,
  binary: false,
  sha: 'a'.repeat(40),
  shortSha: 'aaaaaaa',
  subject: 'fix: гонка при загрузке',
  authorName: 'Аня Петрова',
  authoredAt: '2026-08-12T01:19:02+02:00',
  ...overrides,
});

const renderCard = (entry: HistoryEntry, overrides: Partial<Parameters<typeof EntryCard>[0]> = {}) =>
  render(
    <EntryCard
      entry={entry}
      selected={false}
      first={false}
      last={false}
      onSelect={() => undefined}
      onCopySha={() => Promise.resolve()}
      {...overrides}
    />,
  );

describe('EntryCard', () => {
  it('показывает тему, автора, обе даты, SHA и числа строк', () => {
    renderCard(commit());

    expect(screen.getByText('fix: гонка при загрузке')).toBeInTheDocument();
    expect(screen.getByText('Аня Петрова')).toBeInTheDocument();
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument();
    // Относительное время отвечает «когда примерно», абсолютное — «когда точно».
    expect(screen.getByText('12 авг 2026, 01:19')).toBeInTheDocument();
    expect(screen.getByText('+12')).toBeInTheDocument();
    expect(screen.getByText('−3')).toBeInTheDocument();
  });

  it('помечает значком статуса каждую версию, включая обычную правку', () => {
    const { unmount } = renderCard(commit());
    expect(screen.getByLabelText('Файл изменён')).toBeInTheDocument();
    unmount();

    renderCard(commit({ status: 'added' }));
    expect(screen.getByLabelText('Файл добавлен')).toBeInTheDocument();
  });

  it('у переименования показывает прежнее имя файла', () => {
    renderCard(commit({ status: 'renamed', previousPath: 'src/old.ts' }));

    expect(screen.getByText('src/old.ts')).toBeInTheDocument();
    expect(screen.getByTitle('Прежнее имя файла: src/old.ts')).toBeInTheDocument();
  });

  it('рабочую копию называет по-своему и не выдумывает ей автора', () => {
    renderCard(commit({ id: 'working', kind: 'working', subject: undefined, authorName: undefined }));

    expect(screen.getByText('Рабочая копия')).toBeInTheDocument();
    expect(screen.getByText('не закоммичено')).toBeInTheDocument();
    expect(screen.getByText('на диске')).toBeInTheDocument();
  });

  it('файл вне git отличает от несохранённой правки', () => {
    renderCard(commit({ id: 'working', kind: 'working', untracked: true }));

    expect(screen.getByText('ещё не в git')).toBeInTheDocument();
  });

  it('у слияния вместо нулей пишет, что это слияние', () => {
    renderCard(commit({ merge: true, insertions: 0, deletions: 0 }));

    expect(screen.getByText('слияние')).toBeInTheDocument();
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  it('двоичному файлу вместо чисел строк пишет, что он двоичный', () => {
    renderCard(commit({ binary: true }));

    expect(screen.getByText('двоичный')).toBeInTheDocument();
    expect(screen.queryByText('+12')).not.toBeInTheDocument();
  });

  it('копирует SHA по клику на него, не трогая выбор версии', async () => {
    const onCopySha = vi.fn(() => Promise.resolve());
    const onSelect = vi.fn();
    renderCard(commit(), { onCopySha, onSelect });

    await userEvent.click(screen.getByTitle('Скопировать SHA коммита'));

    expect(onCopySha).toHaveBeenCalledOnce();
    // Клик по SHA — про буфер обмена, а не про переход к другой версии.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('после копирования подтверждает это на самой надписи', async () => {
    renderCard(commit());

    await userEvent.click(screen.getByTitle('Скопировать SHA коммита'));

    expect(await screen.findByTitle('SHA скопирован')).toHaveTextContent('aaaaaaa');
  });

  it('у рабочей копии копировать нечего', () => {
    renderCard(commit({ id: 'working', kind: 'working' }));

    expect(screen.queryByTitle('Скопировать SHA коммита')).not.toBeInTheDocument();
  });

  it('сообщает о выборе и отмечает выделение для чтения с экрана', async () => {
    const onSelect = vi.fn();
    renderCard(commit(), { onSelect, selected: true });

    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).toHaveAttribute('id', entryCardId('a'.repeat(40)));

    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('entryCardHeight', () => {
  it('переименование занимает больше места: у него есть строка с прежним именем', () => {
    expect(entryCardHeight(commit({ previousPath: 'src/old.ts' }))).toBeGreaterThan(entryCardHeight(commit()));
  });
});
