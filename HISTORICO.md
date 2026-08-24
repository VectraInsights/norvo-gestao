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
16. **Módulo Férias (DP/RH)** — migration `20260822120000`: tabelas `ferias_periodos` (aquisitivo
    12m + limite de concessão 18m calculados das datas) e `ferias_concessoes` (gozo, abono
    pecuniário ≤10 dias, adiantar 13º, `dias` gerado no banco), com RLS `is_empresa_member`,
    grants e triggers no padrão do projeto. Aplicada via Management API. Rota `/rh/ferias`
    seguindo o padrão visual das demais páginas: alertas de concessão vencendo (60 dias) e
    vencida (risco de pagamento em dobro, CLT art. 137), validação de saldo, gozo mínimo de
    5 dias e venda máxima de 10. Menu lateral + Ctrl+K atualizados.
    **Fora de escopo por enquanto (conforme decisão de produto):** integração eSocial,
    cálculo automático de verbas rescisórias, banco de horas/ponto.
    Ajustes pós-teste (22/08): embed PostgREST `colaboradores` em many-to-one retorna OBJETO
    (não array) — corrigido acesso que deixava o nome em branco na tabela; adicionada edição
    do período aquisitivo (reabre o diálogo preenchido; colaborador fica travado, datas
    recalculam fim/limite, direito não pode ficar abaixo do já utilizado).
18. **Redesign Férias: controle automático** — a pedido do dono ("não é mais fácil mostrar
    todos os trabalhadores com situação de férias?"), os períodos aquisitivos passaram a ser
    DERIVADOS da `data_admissao` (ciclos de 12m + 6m para conceder, CLT art. 134). A tabela
    manual `ferias_periodos` foi REMOVIDA (migration `20260822120200`: 1 registro de teste,
    0 concessões na época) e `ferias_concessoes` passou a identificar o ciclo pela coluna
    `periodo_inicio` (com CHECK `periodo_inicio < data_inicio_gozo`). A página `/rh/ferias`
    agora lista um colaborador por linha: admissão, períodos em aberto, saldo total,
    "conceder até" (prazo mais próximo) e situação (Vencida / vence em 60d / Em dia /
    Sem data de admissão), com banners de alerta. Conceder abre diálogo com escolha do ciclo
    aberto, datas de gozo (mín. 5d, após fim do ciclo), abono ≤10d e 13º adiantado; concessões
    existentes listadas com status editável. Direito fixo em 30 dias no MVP (proporcional
    fica para depois).
19. **Cadastro de colaboradores endurecido** — obrigatórios: nome, CPF (11 dígitos),
    cargo, salário >0, data de admissão (insumo das férias automáticas) e ao menos um
    telefone — múltiplos números permitidos, salvos juntos no campo texto `telefone`
    separados por " / " (migração para tabela própria quando houver integração WhatsApp/SMS).
    Campo data de demissão adicionado ao formulário (obrigatório quando status = demitido;
    coluna já existia). Validações são no app, sem NOT NULL no banco (linha real anterior
    ficaria inválida).
20. **Modelo de acesso em 3 níveis (modo "aluguel"/SaaS)** — decisão do dono: ele é o
    SUPER ADMIN da plataforma (cria as empresas-cliente/aluguéis); cada empresa pagante tem
    um ADMIN que cria os usuários do próprio CNPJ com senha padrão e define módulos; membros
    veem apenas os módulos marcados. Implementação:
    - Migration `20260822120300`: tabela `super_admins` (sem policies, só service role;
      helper `private.is_super_admin`), dono inserido; policy de INSERT em `empresas`
      trocada para exigir super admin (antes qualquer um criava CNPJ);
      `empresa_users.modulos text[]` (vazio em membro = só Dashboard) + colunas denormalizadas
      `nome`/`email`.
    - Server functions (`src/lib/usuarios-api.ts`, createServerFn + service role):
      `criarUsuarioEmpresaFn` (auth.admin.createUser com email_confirm + insert em
      empresa_users, com rollback), `resetarSenhaUsuarioFn`, `souSuperAdminFn`. Todas validam
      que o chamador é super admin ou owner/admin da empresa.
    - Página `/configuracoes/usuarios`: lista membros, criar acesso (nome/email/senha
      padrão `Norvo@2026`/papel/módulos), editar permissões (client-side, RLS
      `empresa_users_manage_admins` autoriza), resetar senha, remover acesso. Owner não é
      editável.
    - Filtro de menu/Ctrl+K por permissão (`usePermissoes` + `moduloDaRota`) e bloqueio de
      página ("Sem acesso a este módulo"). "Alterar senha" no menu Minha conta
      (`AlterarSenhaDialog`). "+ Nova empresa" visível só ao super admin.
    - Cadastro público DESABILITADO no Supabase (`disable_signup: true` via Management API):
      ninguém se auto-registra; todo acesso nasce de convite interno do admin.
    - Limitações MVP: restrição por módulo é na UI (RLS continua isolando por EMPRESA,
      não por módulo); super admin não vê empresas onde não é membro (gerenciar via SQL).

21. **Estoque focado em transportadora** — análise do texto com sugestões genéricas de
    gestão de estoque contra o contexto real (MVP, cliente-tipo transportadora: pneus,
    peças, óleo, ARLA): ADIAR lotes/validade, nº série, endereçamento, reservas,
    romaneio e código de barras; implementar o que fecha o ciclo operacional barato:
    - Migration `20260822130000`: RPC `public.transferir_estoque(produto, qtd, origem,
      destino, obs)` SECURITY DEFINER — valida papel owner/admin/estoque, depósitos da
      mesma empresa e saldo; grava o PAR entrada(destino)+saída(origem) numa transação
      (entrada primeiro evita alerta falso de estoque baixo). Estoque global não muda.
    - `/estoque/inventario`: contagem física por produto; divergências viram ajustes com
      sinal ao custo padrão, opcionalmente ligadas a um depósito; filtro "somente
      divergências" e impacto em R$ nos filtros.
    - `/estoque/reposicao`: itens com atual <= mínimo, sugestão max(2×mín − atual, mín)
      editável; gera ordem de compra rascunho (fornecedor obrigatório, conta/depósito/
      previsão opcionais). Receber a OC segue gerando entrada + conta a pagar.
    - `/estoque/relatorios`: valor em estoque, consumo 12m valorado ao CUSTO PADRÃO (o
      trigger de venda grava PREÇO de venda em custo_unitario — não usar), giro anual,
      curva ABC 80/95 e itens parados (janela 60/90/180d). Tudo calculado no front.
    - Movimentações: dialog "Transferir" via RPC + coluna Depósito; opção "transferencia"
      removida do form simples (era inerte — trigger dá delta 0).
22. **Fix RLS "permission denied for function is_empresa_member"** — ao criar o primeiro
    colaborador no projeto novo, todo INSERT/SELECT em tabelas cujas policies usam a versão
    pública da função (colaboradores, comissoes, adiantamentos, emprestimos, folha_pagamento,
    crm_*, ferias_*) falhava: a função foi recriada com ACL restrita (só postgres/service_role),
    sem grant para `authenticated` (a versão `private.` sempre teve o grant certo).
    Corrigido com `GRANT EXECUTE ... TO authenticated` (migration
    `20260822120100`) e validado simulando o role via `SET ROLE authenticated`.
23. **Quick wins transportadora (categoria + CNH)** — migration `20260822131000`: coluna
    `produtos.categoria` (índice empresa+categoria) e `colaboradores.cnh_numero/
    cnh_categoria/cnh_validade`. Produtos ganhou campo categoria com datalist e filtro;
    RH ganhou seção CNH opcional no formulário; o Dashboard lista motoristas com CNH
    vencida ou vencendo em até 30 dias junto dos alertas de estoque.
24. **Módulo Frota & Viagens** — núcleo operacional da transportadora (migration
    `20260822132000`, tabelas `veiculos`, `viagens`, `viagem_despesas`; tipos
    veiculo_status e viagem_status; placa única por empresa):
    - `/frota/veiculos`: CRUD de caminhões (placa, modelo, tipo, ano, RNTRC, KM, status).
    - `/frota/viagens`: fretes com cliente/motorista/veículo, rota cidade+UF, datas,
      valor do frete e KM; KPIs do mês (em trânsito, fretes, resultado = frete − despesas);
      fluxo planejada → em trânsito → concluída (ou cancelada).
    - Automação financeira: cada despesa da viagem (diesel/pedágio/manutenção/outros)
      gera CONTA A PAGAR automática (categoria tenta %combust%/frota%/transporte%, senão
      a primeira de pagar) e fica vinculada por `lancamento_id`; concluir a viagem gera
      RECEITA única no contas a receber (trigger dispara só na transição de status).
    - Testado ponta a ponta via SQL: despesa→pagar ✓, vínculo ✓, conclusão→receita ✓,
      sem duplicação ✓, limpeza ✓. Módulo 'frota' adicionado às permissões (membros
      existentes precisam ter o módulo marcado pelo admin para ver o menu).
25. **Catálogo de cargos + filtro de motoristas** — substituiu (no mesmo dia) uma marcação
    "é motorista" que havia sido criada: agora existe a tabela `cargos` com 10 cargos
    padrão de transportadora (Motorista, Motorista Carreteiro, Ajudante, Mecânico,
    Estoquista, Administrativo, Financeiro, Atendimento, Comercial, Gerente) e suporte a
    cargos por empresa. O formulário de RH usa dropdown; botão "Cargos" na página cria/
    exclui cargos da empresa — permitido SOMENTE a owner/admin ou super admin (RLS).
    Nas viagens, aparecem como motoristas apenas os colaboradores ativos com cargo
    contendo "Motorist". Para esses cargos, nº da CNH e categoria são OBRIGATÓRIOS
    (validação no app) e a categoria virou dropdown (ACC, A, B, AB, C, D, E).

26. **Pacote de melhorias de DP/RH e UX (24/08/2026)** — feedback do dono após testar:
    - **Adiantamento recorrente mensal**: campo "Parcelas" REMOVIDO (gerava 1 lançamento com
      o total — bug). No lugar, checkbox "Recorrente mensal" + dia do pagamento (1–31).
      Um job pg_cron (`adiantamentos-recorrentes`, diário 03:15 UTC) chama a função
      `public.gerar_adiantamentos_recorrentes()`, que cria a conta a pagar do mês quando o
      dia chega (idempotente via `ultimo_mes_gerado`; dia ≥29 cai no último dia do mês).
      Avulsos continuam com botão manual de gerar conta.
    - **Amarração adiantamento ↔ financeiro**: trigger `tg_lancamento_sync_adiantamento`
      marca o adiantamento como PAGO automaticamente quando o lançamento vinculado é quitado
      (baixa manual ou conciliação bancária); se o lançamento reabrir, volta a Em aberto.
      Botão manual "Descontado" removido da UI.
    - **Calendário em todos os campos de data**: componente `DateInput`
      (`src/components/erp/date-input.tsx`) = input nativo + ícone que abre calendário
      pt-BR. Substituiu os campos de data de 11 páginas. Exceção pedida pelo dono:
      contas a pagar e a receber seguem com o input nativo simples.
    - **Catálogo de cargos efetivos** (migration `20260824120000`): saíram os genéricos
      ("Administrativo", "Financeiro", etc.); entraram ~47 cargos reais de transportadora
      (Gerente/Supervisor/Encarregado/Analista/Assistente/Auxiliar de Transportes,
      Logística, Frota, Pátio, Expedição..., Eletricista, Conferente, Operador de
      Empilhadeira). Mantidos Motorista, Motorista Carreteiro, Mecânico, Ajudante,
      Estoquista. 52 cargos padrão no total.
    - **Comissões só para motoristas**: lista de colaboradores filtrada por cargo
      ILIKE '%motorist%' (query própria, sem afetar adiantamentos/folha).
    - **Férias: prazo concessivo corrigido** — antes era fim do aquisitivo +6m; agora o
      período concessivo completo (+12m) com folga de 30 dias: limite = fim + 12m − 30d
      (admissão 19/02/2024 → conceder até 19/01/2026).
    - Título da seção CNH no cadastro virou apenas "CNH".
    - Migração aplicada localmente via pooler (`scripts/apply-migration.cjs`, usa env
      DATABASE_URL); teste da automação/trigger rodou em transação revertida.

## Registro de manutenção — 24/08/2026 (tarde): adiantamentos e extrato

- **Geração imediata**: ao cadastrar adiantamento recorrente, a 1ª conta a pagar nasce na
  hora (UI chama a função de geração; `GRANT EXECUTE` para authenticated na migration
  `20260824150000`). O pg_cron noturno continua como fallback dos meses seguintes.
- **Dia útil** (migration `20260824170000`): vencimento que cair em sábado/domingo
  antecipa para a sexta anterior. Lançamento existente do Victor (dia 20 → dom 20/09)
  foi corrigido no banco para 18/09.
- **Descrição/categoria**: lançamento de adiantamento (recorrente OU gerado na UI) fica
  com descrição = nome do colaborador e categoria "Adiantamentos" (tipo pagar; criada
  automaticamente por empresa se não existir). Sem prefixo "Adiantamento recorrente -".
- **Bug de fuso no extrato**: colunas DATE ("YYYY-MM-DD") formatadas com date-fns direto
  apareciam um dia a menos no fuso -3 (ex.: 20/09 mostrava 19/09). Corrigido com helper
  `parseDia` (meia-noite local) no filtro, na tabela e no CSV.
- Checkbox de recorrência simplificado para apenas "Recorrente" (sem texto explicativo).
- DateInput: ícone nativo do input de data escondido (`::-webkit-calendar-picker-indicator`)
  para não duplicar com o ícone do calendário pop-up. Import faltando corrigido em
  rh.colaboradores.tsx; contas a pagar/receber voltaram ao input nativo (decisão do dono).

## Regras de segurança

- NUNCA commitar tokens/senhas (GitHub PAT, senhas de banco, service keys).
- Credenciais coladas em conversas anteriores devem ser rotacionadas quando possível.
