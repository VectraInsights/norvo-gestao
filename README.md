# Norvo Gestão

ERP na nuvem para pequenas e médias empresas brasileiras: financeiro, CRM, estoque,
fiscal, RH e projetos em um único painel.

**Site (produção)**: https://norvo-gestao.vercel.app
**Desktop**: wrapper Electron Windows (`desktop/`, instalador NSIS)

## Stack

- [TanStack Start](https://tanstack.com/start) (SSR) + Vite + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Backend: [Supabase](https://supabase.com) (auth, Postgres, storage)

## Desenvolvimento local

Requisitos: Node.js LTS + npm.

```sh
git clone https://github.com/VectraInsights/norvo-gestao.git
cd norvo-gestao
npm install
cp .env.example .env   # preencha com as credenciais do projeto Supabase
npm run dev
```

> O `.env` não é versionado. Peça as credenciais ao dono do projeto.

## Documentação interna

- `AGENTS.md` — arquitetura, comandos, deploy e armadilhas conhecidas.
- `HISTORICO.md` — histórico de decisões do projeto.
