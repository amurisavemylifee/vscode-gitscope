/**
 * Типизированный RPC поверх `postMessage`.
 *
 * Изоморфный модуль: одна и та же реализация работает в extension host и в
 * webview, разница только в транспорте. Написан обобщённо, чтобы будущие
 * панели (граф коммитов, blame, история файла) переиспользовали его как есть,
 * объявив собственные схемы запросов и уведомлений.
 */

/** Всё, что нужно RPC от среды: отправить сообщение и подписаться на входящие. */
export interface Transport {
  post(message: unknown): void;
  /** Возвращает функцию отписки. */
  subscribe(handler: (message: unknown) => void): () => void;
}

/** Схема запросов: имя метода → форма параметров и результата. */
export type RpcSchema = Record<string, { params: unknown; result: unknown }>;

/** Схема уведомлений (односторонних, без ответа): имя → форма нагрузки. */
export type NotificationSchema = Record<string, unknown>;

export interface RpcErrorPayload {
  readonly message: string;
  readonly detail?: string;
}

/** Ошибка, пришедшая с другой стороны канала. */
export class RpcError extends Error {
  readonly detail: string | undefined;

  constructor(payload: RpcErrorPayload) {
    super(payload.message);
    this.name = 'RpcError';
    this.detail = payload.detail;
  }
}

type Envelope =
  | { readonly channel: 'gitscope'; readonly kind: 'request'; readonly id: number; readonly method: string; readonly params: unknown }
  | { readonly channel: 'gitscope'; readonly kind: 'cancel'; readonly id: number }
  | { readonly channel: 'gitscope'; readonly kind: 'result'; readonly id: number; readonly result: unknown }
  | { readonly channel: 'gitscope'; readonly kind: 'failure'; readonly id: number; readonly error: RpcErrorPayload }
  | { readonly channel: 'gitscope'; readonly kind: 'notify'; readonly method: string; readonly payload: unknown };

const isEnvelope = (message: unknown): message is Envelope =>
  typeof message === 'object' && message !== null && (message as { channel?: unknown }).channel === 'gitscope';

// --- Клиентская сторона (webview) -------------------------------------------

export interface RpcClient<Requests extends RpcSchema, Notifications extends NotificationSchema> {
  request<K extends keyof Requests & string>(
    method: K,
    params: Requests[K]['params'],
    signal?: AbortSignal,
  ): Promise<Requests[K]['result']>;
  on<K extends keyof Notifications & string>(method: K, handler: (payload: Notifications[K]) => void): () => void;
  dispose(): void;
}

export function createRpcClient<Requests extends RpcSchema, Notifications extends NotificationSchema>(
  transport: Transport,
): RpcClient<Requests, Notifications> {
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: never) => void; reject: (reason: unknown) => void }>();
  const listeners = new Map<string, Set<(payload: never) => void>>();

  const unsubscribe = transport.subscribe((message) => {
    if (!isEnvelope(message)) {
      return;
    }
    if (message.kind === 'result' || message.kind === 'failure') {
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }
      pending.delete(message.id);
      if (message.kind === 'result') {
        entry.resolve(message.result as never);
      } else {
        entry.reject(new RpcError(message.error));
      }
      return;
    }
    if (message.kind === 'notify') {
      for (const handler of listeners.get(message.method) ?? []) {
        (handler as (payload: unknown) => void)(message.payload);
      }
    }
  });

  return {
    request(method, params, signal) {
      if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new Error('Запрос отменён'));
      }
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: never) => void, reject });
        signal?.addEventListener(
          'abort',
          () => {
            if (pending.delete(id)) {
              transport.post({ channel: 'gitscope', kind: 'cancel', id } satisfies Envelope);
              reject(signal.reason ?? new Error('Запрос отменён'));
            }
          },
          { once: true },
        );
        transport.post({ channel: 'gitscope', kind: 'request', id, method, params } satisfies Envelope);
      });
    },
    on(method, handler) {
      const set = listeners.get(method) ?? new Set();
      set.add(handler as (payload: never) => void);
      listeners.set(method, set);
      return () => {
        set.delete(handler as (payload: never) => void);
      };
    },
    dispose() {
      unsubscribe();
      for (const entry of pending.values()) {
        entry.reject(new Error('Канал закрыт'));
      }
      pending.clear();
      listeners.clear();
    },
  };
}

// --- Серверная сторона (extension host) -------------------------------------

export type RpcHandlers<Requests extends RpcSchema> = {
  [K in keyof Requests]: (params: Requests[K]['params'], signal: AbortSignal) => Promise<Requests[K]['result']> | Requests[K]['result'];
};

export interface RpcServer<Notifications extends NotificationSchema> {
  notify<K extends keyof Notifications & string>(method: K, payload: Notifications[K]): void;
  dispose(): void;
}

export function createRpcServer<Requests extends RpcSchema, Notifications extends NotificationSchema>(
  transport: Transport,
  handlers: RpcHandlers<Requests>,
  onUnexpectedError?: (error: unknown) => void,
): RpcServer<Notifications> {
  const inFlight = new Map<number, AbortController>();

  const unsubscribe = transport.subscribe((message) => {
    if (!isEnvelope(message)) {
      return;
    }
    if (message.kind === 'cancel') {
      inFlight.get(message.id)?.abort(new Error('Запрос отменён'));
      inFlight.delete(message.id);
      return;
    }
    if (message.kind !== 'request') {
      return;
    }

    const handler = handlers[message.method as keyof Requests] as
      | ((params: unknown, signal: AbortSignal) => unknown)
      | undefined;
    if (!handler) {
      transport.post({
        channel: 'gitscope',
        kind: 'failure',
        id: message.id,
        error: { message: `Неизвестный метод «${message.method}»` },
      } satisfies Envelope);
      return;
    }

    const controller = new AbortController();
    inFlight.set(message.id, controller);

    void (async () => {
      try {
        const result = await handler(message.params, controller.signal);
        if (!controller.signal.aborted) {
          transport.post({ channel: 'gitscope', kind: 'result', id: message.id, result } satisfies Envelope);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        onUnexpectedError?.(error);
        transport.post({
          channel: 'gitscope',
          kind: 'failure',
          id: message.id,
          error: toErrorPayload(error),
        } satisfies Envelope);
      } finally {
        inFlight.delete(message.id);
      }
    })();
  });

  return {
    notify(method, payload) {
      transport.post({ channel: 'gitscope', kind: 'notify', method, payload } satisfies Envelope);
    },
    dispose() {
      unsubscribe();
      for (const controller of inFlight.values()) {
        controller.abort(new Error('Канал закрыт'));
      }
      inFlight.clear();
    },
  };
}

/** Превращает исключение в то, что можно показать пользователю. */
export function toErrorPayload(error: unknown): RpcErrorPayload {
  if (error instanceof Error) {
    const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : undefined;
    return detail === undefined ? { message: error.message } : { message: error.message, detail };
  }
  return { message: String(error) };
}
