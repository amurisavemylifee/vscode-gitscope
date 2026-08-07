import { describe, expect, it, vi } from 'vitest';
import { RpcError, createRpcClient, createRpcServer, type RpcHandlers, type Transport } from '@shared/messaging';

type TestRequests = {
  echo: { params: { value: string }; result: string };
  hang: { params: Record<string, never>; result: string };
  boom: { params: Record<string, never>; result: string };
};

type TestNotifications = {
  ping: { at: number };
};

/** Две связанные стороны канала: то, что отправила одна, приходит другой. */
function createChannelPair() {
  const listeners = { client: new Set<(m: unknown) => void>(), server: new Set<(m: unknown) => void>() };

  const make = (self: 'client' | 'server', peer: 'client' | 'server'): Transport => ({
    post: (message) => {
      // postMessage всегда асинхронный — воспроизводим это, иначе тесты
      // проходили бы на порядке вызовов, которого в реальности нет.
      queueMicrotask(() => {
        for (const handler of listeners[peer]) {
          handler(message);
        }
      });
    },
    subscribe: (handler) => {
      listeners[self].add(handler);
      return () => listeners[self].delete(handler);
    },
  });

  return { clientTransport: make('client', 'server'), serverTransport: make('server', 'client') };
}

function createConnectedPair(overrides: Partial<RpcHandlers<TestRequests>> = {}) {
  const { clientTransport, serverTransport } = createChannelPair();

  const handlers: RpcHandlers<TestRequests> = {
    echo: ({ value }) => value.toUpperCase(),
    hang: (_params, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('прервано')), { once: true });
      }),
    boom: () => {
      throw new Error('всё сломалось');
    },
    ...overrides,
  };

  const onUnexpectedError = vi.fn();
  const server = createRpcServer<TestRequests, TestNotifications>(serverTransport, handlers, onUnexpectedError);
  const client = createRpcClient<TestRequests, TestNotifications>(clientTransport);

  return { client, server, handlers, onUnexpectedError };
}

describe('RPC поверх postMessage', () => {
  it('доставляет запрос и возвращает результат', async () => {
    const { client } = createConnectedPair();

    await expect(client.request('echo', { value: 'привет' })).resolves.toBe('ПРИВЕТ');
  });

  it('не путает ответы на параллельные запросы', async () => {
    const { client } = createConnectedPair();

    const results = await Promise.all([
      client.request('echo', { value: 'один' }),
      client.request('echo', { value: 'два' }),
      client.request('echo', { value: 'три' }),
    ]);

    expect(results).toEqual(['ОДИН', 'ДВА', 'ТРИ']);
  });

  it('превращает ошибку обработчика в RpcError на клиенте', async () => {
    const { client, onUnexpectedError } = createConnectedPair();

    await expect(client.request('boom', {})).rejects.toBeInstanceOf(RpcError);
    await expect(client.request('boom', {})).rejects.toThrow('всё сломалось');
    expect(onUnexpectedError).toHaveBeenCalled();
  });

  it('отвечает ошибкой на неизвестный метод', async () => {
    const { client } = createConnectedPair();

    // @ts-expect-error — проверяем поведение при рассинхроне схем на рантайме
    await expect(client.request('такого-нет', {})).rejects.toThrow('Неизвестный метод');
  });

  it('доставляет уведомления только подписчикам своего метода', async () => {
    const { client, server } = createConnectedPair();
    const onPing = vi.fn();
    const unsubscribe = client.on('ping', onPing);

    server.notify('ping', { at: 42 });
    await Promise.resolve();

    expect(onPing).toHaveBeenCalledWith({ at: 42 });

    unsubscribe();
    server.notify('ping', { at: 43 });
    await Promise.resolve();

    expect(onPing).toHaveBeenCalledTimes(1);
  });

  it('по отмене прерывает обработчик на сервере и отклоняет промис', async () => {
    const { client } = createConnectedPair();
    const controller = new AbortController();

    const pending = client.request('hang', {}, controller.signal);
    await Promise.resolve();
    controller.abort(new Error('пользователь сменил ревизии'));

    await expect(pending).rejects.toThrow('пользователь сменил ревизии');
  });

  it('не отправляет запрос, если сигнал уже отменён', async () => {
    const { client } = createConnectedPair();
    const controller = new AbortController();
    controller.abort(new Error('поздно'));

    await expect(client.request('echo', { value: 'x' }, controller.signal)).rejects.toThrow('поздно');
  });

  it('отклоняет незавершённые запросы при закрытии канала', async () => {
    const { client } = createConnectedPair();

    const pending = client.request('hang', {});
    client.dispose();

    await expect(pending).rejects.toThrow('Канал закрыт');
  });

  it('игнорирует чужие сообщения в том же окне', async () => {
    const { clientTransport, serverTransport } = createChannelPair();
    const handler = vi.fn();
    createRpcServer<TestRequests, TestNotifications>(serverTransport, {
      echo: handler,
      hang: handler,
      boom: handler,
    });

    // Сообщение без нашего канала — например, от другого расширения.
    clientTransport.post({ type: 'что-то-чужое' });
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
  });

  it('после dispose сервер перестаёт отвечать', async () => {
    const { client, server } = createConnectedPair();
    server.dispose();

    const pending = client.request('echo', { value: 'привет' });
    const settled = await Promise.race([pending.then(() => 'ответ'), delay(20).then(() => 'тишина')]);

    expect(settled).toBe('тишина');
  });
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
