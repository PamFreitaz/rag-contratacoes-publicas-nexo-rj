import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { json, stubFetch } from '../../test/http';
import { TracePanel } from './TracePanel';

const TRACE = {
  query_id: 'q_1', session_id: 's_1234567890123456', run_ids: ['run_1'],
  pergunta: 'Quais contratos?', inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T10:00:02-03:00',
  latencia_total_ms: 2000,
  resumo: { consultou_sql: true, consultou_vetorial: true, evidencias_sql: 2, evidencias_vetorial: { contratos: 5 }, fontes_citadas: ['a'], confidence_level: 'alta', is_refusal: false },
  etapas: [{ ordem: 1, stage: 'consulta_sql', base: 'sql', status: 'ok', ts: '2026-10-08T10:00:00-03:00', latencia_ms: 120, input: 'pergunta', output: '2 linhas', tokens: null, modelo: null, detalhes: { sql: 'SELECT * FROM contratacoes', linhas: [{ id: 1 }] } }],
};

describe('TracePanel', () => {
  it('mostra o resumo e os detalhes do caminho da pergunta', async () => {
    const { calls } = stubFetch(() => json(200, TRACE));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);

    expect(await screen.findByText('Quais contratos?')).toBeInTheDocument();
    expect(screen.getByText('Evidências SQL')).toBeInTheDocument();
    expect(screen.getByText('Consulta à base estruturada')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Ver detalhes'));
    expect(screen.getByText('SELECT * FROM contratacoes')).toBeInTheDocument();
    expect(calls[0].headers.get('X-Session-Id')).toBe('s_1234567890123456');
  });

  it('oferece nova tentativa quando a rede falha', async () => {
    let attempt = 0;
    stubFetch(() => ++attempt === 1 ? Promise.reject(new TypeError('offline')) : json(200, TRACE));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText(/conectar ao backend/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Quais contratos?')).toBeInTheDocument();
  });

  it('aceita trace legado com num_fontes e sinaliza trace incompleto', async () => {
    stubFetch(() => json(200, { ...TRACE, completo: false, latencia_metodo: 'soma_etapas_legado', resumo: { ...TRACE.resumo, fontes_citadas: undefined, num_fontes: 3 } }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText(/trace incompleto/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('tempo estimado')).toBeInTheDocument();
  });

  it('mostra selo de segunda tentativa', async () => {
    stubFetch(() => json(200, { ...TRACE, etapas: [{ ...TRACE.etapas[0], stage: 'retrieval_bm25', detalhes: { tentativa_busca: 2 } }] }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText('2ª tentativa · sem filtros')).toBeInTheDocument();
  });

  it('normaliza outcome e mostra plano B de etapa degradada', async () => {
    stubFetch(() => json(200, { ...TRACE, etapas: [{ ...TRACE.etapas[0], status: 'ok', detalhes: { outcome: 'degradado', fallback: 'busca sem filtros' } }] }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText('com reserva')).toHaveClass('trace-status-warning');
    await userEvent.click(screen.getByText('Ver detalhes'));
    expect(screen.getByText(/Plano B/).parentElement).toHaveTextContent('busca sem filtros');
  });

  it('mostra status pulado e seu motivo', async () => {
    stubFetch(() => json(200, { ...TRACE, etapas: [{ ...TRACE.etapas[0], status: 'pulado', detalhes: { motivo: 'calculo_sql_suficiente' } }] }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText('não executada')).toHaveClass('trace-status-neutral');
    await userEvent.click(screen.getByText('Ver detalhes'));
    expect(screen.getByText(/cálculo SQL respondeu sozinho/)).toBeInTheDocument();
  });

  it('usa nomes amigáveis nas etapas de envelope', async () => {
    const names = ['requisicao_inicio', 'pipeline_inicio', 'pipeline_fim', 'persistencia_historico', 'requisicao_fim'];
    stubFetch(() => json(200, { ...TRACE, etapas: names.map((stage, ordem) => ({ ...TRACE.etapas[0], ordem, stage, detalhes: {} })) }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);
    expect(await screen.findByText('Pergunta recebida')).toBeInTheDocument();
    expect(screen.getByText('Início do processamento')).toBeInTheDocument();
    expect(screen.getByText('Fim do processamento')).toBeInTheDocument();
    expect(screen.getByText('Gravação no histórico')).toBeInTheDocument();
    expect(screen.getByText('Resposta enviada')).toBeInTheDocument();
  });

  it('aplica a semântica visual explícita dos status', async () => {
    const statuses = ['iniciado', 'iniciado', 'ok', 'pulado', 'degradado', 'recusa', 'erro', 'rejeitado', 'desconhecido'];
    stubFetch(() => json(200, {
      ...TRACE,
      etapas: statuses.map((status, ordem) => ({
        ...TRACE.etapas[0], ordem, stage: ordem === 0 ? 'requisicao_inicio' : ordem === 1 ? 'pipeline_inicio' : `etapa_${ordem}`, status, detalhes: {},
      })),
    }));
    render(<TracePanel sessionId="s_1234567890123456" queryId="q_1" onClose={vi.fn()} />);

    expect(await screen.findAllByText('registrado')).toHaveLength(2);
    screen.getAllByText('registrado').forEach((status) => expect(status).toHaveClass('trace-status-neutral'));
    expect(screen.getByText('concluído')).toHaveClass('trace-status-success');
    expect(screen.getByText('não executada')).toHaveClass('trace-status-neutral');
    expect(screen.getByText('com reserva')).toHaveClass('trace-status-warning');
    expect(screen.getByText('recusada')).toHaveClass('trace-status-warning');
    expect(screen.getByText('erro')).toHaveClass('trace-status-danger');
    expect(screen.getByText('rejeitado')).toHaveClass('trace-status-danger');
    expect(screen.getByText('desconhecido')).toHaveClass('trace-status-neutral');
  });
});
