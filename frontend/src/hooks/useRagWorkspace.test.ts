import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, stubFetch } from '../test/http';
import { useRagWorkspace } from './useRagWorkspace';

function response(query: string, queryId: string, sessionId = 's_1234567890123456') {
  return {
    query_id: queryId,
    session_id: sessionId,
    query,
    answer: `Resposta para ${query}`,
    bases_consultadas: ['estruturada'],
    sources_used: [],
    confidence_level: 'alta',
    is_refusal: false,
    refusal_reason: null,
  };
}

describe('useRagWorkspace', () => {
  it('guarda a sessão por aba, reenvia contexto e descarta em Nova conversa', async () => {
    let call = 0;
    const { calls } = stubFetch((request) => json(200, response(String((request.body as { query: string }).query), `q_${++call}`)));
    const { result } = renderHook(() => useRagWorkspace());

    await act(() => result.current.submitQuery('Primeira pergunta'));
    expect(window.sessionStorage.getItem('nexo:conversation-session-id')).toBe('s_1234567890123456');

    await act(() => result.current.submitQuery('E depois?'));
    expect(calls[1].body).toMatchObject({
      session_id: 's_1234567890123456',
      historico: [{ pergunta: 'Primeira pergunta', resposta: 'Resposta para Primeira pergunta' }],
    });

    await act(() => result.current.submitQuery('E por fim?'));
    expect(calls[2].body).toMatchObject({
      session_id: 's_1234567890123456',
      historico: [
        { pergunta: 'Primeira pergunta', resposta: 'Resposta para Primeira pergunta' },
        { pergunta: 'E depois?', resposta: 'Resposta para E depois?' },
      ],
    });

    act(() => result.current.startNewConversation());
    expect(window.sessionStorage.getItem('nexo:conversation-session-id')).toBeNull();
    expect(result.current.turns).toHaveLength(0);

    await act(() => result.current.submitQuery('Pergunta da nova conversa'));
    expect(calls[3].body).toEqual({ query: 'Pergunta da nova conversa', top_k: 5 });
  });

  it('busca vinda do catálogo durante uma consulta pendente abandona a anterior e envia a nova', async () => {
    let call = 0;
    // A primeira consulta nunca responde, como uma geração lenta no LLM.
    const { calls } = stubFetch(() => ++call === 1
      ? new Promise<Response>(() => {})
      : json(200, response('Segunda', 'q_2')));
    const { result } = renderHook(() => useRagWorkspace());

    act(() => { void result.current.submitQuery('Primeira'); });
    expect(result.current.loading).toBe(true);

    // Mesma sequência do handleDirectSearch do App, no mesmo render.
    await act(async () => {
      result.current.startNewConversation();
      await result.current.submitQuery('Segunda');
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ query: 'Segunda', top_k: 5 });
    expect(result.current.turns.map((turn) => turn.response.query)).toEqual(['Segunda']);
    expect(result.current.loading).toBe(false);
  });

  it('ao receber 422 por sessão restaurada, limpa o id e tenta uma vez sem ele', async () => {
    window.sessionStorage.setItem('nexo:conversation-session-id', 's_1234567890123456');
    let call = 0;
    // A sessão restaurada também pede o histórico; aqui só as perguntas interessam.
    const { calls } = stubFetch((request) => request.url.pathname === '/api/v1/history'
      ? json(200, [])
      : ++call === 1 ? json(422, {}) : json(200, response('Pergunta', 'q_2', 's_nova_123456789012')));
    const queries = () => calls.filter((request) => request.url.pathname === '/api/v1/query');
    const { result } = renderHook(() => useRagWorkspace());

    await act(() => result.current.submitQuery('Pergunta'));
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    expect(queries()).toHaveLength(2);
    expect(queries()[0].body).toMatchObject({ session_id: 's_1234567890123456' });
    expect(queries()[1].body).not.toHaveProperty('session_id');
    expect(window.sessionStorage.getItem('nexo:conversation-session-id')).toBe('s_nova_123456789012');
  });

  it('depois de recarregar a página, remonta a conversa pelo histórico e continua com contexto', async () => {
    window.sessionStorage.setItem('nexo:conversation-session-id', 's_1234567890123456');
    // O backend devolve o histórico do mais recente para o mais antigo.
    const historico = [
      historyItem('Segunda pergunta', 'q_2', '2026-10-28T10:01:00Z'),
      { ...historyItem('Primeira pergunta', 'q_1', '2026-10-28T10:00:00Z'),
        feedback: [{ avaliacao: 'positivo', comentario: null, ts: '2026-10-28T10:00:30Z' }] },
    ];
    const { calls } = stubFetch((request) => request.url.pathname === '/api/v1/history'
      ? json(200, historico)
      : json(200, response('E agora?', 'q_3')));
    const { result } = renderHook(() => useRagWorkspace());

    await waitFor(() => expect(result.current.turns).toHaveLength(2));
    expect(calls[0].headers.get('x-session-id')).toBe('s_1234567890123456');
    expect(result.current.turns.map((turn) => turn.response.query)).toEqual(['Primeira pergunta', 'Segunda pergunta']);
    expect(result.current.turns[0]).toMatchObject({
      feedback: 'positivo',
      response: { query_id: 'q_1', session_id: 's_1234567890123456' },
    });

    await act(() => result.current.submitQuery('E agora?'));
    expect(calls.at(-1)?.body).toMatchObject({
      session_id: 's_1234567890123456',
      historico: [
        { pergunta: 'Primeira pergunta', resposta: 'Resposta para Primeira pergunta' },
        { pergunta: 'Segunda pergunta', resposta: 'Resposta para Segunda pergunta' },
      ],
    });
    expect(result.current.turns).toHaveLength(3);
  });

  it('sem o histórico, a conversa começa vazia e mantém a sessão', async () => {
    window.sessionStorage.setItem('nexo:conversation-session-id', 's_1234567890123456');
    const { calls } = stubFetch(() => json(500, {}));
    const { result } = renderHook(() => useRagWorkspace());

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current.turns).toEqual([]);
    expect(result.current.sessionId).toBe('s_1234567890123456');
    expect(result.current.error).toBeNull();
  });

  it('Nova conversa antes do histórico chegar descarta a conversa antiga', async () => {
    window.sessionStorage.setItem('nexo:conversation-session-id', 's_1234567890123456');
    let entregarHistorico: (value: Response) => void = () => {};
    stubFetch(() => new Promise<Response>((resolve) => { entregarHistorico = resolve; }));
    const { result } = renderHook(() => useRagWorkspace());

    act(() => result.current.startNewConversation());
    await act(async () => entregarHistorico(json(200, [historyItem('Pergunta antiga', 'q_1', '2026-10-28T10:00:00Z')])));
    expect(result.current.turns).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });
});

function historyItem(query: string, queryId: string, ts: string) {
  const { query_id: _queryId, session_id: _sessionId, ...resposta } = response(query, queryId);
  return { query_id: queryId, run_id: `r_${queryId}`, ts, query, resposta, feedback: [] };
}
