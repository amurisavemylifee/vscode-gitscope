import { createRpcClient } from '@shared/messaging';
import type { GitScopeNotifications, GitScopeRequests } from '@shared/protocol';
import { transport } from './vscode';

/** Типизированный клиент панели сравнения к extension host. */
export const bridge = createRpcClient<GitScopeRequests, GitScopeNotifications>(transport);

export { persistedState } from './vscode';
