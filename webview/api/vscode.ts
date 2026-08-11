import type { Transport } from '@shared/messaging';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi можно вызвать ровно один раз за жизнь документа, поэтому
// доступ к нему живёт в отдельном модуле: панели заводят собственные типизи-
// рованные каналы, но окно у них одно на всех.
const api = acquireVsCodeApi();

/** Транспорт для RPC: сообщения в extension host и обратно. */
export const transport: Transport = {
  post: (message) => api.postMessage(message),
  subscribe: (handler) => {
    const listener = (event: MessageEvent<unknown>) => handler(event.data);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  },
};

/**
 * Состояние, переживающее скрытие панели и перезапуск VS Code.
 * Сюда кладём только выбор пользователя (режим, ширина колонки), но не данные —
 * данные всегда перечитываются из git, чтобы не показывать протухшее.
 */
export const persistedState = {
  read<T>(): Partial<T> {
    const value = api.getState();
    return (typeof value === 'object' && value !== null ? value : {}) as Partial<T>;
  },
  write<T>(patch: Partial<T>): void {
    api.setState({ ...persistedState.read<T>(), ...patch });
  },
};
