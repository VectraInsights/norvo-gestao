<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Norvo Gestão

ERP web (financeiro, vendas, estoque, fiscal, RH, projetos) com backend Supabase.
Dono do projeto: VectraInsights. Conversas com o agente podem ser em português.

## Stack

- TanStack Start (SSR) + Vite 8 + React 19 + TypeScript
- Estilização: Tailwind CSS 4 (`@tailwindcss/vite`) + shadcn/ui (pasta `src/components/ui`)
- Rotas: file-based em `src/routes` (TanStack Router; `routeTree.gen.ts` é gerado, não editar)
- Backend: Supabase (auth, Postgres, storage). Credenciais públicas em `.env`
- Build via plugin `@lovable.dev/vite-tanstack-config` (não adicionar plugins duplicados manualmente)

## Comandos

```bash
npm install                # deps (existe package-lock; bun.lock também existe mas usamos npm)
npm run dev                # dev server
NITRO_PRESET=node-server npm run build   # build SSR local -> .output/server/index.mjs
                           # roda com: PORT=xxxx node .output/server/index.mjs
node .output/server/index.mjs            # precisa das env vars SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
```

O preset padrão do nitro é cloudflare (via plugin Lovable). A env `NITRO_PRESET`
sobrescreve fora do sandbox deles (ex.: `node-server`, `vercel`).

## Deploy e distribuição

- **Vercel**: conectada ao GitHub (`VectraInsights/norvo-gestao`, branch main). Todo push em main publica sozinho.
- **Site principal**: https://norvo-gestao.vercel.app (Vercel, auto-deploy do GitHub main).
- **Site legado**: https://norvo-gestao.lovable.app (publicado pela Lovable; pode ficar desatualizado).
- **Backend**: projeto próprio `lfxhimtbuazezjkjlddj` (us-east-1), dono é o usuário. Google provider
  configurado lá. O antigo projeto Lovable (`tuylnxtnvwirqtgshmtu`) está abandonado.
- **Exe Windows**: wrapper Electron em `desktop/`. Carrega a URL da VERCEL numa janela própria.
  Rebuild: `cd desktop && npm install && npx electron-builder --win nsis` → saída em `desktop/release/`.
  Instalador portátil (target "portable") travava na extração nesta máquina — usar NSIS.
- Repo é **privado**: pull/push exigem PAT fine-grained com Contents Read/Write no repo
  (token fica embutido na URL do remote `.git/config`). NUNCA commitar tokens.

## Autenticação

- Email/senha direto via `supabase.auth` (`src/routes/auth.tsx`).
- Erros são traduzidos por `friendlyAuthError()` em mensagens PT-BR claras para o usuário.
- Google OAuth: o provedor NÃO está configurado no projeto Supabase ("missing OAuth secret").
  Historicamente passava pelo broker da Lovable (`/~oauth/initiate`), que só existe na hospedagem
  deles. Para funcionar na Vercel/exe, configurar Google provider direto no painel do Supabase
  (Authentication → Providers → Google) e permitir os domínios em Redirect URLs.
- Confirmação de email está ATIVA no Supabase e o SMTP padrão tem limite baixo — emails de
  confirmação podem não chegar. Recomendado desativar "Confirm email" ou configurar SMTP próprio.

## Armadilhas conhecidas

- `src/integrations/supabase/client.server.ts` exige `SUPABASE_SERVICE_ROLE_KEY` (só existe na
  nuvem da Lovable). Se algum server function usar admin client, vai quebrar fora da Lovable.
- `routeTree.gen.ts` e arquivos em `src/integrations/lovable` são gerenciados por ferramentas.
- Ao testar o exe localmente: matar SEMPRE a árvore inteira de processos (o app usa
  single-instance lock; órfãos seguram o lock e fazem novas instâncias saírem em silêncio).
- Existe um usuário de teste criado por diagnóstico (`teste-diagnostico-*@exemplo.com`) que pode
  ser removido no painel do Supabase.
