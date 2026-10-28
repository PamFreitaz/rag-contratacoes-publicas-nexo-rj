import { apiRequest } from './api';
import type { HistoryItem } from '../types/api';

export const HISTORY_LIMIT = 100;

/** Histórico privado da conversa identificada por X-Session-Id. */
export function getSessionHistory(sessionId: string, limit = HISTORY_LIMIT): Promise<HistoryItem[]> {
  return apiRequest<HistoryItem[]>('/api/v1/history', {
    params: { limit },
    headers: { 'X-Session-Id': sessionId },
  });
}
