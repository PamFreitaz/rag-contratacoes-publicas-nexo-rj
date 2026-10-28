import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem } from '../types/api';
import { getSessionHistory } from '../services/history.service';
import { errorMessage } from './useApiResource';

export function useHistory(sessionId: string | null) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId) {
      setItems([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const result = await getSessionHistory(sessionId);
      setItems(result);
      setStatus(result.length ? 'success' : 'empty');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('error');
    }
  }, [sessionId]);

  useEffect(() => { void reload(); }, [reload]);
  return { items, status, error, reload };
}
