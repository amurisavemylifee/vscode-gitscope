import { createRpcClient, type Transport } from '@shared/messaging';
import type { GitScopeNotifications, GitScopeRequests } from '@shared/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi можно вызвать ровно один раз за жизнь документа.
const api = acquireVsCodeApi();

const transport: Transport = {
  post: (message) => api.postMessage(message),
  subscribe: (handler) => {
    const listener = (event: MessageEvent<unknown>) => handler(event.data);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  },
};

/** Типизированный клиент к extension host. */
export const bridge = createRpcClient<GitScopeRequests, GitScopeNotifications>(transport);

/**
 * Состояние, переживающее скрытие панели и перезапуск VS Code.
 * Сюда кладём только выбор пользователя (режим, скролл), но не данные —
 * данные всегда перечитываются из git, чтобы не показывать протухший diff.
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
