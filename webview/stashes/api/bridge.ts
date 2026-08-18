import { createRpcClient } from '@shared/messaging';
import type { StashNotifications, StashRequests } from '@shared/stashProtocol';
import { transport } from '../../api/vscode';

/** Типизированный клиент панели стешей к extension host. */
export const bridge = createRpcClient<StashRequests, StashNotifications>(transport);

export { persistedState } from '../../api/vscode';
