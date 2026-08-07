import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FilePatch } from '@shared/model';
import type { PatchState } from '../../webview/hooks/usePatches';

const highlightPatch = vi.fn();

vi.mock('../../webview/syntax/highlighter', () => ({
  highlightPatch: (...args: unknown[]) => highlightPatch(...args),
  highlightLines: vi.fn(async () => undefined),
  detectTheme: () => (document.body.dataset['vscodeThemeKind'] ?? '').includes('light') ? 'light-plus' : 'dark-plus',
}));

const { useSyntaxTheme, useSyntaxTokens } = await import('../../webview/hooks/useSyntaxTokens');

const patch = (overrides: Partial<FilePatch> = {}): FilePatch => ({
  path: 'src/a.ts',
  status: 'modified',
  binary: false,
  truncated: false,
  hunks: [
    {
      baseStart: 1,
      baseCount: 1,
      compareStart: 1,
      compareCount: 1,
      header: '',
      lines: [{ kind: 'context', text: 'const a = 1;', baseLine: 1, compareLine: 1 }],
    },
  ],
  ...overrides,
});

const ready = (value = patch()): PatchState => ({ status: 'ready', patch: value });
const tokens = { hunks: [[[{ content: 'const', color: '#569CD6', offset: 0 }]]] };

describe('useSyntaxTokens', () => {
  beforeEach(() => {
    highlightPatch.mockReset();
    highlightPatch.mockResolvedValue(tokens);
  });

  it('подсвечивает загруженные патчи', async () => {
    const patches = new Map<string, PatchState>([['src/a.ts', ready()]]);
    const { result } = renderHook(() => useSyntaxTokens(patches, 'dark-plus'));

    await waitFor(() => expect(result.current.get('src/a.ts')).toBe(tokens));
  });

  it('не трогает то, что подсвечивать нечем', async () => {
    const patches = new Map<string, PatchState>([
      ['bin', ready(patch({ path: 'logo.png', binary: true, hunks: [] }))],
      ['empty', ready(patch({ hunks: [] }))],
      ['loading', { status: 'loading' }],
    ]);
    renderHook(() => useSyntaxTokens(patches, 'dark-plus'));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(highlightPatch).not.toHaveBeenCalled();
  });

  it('каждый файл подсвечивается один раз, сколько бы раз ни перерисовалась панель', async () => {
    const patches = new Map<string, PatchState>([['src/a.ts', ready()]]);
    const { result, rerender } = renderHook(() => useSyntaxTokens(patches, 'dark-plus'));

    await waitFor(() => expect(result.current.size).toBe(1));
    rerender();
    rerender();

    expect(highlightPatch).toHaveBeenCalledTimes(1);
  });

  it('смена темы обесценивает посчитанные токены', async () => {
    const patches = new Map<string, PatchState>([['src/a.ts', ready()]]);
    const { result, rerender } = renderHook(({ theme }) => useSyntaxTokens(patches, theme), {
      initialProps: { theme: 'dark-plus' as const },
    });

    await waitFor(() => expect(result.current.size).toBe(1));

    rerender({ theme: 'light-plus' as never });

    await waitFor(() => expect(highlightPatch).toHaveBeenCalledTimes(2));
    expect(highlightPatch.mock.calls[1]?.[1]).toBe('light-plus');
  });

  it('файл, для которого подсветки нет, просто остаётся без токенов', async () => {
    highlightPatch.mockResolvedValue(undefined);
    const patches = new Map<string, PatchState>([['src/a.ts', ready()]]);
    const { result } = renderHook(() => useSyntaxTokens(patches, 'dark-plus'));

    await waitFor(() => expect(highlightPatch).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});

describe('useSyntaxTheme', () => {
  it('берёт тему из атрибута, который проставляет VS Code', () => {
    document.body.dataset['vscodeThemeKind'] = 'vscode-light';
    const { result } = renderHook(() => useSyntaxTheme());

    expect(result.current).toBe('light-plus');
    delete document.body.dataset['vscodeThemeKind'];
  });

  it('замечает переключение темы на лету', async () => {
    document.body.dataset['vscodeThemeKind'] = 'vscode-dark';
    const { result } = renderHook(() => useSyntaxTheme());
    expect(result.current).toBe('dark-plus');

    // MutationObserver в jsdom работает — меняем атрибут по-настоящему.
    act(() => {
      document.body.dataset['vscodeThemeKind'] = 'vscode-light';
    });

    await waitFor(() => expect(result.current).toBe('light-plus'));
    delete document.body.dataset['vscodeThemeKind'];
  });
});
