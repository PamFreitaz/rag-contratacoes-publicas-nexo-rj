# NEXO RJ — Frontend

Interface React do NEXO RJ, consulta inteligente sobre contratações públicas do Estado do Rio de Janeiro. Projeto da Residência TIC em Trilhas (Instituto ECOA · PUC-Rio).

O site foi desenvolvido por **Eduarda Silva Santos ([@Etuarda](https://github.com/Etuarda))** no repositório [Etuarda/frontendRAG](https://github.com/Etuarda/frontendRAG) e foi copiado para esta pasta, sem o histórico de commits, para o projeto ficar completo num repositório só.

O frontend consome **exclusivamente** a API do backend (a pasta `backend/` deste repositório). Não há respostas simuladas nem catálogo de exemplo: com o backend desligado, a interface mostra erro de conexão.

## Como rodar

Pré-requisitos: **Node.js 22 (LTS)** e o backend rodando em `http://localhost:8080` (passo a passo no [README principal](../README.md#como-executar)).

```bash
cd frontend
npm ci
npm run check:backend   # verifica API, corpus e banco; não chama o LLM
npm run dev             # abra http://localhost:5173
```

Na tela **Consulta**, envie, por exemplo: **"O que estabelece a Lei 14.133/2021?"**. A resposta deve mostrar fontes. Verifique também Contratações, Histórico e feedback.

`npm run dev` e os diagnósticos usam `.env.development`, já versionado com `VITE_API_BASE_URL=http://localhost:8080`. Para outra URL, crie `.env.development.local` e reinicie o Vite. Nunca coloque senhas ou tokens nas variáveis `VITE_*`: elas são públicas no navegador.

O diagnóstico rápido não garante que o LLM esteja disponível nem testa CORS; `npm run check:query` valida uma consulta real, e a interface valida a conexão do navegador.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm ci` | Instala as versões do `package-lock.json` |
| `npm run dev` | Servidor de desenvolvimento na porta 5173 |
| `npm run check:backend` | Diagnóstico HTTP da API, corpus e banco estruturado |
| `npm run check:query` | Diagnóstico + pergunta real; grava consulta no histórico do backend |
| `npm test` | Testes offline da interface e dos diagnósticos |
| `npm run build` | Checagem de tipos e build de produção em `dist/` |
| `npm run build:pages` | Build + cópia para `assets/` e `docs/` (GitHub Pages) |
| `npm run preview` | Serve o build de `dist/` localmente |
| `npm run check:backend` | Verifica o `/health` do backend configurado |
| `npm run check:query` | Executa uma pergunta real no pipeline RAG |
| `npm run check:pages` | Valida a URL HTTPS do backend antes da publicação |
| `npm run check:pages-build` | Confere o index e a URL incorporada ao bundle em `dist/` |

Todas as chamadas usam `VITE_API_BASE_URL` e enviam `ngrok-skip-browser-warning: 1`.
Para testar outro backend localmente, defina a variável em `.env.development.local`.

## Publicação

O site pode ser publicado no GitHub Pages: `npm run build` gera a interface em `dist/`, com `VITE_API_BASE_URL` apontando para um backend acessível por HTTPS. O GitHub Pages hospeda só a interface, não o Python nem o LLM; na demonstração do grupo, o backend ficou público por um túnel do ngrok. A origem do site precisa estar liberada no CORS do backend (`CORS_ALLOW_ORIGINS`). Veja [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md).

## Stack e estrutura

React 19 · TypeScript · Vite 6 · CSS próprio, mobile-first.

```text
src/
├── app/            # Composição das páginas e navegação
├── pages/          # Consulta, Histórico, Explorar, Sobre...
├── components/     # Componentes visuais reutilizáveis (sem fetch)
├── hooks/          # Estado de tela e chamadas via services
├── services/       # api.ts (cliente HTTP único) + um service por recurso
├── types/          # Tipos do contrato e tipos só de UI
├── constants/      # Rótulos de interface
├── utils/          # Formatadores
└── styles/         # global.css
scripts/            # Diagnóstico local e publicação
```

Fluxo: `Página/Componente → hook → service → api.ts → FastAPI`.

O contrato oficial está em [backend/docs/FRONTEND_API_CONTRACT.md](../backend/docs/FRONTEND_API_CONTRACT.md). Os detalhes de endpoints, estados de tela e testes estão em [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md).
