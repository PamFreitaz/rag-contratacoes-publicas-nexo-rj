import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContratacoesPage } from './Contratacoes/ContratacoesPage';
import { App } from '../app/App';
import { json, stubFetch, stubNetworkDown } from '../test/http';

const CONTRATO = {
  id: '30381552000158-2-000016/2025',
  numero_contrato: '30381552000158-2-000016/2025',
  orgao: 'DUQUE DE CAXIAS CAMARA MUNICIPAL',
  orgao_cnpj: '30381552000158',
  fornecedor: 'MODERNIZACAO PUBLICA E INFORMATICA LTDA',
  objeto: 'Licenciamento de programas de informática.',
  valor_global: 38551.16,
  data_homologacao: null,
  modalidade: null,
  fonte_oficial: 'PNCP',
  status: null,
  esfera: 'municipal',
  municipio: 'Duque de Caxias',
};

describe('ContratacoesPage', () => {
  it('mostra os dados da API e campos nulos como "Não informado"', async () => {
    stubFetch(() => json(200, [CONTRATO]));
    render(<ContratacoesPage onSearchQuery={vi.fn()} />);

    const card = (await screen.findByText(CONTRATO.numero_contrato)).closest('article')!;
    expect(within(card).getByText('R$ 38.551,16')).toBeInTheDocument();
    // modalidade, status e data_homologacao são null no registro.
    expect(within(card).getAllByText('Não informado')).toHaveLength(3);
  });

  it('consulta o NEXO pelo número de controle PNCP real', async () => {
    const onSearchQuery = vi.fn();
    stubFetch(() => json(200, [{ ...CONTRATO, numero_contrato: 'Contrato 16/2025' }]));
    render(<ContratacoesPage onSearchQuery={onSearchQuery} />);
    await userEvent.click(await screen.findByRole('button', { name: /Consultar no NEXO/ }));
    expect(onSearchQuery).toHaveBeenCalledWith(expect.stringContaining(`PNCP ${CONTRATO.id}`));
    expect(onSearchQuery).not.toHaveBeenCalledWith(expect.stringContaining('Contrato 16/2025'));
  });

  it('erro da API mostra mensagem e "Tentar novamente"', async () => {
    let attempt = 0;
    stubFetch(() => (++attempt === 1 ? json(503, {}) : json(200, [CONTRATO])));
    render(<ContratacoesPage onSearchQuery={vi.fn()} />);

    expect(await screen.findByText(/temporariamente indisponível/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(await screen.findByText(CONTRATO.numero_contrato)).toBeInTheDocument();
  });
});

describe('App com backend desligado', () => {
  it('a consulta mostra erro de conexão e nenhuma resposta', async () => {
    stubNetworkDown();
    render(<App />);

    await userEvent.type(screen.getByLabelText('Pergunta sobre contratações públicas'), 'Quais contratos?{Enter}');

    expect(await screen.findByText(/conectar ao backend/)).toBeInTheDocument();
    expect(screen.queryByText(/Fontes utilizadas/)).not.toBeInTheDocument();
    expect(await screen.findByText('Backend offline')).toBeInTheDocument();
  });
});
