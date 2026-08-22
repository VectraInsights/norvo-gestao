# Histórico de decisões do projeto

Registro condensado da evolução do Norvo Gestão fora do editor Lovable.
(Para arquitetura e comandos, veja `AGENTS.md`. Este arquivo é contexto narrativo.)

## Linha do tempo

1. **Origem** — ERP construído no Lovable (TanStack Start + Supabase gerenciado por eles).
   Exportado do GitHub (`VectraInsights/norvo-gestao`, branch main, repo privado).

2. **Ambiente local (PC principal)** — Node.js LTS e Git instalados via winget; deps com npm
   (o package-lock estava defasado vs bun.lock; `npm install` resolve).

3. **Empacotamento Windows** — alvo `portable` do electron-builder travava na extração;
   **NSIS** funciona. Wrapper Electron vive em `desktop/` (janela + navegação controlada).

4. **Diagnósticos de autenticação** (fase Lovable):
   - Botão Google dava **404 dentro do exe**: o SDK da Lovable chama `/~oauth/initiate`,
     rota que só existe na hospedagem deles. O projeto Supabase nunca teve secret Google próprio.
   - Senha fraca é rejeitada (`weak_password`, proteção pwned).
   - Email de confirmação não chegava (SMTP padrão com limite baixo).

5. **Virada de arquitetura ("esquecer a Lovable")**:
   - Frontend publicado na **Vercel**, conectada ao GitHub (deploy automático a cada push em main).
   - Backend migrado para **Supabase próprio** do dono (`lfxhimtbuazezjkjlddj`, região us-east-1):
     as 32 migrações de `supabase/migrations` foram aplicadas via connection string (pooler),
     criando 31 tabelas no schema public. `.env` do repo atualizado para o novo projeto.

6. **Google OAuth direto** — provider habilitado no Supabase novo com credenciais próprias do
   Google Cloud (tipo *Aplicativo da Web*). Erro `redirect_uri_mismatch` resolvido ao cadastrar
   a callback certa: `https://lfxhimtbuazezjkjlddj.supabase.co/auth/v1/callback`.
   Redirect URLs autorizadas incluem `https://norvo-gestao.vercel.app/auth`.

7. **Estado final** — login por email com sessão imediata (Confirm email DESATIVADO no painel),
   login Google funcional no site Vercel; exe carrega `https://norvo-gestao.vercel.app`.

8. **Recuperação de senha** (commit 630a293) — fluxo completo implementado:
   - Link "Esqueci minha senha" na tela de login → rota `/recuperar` (envia email via
     `resetPasswordForEmail` com redirectTo `/redefinir`) → rota `/redefinir` (define nova senha,
     detecta o evento PASSWORD_RECOVERY do supabase-js).
   - Requer `https://norvo-gestao.vercel.app/redefinir` nas Redirect URLs do Supabase.
   - Emails de reset usam o SMTP padrão do Supabase (limite baixo) — configurar SMTP próprio
     no painel se o volume incomodar.

9. **Onboarding da 1ª empresa** — fluxo de primeiro acesso implementado:
   - Nova rota `/onboarding` (`src/routes/onboarding.tsx`, ssr:false): tela "Bem-vindo" com
     formulário curto (CNPJ opcional com busca na Receita via BrasilAPI, nome fantasia obrigatório,
     razão social/email/telefone opcionais). Cria a empresa, seleciona automaticamente no
     switcher (`setSelectedEmpresaId`) e leva ao `/dashboard`.
   - Guarda `RequireEmpresa` em `_authenticated/route.tsx`: enquanto a query `["empresas"]`
     carrega mostra spinner; se o usuário não tem nenhuma empresa visível, redireciona para
     `/onboarding`. A própria rota `/onboarding` redireciona de volta ao dashboard se o usuário
     já possui empresa (sem loop: ela fica fora do layout `_authenticated`).

## Pendências conhecidas

- **SMTP próprio (Resend) adiado de propósito**: para testes o SMTP padrão do Supabase
  atende. Para produção, registrar domínio (~R$ 40/ano), verificar no Resend e configurar
  em Authentication → SMTP (host `smtp.resend.com`, porta 465, usuário `resend`,
  senha = API key). Sem domínio verificado, o Resend só entrega ao próprio email do dono.
- O site `norvo-gestao.lovable.app` é legado e pode ficar dessincronizado — não usar como referência.

## Registro de manutenção

10. **Service role key configurada** - `.env` saiu do versionamento (gitignore + `.env.example`
    como modelo); a secret `sb_secret_...` existe no `.env` local e nas env vars da Vercel.
    Nada no código usa `supabaseAdmin` ainda — configuração preventiva.
11. **Limpeza de usuários de teste** - apagados via Auth Admin API no projeto atual; restou
    apenas a conta real do dono (`sptn201169@gmail.com`). O projeto antigo da Lovable está
    abandonado e fora de escopo.
12. **Commits passaram a usar** `vectrainsights@users.noreply.github.com` como autor — a Vercel
    Hobby bloqueia deploys de commits cujo email não está associado à conta GitHub.
13. **Incidente de env vars na Vercel** — ao tirar o `.env` do repo, o site quebrou em produção
    ("Algo saiu do trilho"): as chaves públicas só existiam no arquivo versionado. Corrigido
    cadastrando as 6 vars no dashboard da Vercel. Lição: TODA env var que o app lê deve existir
    no painel da Vercel; `.env` local serve só para desenvolvimento.
14. **"Confirm email" verificado DESATIVADO** — `mailer_autoconfirm: true` confirmado via
    Management API (22/08/2026); AGENTS.md dizia o contrário e foi corrigido.
15. **Último resquício da Lovable removido: o plugin de build.** `vite.config.ts` reescrito com
    config nativa (tailwindcss + tsConfigPaths + tanstackStart com `server.entry = "server"` +
    nitro `defaultPreset: "cloudflare-module"` + viteReact, alias `@`, dedupe, lightningcss,
    envDefine de VITE_*). Deps `@lovable.dev/*` eliminadas; `bun.lock` deletado (apontava para
    registry privado da Lovable). Validado localmente: build `NITRO_PRESET=node-server` OK e
    smoke test HTTP 200 nas rotas `/` e `/auth`.

## Regras de segurança

- NUNCA commitar tokens/senhas (GitHub PAT, senhas de banco, service keys).
- Credenciais coladas em conversas anteriores devem ser rotacionadas quando possível.
