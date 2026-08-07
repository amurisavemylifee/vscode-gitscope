import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { GraphRow } from '../../webview/graph/components/GraphRow';
import type { RowLanes } from '../../webview/graph/lanes';

const node = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  commit: {
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    subject: 'Первый коммит',
    authorName: 'Тарас',
    authoredAt: '2026-01-01T10:00:00+03:00',
    parents: [],
  },
  lane: 0,
  parentEdges: [],
  branches: [],
  tags: [],
  stashes: [],
  ...overrides,
});

const rowLanes: RowLanes = { ownLane: 0, segments: [] };

describe('GraphRow', () => {
  it('показывает sha, тему коммита и автора', () => {
    render(
      <GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={() => undefined} />,
    );

    expect(screen.getByText('aaaaaaa')).toBeInTheDocument();
    expect(screen.getByText('Первый коммит')).toBeInTheDocument();
    expect(screen.getByText('Тарас')).toBeInTheDocument();
  });

  it('клик по строке выбирает коммит', async () => {
    const onSelect = vi.fn();
    render(<GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /Первый коммит/ }));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'commit', commit: node().commit } satisfies GraphEntity);
  });

  it('Enter на сфокусированной строке тоже выбирает коммит', async () => {
    const onSelect = vi.fn();
    render(<GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={onSelect} />);

    screen.getByRole('button', { name: /Первый коммит/ }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith({ kind: 'commit', commit: node().commit } satisfies GraphEntity);
  });

  it('Пробел на сфокусированной строке тоже выбирает коммит', async () => {
    const onSelect = vi.fn();
    render(<GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={onSelect} />);

    screen.getByRole('button', { name: /Первый коммит/ }).focus();
    await userEvent.keyboard(' ');

    expect(onSelect).toHaveBeenCalledWith({ kind: 'commit', commit: node().commit } satisfies GraphEntity);
  });

  it('прочие клавиши строку не выбирают', async () => {
    const onSelect = vi.fn();
    render(<GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={onSelect} />);

    screen.getByRole('button', { name: /Первый коммит/ }).focus();
    await userEvent.keyboard('a');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('показывает бейджи веток, тегов и стешей', () => {
    render(
      <GraphRow
        node={node({
          branches: [{ kind: 'head', name: 'main', sha: 'a'.repeat(40), isCurrent: true }],
          tags: [{ kind: 'tag', name: 'v1.0.0', sha: 'a'.repeat(40), isCurrent: false }],
          stashes: [
            {
              index: 0,
              ref: 'stash@{0}',
              sha: 'b'.repeat(40),
              baseSha: 'a'.repeat(40),
              message: 'WIP',
              authorName: 'Тарас',
              authoredAt: '2026-01-02T10:00:00+03:00',
            },
          ],
        })}
        rowLanes={rowLanes}
        laneCount={1}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('stash@{0}')).toBeInTheDocument();
  });

  it('клик по бейджу ветки выбирает именно ветку, а не коммит строки', async () => {
    const onSelect = vi.fn();
    const branch = { kind: 'head' as const, name: 'main', sha: 'a'.repeat(40), isCurrent: true };
    render(
      <GraphRow
        node={node({ branches: [branch] })}
        rowLanes={rowLanes}
        laneCount={1}
        selected={false}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText('main'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'branch', ref: branch } satisfies GraphEntity);
  });

  it('выбранная строка получает модификатор', () => {
    const { container } = render(
      <GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected onSelect={() => undefined} />,
    );

    expect(container.querySelector('.gs-grow--selected')).not.toBeNull();
  });

  it('локальная не текущая ветка и удалённая ветка красятся по-разному', () => {
    const localBranch = { kind: 'head' as const, name: 'feature', sha: 'a'.repeat(40), isCurrent: false };
    const remoteBranch = { kind: 'remote' as const, name: 'origin/feature', sha: 'a'.repeat(40), isCurrent: false };
    const { container } = render(
      <GraphRow
        node={node({ branches: [localBranch, remoteBranch] })}
        rowLanes={rowLanes}
        laneCount={1}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    expect(container.querySelector('.gs-ref-badge--branch')).not.toBeNull();
    expect(container.querySelector('.gs-ref-badge--remote')).not.toBeNull();
  });

  it('рисует верхний, сквозной и нижний отрезки дорожек', () => {
    const lanes: RowLanes = {
      ownLane: 1,
      segments: [
        { lane: 1, part: 'top' },
        { lane: 0, part: 'through' },
        { lane: 2, part: 'bottom' },
      ],
    };
    const { container } = render(
      <GraphRow node={node()} rowLanes={lanes} laneCount={3} selected={false} onSelect={() => undefined} />,
    );

    const svgLines = container.querySelectorAll('.gs-grow__lanes line');
    expect(svgLines).toHaveLength(3);
    // top: вертикаль от 0 до половины высоты строки.
    expect(svgLines[0]).toHaveAttribute('y2', '14');
    // through: на всю высоту строки.
    expect(svgLines[1]).toHaveAttribute('y1', '0');
    expect(svgLines[1]).toHaveAttribute('y2', '28');
    // bottom: диагональ из своей дорожки (1) в чужую (2).
    expect(svgLines[2]).toHaveAttribute('x1', svgLines[0]?.getAttribute('x1'));
  });
});
