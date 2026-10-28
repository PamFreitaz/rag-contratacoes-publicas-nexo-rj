import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoricoPage } from './HistoricoPage';
import { json, stubFetch } from '../../test/http';

describe('HistoricoPage', () => {
  it('sem sessão não chama o histórico global', () => {
    const { fetchStub } = stubFetch(() => json(200, []));
    render(<HistoricoPage sessionId={null} onNewQuery={vi.fn()} />);
    expect(screen.getByText(/Inicie uma conversa/)).toBeInTheDocument();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('carrega somente o histórico da sessão ativa', async () => {
    const { calls } = stubFetch(() => json(200, [{
      query_id: 'q_1', run_id: 'r_1', ts: '2026-10-14T12:00:00Z', query: 'Minha pergunta',
      resposta: { query: 'Minha pergunta', answer: 'Minha resposta', bases_consultadas: [],
        sources_used: [], confidence_level: 'alta', is_refusal: false, refusal_reason: null },
      feedback: [],
    }]));
    render(<HistoricoPage sessionId="s_1234567890123456" onNewQuery={vi.fn()} />);
    expect(await screen.findByText('Minha resposta')).toBeInTheDocument();
    expect(calls[0].headers.get('X-Session-Id')).toBe('s_1234567890123456');
    expect(calls[0].headers.has('X-API-Key')).toBe(false);
  });
});
