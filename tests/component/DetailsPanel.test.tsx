import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { DetailsPanel } from '../../webview/graph/components/DetailsPanel';

const writeText = vi.fn(async () => undefined);
vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

const commitEntity = (overrides: Partial<GraphEntity & { kind: 'commit' }> = {}): GraphEntity => ({
  kind: 'commit',
  commit: {
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    subject: 'Тема коммита',
    authorName: 'Тарас',
    authoredAt: '2026-01-01T10:00:00+03:00',
    parents: ['b'.repeat(40)],
  },
  ...overrides,
});

const node = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  commit: {
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    subject: 'Тема коммита',
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

/** Панель почти везде вызывается с одинаковой обвязкой — здесь только различия. */
const renderPanel = (
  entity: GraphEntity | null,
  extra: { node?: GraphNode | null; onJumpToSha?: () => void; onSelect?: () => void } = {},
) =>
  render(
    <DetailsPanel
      entity={entity}
      node={extra.node ?? null}
      width={300}
      onJumpToSha={extra.onJumpToSha ?? (() => undefined)}
      onSelect={extra.onSelect ?? (() => undefined)}
    />,
  );

describe('DetailsPanel', () => {
  beforeEach(() => writeText.mockClear());

  it('без выбора подсказывает, что делать, включая навигацию клавишами', () => {
    renderPanel(null);

    expect(screen.getByText('Ничего не выбрано')).toBeInTheDocument();
    expect(screen.getByText(/По графу можно ходить клавишами/)).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('коммит: показывает полный sha, автора и кнопки родителей', async () => {
    const onJumpToSha = vi.fn();
    renderPanel(commitEntity(), { onJumpToSha });

    expect(screen.getByText('Тема коммита')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(40))).toBeInTheDocument();

    await userEvent.click(screen.getByText('b'.repeat(8)));
    expect(onJumpToSha).toHaveBeenCalledWith('b'.repeat(40));
  });

  it('merge-коммит подписан как merge и показывает всех родителей', () => {
    renderPanel(
      commitEntity({
        commit: { ...(commitEntity() as { commit: GraphNode['commit'] }).commit, parents: ['b'.repeat(40), 'c'.repeat(40)] },
      }),
    );

    expect(screen.getByText('Merge-коммит')).toBeInTheDocument();
    expect(screen.getByText('Родители')).toBeInTheDocument();
    expect(screen.getByText('b'.repeat(8))).toBeInTheDocument();
    expect(screen.getByText('c'.repeat(8))).toBeInTheDocument();
  });

  it('копирует sha в буфер обмена и подтверждает это', async () => {
    renderPanel(commitEntity());

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать SHA' }));

    expect(writeText).toHaveBeenCalledWith('a'.repeat(40));
    await waitFor(() => expect(screen.getByRole('button', { name: 'SHA скопирован' })).toBeInTheDocument());
  });

  it('недоступный буфер обмена не роняет панель', async () => {
    writeText.mockRejectedValueOnce(new Error('нет доступа'));
    renderPanel(commitEntity());

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать SHA' }));

    expect(screen.getByText('Тема коммита')).toBeInTheDocument();
  });

  it('корневой коммит показывает пояснение вместо списка родителей', () => {
    renderPanel(commitEntity({ commit: { ...node().commit, subject: 'Корневой', parents: [] } }));

    expect(screen.getByText('Корневой коммит — родителей нет.')).toBeInTheDocument();
  });

  it('ветка с сервера подписана как таковая и ведёт к своему коммиту', async () => {
    const onJumpToSha = vi.fn();
    const entity: GraphEntity = {
      kind: 'branch',
      ref: { kind: 'remote', name: 'origin/main', sha: 'c'.repeat(40), isCurrent: false },
    };
    renderPanel(entity, { onJumpToSha });

    expect(screen.getByText('origin/main')).toBeInTheDocument();
    expect(screen.getByText('Ветка с сервера')).toBeInTheDocument();

    await userEvent.click(screen.getByText('c'.repeat(40)));
    expect(onJumpToSha).toHaveBeenCalledWith('c'.repeat(40));
  });

  it('текущая локальная ветка выделена отдельным заголовком и показывает свой коммит', () => {
    const entity: GraphEntity = {
      kind: 'branch',
      ref: {
        kind: 'head',
        name: 'feature',
        sha: 'c'.repeat(40),
        isCurrent: true,
        subject: 'коммит в фиче',
        authorName: 'Тарас',
        authoredAt: '2026-01-01T10:00:00+03:00',
      },
    };
    renderPanel(entity);

    expect(screen.getByText('Текущая ветка')).toBeInTheDocument();
    expect(screen.getByText('коммит в фиче')).toBeInTheDocument();
  });

  it('тег без сообщения помечается как лёгкий', () => {
    renderPanel({ kind: 'tag', ref: { kind: 'tag', name: 'v1.0.0', sha: 'd'.repeat(40), isCurrent: false } });

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Лёгкий тег — без сообщения.')).toBeInTheDocument();
  });

  it('аннотированный тег показывает сообщение и автора', () => {
    renderPanel({
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
    });

    expect(screen.getByText('релиз 2.0')).toBeInTheDocument();
    expect(screen.getByText('Тарас')).toBeInTheDocument();
    expect(screen.queryByText('Лёгкий тег — без сообщения.')).not.toBeInTheDocument();
  });

  it('стеш: показывает сообщение и ведёт к базовому коммиту', async () => {
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
    renderPanel(entity, { onJumpToSha });

    expect(screen.getByText('WIP на main')).toBeInTheDocument();
    expect(screen.getByText('stash@{0}')).toBeInTheDocument();

    await userEvent.click(screen.getByText('f'.repeat(40)));
    expect(onJumpToSha).toHaveBeenCalledWith('f'.repeat(40));
  });

  it('стеш без базового коммита не показывает переход', () => {
    renderPanel({
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
    });

    expect(screen.getByText('WIP без базы')).toBeInTheDocument();
    expect(screen.queryByText('Сделан поверх')).not.toBeInTheDocument();
  });

  describe('ссылки на выбранном коммите', () => {
    it('показывает ветки и теги, стоящие на этом коммите', async () => {
      const onSelect = vi.fn();
      const branch = { kind: 'head' as const, name: 'main', sha: 'a'.repeat(40), isCurrent: true };
      renderPanel(commitEntity(), { node: node({ branches: [branch] }), onSelect });

      expect(screen.getByText('На этом коммите')).toBeInTheDocument();

      await userEvent.click(screen.getByText('main'));
      expect(onSelect).toHaveBeenCalledWith({ kind: 'branch', ref: branch });
    });

    it('не дублирует бейджем ту самую ветку, которая уже выбрана', () => {
      const branch = { kind: 'head' as const, name: 'main', sha: 'a'.repeat(40), isCurrent: true };
      renderPanel({ kind: 'branch', ref: branch }, { node: node({ branches: [branch] }) });

      // Имя ветки показано один раз — как заголовок панели, а не ещё и бейджем.
      expect(screen.getAllByText('main')).toHaveLength(1);
      expect(screen.queryByText('На этом коммите')).not.toBeInTheDocument();
    });

    it('без узла в графе секция ссылок не рисуется', () => {
      renderPanel(commitEntity(), { node: null });

      expect(screen.queryByText('На этом коммите')).not.toBeInTheDocument();
    });
  });
});
