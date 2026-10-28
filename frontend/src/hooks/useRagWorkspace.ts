import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationHistoryTurn, HistoryItem } from '../types/api';
import type { Avaliacao, ConversationTurn } from '../types/app';
import { ApiError } from '../services/api';
import { getSessionHistory } from '../services/history.service';
import { queryRag } from '../services/query.service';
import { errorMessage } from './useApiResource';

const SESSION_STORAGE_KEY = 'nexo:conversation-session-id';

function readStoredSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSession(sessionId: string | null): void {
  try {
    if (sessionId) window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    else window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // A conversa continua funcional em memória quando o navegador bloqueia storage.
  }
}

function historyFrom(turns: ConversationTurn[]): ConversationHistoryTurn[] {
  return turns.slice(-10).map(({ response }) => ({
    pergunta: response.query,
    resposta: response.answer,
  }));
}

function turnFrom(item: HistoryItem, sessionId: string): ConversationTurn {
  return {
    response: { ...item.resposta, query_id: item.query_id, session_id: sessionId },
    feedback: item.feedback.at(-1)?.avaliacao,
  };
}

/** Conversa atual, com sessão isolada por aba e contexto reenviado ao backend. */
export function useRagWorkspace() {
  const initialSession = useRef<string | null>(readStoredSession());
  const sessionIdRef = useRef<string | null>(initialSession.current);
  const turnsRef = useRef<ConversationTurn[]>([]);
  const [turns, setTurnsState] = useState<ConversationTurn[]>([]);
  const [sessionId, setSessionIdState] = useState<string | null>(initialSession.current);
  // A ref acompanha o estado para submitQuery ver na hora o que
  // startNewConversation acabou de limpar, sem esperar o próximo render.
  const pendingQueryRef = useRef<string | null>(null);
  const [pendingQuery, setPendingQueryState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ApiError['kind'] | null>(null);
  const failedQueryRef = useRef<string | null>(null);
  const [estimatedDurationMs, setEstimatedDurationMs] = useState(82_000);
  const queryStartedAtRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const setTurns = useCallback((next: ConversationTurn[] | ((current: ConversationTurn[]) => ConversationTurn[])) => {
    const value = typeof next === 'function' ? next(turnsRef.current) : next;
    turnsRef.current = value;
    setTurnsState(value);
  }, []);

  const setSessionId = useCallback((next: string | null) => {
    sessionIdRef.current = next;
    setSessionIdState(next);
    storeSession(next);
  }, []);

  const setPendingQuery = useCallback((next: string | null) => {
    pendingQueryRef.current = next;
    setPendingQueryState(next);
  }, []);

  // Depois de recarregar a página, a sessão volta do sessionStorage, mas as respostas não
  // ficam no navegador: a conversa é remontada pelo histórico que o backend guardou.
  useEffect(() => {
    const restoredSession = initialSession.current;
    if (!restoredSession) return;
    let active = true;
    getSessionHistory(restoredSession)
      .then((items) => {
        // Nova conversa (ou sessão trocada após 422) antes da resposta: o histórico é de outra.
        if (!active || sessionIdRef.current !== restoredSession || items.length === 0) return;
        const restored = [...items].reverse().map((item) => turnFrom(item, restoredSession));
        // Uma pergunta enviada enquanto o histórico carregava fica depois das restauradas.
        setTurns((current) => [
          ...restored.filter((turn) => !current.some((c) => c.response.query_id === turn.response.query_id)),
          ...current,
        ]);
      })
      .catch(() => {
        // Sem o histórico (backend fora do ar, sessão expirada), a conversa começa vazia como antes.
      });
    return () => {
      active = false;
    };
  }, [setTurns]);

  const loading = pendingQuery !== null;

  const submitQuery = useCallback(
    async (queryText: string) => {
      const normalized = queryText.trim();
      if (!normalized || pendingQueryRef.current !== null) return;

      const requestId = ++requestIdRef.current;
      queryStartedAtRef.current = Date.now();
      setPendingQuery(normalized);
      setError(null);
      setErrorKind(null);
      failedQueryRef.current = null;

      const context = () => ({
        sessionId: sessionIdRef.current,
        history: historyFrom(turnsRef.current),
      });

      try {
        let response;
        try {
          response = await queryRag(normalized, context());
        } catch (err) {
          // Uma sessão restaurada pode ter formato/validade incompatível com o servidor atual.
          if (!(err instanceof ApiError) || err.status !== 422 || !sessionIdRef.current) throw err;
          setSessionId(null);
          response = await queryRag(normalized, {
            history: historyFrom(turnsRef.current),
          });
        }

        if (requestId !== requestIdRef.current) return;
        setSessionId(response.session_id);
        const duration = Date.now() - (queryStartedAtRef.current ?? Date.now());
        setEstimatedDurationMs((current) => Math.max(5_000, Math.round(current * 0.4 + duration * 0.6)));
        setTurns((current) => [...current, { response }]);
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setError(errorMessage(err));
          setErrorKind(err instanceof ApiError ? err.kind : 'network');
          failedQueryRef.current = normalized;
        }
      } finally {
        if (requestId === requestIdRef.current) setPendingQuery(null);
      }
    },
    [setPendingQuery, setSessionId, setTurns]
  );

  const retryQuery = useCallback(() => {
    const query = failedQueryRef.current;
    if (query) void submitQuery(query);
  }, [submitQuery]);

  const markRated = useCallback((queryId: string, avaliacao: Avaliacao) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.response.query_id === queryId ? { ...turn, feedback: avaliacao } : turn
      )
    );
  }, [setTurns]);

  const startNewConversation = useCallback(() => {
    requestIdRef.current++;
    setTurns([]);
    setSessionId(null);
    setPendingQuery(null);
    setError(null);
    setErrorKind(null);
    failedQueryRef.current = null;
  }, [setPendingQuery, setSessionId, setTurns]);

  return {
    turns,
    sessionId,
    pendingQuery,
    loading,
    estimatedDurationMs,
    error,
    errorKind,
    submitQuery,
    retryQuery,
    markRated,
    startNewConversation,
  };
}
