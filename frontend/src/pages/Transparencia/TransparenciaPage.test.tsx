import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransparenciaPage } from './TransparenciaPage';
import { json, stubFetch } from '../../test/http';

// Fixture: contagens fictícias; a tela lê sempre a resposta da API.
const summary = {
  projeto: 'Projeto informado pelo servidor', scenario_id: 'cenario-teste',
  descricao: 'Resumo da API de teste', versao_manifesto: 'manifesto-teste', versao_corpus: 'v7-reparo',
  versao_inventario: 'v6 + suplemento sintético',
  corpus_ativo: {
    versao: 'v7-reparo', snapshot_id: 'candidato_07_reparo', construido_em: '2026-10-18T21:14:05+00:00',
    total_documentos: 200, total_chunks: 300, total_vetores: 290, chunks_sem_vetor: 10,
    bytes_documents: 659605504, schema_sql: '7', vetores_por_base: { contratos_estruturado: 290 },
    avisos: ['Linhagem de embedding mista (fixture).'],
  },
  snapshot_anterior: { versao: 'v6 + suplemento sintético', coletado_em: '2026-09-30T17:08:01+00:00',
    arquivos: 1425, backup: 'data/backup_v6_fixture' },
  coletado_em: null, inventario_completo: false, total_documentos: 123,
  total_itens: 456, total_falhas: 2,
  bases: [{ base_id: 'contratos_estruturado', natureza: 'estruturado', escopo: 'oficial',
    status: 'complete', documentos: 123, formatos: { json: 123 },
    documentos_ativos: 625, chunks_ativos: 106666, vetores_ativos: 105917 }],
};

describe('TransparenciaPage', () => {
  it('mantém os quatro princípios com o texto atualizado do pipeline', async () => {
    stubFetch(() => json(200, summary));
    render(<TransparenciaPage />);
    expect(screen.getByRole('heading', { name: 'Respostas a partir do acervo oficial' })).toBeInTheDocument();
    expect(screen.getByText(/calculados em SQL na base estruturada/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recusa quando não há evidência' })).toBeInTheDocument();
    expect(screen.getByText(/não é uma probabilidade de acerto/)).toBeInTheDocument();
    expect(screen.getByText(/histórico autorizado/)).toBeInTheDocument();
    await screen.findByText(summary.projeto);
  });

  it('segue o CORPUS_INVENTORY: v7 como inventário principal e v6 como snapshot anterior', async () => {
    const { calls } = stubFetch(() => json(200, summary));
    render(<TransparenciaPage />);
    await screen.findByText('Chunks normalizados');
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('Vetores FAISS')).toBeInTheDocument();
    expect(screen.getByText('290')).toBeInTheDocument();
    expect(screen.getByText('Schema SQL')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('v7-reparo')).toBeInTheDocument();
    expect(screen.getByText('candidato_07_reparo')).toBeInTheDocument();
    expect(screen.getByText('629 MB')).toBeInTheDocument();
    expect(screen.queryByText('Trechos sem vetor')).not.toBeInTheDocument();
    expect(screen.getByText(/Snapshot anterior v6/)).toBeInTheDocument();
    expect(screen.getByText(/data\/backup_v6_fixture/)).toBeInTheDocument();
    // Tabela de bases: chunks por base, sem coluna de vetores.
    expect(screen.getByRole('columnheader', { name: 'Chunks' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Vetores' })).not.toBeInTheDocument();
    expect(screen.getByText('106.666')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument();
    expect(calls[0].url.pathname).toBe('/api/v1/project/summary');
  });
});