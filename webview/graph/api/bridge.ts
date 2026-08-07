import { createRpcClient, type Transport } from '@shared/messaging';
import type { GitGraphNotifications, GitGraphRequests } from '@shared/graphProtocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi можно вызвать ровно один раз за жизнь документа — у панели
// графа свой документ (свой webview), поэтому конфликта с панелью сравнения нет.
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
export const bridge = createRpcClient<GitGraphRequests, GitGraphNotifications>(transport);

/** Состояние, переживающее скрытие панели и перезапуск VS Code — только выбор пользователя. */
export const persistedState = {
  read<T>(): Partial<T> {
    const value = api.getState();
    return (typeof value === 'object' && value !== null ? value : {}) as Partial<T>;
  },
  write<T>(patch: Partial<T>): void {
    api.setState({ ...persistedState.read<T>(), ...patch });
  },
};
