# Norvo Gestão

ERP web (financeiro, vendas, estoque, fiscal, RH, projetos) com backend Supabase.
Dono do projeto: VectraInsights. Conversas com o agente podem ser em português.
> Contexto narrativo e histórico de decisões: leia também `HISTORICO.md`.

## Stack

- TanStack Start (SSR) + Vite 8 + React 19 + TypeScript
- Estilização: Tailwind CSS 4 (`@tailwindcss/vite`) + shadcn/ui (pasta `src/components/ui`)
- Rotas: file-based em `src/routes` (TanStack Router; `routeTree.gen.ts` é gerado, não editar)
- Backend: Supabase (auth, Postgres, storage). Credenciais em `.env` LOCAL (não versionado;
  ver `.env.example`). Na Vercel as env vars são configuradas no dashboard do projeto.
- Build: `vite.config.ts` nativo (tailwindcss + tsConfigPaths + tanstackStart + nitro + viteReact).
  Ordem importa: `tanstackStart` ANTES de `viteReact`. O preset do nitro é controlado pela env
  `NITRO_PRESET` (padrão do config: `cloudflare-module`).

## Comandos

```bash
npm install                # deps (package-lock; usamos npm — não existe bun.lock)
npm run dev                # dev server
NITRO_PRESET=node-server npm run build   # build SSR local -> .output/server/index.mjs
                           # roda com: PORT=xxxx node .output/server/index.mjs
node .output/server/index.mjs            # precisa das env vars SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY
```

O preset do nitro vem do `vite.config.ts` (`defaultPreset: "cloudflare-module"`) e pode ser
sobrescrito pela env `NITRO_PRESET` (ex.: `node-server`, `vercel`).

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
- Confirmação de email está DESATIVADA no painel (`mailer_autoconfirm: true`, verificado via
  Management API em 22/08/2026): login por email cria sessão imediata. O SMTP padrão do
  Supabase tem limite baixo — configurar SMTP próprio (Resend + domínio) antes de produção.

## Permissões (3 níveis)

- **Super admin da plataforma** (tabela `super_admins`, dono do projeto): único que cria
  empresas. Verificação server-side em `src/lib/usuarios-api.ts`; client consulta via
  `souSuperAdminFn` (hook `usePermissoes`).
- **Admin da empresa** (`empresa_users.role` = owner/admin): gerencia usuários e módulos
  do próprio CNPJ na página `/configuracoes/usuarios`. RLS `empresa_users_manage_admins`
  autoriza os updates client-side.
- **Membro** (role viewer): vê apenas os módulos marcados em `empresa_users.modulos`
  (array vazio = nenhum; Dashboard sempre visível). Restrição aplicada no menu/Ctrl+K e
  com tela "Sem acesso" em `app-shell.tsx` via `moduloDaRota()` — NÃO é enforced por RLS.
- Cadastro público desabilitado (`disable_signup: true`): usuários nascem de
  `criarUsuarioEmpresaFn` com senha padrão `Norvo@2026`, trocável em "Minha conta".
- Server functions seguem o padrão: `createServerFn` em arquivo comum (NÃO `.server.ts`),
  import dinâmico do `client.server` DENTRO do handler, token JWT passado no `data`.

## Onboarding

- Usuário sem nenhuma empresa visível é levado a `/onboarding` (guarda `RequireEmpresa` em
  `_authenticated/route.tsx`, query `["empresas"]`). A rota `/onboarding` fica FORA do layout
  `_authenticated` e redireciona ao `/dashboard` se o usuário já tem empresa — não criar loop.
- A criação de empresa depende do trigger/RLS existentes (`created_by = auth.uid()`; o criador
  vira owner automaticamente via trigger no banco).

## Armadilhas conhecidas

- `src/integrations/supabase/client.server.ts` exige `SUPABASE_SERVICE_ROLE_KEY` (secret
  `sb_secret_...`). Configurada no `.env` local; na Vercel deve existir como env var.
  Se algum server function usar admin client sem ela, vai quebrar em runtime.
- `routeTree.gen.ts` é gerado pelo TanStack Router (não editar).
- Ao testar o exe localmente: matar SEMPRE a árvore inteira de processos (o app usa
  single-instance lock; órfãos seguram o lock e fazem novas instâncias saírem em silêncio).
- Tabelas criadas após o export do `types.ts` (ex.: `ferias_periodos`, `ferias_concessoes`) não
  constam no tipo `Database`. Padrão adotado nas páginas de RH: `supabase.from("tabela" as never)`
  + casts `any` com `eslint-disable @typescript-eslint/no-explicit-any` no topo do arquivo.
- Policies usam duas variantes da mesma função: `private.is_empresa_member` (maioria, criada
  nas migrações originais) e `public.is_empresa_member` (tabelas RH/CRM/férias). Ao recriar
  funções SECURITY DEFINER no projeto Supabase, SEMPRE conceder
  `GRANT EXECUTE ON FUNCTION ... TO authenticated;` — sem isso o erro em runtime é
  `permission denied for function ...` (já aconteceu; fix na migration `20260822120100`).
- Férias NÃO tem tabela de períodos: ciclos aquisitivos são calculados no front a partir de
  `colaboradores.data_admissao` (12m + 6m, CLT art. 134). `ferias_concessoes.periodo_inicio`
  guarda o início do ciclo e tem CHECK `periodo_inicio < data_inicio_gozo`. Direito fixo 30d.
- Transferência entre depósitos SÓ pela RPC `public.transferir_estoque` (par
  entrada+saída atômico; estoque global não muda). O enum `transferencia` é inerte no
  trigger (delta 0) — não criar movimentações soltas com esse tipo.
- Relatórios de estoque (`/estoque/relatorios`: curva ABC, giro, parados) e a sugestão de
  reposição são calculados NO FRONT (produtos + movimentações de 12 meses). Consumo valorado
  ao `preco_custo` — o trigger de venda grava preço DE VENDA em `custo_unitario`.
- `ordens_compra`/`ordens_compra_itens`, `veiculos`, `viagens` e `viagem_despesas` não estão
  em `types.ts` (padrão `"as never"` já usado em estoque/frota). Receber OC dispara entrada em
  estoque + conta a pagar via trigger `tg_oc_recebida`.
- Frota & Viagens: despesa em `viagem_despesas` gera CONTA A PAGAR automática (trigger
  `tg_viagem_despesa_pagar`, categoria %combust%/frota%/transporte% senão a 1ª de pagar);
  concluir viagem gera RECEITA única (trigger `tg_viagem_receita`, só na transição para
  'concluida' — editar viagem concluída não duplica). Enum é `'receber'`/`'pagar'`
  (NÃO existe valor 'receita'). Placa de veículo é única por empresa.
- Módulos novos exigem entrada em `MODULOS` (`src/lib/permissoes.ts`) — `moduloDaRota()`
  deriva o módulo do primeiro segmento da rota. Membros existentes só veem o menu novo após
  o admin marcar o módulo em Configurações → Usuários (owner/admin sempre veem tudo).
- Catálogo de `cargos` (migrations `20260822133000` + `20260824120000`): tabela global com
  52 linhas padrão de transportadora (`empresa_id IS NULL`, imutáveis pelo app) + cargos por
  empresa; leitura para qualquer membro, criar/excluir só owner/admin da empresa ou
  super_admin (policies). Cargo no RH é dropdown; VIAGENS e COMISSÕES consideram motoristas
  os colaboradores ativos cujo cargo contém "Motorist" (ILIKE) — não existe coluna
  `eh_motorista`.
- Adiantamentos (migration `20260824120000`): campo "recorrente" gera conta a pagar mensal.
  A UI chama `public.gerar_adiantamentos_recorrentes()` logo após o INSERT (1ª conta na
  hora; se o dia do mês já passou, a 1ª conta é a do mês seguinte) e o pg_cron diário
  ('adiantamentos-recorrentes') é fallback para os meses seguintes — idempotente por
  `ultimo_mes_gerado`. Regras do lançamento gerado (`20260824170000`): vencimento em
  sábado/domingo antecipa para a sexta anterior; descrição = NOME do colaborador (sem
  prefixo); categoria = "Adiantamentos" (tipo pagar, criada por empresa se não existir).
  Geração manual na UI segue as mesmas regras. EXCLUIR um adiantamento remove junto as
  contas a pagar em aberto geradas por ele (vinculada via `lancamento_id` ou, no caso
  recorrente, por observações="Gerado automaticamente pelo adiantamento recorrente" +
  descrição = nome; as já PAGAS ficam). Adiantamento só é editável enquanto NÃO tem
  `lancamento_id`; depois disso o valor muda pela tela financeira. O STATUS do
  adiantamento é espelho do
  lançamento vinculado: trigger `tg_lancamento_sync_adiantamento` marca 'descontado'
  (= pago) quando o lancamento vai a 'pago' e reverte se reabrir — NUNCA setar esse status
  na mão pela UI.
- Campos de data usam `<DateInput>` (`src/components/erp/date-input.tsx`: input nativo +
  popover de calendário pt-BR). Não criar `<Input type="date">` solto em páginas novas.
  EXCEÇÃO (decisão do dono): financeiro/contas e financeiro/receber usam input nativo.
- Férias: prazo de concessão = fim do período aquisitivo +12 meses −30 dias (concessivo
  completo do art. 134 com folga; NÃO é +6 meses). Cálculo em `ciclosAteHoje()` no front.
- Colunas novas fora do types.ts (ex.: `produtos.categoria`, CNH em colaboradores) pedem
  cast duplo no retorno de queries tipadas: `(data ?? []) as unknown as Tipo[]`.
- Colunas DATE ("YYYY-MM-DD") NÃO podem ir direto para `new Date()` quando o resultado é
  formatado em fuso local (date-fns `format`, comparação com limites de mês etc.): UTC-3
  desloca para o dia anterior. Usar `parseDia` (extrato) ou `new Date(s + "T00:00:00")`
  (contas) ou `dateBR` (`src/lib/format`, que força timeZone UTC). Já deu bug real no extrato.
- `colaboradores.telefone` pode conter vários números separados por " / " (UI multi-input).
  Obrigatoriedade (nome/CPF/cargo/salário/admissão/telefone) é validada no app, não no banco.
- Commits devem usar o autor `vectrainsights@users.noreply.github.com` (config local do clone);
  outro email faz a Vercel Hobby bloquear o deploy.
