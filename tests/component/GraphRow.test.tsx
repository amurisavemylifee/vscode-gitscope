import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { GraphRow, ROW_HEIGHT } from '../../webview/graph/components/GraphRow';
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

  it('рисует аватар автора с его инициалами', () => {
    const { container } = render(
      <GraphRow
        node={node({ commit: { ...node().commit, authorName: 'Тарас Шашурин' } })}
        rowLanes={rowLanes}
        laneCount={1}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    expect(container.querySelector('.gs-avatar')).toHaveTextContent('ТШ');
  });

  it('клик по строке выбирает коммит', async () => {
    const onSelect = vi.fn();
    render(<GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('option', { name: /Первый коммит/ }));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'commit', commit: node().commit } satisfies GraphEntity);
  });

  it('выбранная строка помечена и для screen reader, и классом', () => {
    const { container } = render(
      <GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected onSelect={() => undefined} />,
    );

    expect(screen.getByRole('option', { selected: true })).toBeInTheDocument();
    expect(container.querySelector('.gs-grow--selected')).not.toBeNull();
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

  it('merge-коммит рисуется кольцом, обычный — заливкой', () => {
    const plain = render(
      <GraphRow node={node()} rowLanes={rowLanes} laneCount={1} selected={false} onSelect={() => undefined} />,
    );
    expect(plain.container.querySelector('.gs-grow__dot--merge')).toBeNull();
    plain.unmount();

    const merge = render(
      <GraphRow
        node={node({ commit: { ...node().commit, parents: ['b'.repeat(40), 'c'.repeat(40)] } })}
        rowLanes={rowLanes}
        laneCount={1}
        selected={false}
        onSelect={() => undefined}
      />,
    );
    expect(merge.container.querySelector('.gs-grow__dot--merge')).not.toBeNull();
  });

  it('переход в чужую дорожку рисуется кривой, а в свою — прямой линией', () => {
    const diagonal = render(
      <GraphRow
        node={node()}
        rowLanes={{ ownLane: 0, segments: [{ lane: 2, part: 'bottom' }] }}
        laneCount={3}
        selected={false}
        onSelect={() => undefined}
      />,
    );
    // Кривая Безье: путь, а не отрезок — иначе на плотной истории получается частокол углов.
    expect(diagonal.container.querySelector('.gs-grow__lanes path')).not.toBeNull();
    diagonal.unmount();

    const straight = render(
      <GraphRow
        node={node()}
        rowLanes={{ ownLane: 0, segments: [{ lane: 0, part: 'bottom' }] }}
        laneCount={1}
        selected={false}
        onSelect={() => undefined}
      />,
    );
    expect(straight.container.querySelector('.gs-grow__lanes path')).toBeNull();
    expect(straight.container.querySelectorAll('.gs-grow__lanes line')).toHaveLength(1);
  });

  it('рисует верхний и сквозной отрезки вертикально', () => {
    const { container } = render(
      <GraphRow
        node={node()}
        rowLanes={{
          ownLane: 1,
          segments: [
            { lane: 1, part: 'top' },
            { lane: 0, part: 'through' },
          ],
        }}
        laneCount={2}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    const lines = container.querySelectorAll('.gs-grow__lanes line');
    expect(lines).toHaveLength(2);
    // top — от верха до середины строки, through — на всю её высоту.
    expect(lines[0]).toHaveAttribute('y1', '0');
    expect(lines[0]).toHaveAttribute('y2', String(ROW_HEIGHT / 2));
    expect(lines[1]).toHaveAttribute('y1', '0');
    expect(lines[1]).toHaveAttribute('y2', String(ROW_HEIGHT));
  });
});
