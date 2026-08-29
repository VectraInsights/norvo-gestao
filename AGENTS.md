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
- Repo é **privado**: pull/push exigem PAT fine-grained com Contents Read/Write no repo.
  O PAT está guardado no **Windows Credential Manager** (helper `wincred`, configurado via
  `git config credential.https://github.com.helper wincred`) — a URL do remote NÃO contém
  token (`.git/config` só tem `https://github.com/VectraInsights/norvo-gestao.git`).
  NUNCA commitar tokens nem colá-los na URL.

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
- CNH e toxicológico dos motoristas: `colaboradores.toxico_exame` (último exame;
  validade = exame + 2 anos e 6 meses, CTB art. 148-A — migration `20260828110000`).
  RH exige nº/categoria da CNH + data do exame p/ cargos com "Motorist"; Dashboard alerta
  CNH e toxicológico de ativos vencidos/vencendo em 30 dias; Frota → Viagens BLOQUEIA salvar
  viagem com motorista de documentação VENCIDA (aviso ⚠ já nos 30 dias).
- Módulos novos exigem entrada em `MODULOS` (`src/lib/permissoes.ts`) — `moduloDaRota()`
  deriva o módulo do primeiro segmento da rota. Membros existentes só veem o menu novo após
  o admin marcar o módulo em Configurações → Usuários (owner/admin sempre veem tudo).
- Catálogo de `cargos` (migrations `20260822133000` + `20260824120000` + `20260824210000`
  + `20260824220000`): customizável — os 52 cargos PADRÃO (`empresa_id IS NULL`) existem e
  podem ser renomeados/excluídos como qualquer outro (em padrão, basta ser owner/admin de
  alguma empresa; em cargo de empresa, owner/admin DELA). A ÚNICA restrição é excluir cargo
  vinculado a funcionário: trigger `tg_cargo_guard` bloqueia no banco comparando
  `colaboradores.cargo` (TEXTO com o nome) — em padrão, considera funcionários de TODAS as
  empresas. A UI mostra "padrão" nos globais e quantos funcionários usam cada cargo.
  Cargo no RH é dropdown; VIAGENS e COMISSÕES consideram motoristas os colaboradores
  ativos cujo cargo contém "Motorist" (ILIKE) — não existe coluna `eh_motorista`.
- Adiantamentos (migration `20260824120000`): campo "recorrente" gera conta a pagar mensal.
  A UI chama `public.gerar_adiantamentos_recorrentes()` logo após o INSERT (1ª conta na
  hora; se o dia do mês já passou, a 1ª conta é a do mês seguinte) e o pg_cron diário
  ('adiantamentos-recorrentes') é fallback para os meses seguintes — idempotente por
  `ultimo_mes_gerado`. Regras do lançamento gerado (`20260824170000` + `20260824180000`):
  vencimento em sábado/domingo antecipa para a sexta anterior; descrição = NOME do
  colaborador + sufixo " (recorrência)"; categoria = "Adiantamentos" (tipo pagar, criada
  por empresa se não existir); AUTORIA = criador do adiantamento (`adiantamentos.created_by`,
  que tem DEFAULT auth.uid() desde `20260824180000`) — as contas da madrugada ficam com o
  nome de quem cadastrou a recorrência. EXCLUIR um adiantamento limpa as contas a
  pagar NO BANCO via trigger `tg_adiantamento_delete` (`20260824200000`, SECURITY DEFINER):
  remove a vinculada (`lancamento_id`) e as automáticas em aberto da recorrência
  (observações + descrição = nome do colaborador + mesmo valor); as já PAGAS ficam.
  Adiantamento só é editável enquanto NÃO tem
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
- Folha de pagamento: fluxo de pagamento via botão HandCoins cria `lancamentos_financeiros`
  com `status: "aberto"` e seta folha como `"lançada"` (enum `folha_status`). Lançamento
  é conciliado via extrato bancário → trigger `tg_lancamento_pago_sincroniza_folha` seta
  folha como `"paga"`. Excluir o lançamento reverte folha para `"aberta"` (trigger
  `trg_lancamento_delete_folha` + fallback no front). Categoria = "Salário". Descrição =
  `Nome — MM/AAAA`. Prévia salarial inclui INSS progressivo 2026 e IRRF Lei 15.270/2025;
  abono pecuniário é isento de INSS/IRRF.
- Férias — status automático: pg_cron diário (`ferias-status-automatico`, 00:05 UTC) muda
  `agendada → em_gozo` (quando `data_inicio_gozo <= hoje`) e `em_gozo → concluída`
  (quando `data_fim_gozo < hoje`). Função `atualizar_status_ferias()` SECURITY DEFINER.
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

## Integração SEFAZ (NFe) — detalhes técnicos

- **Arquivo core**: `src/lib/sefaz.ts` — parse PKCS#12 (node-forge), assinatura XML W3C, SOAP 1.2, mTLS
  via `https.Agent(pfx, passphrase)`. Endpoints homologação por UF em `SEFAZ_ENDPOINTS` (SP, MG, GO,
  AM, PR, SC, BA, CE, PE, RS, DEFAULT/SVRS). Serviços nacionais `NFeDistribuicaoDFe` e
  `NFeRecepcaoEvento4` em `hom.nfe.fazenda.gov.br`.

- **Server functions**: `src/lib/sefaz-server.ts` — `createServerFn` que escolhe modo:
  - `SEFAZ_URL` ausente (Vercel/Node.js): mTLS direto (busca certificado no Supabase via service role,
    baixa do Storage, chama `sefaz.ts`)
  - `SEFAZ_URL` presente (Cloudflare Worker): `POST ${SEFAZ_URL}` com body `{action, empresaId, ...}`
    + header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`

- **Proxy Vercel**: `src/server.ts` intercepta `POST /api/sefaz` ANTES do handler TanStack Start.
  Chama `src/lib/sefaz-proxy.ts` (handler puro Web APIs, sem h3/Nitro) que valida Bearer token e
  executa a lógica mTLS idêntica. Rota Nitro `server/api/sefaz.post.ts` REMOVIDA (não registrava).

- **Cloudflare Worker** (`norvo-gestao-cf`): preset `cloudflare-module`, env `VITE_SEFAZ_URL`
  apontando para o proxy Vercel. Worker NÃO suporta mTLS (limitação da plataforma). Deploy
  automático via GitHub Actions (Wrangler) no push em main.

- **Certificados**: tabela `certificados_digitais` + bucket Storage `certificados` (RLS por empresa).
  Upload em `/configuracoes/fiscal` → valida thumbprint/validade via node-forge → inserção atômica.
  Senha armazenada em `senha_cript` (service role). Busca via `buscarCertificadoAtivo(empresaId)`
  retorna `{pfx, senha, cnpj, uf}`.

- **Frontend**: `/fiscal/recebidas` (consultar + manifestar), `/fiscal/emitidas` (emitir),
  `/fiscal/configuracoes` (upload/preview). CT-e/MDF-e mockados REMOVIDOS.
