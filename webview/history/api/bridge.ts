import type { HistoryNotifications, HistoryRequests } from '@shared/historyProtocol';
import { createRpcClient } from '@shared/messaging';
import { transport } from '../../api/vscode';

/** Типизированный клиент панели истории к extension host. */
export const bridge = createRpcClient<HistoryRequests, HistoryNotifications>(transport);

export { persistedState } from '../../api/vscode';
