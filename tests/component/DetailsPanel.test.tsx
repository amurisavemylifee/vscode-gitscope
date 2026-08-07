import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphEntity } from '@shared/graph/model';
import { DetailsPanel } from '../../webview/graph/components/DetailsPanel';

describe('DetailsPanel', () => {
  it('без выбора предлагает кликнуть по сущности', () => {
    render(<DetailsPanel entity={null} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('Ничего не выбрано')).toBeInTheDocument();
  });

  it('коммит: показывает sha, автора и кнопки родителей', async () => {
    const onJumpToSha = vi.fn();
    const entity: GraphEntity = {
      kind: 'commit',
      commit: {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        subject: 'Тема коммита',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
        parents: ['b'.repeat(40)],
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={onJumpToSha} />);

    expect(screen.getByText('Тема коммита')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(40))).toBeInTheDocument();

    await userEvent.click(screen.getByText('b'.repeat(40).slice(0, 12)));
    expect(onJumpToSha).toHaveBeenCalledWith('b'.repeat(40));
  });

  it('merge-коммит с несколькими родителями показывает «Родители» во множественном числе', () => {
    const entity: GraphEntity = {
      kind: 'commit',
      commit: {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        subject: 'Мердж',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
        parents: ['b'.repeat(40), 'c'.repeat(40)],
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('Родители')).toBeInTheDocument();
  });

  it('корневой коммит показывает пояснение вместо списка родителей', () => {
    const entity: GraphEntity = {
      kind: 'commit',
      commit: {
        sha: 'a'.repeat(40),
        shortSha: 'aaaaaaa',
        subject: 'Корневой',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
        parents: [],
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('Корневой коммит — родителей нет.')).toBeInTheDocument();
  });

  it('ветка: показывает тип и позволяет перейти к коммиту', async () => {
    const onJumpToSha = vi.fn();
    const entity: GraphEntity = {
      kind: 'branch',
      ref: { kind: 'remote', name: 'origin/main', sha: 'c'.repeat(40), isCurrent: false },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={onJumpToSha} />);

    expect(screen.getByText('origin/main')).toBeInTheDocument();
    expect(screen.getByText('удалённая ветка')).toBeInTheDocument();

    await userEvent.click(screen.getByText('c'.repeat(40).slice(0, 12)));
    expect(onJumpToSha).toHaveBeenCalledWith('c'.repeat(40));
  });

  it('локальная не текущая ветка с известным коммитом показывает тему, автора и дату', () => {
    const entity: GraphEntity = {
      kind: 'branch',
      ref: {
        kind: 'head',
        name: 'feature',
        sha: 'c'.repeat(40),
        isCurrent: false,
        subject: 'коммит в фиче',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('локальная ветка')).toBeInTheDocument();
    expect(screen.getByText('коммит в фиче')).toBeInTheDocument();
    expect(screen.getAllByText('Тарас').length).toBeGreaterThan(0);
  });

  it('тег без сообщения помечается как лёгкий', () => {
    const entity: GraphEntity = {
      kind: 'tag',
      ref: { kind: 'tag', name: 'v1.0.0', sha: 'd'.repeat(40), isCurrent: false },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Лёгкий тег — без сообщения.')).toBeInTheDocument();
  });

  it('аннотированный тег показывает сообщение, автора и дату', () => {
    const entity: GraphEntity = {
      kind: 'tag',
      ref: {
        kind: 'tag',
        name: 'v2.0.0',
        sha: 'd'.repeat(40),
        isCurrent: false,
        subject: 'релиз 2.0',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('релиз 2.0')).toBeInTheDocument();
    expect(screen.getByText('Тарас')).toBeInTheDocument();
  });

  it('стеш: показывает сообщение и кнопку базового коммита', async () => {
    const onJumpToSha = vi.fn();
    const entity: GraphEntity = {
      kind: 'stash',
      stash: {
        index: 0,
        ref: 'stash@{0}',
        sha: 'e'.repeat(40),
        baseSha: 'f'.repeat(40),
        message: 'WIP на main',
        authorName: 'Тарас',
        authoredAt: '2026-01-03T10:00:00+03:00',
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={onJumpToSha} />);

    expect(screen.getByText('WIP на main')).toBeInTheDocument();
    expect(screen.getByText('stash@{0}')).toBeInTheDocument();

    await userEvent.click(screen.getByText('f'.repeat(40).slice(0, 12)));
    expect(onJumpToSha).toHaveBeenCalledWith('f'.repeat(40));
  });

  it('стеш без определённого базового коммита не показывает кнопку перехода', () => {
    const entity: GraphEntity = {
      kind: 'stash',
      stash: {
        index: 1,
        ref: 'stash@{1}',
        sha: 'e'.repeat(40),
        baseSha: undefined,
        message: 'WIP без базы',
        authorName: 'Тарас',
        authoredAt: '2026-01-03T10:00:00+03:00',
      },
    };
    render(<DetailsPanel entity={entity} width={300} onJumpToSha={() => undefined} />);

    expect(screen.getByText('WIP без базы')).toBeInTheDocument();
    expect(screen.queryByText('Сделан поверх')).not.toBeInTheDocument();
  });
});
