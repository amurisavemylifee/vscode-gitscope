import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMessage = vi.fn();
let savedState: unknown;

// Настоящий bridge живёт только внутри webview: acquireVsCodeApi даёт сам
// VS Code, и вызывать его можно ровно один раз за жизнь документа.
vi.stubGlobal('acquireVsCodeApi', () => ({
  postMessage,
  getState: () => savedState,
  setState: (value: unknown) => {
    savedState = value;
  },
}));

const { bridge, persistedState } = await import('../../webview/api/bridge');

interface RequestEnvelope {
  readonly channel: string;
  readonly kind: string;
  readonly id: number;
  readonly method: string;
}

const lastEnvelope = () => postMessage.mock.calls.at(-1)?.[0] as RequestEnvelope;

const reply = (id: number, result: unknown) => {
  window.dispatchEvent(
    new MessageEvent('message', { data: { channel: 'gitscope', kind: 'result', id, result } }),
  );
};

describe('bridge', () => {
  beforeEach(() => {
    postMessage.mockClear();
    savedState = undefined;
  });

  it('отправляет запрос в extension host и разрешается его ответом', async () => {
    const pending = bridge.request('comparison/context', {
      path: 'a.ts',
      side: 'compare',
      startLine: 1,
      endLine: 3,
    });

    const envelope = lastEnvelope();
    expect(envelope).toMatchObject({ channel: 'gitscope', kind: 'request', method: 'comparison/context' });

    reply(envelope.id, ['одна', 'две', 'три']);

    await expect(pending).resolves.toEqual(['одна', 'две', 'три']);
  });

  it('передаёт уведомления подписчикам', () => {
    const handler = vi.fn();
    const unsubscribe = bridge.on('comparison/loading', handler);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: 'gitscope', kind: 'notify', method: 'comparison/loading', payload: { loading: true } },
      }),
    );

    expect(handler).toHaveBeenCalledWith({ loading: true });
    unsubscribe();
  });

  it('чужие сообщения в окне игнорирует', () => {
    const handler = vi.fn();
    const unsubscribe = bridge.on('comparison/loading', handler);

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'что-то-от-другого-расширения' } }));

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('persistedState', () => {
  it('на чистой панели отдаёт пустой объект', () => {
    expect(persistedState.read()).toEqual({});
  });

  it('дописывает поля, а не затирает сохранённое целиком', () => {
    persistedState.write({ viewMode: 'split' });
    persistedState.write({ treeWidth: 320 });

    expect(persistedState.read()).toEqual({ viewMode: 'split', treeWidth: 320 });
  });

  it('переживает мусор вместо сохранённого состояния', () => {
    savedState = 'не объект';

    expect(persistedState.read()).toEqual({});
  });
});
