import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphRef } from '@shared/graph/model';
import type { GraphRefFilter } from '@shared/graphProtocol';
import { BranchFilter } from '../../webview/graph/components/BranchFilter';

const refs: GraphRef[] = [
  { kind: 'head', name: 'main', sha: 'a'.repeat(40), isCurrent: true },
  { kind: 'head', name: 'feature', sha: 'b'.repeat(40), isCurrent: false },
  { kind: 'remote', name: 'origin/main', sha: 'a'.repeat(40), isCurrent: false },
  { kind: 'tag', name: 'v1.0.0', sha: 'c'.repeat(40), isCurrent: false },
];

const defaultFilter: GraphRefFilter = { mode: 'default', selectedRefs: [] };

describe('BranchFilter', () => {
  it('не показывает теги в списке веток', () => {
    render(
      <BranchFilter availableRefs={refs} includedRefs={['main']} filter={defaultFilter} onChange={() => undefined} />,
    );

    expect(screen.queryByText('v1.0.0')).not.toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('origin/main')).toBeInTheDocument();
  });

  it('поиск фильтрует список по подстроке', async () => {
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main']}
        filter={defaultFilter}
        onChange={() => undefined}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText('Поиск веток…'), 'feat');

    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.queryByText('main')).not.toBeInTheDocument();
  });

  it('чекбокс отражает includedRefs, пока фильтр не custom', () => {
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main']}
        filter={defaultFilter}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'main' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'feature' })).not.toBeChecked();
  });

  it('снятие галочки с дефолтной ветки переключает фильтр в custom, исключая её', async () => {
    const onChange = vi.fn();
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main', 'feature']}
        filter={defaultFilter}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'main' }));

    expect(onChange).toHaveBeenCalledWith({ mode: 'custom', selectedRefs: ['feature'] });
  });

  it('добавление ветки в custom-режиме дописывает её в список', async () => {
    const onChange = vi.fn();
    const customFilter: GraphRefFilter = { mode: 'custom', selectedRefs: ['main'] };
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main']}
        filter={customFilter}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'feature' }));

    expect(onChange).toHaveBeenCalledWith({ mode: 'custom', selectedRefs: ['main', 'feature'] });
  });

  it('«показать все» переключает режим all и блокирует остальные чекбоксы', async () => {
    const onChange = vi.fn();
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main']}
        filter={defaultFilter}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Показать все ветки (--all)' }));

    expect(onChange).toHaveBeenCalledWith({ mode: 'all', selectedRefs: [] });
  });

  it('снятие «показать все» возвращает режим default', async () => {
    const onChange = vi.fn();
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main', 'feature', 'origin/main']}
        filter={{ mode: 'all', selectedRefs: [] }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Показать все ветки (--all)' }));

    expect(onChange).toHaveBeenCalledWith({ mode: 'default', selectedRefs: [] });
  });

  it('в режиме all чекбоксы веток задизейблены', () => {
    render(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main', 'feature', 'origin/main']}
        filter={{ mode: 'all', selectedRefs: [] }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'main' })).toBeDisabled();
  });

  it('кнопка сброса появляется только в custom и возвращает к default', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BranchFilter availableRefs={refs} includedRefs={['main']} filter={defaultFilter} onChange={onChange} />,
    );
    expect(screen.queryByRole('button', { name: 'Сбросить к дефолту' })).not.toBeInTheDocument();

    rerender(
      <BranchFilter
        availableRefs={refs}
        includedRefs={['main']}
        filter={{ mode: 'custom', selectedRefs: ['main'] }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить к дефолту' }));

    expect(onChange).toHaveBeenCalledWith({ mode: 'default', selectedRefs: [] });
  });
});
