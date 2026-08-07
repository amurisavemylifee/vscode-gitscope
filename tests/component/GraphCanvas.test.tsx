import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { GraphNode } from '@shared/graph/model';
import { GraphCanvas } from '../../webview/graph/components/GraphCanvas';

/*
 * jsdom не считает реальную геометрию — `@tanstack/react-virtual` в таком окружении
 * не рендерит ни одной видимой строки (высота контейнера всегда 0). Поэтому здесь
 * проверяется только поведение вокруг подгрузки истории; содержимое самой строки
 * покрыто прямым рендером `GraphRow` в `GraphRow.test.tsx` — тем же приёмом, каким
 * `DiffLines.test.tsx` тестирует строки диффа отдельно от `DiffCanvas`.
 */
const node = (sha: string, subject: string): GraphNode => ({
  commit: { sha, shortSha: sha.slice(0, 7), subject, authorName: 'Тарас', authoredAt: '2026-01-01T10:00:00+03:00', parents: [] },
  lane: 0,
  parentEdges: [],
  branches: [],
  tags: [],
  stashes: [],
});

const nodes = [node('a'.repeat(40), 'первый'), node('b'.repeat(40), 'второй'), node('c'.repeat(40), 'третий')];

describe('GraphCanvas', () => {
  it('показывает шапку колонок — она задаёт структуру всей таблицы', () => {
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore={false} loading={false} onSelect={() => undefined} onLoadMore={() => undefined} />,
    );

    for (const column of ['Граф', 'Коммит', 'Автор', 'Когда', 'SHA']) {
      expect(screen.getByText(column)).toBeInTheDocument();
    }
  });

  it('список объявлен как listbox с доступным именем', () => {
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore={false} loading={false} onSelect={() => undefined} onLoadMore={() => undefined} />,
    );

    expect(screen.getByRole('listbox', { name: 'Коммиты' })).toBeInTheDocument();
  });

  it('во время догрузки показывает индикатор', () => {
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore loading onSelect={() => undefined} onLoadMore={() => undefined} />,
    );

    expect(screen.getByText('Загружаем историю…')).toBeInTheDocument();
  });

  it('короткий список сразу упирается в порог подгрузки и просит ещё историю', async () => {
    const onLoadMore = vi.fn();
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore loading={false} onSelect={() => undefined} onLoadMore={onLoadMore} />,
    );

    await waitFor(() => expect(onLoadMore).toHaveBeenCalled());
  });

  it('не просит ещё историю, если её больше нет', async () => {
    const onLoadMore = vi.fn();
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore={false} loading={false} onSelect={() => undefined} onLoadMore={onLoadMore} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('не просит ещё историю, пока предыдущая загрузка не завершилась', async () => {
    const onLoadMore = vi.fn();
    render(
      <GraphCanvas nodes={nodes} selectedSha={null} hasMore loading onSelect={() => undefined} onLoadMore={onLoadMore} />,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
