# NEXO RJ — consulta inteligente a contratações públicas do Rio de Janeiro

Sistema de **RAG adaptativo** que responde, em português, perguntas sobre as
contratações públicas do Estado do Rio de Janeiro registradas no PNCP (Portal
Nacional de Contratações Públicas). O número vem do banco de dados, o texto vem
da fonte oficial citada, e o sistema recusa quando não há evidência ou quando a
pergunta pede um dado sensível.

Projeto do **Grupo 04** no Grande Desafio (Cenário 1) da **Residência TIC em
Trilhas · PUC-Rio · Instituto ECOA**, apresentado no Demo Day de 23/10/2026.

## 🎬 Vídeo de apresentação

**[Assista ao vídeo (até 5 minutos)](https://drive.google.com/drive/folders/107xSLhfgGC5FQEngGBvXwQhCcCBPptmS?usp=drive_link)**:
o problema, a solução, as tecnologias e uma demonstração do sistema. O vídeo
está na pasta do projeto no Google Drive, a mesma dos dados da v7 (veja
[2. Dados](#2-dados)); dá para assistir direto no navegador, sem baixar.

📁 Pasta do projeto no Google Drive (vídeo e dados da v7):
<https://drive.google.com/drive/folders/107xSLhfgGC5FQEngGBvXwQhCcCBPptmS?usp=drive_link>

## O problema

Todo órgão público publica as suas contratações no PNCP, mas o portal só permite
consultar contrato por contrato. Os dados existem, mas não respondem perguntas:

- **Volume:** só em 2025 são mais de 106 mil contratos, empenhos e compras de
  órgãos do RJ.
- **Dispersão:** contratos, atas de registro de preços, planos anuais e leis
  ficam em lugares e formatos diferentes.
- **Perguntas cruzadas:** "quanto a prefeitura gastou com ambulâncias e qual lei
  vale para essa compra?" exige somar registros **e** ler a norma.

Um chatbot genérico inventa números e não diz de onde tirou a informação. Em
compras públicas, uma resposta sem fonte não serve.

## A solução

Antes de buscar, o sistema decide **onde** procurar a resposta:

```
Pergunta → segurança (recusas e tentativas de manipulação) → análise da pergunta (filtros)
         → roteador (escolhe as bases)
             ├─ conta, lista ou CNPJ → consulta SQL → resposta direta, sem LLM (0,3 a 3 s)
             └─ norma, ata, cruzamento → busca híbrida (vetorial + palavras) → rerank → LLM com citação
         → validação (fontes, confiança e dados pessoais mascarados) → caminho registrado no log
```

- **O número vem do banco:** contas, totais e rankings saem de uma consulta SQL
  fixa e parametrizada, nunca escrita pelo modelo de linguagem.
- **O texto vem da fonte:** leis e atas são buscadas no acervo oficial e citadas
  na resposta.
- **Sem evidência, não responde:** dados bancários, senhas, juízo sobre a
  legalidade de um contrato e previsões são recusados.
- **Transparência:** cada resposta guarda o seu caminho (bases consultadas, o
  que foi encontrado, por que chegou àquela confiança), que o site mostra em
  "Ver caminho".

O acervo (versão v7) tem 106.667 registros de contratação, 144.112 trechos de
busca e cinco bases: contratos, atas de registro de preços, normas (Lei
14.133/2021, LC 123/2006 e decretos do RJ), o plano anual de contratações e um
conjunto de e-mails sintéticos criados pelo tutor para testar a segurança.

## Tecnologias

| Parte | Tecnologias |
|---|---|
| Backend e API | Python 3.14, FastAPI, Uvicorn, Pydantic |
| Dados estruturados | SQLite (índice FTS5), com PostgreSQL/Neon como opção |
| Busca | FAISS, Qwen3-Embedding 0.6B (1.024 dimensões), BM25 com índice invertido, fusão RRF, rerank com cross-encoder multilíngue (mMiniLM, sentence-transformers) |
| Geração | qwen3-8b no endpoint de modelos da residência (ECOA), com OpenRouter de reserva |
| Extração de documentos | pypdf, pypdfium2 e OCR com Tesseract para PDFs escaneados |
| Frontend | React 19, TypeScript, Vite (pasta [frontend/](frontend/)) |
| Qualidade | pytest (2.400 testes), GitHub Actions, golden set com 36 perguntas de referência |

## Resultados

- **Golden set: 36 de 36 perguntas corretas**, com 100% das recusas e das
  citações corretas (rodadas de 27/10/2026, base v7).
- **Busca:** em 87% das 47 perguntas de teste, o trecho certo aparece entre os 10
  primeiros resultados.
- **2.400 testes automatizados** passando.
- Respostas de conta em **0,3 a 3 segundos**, direto do banco.

Limitações conhecidas: perguntas que passam pelo modelo de linguagem levam de 20
a 100 segundos, a reserva gratuita do modelo nem sempre responde e a base cobre
o ano de 2025. Detalhes em [backend/ARQUITETURA.md](backend/ARQUITETURA.md).

## Como executar

O repositório tem as duas partes: o backend e a API, na pasta [backend/](backend/),
e o site, na pasta [frontend/](frontend/).

### Pré-requisitos

- Git
- Python 3.12 ou mais novo (o CI usa 3.14)
- Node.js 22 (LTS), para o site
- Cerca de 8 GB de RAM livres: com a base v7 carregada, o backend ocupa de 4 a 6 GB

### 1. Backend

```bash
git clone https://github.com/PamFreitaz/rag-contratacoes-publicas-nexo-rj.git
cd rag-contratacoes-publicas-nexo-rj/backend
```

Instale tudo com um comando, **dentro da pasta `backend/`**: ele cria o ambiente
virtual (`.venv`), instala as dependências e copia o `.env.example` para `.env`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   # Windows
```
```bash
bash scripts/setup.sh                                        # Linux ou macOS
```

### 2. Dados

Os dados da v7 (cerca de 2,1 GB) ficam fora do Git. Baixe o ZIP e o arquivo
`.sha256` da
[pasta do Google Drive](https://drive.google.com/drive/folders/107xSLhfgGC5FQEngGBvXwQhCcCBPptmS?usp=drive_link)
e extraia o ZIP **dentro da pasta `backend/`**. Ele já traz os arquivos nos lugares
certos: `data/normalized/`, `data/structured/`, `data/config/`, `index/` e
`runtime_bundle.json`.

No arquivo `backend/.env`, confirme a linha:

```dotenv
SNAPSHOT_MANIFEST=runtime_bundle.json
```

A conferência do pacote (SHA-256) está em [backend/docs/REPARO_V7.md](backend/docs/REPARO_V7.md).

### 3. Modelos de linguagem

O `.env.example` já aponta para o endpoint de modelos da residência (ECOA).
Fora da residência, use o OpenRouter, que tem modelos gratuitos:

```dotenv
LLM_PROVIDER_MODE=openrouter
OPENROUTER_API_KEY=sua_chave
```

As perguntas de número (valor, quantidade, órgão, fornecedor, CNPJ) saem do SQL
e funcionam mesmo sem modelo de linguagem.

### 4. Subir a API

Ainda dentro da pasta `backend/`:

```bash
.venv/Scripts/python -m uvicorn app.api:app --host 127.0.0.1 --port 8080   # Windows
.venv/bin/python -m uvicorn app.api:app --host 127.0.0.1 --port 8080       # Linux ou macOS
```

Com a v7, a API leva cerca de 2 minutos para ficar pronta: ela confere o pacote
de dados e carrega os índices. Acompanhe em
[http://localhost:8080/ready](http://localhost:8080/ready), que responde
`"ready": true` quando tudo estiver certo. A documentação interativa da API fica
em [http://localhost:8080/docs](http://localhost:8080/docs).

### 5. Site

Em outro terminal, a partir da pasta do projeto:

```bash
cd frontend
npm ci
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). O rodapé mostra
**Backend online** quando o site encontra a API.

### 6. Experimente

- *Qual o valor total dos contratos assinados do Município de Maricá?*
- *Quantos contratos de ambulância foram firmados em 2025?* e, na mesma
  conversa, *E em 2024?*
- *O que estabelece a Lei 14.133/2021?*
- *Qual é a conta bancária do fornecedor do maior contrato de ambulância?*
  (o sistema recusa)

### Testes e avaliação

Dentro da pasta `backend/` (o site tem os próprios testes: `cd frontend` e `npm test`):

```bash
.venv/Scripts/python -m pytest -q                          # 2.400 testes
.venv/Scripts/python eval/run_eval.py check                # valida o golden set
.venv/Scripts/python eval/run_eval.py run --pipeline eval.adapters:pipeline_completo
```

## Estrutura do projeto

```
├── backend/
│   ├── app/          API FastAPI: consulta, histórico, feedback, caminho da pergunta e catálogo
│   ├── src/          o pipeline: análise da pergunta, roteador, busca, SQL, geração e log
│   ├── eval/         golden set e avaliação automática
│   ├── tests/        testes automatizados
│   ├── scripts/      instalação e download de modelos
│   ├── data/         configuração, manifestos e dados sintéticos (os dados da v7 vêm do Drive)
│   ├── docs/         documentação técnica
│   ├── ARQUITETURA.md         arquitetura, decisões e limitações
│   └── corpus_manifest.yaml   de onde vem cada base de dados
├── frontend/         o site (React, TypeScript, Vite)
└── .github/          testes automáticos a cada envio (GitHub Actions)
```

A documentação técnica completa, com cada etapa do pipeline, as variáveis de
configuração e o histórico das avaliações, está em
[backend/docs/README_TECNICO.md](backend/docs/README_TECNICO.md).

## Equipe

| Integrante | GitHub |
|---|---|
| Pâmela de Freitas | [@PamFreitaz](https://github.com/PamFreitaz) |
| Diogo Oliveira Vieira | [@Diogooliveira10](https://github.com/Diogooliveira10) |
| Eduarda Silva Santos | [@Etuarda](https://github.com/Etuarda) |
| João Pedro Félix Reis | [@sevenRevy](https://github.com/sevenRevy) |
| Marco Aurélio | [@MarcoBritoDev](https://github.com/MarcoBritoDev) |
| Renato Lemos (coordenação) | [@limongi1234](https://github.com/limongi1234) |

Repositório original do grupo (privado, acesso da equipe):
[Diogooliveira10/rag-grande-desafio-grupo04-cenario01](https://github.com/Diogooliveira10/rag-grande-desafio-grupo04-cenario01).
O site (pasta `frontend/`) foi desenvolvido por Eduarda Silva Santos no repositório
[Etuarda/frontendRAG](https://github.com/Etuarda/frontendRAG) e foi copiado para cá, sem o
histórico de commits, para o projeto ficar completo num repositório só.

## Minha contribuição

- **Análise da pergunta:** mascaramento de dados pessoais no log, filtro de
  vigência das normas e reconhecimento de "Prefeitura de X" como o órgão
  "MUNICIPIO DE X" do PNCP.
- **Qualidade do corpus:** marcação de páginas ilegíveis, vigência das normas,
  ligação entre contratos e compras e correção do OCR das atas escaneadas.
- **E-mails sintéticos:** casos no golden set e prova de que as conversas
  restritas nunca chegam ao modelo nem viram fonte.
- **Avaliação:** perguntas que continuam a anterior avaliadas com o histórico da
  conversa e casos de busca por CNPJ.
- **Qualidade das respostas:** modalidade de licitação vinda só do registro, sem
  deduzir pelo amparo legal, e respostas com evidência insuficiente sem serem
  tratadas como recusa (o golden set chegou a 36 de 36).
- **Documentação:** revisão dos textos desatualizados e do guia de execução.

---

*Residência TIC em Trilhas · PUC-Rio · Instituto ECOA · MCTI Futuro · Softex*
