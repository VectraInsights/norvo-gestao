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
- **Contas a pagar/receber**: "Lançado por" saiu da lista e aparece só dentro do diálogo
  do lançamento (bug: a reconsulta de edição não pedia `created_by/created_at` — autor
  nunca aparecia); vencimento da lista tinha o mesmo bug de fuso (17/09 → 18/09).
- **Adiantamentos**: excluir agora remove também as contas a pagar EM ABERTO geradas por
  ele (as pagas ficam no histórico); botão Editar habilitado enquanto o adiantamento não
  foi enviado ao contas a pagar; recorrente sem lançamento vinculado também edita.
- **Autoria das contas de recorrência** (migration `20260824180000`): `adiantamentos.created_by`
  ganhou DEFAULT auth.uid() e a função de geração replica esse criador no lançamento —
  contas geradas até de madrugada ficam com o nome de quem cadastrou a recorrência.
  O marcador de recorrência fica JUNTO AO AUTOR na UI (não na descrição, que ficou só
  com o nome do colaborador — migration `20260824190000` reverteu o sufixo).
- **Limpeza garantida no banco** (migration `20260824200000`): trigger
  `tg_adiantamento_delete` em adiantamentos remove as contas a pagar EM ABERTO ao excluir
  o adiantamento (vinculada + automáticas da recorrência; pagas permanecem). Testado em
  transação revertida: gerou → excluiu → conta sumiu. Órfãs deixadas por testes anteriores
  foram removidas manualmente.
- **Cargos customizáveis** (migrations `20260824210000` + `20260824220000`): dono pediu
  liberdade total — primeiro o padrão foi apagado por engano de interpretação e RESTAURADO
  em seguida (com acentos corrigidos; o arquivo original da 121200 estava com mojibake).
  Estado final: catálogo padrão existe, mas TUDO é renomeável/excluível; exclusão bloqueada
  no banco apenas quando o nome está vinculado a algum funcionário (trigger
  `tg_cargo_guard`; em cargos padrão considera todas as empresas). Diálogo no RH mostra
  "padrão", contagem de funcionários por cargo, renomear inline e excluir.

- **Folha de pagamento — status "paga" só após conciliação** (migration
  `20260825030000`, commit `dbe7af4`): fluxo antigo marcava folha como "paga" e o trigger
  `tg_folha_paga` criava o lançamento financeiro já quitado — sem passar pela conciliação
  bancária. Agora: botão "Pagar" cria `lancamentos_financeiros` com `status: "aberto"` e seta
  folha como `"lançada"` (novo valor no enum `folha_status`). Quando o lançamento é conciliado
  via extrato bancário, o novo trigger `tg_lancamento_pago_sincroniza_folha` sincroniza a folha
  para "paga". Trigger antigo removido. Badge "lançada" em sky na UI; botões de edição/
  exclusão ocultos para status "lançada" e "paga".

- **Folha — excluir lançamento reverte status** (migration `20260825040000`, commit
  `2b08a4b`): trigger `tg_lancamento_delete_sincroniza_folha` ao deletar
  `lancamentos_financeiros` reverte folha para "aberta" e limpa `lancamento_id`. Fallback
  no front (`financeiro.receber.tsx`) atualiza folha via client antes do DELETE + invalida
  query `["folha"]`.

- **Folha — descrição e categoria** (commit `cd940db`): descrição do lançamento agora é
  `Nome — MM/AAAA` (antes `Folha MM/AAAA — Nome`). Categoria criada/busca por "Salário"
  (antes "Folha de Pagamento"). Texto "pendente de conciliação" removido de tooltip/header/
  toast. Botão excluir visível para todos os status (com confirm).

- **Férias — formulário de concessão inline** (commit `1d87e9c`): formulário abre logo
  abaixo do período selecionado (antes ficava no final da lista). Removido `({dias}d)` das
  concessões.

- **Férias — abono pecuniário** (commits `07ca74f`, `0947d4d`): campo começa vazio,
  setinhas do input numérico removidas (`appearance:textfield`), pré-cálculo desconta abono
  na data fim (30 − abono dias).

- **Férias — prévia salarial com impostos** (commits `1f59520`, `ee124a0`, `d756d75`):
  card de preview mostra férias bruto + ⅓, INSS progressivo 2026 (até R$ 988,09), IRRF
  Lei 15.270/2025 (isento até R$ 5.000 do bruto, não do salário base). Abono pecuniário
  isento de INSS/IRRF. 13º adiantado com desconto próprio.

- **Férias — transição automática de status** (migration `20260825050000`, commit
  `1f59520`): pg_cron diário (`ferias-status-automatico`, 00:05 UTC) roda
  `atualizar_status_ferias()` que muda `agendada → em_gozo` (quando `data_inicio_gozo <=`
  hoje) e `em_gozo → concluída` (quando `data_fim_gozo < hoje`). Função SECURITY DEFINER.

## Registro de manutenção — 25/08/2026: Módulo Fiscal — SEFAZ (NFe) completo

- **Certificado digital multi-tenant** (migration `20260825060000`): tabela `certificados_digitais`
  (empresa_id, arquivo_path, thumbprint, validade, senha_cript, ativo) + bucket Storage `certificados`
  (RLS por empresa). Upload de `.pfx` em `/configuracoes/fiscal` → validação via node-forge
  (thumbprint, validade, subject/issuer) + inserção atômica. Senha armazenada criptografada
  (service role); visualização de thumbprint/validade na UI sem expor o arquivo.

- **Serviço SEFAZ core** (`src/lib/sefaz.ts`):
  - Parse PKCS#12 (node-forge) → extrai chave privada + cadeia X.509
  - Assinatura XML W3C (enveloped signature, SHA-1, canonicalização C14N exclusiva)
  - SOAP 1.2 sobre HTTPS com mTLS (node-forge `https.Agent` com PFX + senha)
  - Endpoints homologação por UF: SP (próprio), MG (próprio), GO, AM, PR, SC, BA, CE, PE, RS,
    DEFAULT/SVRS para demais; NFeDistribuicaoDFe + RecepcaoEvento nacionais (Ambiente Nacional)
  - Operações: `consultarDestinatario` (NFeDistribuicaoDFe), `enviarEventoManifestacao`
    (210200/210210/210220), `emitirNFe` (NFeAutorizacao)

- **Server functions** (`src/lib/sefaz-server.ts`):
  - `consultarNFeDestinatarioFn`, `manifestarNFeFn`, `emitirNFeFn`, `verificarStatusServicoFn`
  - Modo direto (Vercel/Node.js): `createServerFn` + mTLS direto (busca certificado no Supabase,
    baixa do Storage, assina/envia)
  - Modo proxy (Cloudflare Worker): env var `SEFAZ_URL` (ou `VITE_SEFAZ_URL`) apontando para
    `/api/sefaz` no Vercel → o Worker chama o proxy via HTTP + Bearer service role key

- **Proxy SEFAZ no Vercel** (`src/server.ts` intercepta `POST /api/sefaz` ANTES do TanStack Start):
  - Handler puro Web APIs (`src/lib/sefaz-proxy.ts`, sem h3/Nitro)
  - Autentica via `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
  - Executa a mesma lógica mTLS das server functions
  - Evita rota Nitro `server/api/sefaz.post.ts` (não registrava — TanStack Start captura entry)

- **Frontend integrado**:
  - `/fiscal/recebidas`: botões "Sincronizar" (consulta destinatário) e "Manifestar"
    (Ciência/Confirmação/Desconhecimento) reais
  - `/fiscal/emitidas`: "Emitir" real (assinatura + envio) com fallback simplificado
  - `/fiscal/configuracoes`: upload `.pfx` → validação + preview thumbprint/validade

- **Cloudflare Worker** (`norvo-gestao-cf`): preset `cloudflare-module`, env vars
  `VITE_SEFAZ_URL=https://norvo-gestao.vercel.app/api/sefaz`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`.
  Deploy automático no push (GitHub Actions via Wrangler). Worker NÃO faz mTLS (limitação
  da plataforma) — delega ao Vercel.

- **Commits**: `034c29c` (proxy), `81b767e` (endpoints corrigidos SVRS), `04e6de4` (todos estados).

18. **Fix endpoints SEFAZ Nacionais (HTTP 404)**:
   - O endpoint de **produção** `NFeDistribuicaoDFe` estava errado: `www.nfe.fazenda.gov.br` → `www1.nfe.fazenda.gov.br` (fonte: lista oficial SP Fazenda).
   - O endpoint de **homologação** também estava errado: `www1.nfe.fazenda.gov.br` → `hom.nfe.fazenda.gov.br`.
   - `NFeRecepcaoEvento4` em homologação: `www.nfe.fazenda.gov.br` → `hom.nfe.fazenda.gov.br`.
   - Versão do `distDFeInt`: `1.01` → `1.00` (conforme WSDL e NT 2014.002).
   - Commits: `b23580a` (Vercel), `e542dde` (CF).

19. **Fix cUFAutor (cStat 137)**: código `91` hardcoded → código IBGE da UF da empresa via `getCodigoUf(uf)`.
    Commits: `361bc6e`, `f48be91`.

20. **Persistência do cursor SEFAZ (cStat 656 "Consumo Indevido")**:
    - Coluna `last_nsu` adicionada à tabela `nfe_config` (migration `20260826150000`).
    - Após cada consulta, `maxNSU` é salvo para retomar de onde parou.
    - Se cStat 656 (outro sistema avançou o cursor), reseta automaticamente para zero e refaz.
    - Toast exibe info de debug (cStat, endpoint, ambiente, CNPJ, cUFAutor).
    Commits: `427283b`, `3aeaad1`.

21. **Cron job SEFAZ 2x/dia** (`vercel.json` + `src/lib/sefaz-cron.ts`):
    - Vercel Cron roda às 8h e 20h BRT (`0 11,23 * * *` UTC).
    - Busca notas de todas as empresas com certificado ativo, 2s de pausa entre cada uma.
    - Endpoint manual: `GET /api/sefaz-cron`.
    - Commits: `eedf18b`, `b8007d1`.

22. **PFX fallback para mTLS (LCP TRANSPORTES)**:
    - Certificados A1 brasileiros com AES-256 + SHA-256 HMAC não são suportados pelo
      `https.Agent` do Node.js (mesmo que `crypto.createPrivateKey` funcione).
    - Solução: `createSefazAgent` agora **sempre** extrai key+cert via `extractPkcs12Native`
      e passa separadamente ao Agent (nunca passa o PFX direto).
    - Commits: `7063153`, `e7ff5bc`.

23. **Olho na senha do certificado**: toggle show/hide no campo de senha do upload de PFX
    em `/configuracoes/fiscal`. Commit: `17ffc72`.

**Problema pendente**: LCP TRANSPORTES (CNPJ 01666018000190) ainda retorna
"Unsupported PKCS12 PFX data". O fallback de extração via crypto nativo pode estar falhando
no parse ASN.1 da cadeia de certificados (`extractCertChainFromPkcs12`). Investigar se o
certificado tem estrutura PKCS12 não padrão ou se `extractPkcs12Native` precisa de ajuste.

24. **Fix createSefazAgent — type pkcs12 inválido**: `crypto.createPrivateKey` do Node.js v24
    não aceita `type: "pkcs12"`. Revertido para usar `pfx` direto no `https.Agent` (método
    nativo correto). Commits: `3b9c687` (Vercel) / `4e33f83` (CF).

25. **Cooldown 5 minutos entre consultas SEFAZ**: coluna `last_query_at` em `nfe_config`
    (migration `20260827150000`). Proxy e server function verificam intervalo mínimo antes de
    consultar. Se menos de 5min, retorna `cooldown: true` com `cooldownMinutos`. Front-end
    mostra "Aguarde antes de sincronizar" com tempo restante. Evita cStat 656 "Consumo Indevido"
    por consultas muito frequentes. Commits: `64e223a` (Vercel) / `df1d39d` (CF).

26. **Timer de retry correto (cStat 656)**: `last_query_at` agora só é atualizado em consulta
    SUCESSO (cStat 138/137). cStat 656 não mexe no timer — a contagem de 1h começa da última
    vez que *conseguimos* consultar, não do último clique. Commits: `7a21484` / `2a53277`.

27. **Cron job SEFAZ a cada 20min (00:00–07:00 BRT)**: `vercel.json` com
    `*/20 3-9 * * *`. Cron pula empresa se `last_query_at` < 1h (evita cStat 656).
    Commit: `c996d9e`.

28. **Importar NF-e por chave de acesso**: nova função `consultarPorChave` usa `consChNFe`
    (mesmo endpoint NFeDistribuicaoDFe). Botão "Importar por Chave" abre modal com input de
    44 dígitos. Consulta SEFAZ, retorna dados da nota e adiciona à lista. Server function
    `consultarNFePorChaveFn` + proxy handler `consultarChave`. Commit: `c996d9e`.

29. **Fiscal — Notas Recebidas → Notas de Compra + correções de importação** (commits `5fbf1ce`, `e9f9cb3`, `ee6a98a`):
    - Rename: `nav-config`/`breadcrumbs`/`command-palette`/`fiscal.relatorios`/`fiscal.contador` de
      "Notas Recebidas" para **"Notas de Compra"** (revertido 1x por engano, voltado ao final).
    - Fix exclusão de nota: cascade delete trocou ordem — parcelas são excluídas ANTES dos
      `lancamentos_financeiros` para não violar FK `notas_importadas_parcelas.lancamento_id`
      (`fiscal.recebidas.tsx`).
    - Categoria obrigatória no import XML: `Input` + `datalist` (vazio quando sem produtos
      categorizados) trocado por `Select` alimentado por `categorias_financeiras` (tipo pagar)
      tanto no card `importResults` quanto no modal `notaDetalhe`. Validação `semCategoria` mantida.
    - Financeiro programado: `handleConfirmarXmlUpload` agora parseia `cobr/dup` do XML (`parseParcelasDoXml`
      inline), estende `ParsedXMLResult` com `parcelas`, exibe lista de parcelas no card (nDup/dVenc/vDup)
      e na confirmação cria 1 lançamento por parcela (com `lancamento_id` linkado em `notas_importadas_parcelas`);
      fallback cria 1 título 30d se XML sem dup. Antes criava 1 título fixo 30d ignorando o XML.
    - Fix crash "Algo saiu do trilho": import `Select` faltava em `fiscal.recebidas.tsx` (Vite buildou,
      runtime quebrou). Adicionado `Select, SelectContent, SelectItem, SelectTrigger, SelectValue`.

30. **Deduplicação de categorias financeiras + Categoria pai removida** (commit `dedup` + este):
    - Bug raiz: `rh.folha.tsx` buscava categoria Salário com `ilike "%sal%C3%A1rio%"` (URL-encoded)
      que nunca casava no Postgres, então cada lançamento de folha fazia `INSERT "Salário"`,
      gerando 8 duplicatas idênticas (screenshot). Sem constraint no banco, duplicava livremente.
      Outras duplicatas: `Fornecedores` (2 empresas).
    - Correção no código: `ilike "%Salário%"` + tratamento `23505` (unique violation) com retry
      select; `financeiro.cadastros.tsx` validação de duplicata passou a considerar `tipo`
      (`norm(c.nome) + c.tipo`) e também trata `23505` do banco.
    - Banco: função `public.immutable_unaccent(text)` (wrapper IMMUTABLE do `unaccent`) +
      índices únicos `uq_categorias_empresa_tipo_nome_unaccent` e `uq_categorias_empresa_tipo_nome_lower`
      em `(empresa_id, tipo, lower(...trim(nome)))` — bloqueia duplicata case/acento-insensível
      dentro do mesmo tipo. Deduplicação via `UPDATE lancamentos/parent_id + DELETE` já executada
      em produção (8 Salário → 1, Fornecedores duplicados removidos).
    - Migration `20260828000000_dedup_categorias_financeiras.sql` espelha o fix para novos ambientes.
    - UI: campo **"Categoria pai"** removido do dialog de categoria (`financeiro.cadastros.tsx`);
      a coluna já havia sido removida da tabela. Todas categorias agora são principais
      (`parent_id = null`); hierarquia existente preservada no banco mas não editável na UI.

31. **Criação inline de categoria no import de Notas de Compra — 27/08/2026** (commit `0cee988`):
    - Coluna **Categoria** em `fiscal.recebidas.tsx:1368,1562` ganhou opção **"+ Nova categoria"**
      no `Select` (importResults e notaDetalhe). Selecionar abre dialog (`novaCatOpen`) que faz
      `INSERT categorias_financeiras (tipo pagar)` e já preenche o produto com a nova categoria,
      invalidando `categorias-financeiras-pagar`/`cadastros-categorias`/`categorias-opt`.
    - Mutation `criarCategoriaInline` com tratamento `23505` e `toast`.

33. **Estrutura CT-e / MDF-e — 28/08/2026** (este commit):
    - Emissão CT-e (57) e MDF-e (58) adiada anteriormente (~2–3 semanas) agora com **fase 1
      de estrutura** para desbloquear implantação incremental:
    - Migration `20260828010000_cte_mdf_estrutura.sql` já aplicada em prod: tabelas
      `cte_documentos` (rascunho/assinado/autorizado/rejeitado/cancelado/denegado, FK viagem/veículo/tomador,
      xml_assinado/protocolo) + `mdf_documentos` (rascunho/autorizado/cancelado/encerrado, veículo tração,
      motorista, UF carga/descarga) + `mdf_cte_vinculos` (N:N), RLS `is_empresa_member`, índices, triggers `updated_at`.
    - Libs `src/lib/sefaz-cte.ts` e `sefaz-mdf.ts` com `ENDPOINTS` hom/prod (AN/SVRS), builders
      `buildCteXmlBase`/`buildMdfXmlBase` (esqueleto 4.00/3.00), stubs `signCteXml`/`signMdfXml`
      (fase 2 reaproveita `signXml` com `<infCte Id>`/`<infMDFe Id>`) e funções stub `emitir*`.
    - Server fns `sefaz-cte-server.ts`/`sefaz-mdf-server.ts` (createServerFn) delegando via
      `SEFAZ_URL` → proxy Vercel (`/api/sefaz`) quando em CF, senão stub fase 1.
    - Proxy `sefaz-proxy.ts` com cases `emitirCte/consultarCte/cancelarCte/emitirMdf/encerrarMdf/cancelarMdf`
      retornando `{fase:1}` até mTLS.
    - Rotas `fiscal.cte.tsx` e `fiscal.mdf.tsx` (cards fase 1, EmptyState, listagem Supabase).
    - Nav `Fiscal` com itens **CT-e** e **MDF-e** (`nav-config.ts:121`).
    - Fase 2 (iniciada neste commit): `sefaz.ts` exporta `createSefazAgent` + `signXml` genérico
      para `<infNFe|infCte|infMDFe Id>` e insere `<Signature>` em `</CTe>`/`</MDFe>`; `sefaz-cte.ts`
      reescrito com `CTE_ENDPOINTS` SVRS hom/prod reais, `gerarChaveCte`/DV mod11, `buildCteXml`
      completo (ide/emit/rem/dest/vPrest/imp/infCTeNorm/rodoviário RNTRC) e `emitirCte`/`consultarCte`/`cancelarCte`
      via SOAP 1.2 mTLS; `sefaz-cte-server.ts` e `sefaz-proxy.ts` agora executam emissão real
      (numeração sequencial `cte_documentos`, insert `autorizado`/`rejeitado` com protocolo),
      delegando CF→Vercel quando `SEFAZ_URL` presente. UI `fiscal.cte.tsx` com dialog Novo CT-e,
      consulta e cancelamento. MDF-e permanece stub até CT-e homologado.
    - Fase 2 (próximos): homologação SVRS com RNTRC real, testes CFOP/ICMS, vinculação Viagem→CT-e,
      MDF-e completo e encerramento.
      SOAP mTLS por UF (validar URLs SP/MG/RS × SVRS), server fns reais, UI de emissão vinculada
      a Viagens/Veículos.

32. **Fix categoria não persistia no produto — 27/08/2026** (este commit):
    - `handleConfirmarXmlUpload` criava produto com `insert {codigo, nome, un, preco...}` sem
      `categoria` (`fiscal.recebidas.tsx:574`) e o `update` de produto existente ignorava
      categoria (`:571`). Produto "PASTILHA FREIO" aparecia como "Sem categoria" na edição
      (screenshot `estoque.produtos`).
    - Correção: `insert` agora inclui `categoria: p.categoria || null`; `update` inclui
      `categoria: p.categoria || categoria_existente`; `select` passou a buscar `categoria`
      nos dois fluxos (`handleConfirmarXmlUpload:561` e `handleLancarNota:834`). Validação
      `semCategoria` já existia, agora efetivamente salva.
    - Produtos já criados sem categoria precisam ser corrigidos manualmente em Estoque → Produtos
      (ou via SQL). Novos imports já salvam corretamente.

34. **Parcelas com forma de pagamento e conta bancária + logos normalizados — 28/08/2026**:
    - NF-e `fiscal.recebidas.tsx:41` `FORMAS_PARCELA` pré-cadastradas (Boleto, Pix, Cartão de crédito/débito, Dinheiro, Transferência, Cheque, Duplicata, Outros) com ordenação alfabética (Outros último). Ao adicionar parcela, selects para **forma** e **banco** (`contas_bancarias`).
    - `ParsedXMLResult`/`notaDetalhe` estendidos com `forma_pagamento`/`conta_bancaria_id`; `parseParcelasDoXml` default Boleto; `handleConfirmarXmlUpload`/`handleLancarNota` gravam `lancamentos_financeiros.forma_pagamento`/`conta_bancaria_id`.
    - Logos `public/bancos/*.png` normalizados 512×512 mesmo canvas (PAD 8, `Pillow`), 9 bancos: bradesco, itau, sicoob, caixa, santander, nubank, inter (077), bb (001), daycoval (707). `src/lib/bancos.ts` migrado para `/bancos/*.png`.

35. **Calendários padronizados + Bradesco/Itaú sem fundo branco — 28/08/2026**:
    - `DateInput` (`src/components/erp/date-input.tsx:13`) com `captionLayout="dropdown"`, bloqueio datas futuras (`maxToday`), footer Hoje + Usar hoje.
    - `financeiro.contas.tsx:522` e `fiscal.recebidas.tsx:1716` (parcelas) e `financeiro.receber.tsx:364` trocados de `Input type=date` para `DateInput` — varredura completa, 0 `type="date"` restante.
    - Bradesco/Itaú regenerados sem padding branco extra (PAD 8 → preenche tudo), `public/bancos` atualizado para mesmo tamanho (512) e exibição com `object-contain`/`bg-white` ajustado.

36. **Notas já lançadas editáveis (Alterar) + formas em ordem alfabética — 28/08/2026**:
    - `fiscal.recebidas.tsx` `FORMAS_PARCELA` e `financeiro.receber.tsx:59` `FORMAS_PAGAMENTO` ordenadas alfabeticamente `pt-BR` com `Outros` sempre último (Boleto, Cartão de crédito, Cartão de débito, Cheque, Dinheiro, Duplicata, Pix, Transferência, Outros).
    - Bug "Esta nota já foi importada anteriormente." ao tentar editar: `handleLancarNota` bloqueava duplicata. Criado `handleAlterarNota` (`:960`): atualiza `notas_importadas`, recalcula estoque por delta (mapa antigo vs novo), recria `notas_importadas_itens`, deleta/recria `notas_importadas_parcelas` + `lancamentos_financeiros` com forma/banco, invalida queries. Botão no modal agora é **Alterar** (âmbar, `Pencil`) quando `notaDetalhe.id` existe, senão **Lançar Nota**.
    - `handleVerNota` para notas já lançadas agora carrega `notas_importadas_itens`/`parcelas` + `lancamentos` (categoria e parcelas com forma/banco) em vez de re-parsear XML zerado — modal mostra "Sem categoria" só se realmente sem.

37. **Contas a pagar: fornecedor, descrição e ordem + fix edição — 28/08/2026** (este commit):
    - `financeiro.receber.tsx:520` header trocado para **Fornecedor | Descrição | Vencimento | Valor | Status** (antes Descrição | Fornecedor) e `TableCell` idem — atende pedido `fornecedor, descrição, vencimento, valor, status`.
    - `fiscal.recebidas.tsx` `handleConfirmarXmlUpload`/`handleLancarNota`/`handleAlterarNota` descrição agora só `NF-e ${nNF}` (ou `CT-e`), fornecedor vai na coluna `Fornecedor` via `contato_id` (criado/buscado por emitente). Antes ia `NF-e 12189 PIPEL PICOS... (001/1)` na descrição e `Fornecedor —`.
    - Screenshot "NF-e 12189 PIPEL PICOS..." com `Fornecedor —` agora corrigido: novo lançamento salva `descricao: NF-e 12189` e `contato: PIPEL PICOS...`.

38. **Valor da parcela direita→esquerda + CT-e com importação de XML — 28/08/2026**:
    - `MoneyInput` (`src/components/erp/money-input.tsx:13`) com `text-right`, `moveCaretToEnd` em `onFocus`/`onClick` e `onKeyDown` que força caret no fim — digitar `1` → `0,01`, `71` → `0,71`, `719` → `7,19` empurrando para esquerda. Parcela em `fiscal.recebidas.tsx:1838` trocada de `Input type=number` para `MoneyInput` com `R$`.
    - **CT-e via XML (corrigido):** removido botão `Emitir CT-e` de `fiscal.recebidas.tsx` (não é a partir de Notas de Compra). Novo fluxo em `fiscal.cte.tsx`: Card **Importar NF-e (XML) para CT-e** (`FileCode`, `Input type=file .xml` single) com `handleImportNFeXml` que lê `dest/CNPJ/xNome/UF/cMun, vNF, pesoB` do XML, preenche `form` (`cnpjTomador/xNomeTomador, vCarga, peso, vPrest`) e abre `Novo CT-e` com banner `NF-e 12189 carregada`.

39. **CT-e robusto estilo STM + múltiplos XMLs — 28/08/2026** (este commit):
    - **CT-e 404 corrigido:** `CTE_ENDPOINTS` V3 `cterecepcao/CteRecepcao.asmx` → **V4** `CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx` (SVRS `cte-homologacao.svrs.rs.gov.br`/`cte.svrs.rs.gov.br` e MG `hcte.fazenda.mg.gov.br`/`cte.fazenda.mg.gov.br`), `getCteEndpoints(ambiente, uf)` com split MG, SOAP `CTeRecepcaoSincV4/cteRecepcaoSinc` (`consultar` → `CTeConsultaV4`, `evento` → `CTeRecepcaoEventoV4`), `codigoUF` para `cOrgao`. Código `cStat 100|104|103` como sucesso. `sefaz-cte-server`/`sefaz-proxy` repassam `cert.uf`.
    - **Tela CT-e robusta (sem aba Mercadoria/Percursos):** `fiscal.cte.tsx` reescrito com **Cadastro de Mercadorias para Embarque** estilo STM: filtros (Nome Empresa, Remetente, Destinatário, Placa, Mercadoria), `Embarque via CT-e` (Avulso), `Situação` (Pendentes/Liberados), `Período`, **Listagem das Notas Fiscais** (Código, Remetente, Destinatário, Nº NF-e, Série, Data, Valor, Peso, Chave) e **Listagem de Mercadorias** (Mercadoria Genérica, NCM, Qtde, Vlr), com contadores `Qtde NF-e / Peso Bruto / Valor`.
    - **Múltiplos XMLs:** `handleImportNFeXml` agora aceita `FileList` `multiple`, deduplica por `chave`, acumula `mercadorias[]` (`chave, nNF, serie, emit, valor, peso, data`), soma `vCarga`/`peso` e `vPrest`, mostra `Badge` por NF-e e tabela completa. Botão `Importar NF-e (múltiplos XML)` com `multiple`, `Limpar` e `Gerar CT-e com N NF-e(s)`. `buildCteXml` com `chavesNFe[]` gera múltiplos `<infNFe><chave>` em `<infDoc>`.
    - Dialog `Novo CT-e` com 3 `Card`s seccionados e ícones: **Tomador** (`UsersRound`), **Rota** (`RouteIcon`/`MapPin` com Env/Ini/Fim), **Carga, valores e fiscal** (`Package`/`DollarSign`/`Building2`, CFOP/RNTRC, `vPrest`/`vCarga`/`peso` + badges das NF-es vinculadas).

40. **CT-e por partes + cabeçalho removido + Tomador do XML — 28/08/2026** (este commit):
     - Cabeçalho **Nome Empresa / Remetente / Destinatário / Placa / Mercadoria** removido de `fiscal.cte.tsx` (`CardContent` `grid-cols-5`) conforme seta — agora inicia direto em `Embarque via CT-e`.
     - `handleImportNFeXml` com `tomador` via `transp>modFrete` do XML: `0`→Remetente (`emit`), `1`→Destinatário (`dest`), `2`→Transportadora (`transp>transporta`), preenchendo `mercadorias[].tomador`/`tomadorCnpj` e `Listagem das Notas Fiscais` coluna **Tomador** (amarelo) corretamente — antes fixo `dest`.
     - Coluna **Tomador** adicionada na `Listagem das Notas Fiscais` (após Destinatário), checkbox desmarcado por padrão (`selecionadas: Set` vazio, usuário escolhe), validação `Gerar CT-e` só com selecionadas e bloqueio se `Set(destCnpj)` ou `Set(tomadorCnpj)` >1 ("destinos diferentes").
     - Botão renomeado `Importar NF-e (múltiplos XML)` → **`Importar NFes (XML)`** (`UploadCloud`, `multiple`).

41. **CT-e dialog robusto estilo STM + CFOPs compartilhados — 28/08/2026** (commits `d8fc2b3`/`b849fc9`):
     - Removida **Listagem de Mercadorias** (CARGA GERAL/NCM) e banner azul `prefillBanner` da tela principal (`fiscal.cte.tsx`).
     - Dialog **Conhecimento de Transporte Avulso** reescrito com 4 abas estilo STM: **Remetente/Destinatário** (cards Remetente/Destinatário auto puxados, Tomador, Rota Coleta/Entrega), **Doc Mercadorias** (tabela Modelo/Chave/Remetente/Destinatário/Nº/Série/Data/Peso/Valor), **Seguros/Veículos** (Seguradora/Apólice/Base Calc/RCTR-C/RCF-DC/Responsável dropdown, Motorista/CIOT/Placas), **Taxas/Despesas Acessórias** (Pedágio 3 eixos/Ad Valorem/GRIS/Taxas + Forma Pagamento Pedágio).
     - Header do dialog com **N° Conhecimento, Data Emissão (DateInput), CFOP Saída** (dropdown); removidos **Espécie Veículo** e **Base Cálculo Frete** conforme pedido (grid 5→3).
     - Criado `src/lib/cfops-transporte.ts:1` com `CFOPS_TODOS` (~500 códigos oficiais 1.xxx–7.xxx exatos do PDF), `CFOPS_TRANSPORTE`/`MOD_FRETE_OPTIONS` (0 CIF,1 FOB,2 Terceiros,3 Próprio Remetente,4 Próprio Destinatário,9 Sem Ocorrência) e `RESPONSAVEL_CTE_OPTIONS` (0 Remetente a 5 Tomador de Serviço), compartilhado entre CT-e e NF. Doc Mercadorias no dialog agora filtra `selecionadas.size>0 ? filtradas : todas` para não mostrar todas as 4 quando só 2 selecionadas.

42. **CFOPs separados por uso + calendário e Tomador corrigidos — 28/08/2026** (commits `800e480`/`b862a27`, `7df5eb5`/`5dfdb83`, `49a076f`/`f71d94d`):
     - `cfops-transporte.ts:640` split: `CFOPS_CTE` (19 códigos de transporte: 5.351–5.360 estaduais, 6.351–6.360 interestaduais, 7.358 internacional) exclusivo do **CT-e** (`fiscal.cte.tsx:21` import `CFOPS_CTE`), `CFOPS_TODOS`/`CFOPS_NOTAS` mantidos para **Notas de Compra/Devolução**.
     - **Calendário padrão ERP**: `DateInput` (`date-input.tsx:22`, `Calendar` dropdown pt-BR, `maxToday`, ícone popover) no **Data Emissão** do dialog (`fiscal.cte.tsx:385`, `form.dataEmissao`) e no **Período de Entrada** da listagem (`periodoIni`/`periodoFim` useState, `DateInput` flex-1), trocando `Input type=date` nativo.
     - **Tomador corrigido para modFrete 0**: `mercadorias` estendida com `tomadorUF/CMun/XMun/modFrete` (`:37`), `handleImportNFeXml` com `tomaByMod {"0":"0","1":"3","2":"4","3":"0","4":"3","9":"4"}` para preencher `toma` correto, `Gerar CT-e` (`:340`) agora usa `tomadorCnpj/tomador/tomadorUF` em vez de `destCnpj/dest` — NF com `FRETE 0-Por conta do Rem` (imagem 3) agora puxa `TECNO2000...` (Remetente) correto, não `INSTITUTO NACIONAL DO SEGURO SOCIAL` (imagem 4 corrigida). Screenshot `INSTITUTO NA...` com frete CIF validado.
     - **Período de Entrada layout**: grid 4→ `border rounded` com `grid lg:grid-cols-3` + linha resumo `Qtde NF-e • Peso Bruto • Valor` com `border-t pt-2 flex-wrap gap-x-3` sem sobreposição com botão **Consulta** (`:209`).

43. **Controle de CNH + toxicológico dos motoristas — 28/08/2026** (commit `e3b5574`, merge `197c940`):
    - Migration `20260828110000_b7c4e9a2-5d8f-4a1b-9e6c-3f2a8d4b7c91.sql` (aplicada): coluna `colaboradores.toxico_exame DATE` (último exame; validade = exame + 2 anos e 6 meses, CTB art. 148-A).
    - RH → Colaboradores: seção de motorista com **Último exame toxicológico** (obrigatório p/ cargos motorista, junto com nº/categoria da CNH) + campo read-only **Validade do toxicológico** (exame + 30 meses) com aviso quando vencendo/vencido.
    - Dashboard: alerta "Alertas & estoque baixo" lista separadamente **CNH** e **Toxicológico** por motorista ativo (vencido/vencendo em 30 dias).
    - Frota → Viagens: select de motorista exibe ⚠ (CNH/toxicológico vencendo em 30 dias) e **bloqueia salvar** quando a documentação está vencida.
    - Merge com o remoto: unidos 160 commits (CT-e/MDF-e, CFOPs, financeiro, adiantamentos, cargos customizáveis) — conflito resolvido em `rh.colaboradores.tsx` (mantidos `toxico_exame` + `optante_vt`).
- Limpeza de tipagem: zerado o `tsc --noEmit` dos erros pré-existentes do remoto — casts `as unknown as`/`as any` em fiscal.cte/mdf/recebidas, `binary.raw.encode` p/ node-forge (fiscal.configuracoes), `rpc(... as never)` (rh.adiantamentos) e correção do `gerarEmLote` em rh.folha (contador real no toast em vez de `vars.length` sempre 0).

44. **Git sem login repetido + fim de linha padronizado — 28/08/2026**:
    - O PAT fine-grained saiu da URL do remote e foi para o **Windows Credential Manager**
      (`cmdkey /generic:git:https://github.com`) com helper `wincred` só para o GitHub
      (`credential.https://github.com.helper wincred`) — elimina as janelas do Git Credential
      Manager e o token não fica mais exposto no `.git/config`.
    - `.gitattributes` com `* text=auto eol=lf` (+ binários): checkout sempre LF, fim dos
      avisos "LF will be replaced by CRLF" e das modificações fantasmas (ex.: `routeTree.gen.ts`).

45. **Multas de trânsito na Frota (Base + integração SENATRAN) — 29/08/2026**:
    - Migration `20260829100000`: `veiculos.renavam` (único por empresa) + tabela `multas`
      (auto de infração único por empresa, placa/renavam/órgão/valor/vencimento/pontos,
      status `aberta|paga|contestada`, origem `manual|senatran`) + `multas_config` (acesso só
      service_role) + RPC `registrar_multas_senatran` (upsert por auto de infração).
    - Página `/frota/multas`: CRUD manual completo, cards de totais (em aberto, vencidas,
      pontos ativos), filtros por busca/situação, marcar paga/reabrir, exclusão com confirmação
      e badge SENATRAN em autos sincronizados. Botão Sincronizar SENATRAN chama
      `sincronizarMultasSENATRANFn` (connector GET no endpoint com Basic auth, contrato
      documentado) — sem credencial configurada avisa e segue no cadastro manual.
    - RENAVAM entrou no cadastro/tabela de veículos; Dashboard passa a alertar multas
      abertas/contestadas vencidas ou vencendo em 30 dias; menu Frota ganhou Multas.
    - Pendente para ligar o automático: credencial do provedor SENATRAN (endpoint, usuário e
      senha em `multas_config` com ativo=true) e, se desejado, pg_cron — hoje a sincronização
      é manual.
46. **Configuração SENATRAN na UI + fix git global — 29/08/2026**:
    - Dialog de configuração SENATRAN na página `/frota/multas`: endpoint, usuário, senha,
      toggle ativo, exibição da última sincronização. Botão Sincronizar só habilitado quando
      a integração está ativa.
    - Fix definitivo do login repetido no git: helper global `manager` (GCM) removido,
      `credential.https://github.com.helper=wincred` mantido globalmente, `GCM_INTERACTIVE=never`
      setado na env do usuário. Push/pull silenciosos em qualquer terminal.
    - `.gitattributes` com `* text=auto eol=lf` (+ binários) — checkout sempre LF, fim dos
      avisos e modificações fantasmas.
    - `tsc --noEmit` limpo: 20 erros TS pré-existentes do remoto corrigidos (fiscal.*,
      rh.adiantamentos, rh.comissoes, rh.folha).
---
47. **Veiculos - CRLV PDF + campos proprietario/eixos/categoria** - 30/08/2026:
    - Migration 20260829120000_seguradoras.sql: tabela seguradoras (empresa_id, nome, cnpj/telefone) + eiculos.seguradora_id FK.
    - Migration 20260829130000_veiculos_extras.sql: colunas proprietario, eixos, categoria (tipo veicular 1-8 conforme CRLV) em eiculos.
    - Campo km REMOVIDO do formulario e da tabela de veiculos (conforme decisao do dono).
    - Import PDF CRLV via pdfjs-dist (parser robusto extrai proprietario, eixos, categoria, marca, ano, fabricacao, renavam). Fallback para placa/RENAVAM quando parser primario nao encontra.
    - Tipo veicular virou dropdown (Caminhao, Carreta, Semi-reboque, Cavalo Mecanico, Utilitario, Van, Caminhonete, Automovel, Motocicleta) - tipo mapeado automaticamente do CRLV.
    - CT-e: campos motorista, placa e seguradora agora sao dropdowns tipo CFOP (autocomplete).

48. **CT-e: NF-e pendentes persistidas no Supabase** - 30/08/2026:
    - Tabela cte_nfes_pendentes (empresa_id, chave, nNF, serie, emitente, destinatario, valor, peso, data_emissao, selecionada) com UNIQUE empresa+chave.
    - handleImportNFeXml agora persiste no banco (upsert por chave) + dedup global - sobrevive F5, troca de tela e atualizacao da pagina.
    - Botao "Limpar" remove todas as pendentes da empresa.

49. **CT-e: templates de emissao** - 30/08/2026:
    - Tabela cte_templates (empresa_id, nome, cnpj_tomador, razao_tomador, cfop, mod_frete, respondavel, observacoes) - reuso rapido de dados de remetente/destino/tomador e rota.
    - UI: botao "Salvar como Template" no dialog de emissao + select para aplicar template existente + excluir template.
    - Dados persistem entre sessoes.

50. **CT-e: CFOPs e impostos editaveis** - 30/08/2026:
    - CFOP de saida virou campo editavel com autocomplete (filtra sem ponto: 5352 -> 5.352, salva com ponto na descricao).
    - Nova aba **Impostos** no dialog CT-e: ICMS (base editavel, aliquota %), PIS, COFINS, IR, INSS, CSLL - todos editaveis com MoneyInput auto-virgula.
    - Base do ICMS corrigida para Prest (era Carga).

51. **CT-e: correcoes rota e data** - 30/08/2026:
    - Origem/destino da rota agora puxa do XML (emit -> coleta, dest -> entrega) em vez de campos manuais.
    - Data de emissao formatada em DD/MM/AAAA pt-BR.
    - Peso bruto formatado em pt-BR.

52. **CRLV parser robusto** - 30/08/2026 (commits b6f9a8, e8615e3, d9b39a2):
    - Parser reescrito para isolar bloco de dados (EEY3C60) e extrair proprietario, marca, categoria com regex robusta.
    - Fallback sequencial quando parser primario falha (placa/RENAVAM de localizacoes alternativas).
    - Logs de debug para amostras problematicas (LGP TRANSPORTES, RANDON SRFG CG).

53. **Sync geral + limpeza de TypeScript** - 30/08/2026:
    - Merge de 160+ commits do remoto com conflitos resolvidos (fiscal, frota, rh, financeiro).
    - 	sc --noEmit zerado: casts  s unknown as/ s any corrigidos em fiscal.cte, fiscal.mdf, fiscal.recebidas, rh.adiantamentos, rh.comissoes, rh.folha.
    - inary.raw.encode p/ node-forge (fiscal.configuracoes) corrigido.
    - gerarEmLote em rh.folha corrigido (contador real no toast em vez de  ars.length sempre 0).

54. **RNTRC com Nome, CNPJ e Categoria** - 01/09/2026:
    - Migration aplicada: coluna `descricao` removida, `nome` e `cnpj` (ambos obrigatórios) adicionados a `rntrc_lista`.
    - Campo **Categoria** adicionado com dropdown (ETC / TAC / CTC).
    - CNPJ com formatação automática (XX.XXX.XXX/XXXX-XX) e busca de nome via BrasilAPI.
    - Dados editáveis inline na tabela (ícone lápis + confirmar/cancelar).
    - RNTRC no veículo: combobox único que mostra RNTRC + nome da transportadora, com busca.
    - Fix: ao clicar "Novo veículo" após editar, formulário é resetado corretamente.
    - Fix parser CRLV: eixos agora pega dígito antes de 03P/00P sem confundir com CMT; tipo "CARGA CAMINHAO" → Cavalo Mecânico; proprietário aceita EIRELI.
    - CT-e: dropdowns Placa Reboque/Semi Reboque só mostram veículos tipo Carreta/Bitrem (exclui Cavalo Mecânico).
    - CT-e: campo "Valor Serviço" agora é editável (era readOnly).
    - CT-e: fix SOAP body e SOAPAction — usava `<cteRecepcaoSinc>` (lowercase) mas o WSDL SVRS espera `<CTeRecepcaoSincV4>` com action `.../CTeRecepcaoSincV4/CTeRecepcaoSincV4`; mesma correção para Consulta e Evento.
    - CT-e: adicionado botão "Salvar Rascunho" ao lado de "Enviar Doc-e"; salva CT-e no Supabase com status `rascunho` sem enviar à SEFAZ (colunas válidas: empresa_id, status, numero, serie, valor_servico, peso_carga, xml_assinado).
    - CT-e: fix salvarRascunho — removido `cfop` e outras colunas inexistentes da tabela `cte_documentos`.
    - CT-e: fix SOAP operation names — corpo e SOAPAction agora usam `cteRecepcao`/`cteConsultaCT`/`cteRecepcaoEvento` (lowercase, conforme WSDL SVRS via ACBr).
    - CT-e rascunho: listagem mostra Nº de NF-e vinculadas, badge âmbar para rascunho, botão Editar (lápis) que carrega form + NF-e e exclui o rascunho antigo para reenvio.
    - CT-e rascunho: NF-e marcadas como `status = "rascunho"` no `cte_nfes_pendentes` ao salvar; somem da listagem de pendentes. Ao editar, voltam para `pendente`.
    - CT-e rascunho: ao salvar fecha dialog e limpa estado.
    - CT-e rascunho fix: listagem mostra Nº das NF-e (ex: "NF-e 123, 456") ao invés de só quantidade.
    - CT-e rascunho fix: NF-e são DELETADAS do `cte_nfes_pendentes` ao salvar rascunho (CHECK constraint só aceita pendente/embarcada); re-inseridas ao editar.
    - CT-e rascunho fix: JSON salva dados completos das NF-e (nfs array) para reconstrução sem consulta ao banco.
    - CT-e SOAP fix V4: body element `CTeRecepcaoSinc` (não `cteRecepcao`), dados comprimidos com GZip + Base64 conforme MOC CT-e 4.00.

55. **MDF-e Fase 2 — implementação completa** - 01/09/2026 (commit `bce4767`):
    - `sefaz-mdf.ts` reescrito: XML 3.00 completo (ide/emit/infModal rodoviário/infDoc/infMunCarrega/infPercurso/veicTrac/condutor/lacres), geração de chave com DV mod11, assinatura reutiliza `signXml`, funções `emitirMdf`/`consultarMdf`/`encerrarMdf`/`cancelarMdf` via SOAP 1.2 mTLS.
    - Endpoints SVRS homologação/produção para todos os serviços (recepção, ret-recepção, consulta, status, evento, distribuição DF-e).
    - `sefaz-mdf-server.ts`: server functions `emitirMdfFn`/`consultarMdfFn`/`encerrarMdfFn`/`cancelarMdfFn` seguindo padrão de `sefaz-server.ts` (mTLS direto no Vercel ou proxy Cloudflare).
    - `fiscal.mdf.tsx` reescrito: tabela listagem com status/filtro período, dialog Novo MDF-e com 3 abas (CT-e vinculados, Veículo/Motorista, Rota/UF), botões Encerrar (evento 110112) e Cancelar (evento 110111) com confirmação, badges de status.
    - Vinculação CT-e → MDF-e: seleção de CT-e autorizados com checkbox, cálculo automático de peso/valor total.

56. **CT-e: pré-visualização XML** - 02/09/2026:
    - Botão "Pré Visualizar" no dialog de CT-e agora funcional (antes era placeholder desabilitado).
    - `previewCteXmlFn` em `sefaz-cte-server.ts`: gera o XML sem enviar para SEFAZ, retorna XML formatado, chave e número.
    - Dialog de pré-visualização com XML indentado e legível, botão "Enviar Doc-e" direto do preview.

57. **CT-e: fix MG SOAP (tentativa 5)** - 02/09/2026:
    - Body simplificado para MG: `<cteRecepcao>{base64}</cteRecepcao>` (sem wrapper `cteDadosMsg`, sem xmlns).
    - Pesquisa revelou: MG tem histórico de problemas com CT-e 4.00 (usuários ACBr reportam retorno em branco em homologação/produção; alguns só conseguem via SVC-SP contingency).
    - SOAP Header (`cteCabecMsg`) removido do CT-e 4.00 síncrono conforme MOC atualizado.

58. **Assistente AI Norvo — chat flutuante** - 02/09/2026:
    - Widget flutuante (canto inferior direito) com chat de IA para auxiliar usuários no ERP.
    - Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8-fast`) — plano free com 10k neurons/dia.
    - 11 tools de consulta somente leitura: clientes, produtos, fornecedores, financeiro, veículos, motoristas, NF-e, CT-e, empresa.
    - Rota `/api/ai/chat` no Cloudflare Worker com tool calling (máx 3 rodadas).
    - System prompt em pt-BR com contexto dos módulos do sistema.
    - Sugestões de perguntas na primeira abertura do chat.

59. **CT-e: listagem NF-e ordenável** - 02/09/2026:
    - NF-e listadas em ordem crescente por número (Nº NF-e).
    - Cabeçalho da tabela clicável para ordenar por qualquer coluna (asc/desc).
    - Coluna "Código" hardcoded removida; coluna "Chave" removida da visualização.

60. **CT-e: migração para CTeSimp + novo DACTE** - 02/09/2026:
    - **MUDANÇA CRÍTICA**: MG usa TCTeSimp (CT-e Simplificado), não TCTe normal.
    - Root element mudou de `<CTe>` para `<CTeSimp>` (XSD `cteSimp_v4.00.xsd`).
    - `<toma>` agora é filho direto de `<infCte>` com dados inline (CNPJ, IE, xNome, enderToma).
    - Removidos `<rem>` e `<dest>` (não existem em TCTeSimp).
    - Removido wrapper `<infCTeNorm>` — `<infCarga>`, `<det>`, `<infModal>` são filhos diretos.
    - `<det nItem="X">` substitui `<infDoc>` com cMunIni/Fim, vPrest, vRec, infNFe.
    - `<total>` substitui `<vPrest>` — agora com vTPrest/vTRec.
    - `<ide>` não tem mais cMunIni/xMunIni/cMunFim/xMunFim/indIEToma.
    - Tomador agora inclui endereço completo (logradouro, nro, bairro, cep, ie, fone, email).
    - DACTE PDF redesenhado: layout completo estilo bsoft/nstech com todas as seções
      (cabeçalho, chave de acesso, protocolo, remetente/destinatário, tomador, documentos
      originários, componentes de valor, impostos, modal rodoviário, declaração).

61. **CT-e: auto-cadastro de contatos + simplificação Tomador** - 02/09/2026:
    - Ao importar XML de NF-e, emitente e destinatário são cadastrados automaticamente
      na tabela `contatos` (se o CNPJ não existir para a empresa), com endereço completo.
    - **Lookup de endereço**: antes de usar dados do XML, consulta `contatos` no Supabase
      pelo CNPJ para puxar endereço completo (logradouro, número, bairro, CEP, cidade, UF, telefone).
      Se o XML não traz endereço, o cadastro existente preenche os campos.
    - Tab "Remetente/Destinatário" agora exibe dados completos (logradouro, bairro, CEP, IE, fone).
    - Seção "Tomador do Serviço" simplificada: apenas checkbox "Contratação do Frete por
      conta do Remetente (toma 0)" ao invés de formulário completo.

62. **CT-e: correção endpoints MG CT-e Simplificado** - 03/09/2026:
    - Endpoint MG corrigido de `CTeRecepcaoSinc` para `CTeRecepcaoSimpV4` (CT-e Simplificado).
    - URL homologação: `https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSimpV4`
    - URL produção: `https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSimpV4`
    - Namespace SOAP corrigido para `CTeRecepcaoSimpV4` (era `CTeRecepcaoSinc`).

63. **CT-e: Tomador editável + limpar rejeitados + motivo rejeição** - 03/09/2026:
    - Tomador restaurado com Select (toma 0/3/4) + campos de endereço completos.
    - Botão "Limpar Rejeitados" para excluir CT-e com status rejeitado do banco.
    - Badge de rejeição mostra o motivo (cortado em 60 chars) com tooltip completo.

64. **CT-e: correção consulta/cancelamento MG (SOAP 1.1)** - 03/09/2026:
    - Consulta e cancelamento MG agora usam SOAP 1.1 (não SOAP 1.2 do SVRS).
    - MG não aceita `<CTeConsultaV4>` wrapper — usa `cteDadosMsg` + Base64 GZip direto.
    - Mesma abordagem da emissão: envelope SOAP 1.1 + SOAPAction customizado.

---
## 03/09/2026 — CT-e: raiz da rejeição = CNPJ errado na empresa

Decodificando a chave de acesso das CT-e rejeitadas (`31260983919614000160...`),
o CNPJ embutido é `83919614000160` — diferente do CNPJ correto da TECNO2000
(`21306287000152`). O problema é DADO: a tabela `empresas` tem o CNPJ errado.

- `buildCteXml` usa `input.emit.cnpj` que vem de `empresas.cnpj` → CNPJ errado na chave e no XML.
- A SEFAZ rejeita porque o CNPJ no XML não bate com o CNPJ do certificado A1.
- **Fix imediato**: rodar SQL no Supabase para corrigir o CNPJ na tabela `empresas`.
- **Fix de longo prazo**: migration `20260903100000_certificados_cnpj_uf.sql` adiciona
  colunas `cnpj`/`uf` em `certificados_digitais` para usar como fonte autoritativa
  (futuramente o código priorizará `cert.cnpj` sobre `emp.cnpj`).

Mudanças no código (commits `df2d23b` cf / `fb0dff8` vercel):
- `complemento` adicionado ao emit em `emitirCteFn`, `previewCteXmlFn` e proxy.
- Logs de debug `[CTE-DEBUG]` e `[CTE-PROXY-DEBUG]` com CNPJ/UF.
- `emitirCte` no proxy agora recebe `emitUf` em vez de `uf` genérica.
---

## CT-e: correção ordem toma + logging detalhado SEFAZ - 03/09/2026

Analisando o XSD do CTeSimp (`cteTiposBasico_v4.00.xsd`), o `<toma>` tem ordem estrita:
`toma → indIEToma → CNPJ/CPF → IE(opt) → xNome → enderToma → fone(opt) → email(opt)`

O XML rejeitado tinha `<fone>` ANTES de `<enderToma>` — violação de schema (cStat 225).

Fix (commit `d9fa9b9` cf / `4592eff` vercel):
- `<enderToma>` movido para ANTES de `<fone>` (antes: fone → enderToma; agora: enderToma → fone)
- Logging detalhado adicionado: XML assinado completo, Base64 comprimido, endpoint URL,
  resposta SEFAZ COMPLETA (não truncada), dados de input (toma, emit, endereços)
- Logs visíveis no Cloudflare Worker dashboard e nos logs do Vercel

---

## CT-e: correção QR code URL + ordem fone/enderToma - 03/09/2026

Correções de compliance com XSD CTeSimp (`cteTiposBasico_v4.00.xsd`):

1. **QR code URL** (provável causa raiz do erro 225):
   - Parâmetro `?qrcode=` trocado por `?chCTe=` (XSD line 2753 exige `chCTe`)
   - URL base para MG: `portalcte.fazenda.mg.gov.br/portalcte/sistema/qrcode.xhtml` (antes usava SVRS)
   - Outros estados continuam com `dfeportal.svrs.rs.gov.br/cteQrCode`

2. **toma element order**: `<fone>` movido de DEPOIS de `<enderToma>` para ANTES, conforme
   sequência XSD: `toma → indIEToma → CNPJ → IE(opt) → xNome → fone(opt) → enderToma → email(opt)`

Commits: `b2eeb50` cf / `a0d8460` vercel

---

## CT-e: correção assinatura CTeSimp — Signature dentro de infCte (03/09/2026)

**Causa raiz do erro 225 (Falha no Schema XML)**: o `signXml` não tratava `</CTeSimp>` — só tinha casos para `</CTe>`, `</MDFe>`, `</NFe>`. Como o XML raiz é `<CTeSimp>`, caía no fallback `</infCte>` e inseria `<Signature>` DENTRO de `<infCte>`, violando o XSD.

**Fix**: adicionado `if (xml.includes("</CTeSimp>"))` ANTES dos outros casos, tanto em `tryForgeSignXml` quanto em `signXmlNative`. A assinatura agora fica FORA de `<infCte>`, entre `</infCte>` e `<infCTeSupl>`.

Commit: `02782ee`

---

## CT-e: assinatura CTeSimp entre infCte e infCTeSupl (04/09/2026)

O fix anterior (`</CTeSimp>` replacement) não funcionou — a assinatura continuava fora do elemento. Causa provável: `replace` não encontrava `</CTeSimp>` por algum motivo (encoding, cache de build).

**Nova abordagem**: em vez de substituir `</CTeSimp>`, o `signXml` agora busca `<infCTeSupl>` e insere a assinatura ANTES dele (`xml.replace("<infCTeSupl>", signature + "\n  <infCTeSupl>")`). Isso garante que a assinatura fica entre `</infCte>` e `<infCTeSupl>`, que é a posição correta no XSD CTeSimp.

Commits: `7e26539` (code) + deploy Vercel `dpl_HdAyjxK5qcZczMK84kMw95xsrmRG` + deploy CF Worker `e4c7065a`

---

## CT-e: remoção de `versao` do root `<CTeSimp>` (04/09/2026)

**Causa raiz do erro 225 (Falha no Schema XML)**: o elemento raiz `<CTeSimp>` estava com o atributo `versao="4.00"`, mas o XSD do CTe Simplificado não define esse atributo no root — ele pertence apenas ao `<infCte>`. A SEFAZ valida contra o XSD e rejeita atributos extras.

**Fix**: removido `versao="4.00"` de `<CTeSimp>` em `src/lib/sefaz-cte.ts:157`. O `<infCte>` continua com `versao="4.00"`.

Commits: `5f04fb9` (push) + CF Worker `460ab7c5`

---

## 37. **CT-e: abas por status + download XML/DACTE PDF** (04/09/2026)

Após o primeiro CT-e autorizado, implementado:

- **Abas de filtragem por status**: Autorizados, Rejeitados, Cancelados, Rascunhos — cada aba mostra contagem e lista filtrada.
- **Botão de download XML** (ícone FileCode azul) — disponível apenas para CT-es autorizados; extrai o XML assinado do `xml_assinado` (ou JSON com campo `xml`) e dispara download como `CTe_{numero}.xml`.
- **Botão de download DACTE PDF** (ícone Download âmbar) — disponível apenas para CT-es autorizados; parseia o XML assinado via DOMParser para extrair dados do emitente/tomador/remetente/destinatário/carga e gera o PDF via `gerarDactePdf()`; download como `DACTE_{numero}.pdf`.
- Badge de status "cancelado" com cor orange (distinta de autorizado=emerald e rejeitado=red).

Arquivo: `src/routes/_authenticated/fiscal.cte.tsx`

Commits: `dd48d3b` (CF deploy `2bb0163e`) + Vercel `65d9010`

---

## Cancelamento CT-e — fix de assinatura

Após a correção do QR code e autorização do CT-e em produção, o cancelamento continuava falhando com "Rejeição: Falha no Schema XML do CT-e". Análise revelou dois bugs na função `signXml` / `signXmlNative`:

1. **Regex `matchId` não reconhece `infEvento`**: O padrão `/inf(?:NFe|Cte|MDFe)/` não casava `<infEvento Id="ID...">` do evento de cancelamento. O URI da referência ficava `"#NFe"` em vez de `"#ID110111..."`, invalidando a assinatura.
2. **Posicionamento da assinatura**: Para `<eventoCTe>`, a assinatura XML precisa estar DENTRO do elemento `<eventoCTe>` (antes de `</eventoCTe>`), mas não existia branch `</eventoCTe>` — o código ia direto para `</CTeSimp>`.

**Correções aplicadas em `src/lib/sefaz.ts`:**
- Regex: `/<inf(?:NFe|Cte|MDFe)/` → `/<inf(?:NFe|Cte|Evento|MDFe)/` (ambas `tryForgeSignXml` e `signXmlNative`)
- Placement: adicionar `</eventoCTe>` como **primeiro** check antes de `</CTeSimp>` em ambas funções

Commits: CF `a96eba4` (deploy `71fd7307`) + Vercel `3157be9`

---

## Cancelamento CT-e — sessão de debugging completa (04/09/2026)

Sessão longa de debugging do cancelamento CT-e Simplificado MG. Foram encontrados **5 bugs** encadeados:

1. **Regex `matchId` não reconhece `infEvento`** (seção anterior)
2. **Posicionamento da assinatura** (seção anterior)
3. **`nSeqEvento` com 1 dígito no Id**: O XSD exige `ID[0-9]{12}[A-Z0-9]{12}[0-9]{29}` = 55 chars. Com `nSeq="1"`, o Id ficava com 53 chars. **Fix**: `nSeq="001"` (3 dígitos).
4. **Quebras de linha `\n` na assinatura**: O SEFAZ rejeita "caracteres de edição" entre tags. **Fix**: remover `\n` na inserção da assinatura.
5. **`dhEvento` com offset -03:00**: `toISOString()` retorna UTC, mas o código trocava `.000Z` por `-03:00`, adiantando 3 horas. SEFAZ rejeitava como "data futura". **Fix**: usar `+00:00` (UTC real).

**Resultado final**: SEFAZ retornou `cStat=135` "Evento registrado e vinculado a CTe". Cancelamento aceito com sucesso.

Commits finais: CF `8e040dd` + Vercel `a4bff0a`

---

## CT-e: seletor de ambiente (homologação/produção) — 04/09/2026

Adicionado ToggleGroup no formulário de emissão de CT-e para escolher entre **Homologação** e **Produção** antes de enviar. O ambiente selecionado é passado do form para `emitirCteFn` / `previewCteXmlFn` / proxy, que o utilizam ao invés de ler sempre de `nfe_config`. Badge no preview DACTE também reflete o ambiente escolhido. `CteDoc` passou a incluir campo `ambiente` na query.

---

## CT-e: validação de NF-es + correções diversas — 04/09/2026

Sessão de correções no fluxo de emissão CT-e:

1. **Validação de NF-es iguais**: Agora valida que todas as NF-es selecionadas têm o mesmo **remetente**, **destinatário** e **tomador** — tanto no botão "Gerar CT-e" quanto nos checkboxes (individual e "selecionar todos"). Bloqueia com toast se houver divergência.

2. **Null checks em `ret?.sucesso`**: Todos os callbacks `onSuccess` de emitir/consultar/cancelar CT-e agora usam optional chaining (`ret?.sucesso`, `ret?.xMotivo`). Se o server function retornar `undefined`, não quebra mais com "Cannot read properties of undefined".

3. **Cabeçalho Remetente/Destinatário usa NF-e selecionada**: Antes o dialog sempre mostrava `mercadorias[0]` (primeira da lista). Agora usa a primeira NF-e **selecionada** (`selecionadas`), ou a primeira se nenhuma selecionada.

4. **Reset do form ao abrir "Novo CT-e"**: Botões "Novo CT-e" e "Novo CT-e avulso" agora chamam `setForm(emptyForm)` + `setSelecionadas(new Set())` antes de abrir o dialog. Não carrega mais dados de CT-e anterior.

5. **Default ambiente = Homologação**: O CT-e agora inicia com ambiente "Homologação" por padrão (antes era "Produção").

6. **IE do tomador extraído do XML da NF-e**: O IE do tomador agora é extraído do XML importado (`destIE` para CIF, `emitIE` para FOB, `transp IE` para terceiros), salvo no banco (`tomador_ie` em `cte_nfes_pendentes`), e carregado automaticamente no form. Migration aplicada: `20260904153000_add_tomador_ie_to_nfes.sql` (colunas `tomador_ie`, `tomador_logradouro`, `tomador_bairro`, `tomador_cep`).

7. **Numeração separada por ambiente**: Homologação usa números 900000+ (para teste sem afetar a real), produção usa sequencial real baseado no último CT-e do banco. A query de "próximo número" filtra por `ambiente`.

Commits: CF `2621c5e` → `bab9d3d` → `7db03b6` → `e283493` → `d436038` → `8f6005a` + Vercel `feb77d6` → `65d17bf` → `a37ef59` → `061ab47` → `6420a5c` → `feedb43`

---

## CT-e: fix cancel NF-e revert — re-insert from rascunho JSON (04/09/2026)

Ao salvar rascunho, NF-e são DELETADAS do `cte_nfes_pendentes`. Quando o CT-e é emitido e
depois cancelado, o `UPDATE status = "pendente"` casava 0 linhas (NF-e não existiam mais),
então as NF-e nunca voltavam para a lista.

**Fix**: após o update, se 0 linhas afetadas, re-inserir NF-e do JSON salvo no rascunho
(`xml_assinado` campo `nfs`). Mesmo fix aplicado ao fluxo de emissão (update para "embarcada"
também falhava ao editar rascunho e emitir).

Commits: CF `8bf6f29` + Vercel `67d88f4`

---

## CT-e: template removido + abas reorganizadas (Eagle Gestão) — 04/09/2026

- **Template removido**: seção inteira (type, state, query, mutations, UI) deletada — não era utilizada.
- **Abas reorganizadas** conforme modelo Eagle Gestão:
  - "Remetente/Destinatário" → **Geral** (com Ambiente, Nº Conhecimento, Data, CFOP integrados)
  - "Doc Mercadorias" → **Carga**
  - "Seguros/Veículos" → **Veículos**
  - "Taxas/Despesas" → **Taxas**
  - "Impostos" → **Tributação**
  - Nova aba **Observações** (movida do rodapé para dentro do dialog)

Commits: CF `30a5bc2` + Vercel `538f4e1`

---

## CT-e: Consignatário/Redespacho compactos + busca CNPJ (04/09/2026)

- Cards de **Consignatário** e **Redespacho** redesenhados no estilo Remetente/Destinatário:
  compactos, só exibem dados (nome, CNPJ+IE, endereço, cidade-UF+CEP).
- **Busca automática ao digitar o CNPJ** (14 dígitos): consulta `contatos` da empresa
  primeiro, senão BrasilAPI com fallback ReceitaWS; preenche nome, endereço, cidade, UF, CEP.
- Botão lupa p/ buscar manualmente, X p/ limpar, máscara `XX.XXX.XXX/XXXX-XX`,
  spinner durante a busca. IE continua editável inline (BrasilAPI não retorna IE).
- `buildCteXml` não usa esses campos (CTeSimp não tem exped/receb) — só tela/rascunho.

Commits: CF `e05db7a` + Vercel `ec1f93f`

---

## CT-e: Consignatário/Redespacho lado a lado + IE do cadastro (08/09/2026)

- Cards de **Consignatário** e **Redespacho** agora lado a lado (`md:grid-cols-2`),
  mesmo tamanho dos cards Remetente/Destinatário.
- **IE puxa do cadastro**: migration `20260908120000_contatos_ie.sql` adiciona coluna
  `ie` em `contatos`; importação de NF-e salva a IE; lookup preenche a IE se existir
  (não apaga IE digitada se o cadastro não tiver). **Aplicar via dashboard SQL Editor**
  (exec_sql não existe).
- CNPJ novo buscado na API é auto-cadastrado em `contatos` p/ próximas buscas instantâneas.
- Código resiliente: funciona com ou sem a coluna `ie` (fallback sem IE).
- `select *` no lookup p/ não quebrar antes da migration aplicada.

Commits: CF `23c97b0` + Vercel `51938b8`

---

## Clientes: lupa atualiza existente + campo IE + backfill XML (08/09/2026)

- **Lupa não bloqueia mais**: editando um contato, a lupa busca na Receita e preenche
  o form (era "Já cadastrado" sem atualizar). Criando novo com CNPJ existente, orienta
  a editar o contato.
- **Campo IE** no cadastro (form, dialog, criar/editar, types.ts).
- **Editar carrega tudo**: `openEdit` trazia só nome/doc/email/tel (endereço vinha vazio)
  — agora carrega endereço + IE + observações (query ampliada).
- **Backfill via API**: contatos com campos vazios preenchidos dos dados de tomador
  das NF-es importadas (ex: TECNO2000 ← IE 2614310460066, FORMIGA/MG).

Commits: CF `3680c1b` + Vercel `9d1e67e`

---

## CT-e: Remetente/Destinatário completam do cadastro (08/09/2026)

- Cards de **Remetente/Destinatário** agora mesclam `contatos` (query `contatos-cte`)
  como fallback: IE, logradouro, número, bairro, cidade, UF, CEP, fone — XML continua
  prioritário. Mesmo formato de exibição do Consignatário (`rua, nº — bairro`).
- Preview do DACTE (`gerarDactePdf`) também usa o fallback p/ rem/dest.

Commits: CF `f26ec03` + Vercel `5eb0a70`

---

## CT-e: Tomador recalcula no toma + CNPJ com busca (08/09/2026)

- Trocar o **toma** (0/CIF, 1/FOB, 3/4, 2/9) **recalcula o tomador**: emitente p/
  0 e 3, destinatário p/ 1 e 4 (com fallback do cadastro p/ IE/nº/fone), limpa tudo
  p/ 2 (terceiros) e 9.
- **CNPJ do tomador com busca automática** (14 dígitos): contatos → BrasilAPI →
  ReceitaWS, máscara, lupa, spinner — igual Consignatário/Redespacho.
- "Gerar CT-e" também mescla cadastro (IE, nº, fone, cidade/UF/CEP/logradouro).

Commits: CF `6108d60` + Vercel `3459b4e`

---

## CT-e: diálogo reestruturado modelo Eagle Gestão (08/09/2026)

Abas na ordem Eagle: **Geral, Tributação, Carga, Veículos, Status, Observações**
(aba Taxas fundida em Veículos; Escrituração fora do escopo — SPED).

- **Geral**: Tomador movido p/ o topo + Mod/Série (57/001) no cabeçalho +
  **Componentes do Valor do Serviço** (FRETE = Valor do Serviço, editável).
- **Carga**: **Quantidades da Carga** (KG/PESO BRUTO auto das NF-es) +
  **Produto Predominante** + Outras Características + Valor Mercadoria (auto) +
  **Documentos Anteriores** (transportadora com busca CNPJ + tabela de docs p/ subcontratação).
- **Tributação**: CST em destaque + **Redução de Base (%)** + **Crédito outorgado/presumido**.
- **Status** (nova): Modal (Rodoviário fixo), Tomador (auto do toma), Forma Pagamento,
  Finalidade, Tipo Serviço, Forma Emissão, CT-e Referenciado, Complemento/Anulação,
  Data Declaração, Situação (somente leitura, pós-transmissão).
- **Observações**: 3 campos vinculados ao form (Gerais, Anulação/Substituição, Globalizado).
- Novos campos persistem no rascunho (JSON do form); transmissão SEFAZ inalterada
  (CTeSimp MG: Normal/Rodoviário — demais opções ficam salvas no rascunho).

Commits: CF `d6cb74b` + Vercel `e75e0bf`

---

## DACTE modelo Eagle + logo Juvenal (08/09/2026)

- **Documentos Originários**: `NF-E {número}` + **chave 44 dígitos** (antes: CNPJ/série-nº).
- **Imposto**: CST rotulado (`00 - NORMAL` etc.) + coluna **% RED BC CALC** com valor do form.
- **Observações**: marca d'água **"AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL"** em homologação.
- **Modal**: `RNTRC DA EMPRESA` + `DATA PREVISTA DE ENTREGA` + texto da legislação.
- Rodapé: "Norvo Gestão" (era `www.norrvo.com.br`).
- Preview usa NF-es reais (com chave), obs dos 3 campos, redução e produto predominante.
- **Logo Juvenal** no cabeçalho do DACTE (`src/lib/juvenal-logo.ts` base64 de
  `src/assets/juvenal-logo.png`; vazio = só nome).

Commits: CF `2dd07ae` + Vercel `b523319`

---

## CT-e Geral: Mod/Série compacto + Tomador de volta p/ baixo (08/09/2026)

- Mod/Série com largura fixa (92px, centralizado, coluna `auto`).
- Ordem restaurada: Remetente/Destinatário → Consignatário/Redespacho → Tomador →
  Componentes do Valor → Rota.
- Removido `(toma X)` do título do Tomador.

Commits: CF `d0f118b` + Vercel `d8fa38f`

---

## CT-e: Carga enxuta + Docs Anteriores com busca SEFAZ (08/09/2026)

- Tabela NF-e com rodapé **TOTAL** (peso + valor); card Quantidades e campo Valor
  Mercadoria removidos (duplicados).
- Docs Anteriores: removidos Tipo/Sub-série (só existe CT-e eletrônico); tabela agora
  ITEM | **CHAVE (44, com lupa)** | SÉRIE | NÚMERO | DATA EMISSÃO.
- **Busca do CT-e anterior pela chave** (`CTeDistribuicaoDFe` nacional, `consChNFe`):
  nova `consultarCtePorChave` em `sefaz-cte.ts` + `consultarCteChaveFn` + action
  `consultarCteChave` no proxy. Preenche transportadora (CNPJ/nome/IE) + série,
  número e emissão da linha. Resposta: sim — digitando a chave, os dados vêm da SEFAZ.

Commits: CF `953c1e9` + Vercel `46decbb`

---

## CT-e: removidos Produto/Docs Anteriores + erro certificado (08/09/2026)

- Removidos cards **Produto Predominante** e **Documentos Anteriores** da aba Carga
  (a pedido). Backend da busca por chave mantido (`consultarCtePorChave`).
- **Erro "Nenhum certificado ativo encontrado"**: diagnosticado — certificados existem
  no banco (1 ativo/empresa); a chave `sb_secret_HUKG...` retorna **401** (rotacionada).
  A Vercel ainda usa a chave antiga em `SUPABASE_SERVICE_ROLE_KEY` → toda chamada
  service-role falha. **Ação do usuário**: copiar a nova `sb_secret` (Supabase →
  Settings → API) e atualizar em Vercel (norvo-gestao → Env Vars → redeploy) e no
  Worker (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY` com a mesma chave, p/ o
  Bearer do proxy continuar válido).

Commits: CF `aee3acf` + Vercel `abbdaf0`

---

## CT-e: fix erro 938 homologação — razão social de teste (08/09/2026)

- Causa raiz (log 08/09 14:14): SEFAZ-MG exige em homologação o tomador com razão
  social literal `CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALORFISCAL` (sem
  espaço em VALORFISCAL, 60 chars). Havia const local com o texto errado e nunca usada.
- Fix: `HOMOLOG_TOMADOR_NOME` exportado em `sefaz-cte.ts`; `buildCteXml` usa no
  `<toma><xNome>` quando `ambiente=homologacao` (vale p/ emissão e preview XML).
  Preview DACTE usa o mesmo texto; aviso âmbar no card Tomador em homologação.
  Produção inalterada (nome real do cadastro).

Commits: CF `f11248e` + Vercel `f83f741`

---

## CT-e: fix erro 310 — grupo IBS/CBS obrigatório (08/09/2026)

- Após o fix do 938, SEFAZ retornou **310 "IBS / CBS não informado"** (reforma
  tributária, obrigatório em 2026).
- Fix em `buildCteXml`: grupo `<IBSCBS>` (CST 000, cClassTrib 000001) injetado no
  `<imp>` em todos os CSTs, com alíquotas de teste 2026 (IBS 0,10% / CBS 0,90%)
  calculadas sobre a vBC com arredondamento 2dp.

Commits: CF `41efded` + Vercel `f044351`

---

## CT-e: fix erro 360 — IBSCBSTot no total (08/09/2026)

- Após o fix do 310, SEFAZ retornou **360 "Total do DFe de preenchimento obrigatório"**.
- Fix: `<IBSCBSTot>` (vBCIBSCBS, gIBS/vIBSUF/vIBSMun, vIBS, gCBS/vCBS) dentro do
  `<total>`, com os mesmos valores do grupo IBSCBS do `<imp>`.

Commits: CF `94061c5` + Vercel `917a70b`

---

## CT-e: fix 225 — vTotDFe no imp, não IBSCBSTot (08/09/2026)

- NT 2025.001 RTC: o total do DFe é `<imp><vTotDFe>` após o IBSCBS (não existe
  `<total><IBSCBSTot>` no CT-e). Em 2026, `vTotDFe = vTPrest` (sem somar IBS/CBS,
  senão erro 365). Meu `IBSCBSTot` anterior causou o 225.
- Fix: `vTotDFe` injetado no `<imp>`; `<total>` voltou ao original.

Commits: CF `ea5bc46` + Vercel `4fe7336`

---

## CT-e: fix 225 — vTotDFe no total do Simp (08/09/2026)

- Com os schemas oficiais (NT 2026.002, Desktop): no **CTeSimp** o `imp` termina no
  IBSCBS e o `vTotDFe` é filho do **`total`** (no CT-e normal/OS é no `imp` — daí
  meu erro anterior). IBSCBS e toma conferidos e corretos no XSD.
- Fix: `vTotDFe` (= vTPrest em 2026) movido para dentro do `<total>`.

Commits: CF `0537490` + Vercel `03fd9c3`

---

## CT-e homologação AUTORIZADO (cStat 100) — 08/09/2026

- Sequência de erros vencida na homologação MG: 938 (razão social de teste) →
  310 (grupo IBSCBS) → 360 (total DFe) → 225 (vTotDFe no `total`, não no `imp`)
  → **100 "Autorizado o uso do CT-e"**, protocolo `131260005246387`,
  chave `31260903919614000160570010009000101789090457` (nCT 900010).
- Layout RTC validado de ponta a ponta contra XSD oficial NT 2026.002.

---

## CT-e: trava duplo-clique + SPED homologação (08/09/2026)

- **Duplo registro (rejeitado+autorizado)**: duplo clique no "Enviar Doc-e" (há dois
  botões: diálogo + preview) disparava 2 emissões concorrentes com o mesmo número —
  SEFAZ autorizava a 1ª e rejeitava a 2ª. Fix: `emittingRef` bloqueia emissão
  concorrente. Rejeitados antigos são histórico de tentativa — limpar com o botão
  "Limpar Rejeitados".
- **Autorizado não aparece no SPED MG**: esperado — homologação não tem valor fiscal
  e nunca vai p/ SPED. Documentos reais só em Produção.

Commits: CF `9fec488` + Vercel `244936b`

---

## CT-e: rascunho reserva NF (sem deletar) + bloqueio duplicidade (08/09/2026)

- Raiz do "cancelado foi p/ rascunho": salvar rascunho **deletava** as NF-es; depois
  nada as encontrava e a lista esvaziava. Migration `20260908140000` (aplicada via
  API): status aceita `rascunho`; salvar rascunho agora faz UPDATE p/ `rascunho`
  em vez de DELETE — emitir/cancelar/excluir revertem sozinhas.
- Import agora **bloqueia NF em rascunho ou embarcada** (toast "bloqueada(s)"),
  acabando com a duplicidade lista × rascunho. Lista segue filtrando só `pendente`.

Commits: CF `a597ac9` + Vercel `0de9ce3`

---

## CT-e: trava silenciosa + toast fantasma (08/09/2026)

- 900011 autorizado mas com toast de erro e sem linha de rejeitado: 2º clique
  concorrente caía no else e mostrava "Rejeitado" sem ter rejeição real.
- Fix: trava retorna `{ignored:true}` e onSuccess ignora em silêncio (sem toast).

Commits: CF `4c42487` + Vercel `aeb82d3`

---

## CT-e: Novo CT-e preserva dados fiscais (08/09/2026)

- "Novo CT-e" / "Novo CT-e avulso" zeravam o form inteiro (`emptyForm`), apagando
  CFOP, alíquotas e impostos digitados. Agora preservam CFOP, vPrest, ICMS
  (CST/alíq/redução/crédito), PIS/COFINS/IR/INSS/CSLL, ambiente e campos de Status;
  só limpam dados da NF (tomador, rota, consignatário, motorista, etc.).

Commits: CF `584eb83` + Vercel `1af180f`

---

## CT-e: transições de NF no servidor (08/09/2026)

- NF 59156 ficou `pendente` após CT-e autorizado: UPDATE do front falhou em
  silêncio (sem toast). Corrigido na hora via API (→ `embarcada`).
- Baixa (`embarcada`) e devolução (`pendente`) agora acontecem no **servidor**
  (service_role) em `emitirCteFn`/`cancelarCteFn` + proxy; front mantém fallback
  e ganhou toasts de erro nos updates (chega de falha silenciosa).

Commits: CF `bdb8d11` + Vercel `f3ce8ba`

---

## CT-e: Tomador vira dropdown no cabeçalho (08/09/2026)

- Card Tomador removido; entra dropdown na linha da Data (compacta, 136px):
  opções da NF-e (0 Remetente CIF / 1 Destinatário FOB) + contatos buscáveis;
  digitar CNPJ busca sozinho; toma definido auto (0/1/2).
- CFOP foi p/ linha própria abaixo. Cabeçalho: Ambiente | Nº | Data | Tomador | Mod/Ser.

Commits: CF `cd4b357` + Vercel `bcadf1e`

---

## CT-e: dropdown tomador com 6 tipos (08/09/2026)

- Dropdown do Tomador lista os 6 tipos de antes (0 CIF, 1 FOB, 2 Terceiros, 3/4
  próprio, 9 sem ocorrência); digitar CNPJ busca e define o toma sozinho.

Commits: CF `9cb5ba6` + Vercel `d68234b`

---

## Configurações: aba Seguradoras (08/09/2026)

- Tabela `seguradoras` existia mas sem tela de cadastro. Nova aba em Configurações
  (nome, CNPJ com busca BrasilAPI, apólice, averbação; edição inline, exclusão).
  CT-e passa a listar na aba Transporte.

Commits: CF `e3f9901` + Vercel `914662a`

## Configurações: Seguradoras CNPJ primeiro (08/09/2026)

- Aba Seguradoras: CNPJ passa a primeiro campo (add + edição + tabela) com busca
  BrasilAPI sempre ao completar 14 dígitos. Padrão CNPJ-primeiro+busca vale p/
  todos os cadastros (clientes, fornecedores, empresas já seguem; RNTRC mantém
  número como chave, busca por CNPJ preservada).

Commits: CF `4807369` + Vercel `f28d8cd`

---

## CT-e: dropdown tomador mostra tipo (08/09/2026)

- Fechado exibe a opção (`0 — Contratação do Frete por conta do Remetente (CIF)`),
  nome só no XML/PDF. Removido sufixo "(XML: razão teste)" do label.

Commits: CF `24d1ab2` + Vercel `1df9043`

---

## CT-e: coleta/entrega na linha do CFOP (08/09/2026)

- Rota vira linha compacta no cabeçalho (Coleta mun+UF | Entrega mun+UF); card Rota
  removido. Faixa de cálculos do rodapé removida (duplicada com Tributação).

Commits: CF `66a3ca0` + Vercel `ac39a4f`

---

## CT-e: CFOP alinhado + scroll + largura (08/09/2026)

- Labels e inputs na mesma altura; municípios flexíveis; scroll da lista CFOP
  isolado do diálogo (`onWheelCapture stopPropagation`); largura máx 700px (cabe
  o 5356); observação abaixo do CFOP removida.

Commits: CF `306e41e`/`704ae0b`/`e385e7d` + Vercel `35f81a2`/`553b1f7`/`f85081c`

---

## CT-e: abas fundidas + Transporte (08/09/2026)

- Tributação e Carga fundidas em **Tributação e Carga** após Veículos; aba
  Veículos renomeada **Transporte**. Ordem: Geral, Veículos→Transporte,
  Tributação e Carga, Status, Observações.

Commits: CF `59f2cd0`/`8188bf2` + Vercel `633f32d`/`272145e`

---

## CT-e: diálogo full-width + rota cabeçalho + sem Componentes (08/09/2026)

- Diálogo ocupa `calc(100vw - 2rem)`; card Componentes do Valor removido (Valor
  Serviço já existe em Transporte); card Rota removido (coleta/entrega no cabeçalho).

Commits: CF `3df15fd`/`4b94f40`/`2c50fcc` + Vercel `c01c2e7`/`2c45dba`/`8dbb950`

---

## CT-e: justificativa padrão de cancelamento (08/09/2026)

- Prompt de cancelamento pré-preenchido ("CT-e cancelado por erro nos dados da
  prestação do serviço"), editável.

Commits: CF `a036d99` + Vercel `fbcf9ad`

---

## Regras de segurança

- NUNCA commitar tokens/senhas (GitHub PAT, senhas de banco, service keys).
- Credenciais coladas em conversas anteriores devem ser rotacionadas quando possível.

---

## CT-e, Percursos e robustez de emissao (09-10/09/2026)

### Percursos (tabela `cte_percursos`, ex-`cte_rotas`)
- Migrations `20260909130000_cte_rotas.sql` e `20260909140000_cte_percursos_extend.sql` aplicadas (rename + codigo + ~48 colunas: consig/redespacho, seguro, pedagio, distancia/duracao, fiscal, obs, emissao).
- Match automatico ESTRITO por CNPJ remetente+destinatario+tomador (sem fallback); salvamento silencioso a cada emissao/rascunho; numero do percurso no cabecalho do CT-e (card removido a pedido).
- Pagina Fiscal -> Percursos: lista + edicao em abas sem rolagem (Geral | Seguro e Pedagio); chave (rem/dest/toma) travada; busca CNPJ em consignatario/redespacho (contatos -> BrasilAPI -> ReceitaWS) com cura do cadastro; entrega amarrada em redespacho > destinatario; endereco completado via cadastro; DialogContent fullscreen por padrao (Ctrl+K preservado).
- Percurso NUNCA guarda motorista/frete; Gerar/Novo CT-e zeram dados de viagem e nao reaproveitam tomador/coleta/entrega (edicao de rascunho preservada).

### Emissao robusta (Vercel proxy + server)
- `return ret` faltando no mutationFn fazia todo envio cair no toast de rejeitado mesmo autorizado (causa raiz do "autorizado com toast de erro").
- Reconciliacao via consSit: resposta de erro, ECONNRESET no envio e no cancelamento (135/155); retry com backoff (3x) no envio e na consulta; toast de resposta vazia com diagnostico (console + JSON).
- Agent mTLS fixado em TLS 1.2.
- 10/09 ~10h35: `hcte.fazenda.mg.gov.br` passou a resetar TODAS as conexoes (envio e consulta, TLS 1.2 e 1.3, Vercel e local). Portal no ar, SVRS ok, NFe nacional ok => homologacao MG fora do ar. Numeros 900015-900017 ficaram como rejeitados locais; retomar do 900018 e limpar rejeitados.

### CT-e UI (Transporte sem rolagem)
- Dialogo maximizado; Transporte compacto (Seguro 2 linhas, Veiculo 3 campos Cavalo/Reboque 1/2 com limpar, Componentes em 1 linha MoneyInput); ICMS e vTPrest sobre o total (menos pedagio, Lei 10.209); pedagio default "Sem Pagamento" + trava obrigatoria em Free Flow/TAGs (alimenta MDF-e); DACTE com seguro; toasts enxutos (sem "Percurso aplicado").

### Distancia/duracao do Percurso
- Calculo via CEP (BrasilAPI) + rota OSRM (menor alternativa); duracao = dist/50 km/h + descansos Lei 13.103, arredonda p/ hora cheia; destino = redespacho > destinatario.

Commits CF `e52f69a..0115b69` (53) + Vercel espelhos + Worker redeployado a cada mudanca.

---

## Percursos: layout final + regras (10/09/2026)

- Layout estilo STM: chave larga a esquerda (1 linha por parte, so nome+CNPJ, boxes com contorno) + Coleta/Entrega estreita a direita na mesma altura (flex distribuido).
- Edicao em abas sem rolagem; DialogContent fullscreen por padrao (Ctrl+K e AlertDialog preservados).
- Regras: IE ou ISENTO obrigatoria (pendencias agregadas num toast so); tudo maiusculo (digita + save + persist CT-e); apagar CNPJ limpa a parte em cascata; busca CNPJ com cura do cadastro; edicao volta para `contatos` (update/insert).
- Entrega amarrada em redespacho > destinatario; emissao fora do percurso (dado do emissor).

Commits CF `fd2c6c0..20d42c4` + Vercel espelhos.

---

## UI + regras Percurso (10-11/09/2026)

- Lib `src/lib/ie.ts`: IE so numeros (ISENTO preservado) + digitos por UF (SINTEGRA); validacao no save do percurso agregada as pendencias.
- CST ICMS virou dropdown com os 8 codigos do STM.
- Nome da rota e coleta/entrega somente leitura; DialogContent fullscreen por padrao; abas ativas vivas; secoes com fundo tonalizado (depois revertido p/ campos).
- Campos (Input/Textarea base) com fundo `bg-primary/[0.10]`; leitura neutralizados (`bg-transparent`): destaque so em editaveis, nos dois temas.

Commits CF `5138d60..b041b1c` + Vercel espelhos.

---

## Percursos: combos digitáveis, tons por tema e Dist/Dur auto (10-11/09/2026)

- CFOP saiu do card da Coleta e foi para o Fiscal ao lado do CST (19 CFOPs de transporte); depois os dois viraram Combo digitável com dropdown (filtra por código/descrição ignorando acento, Enter escolhe o primeiro).
- Tons: editáveis com fundo visível (claro `stone-200`, escuro `muted`); dropdowns (SelectTrigger) com o mesmo tom por serem selecionáveis; só-leitura transparente nos dois temas (código/nome do percurso, Parte/Tomador/R, Tomador/Chave/protocolos do CT-e).
- Box Coleta/Entrega: Distância/Duração por extenso na mesma linha (km/h), sem sobreposição (inputs `w-0 flex-1`, sem `justify-between`).
- Dist/Dur automáticos no save: se vazio ou se a rota mudou (origem/destino efetivo vs. banco), recalcula — CEP em 3 fontes (BrasilAPI v2 → AwesomeAPI → Nominatim por CEP) com fallback cidade/UF → rota OSRM (menor alternativa). Botão Recalcular no box + recálculo sozinho ~1s após trocar cidade (debounce, não dispara ao abrir).
- Regra de duração final: volante = km ÷ 60; dias = teto(volante ÷ 12); 1 dia = só o volante; mais dias = volante + 12h descanso × dias; sem decimais (decimal maior que 5 arredonda p/ cima, até 5 p/ baixo; ex.: 185 km = 3h; 2813 km = 95h).
- Save do percurso paralelizado (update + writeback consig/redesp em `Promise.all`).

Commits CF `a16bf80..2aca9b8` + Vercel espelhos + Worker redeployado a cada mudança.

---

## Padrão numérico pt-BR em todo o sistema (11/09/2026)

- `MoneyInput` (`src/components/erp/money-input.tsx`) ganhou prop `decimals` (padrão 2): digita só números e preenche sozinho `1.234,56` (milhar com ponto, decimal com vírgula); emite string crua (`"1234.56"`) p/ banco/SEFAZ.
- Regra: valores R$ = padrão; % = `prefix=""`; quantidades = `decimals={3}`; inteiros (parcelas, dias, pontos, eixos, km, prob.) = `decimals={0}`; identificadores (série, próximo número, ano) mantidos sem máscara.
- Convertidos todos os `type="number"` + campos de texto do Percurso (Fiscal: 8 alíquotas; Seguro: RCTR-C/RCF-DC/Adicional/Total; Vale pedágio; Distância/Duração inteiros): config, estoque (5 telas), financeiro (contas, empréstimos), fiscal (config, emitidas, percursos), frota (multas, veículos, viagens), RH (comissões, férias), vendas (crm, pedidos).

Commits CF `1f78d92` + Vercel `bb9c24d` + Worker `c78b722c`.

---

## DACTE padrão do modelo + obs do percurso (11/09/2026)

- `src/lib/dacte-pdf.ts` rebuildado no padrão do modelo enviado (Scribd CT-e Rodoviário): P&B sem faixas azuis/cinzas, canhoto de recebimento no topo (declaração + NOME/RG/ASSINATURA + TÉRMINO + box CT-E Nº/SÉRIE), CFOP com INÍCIO/TÉRMINO DA PRESTAÇÃO (cidade-UF), coluna ICMS ST, DOCUMENTOS com CNPJ emitente + SÉRIE/NRO, CST por extenso Tabela B; homologação continua no box OBSERVAÇÕES; logo Juvenal mantido.
- Obs do percurso (`obs_gerais`) sai no DACTE: preview já levava; download de autorizado agora lê `form.obsGerais` gravado no JSON + `ObsCont/ObsFisco` do XML (antes era `""` fixo).
- Download lê ICMS do grupo correto (ICMS00/20/45/60/90/OutraUF; antes só ICMS00) e emissor mapeia 40/41/45/51 p/ ICMS45, resto só 00/20/60/90, resto bloqueia com erro claro.

Commits CF `9113282` + Vercel `eba27ef` + Worker `91291ef6` (+ fix `64b9d36`: o `.new` do layout não tinha sido movido; layout real vale deste).

---

## DACTE com barras e QR reais (11/09/2026)
- Barras CODE-128C reais da chave (MOC 4.00) via JsBarcode+canvas; QR vetorial do `qrCodCTe` do XML via qrcode-generator (módulos desenhados no PDF, 25mm). Fallback p/ barras simuladas fora do browser ou sem chave.
- Download lê `qrCodCTe` (`infCTeSupl`) do XML autorizado. Preview segue sem QR (só existe após autorizar) e com barras reais se já houver chave.
- Libs vendorizadas em `src/lib/vendor/` (bundles oficiais jsbarcode 3.12.3 + qrcode-generator 2.0.4) porque o `package.json` está com lock de escrita — documentar ao destravar.

Commits CF `f1f9062` + Vercel `5f69095` + Worker `20b4dc02`.

---

## Consulta SEFAZ e DACTE fiel ao XML (11/09/2026)

- Consulta MG mandava gzip+base64 (copiado da recepção) e voltava 225; consulta espera XML puro — corrigido, passou a responder 100/217 de verdade.
- Consulta usava ambiente do config da empresa (padrão produção!); agora usa o ambiente do próprio documento (tela → server → proxy). 217 anterior era pergunta na produção por doc de homologação.
- Download do DACTE lê cidades do `det` (no Simplificado não há xMunIni no `ide`), destinatário prefere grupo `dest`/percurso (não o toma com texto de homologação), lê enderDest/enderRem/exped/receb quando existirem (no Simplificado esses grupos não existem no schema) e observa aviso se percurso não casar.

Commits CF `8953415` + Vercel `155cfea` + Worker `861f1175`.

---

## Percursos: Tabela B, linha única e diálogo sem rolagem (11/09/2026)

- CST com os 11 códigos da Tabela B por extenso (saiu o 99-ISSQN); idem no CT-e, com emissor mapeando 40/41/45/51 p/ ICMS45 e bloqueando 10/30/50/70 (sem grupo no CT-e).
- Consignatário/Redespacho sempre visíveis em linha única (CNPJ+Nome+IE+CEP+Município+UF, Município antes da UF; endereço saiu da tela, segue gravado e buscado).
- Fiscal: CST/CFOP 45/55 em linha flex e 8 alíquotas numa linha de 8; rota efetiva (coleta/entrega da tela, não do cadastro) no cálculo, na comparação e no salvamento — fim do vai-e-volta Contagem×Belém.
- Diálogo cabe sem rolar (saiu linha Código/Nome, obs em 1 linha, paddings) e Observação estica até o Salvar (flex, sem resize manual).

Commits CF `5f84898..f48e434` + `534741e` + Vercel espelhos + Worker redeployado a cada mudança.

---

## CT-e: viewer, travas, IE e sincronia (11/09/2026)

- Botão olho abre o DACTE embutido no sistema (tela cheia); geração separada em `gerarDacteBlob`, download mantido.
- Travas de emissão agregadas numa mensagem só: IE de remetente/destinatário/tomador/consig/redesp (ISENTO vale), motorista, placa da tração, reboque se tração for cavalo/truck (menos bitruck), valor > 0, CST/CFOP/alíquota, seguradora/apólice/responsável; pedágio padrão sem. Rascunho/preview não travam.
- IE editável no box do Destinatário e no cabeçalho do Tomador; quedas NF-e → contato → percurso → digitado (a tabela de NF-es não guarda IE e o reload perdia).
- Entrega segue redespacho/destino sozinha (com IBGE p/ cMun); sem percurso para a chave, cria sozinho e avisa; destinatário via NF-e/contatos (nunca texto de homologação); consulta mira o ambiente do documento; obs sem sobrepor a marca d'água.
- Correções: `destNomeFix` fora do `try`, ordem do lookup de contatos, gzip só na recepção, bloco de travas fora do preview.

Commits CF `4b9e2aa..437fb22` + Vercel espelhos + Worker redeployado a cada mudança.

---

## Assistente AI no Worker, fora da Vercel (14/09/2026)

- `/api/ai/chat` atendido so onde ha binding AI (Worker): sem binding, 404 direto em vez de 500 � a Vercel nao queima mais function num caminho morto. SEFAZ (`/api/sefaz`, `/api/sefaz-cron`) intocada.
- Front chama via `VITE_AI_URL` (absoluto; vazio = mesma origem no Worker); CORS restrito (vercel.app, workers.dev, localhost) + preflight OPTIONS.
- `wrangler.jsonc`: `"bindings"` nao e campo valido (wrangler ignorava com warning) ? `"ai": {"binding": "AI"}`; binding `env.AI` ativo no deploy.
- Handler lia `response.response.tool_calls` (formato OpenAI) e quebrava: Workers AI/llama retorna `{ response, tool_calls: [{ name, arguments }] }` no topo � parse refeito nos dois formatos + eco do turno no estilo da doc. Chat testado de ponta a ponta no Worker.
- Env do Worker chega via `globalThis.__env__` (o entry nitro chama o handler so com `request`).
- MDF-e auditado: o proxy `/api/sefaz` nunca importou `sefaz-mdf-server`; so a pagina `/fiscal/mdf` usa (serverFn sob demanda) � nada a cortar sem perder funcao.
- `routeTree.gen.ts` regenerado no build (faltava `/fiscal/percursos` no manifesto commitado).

PENDENTE (dashboard Vercel): criar env `VITE_AI_URL=https://norvo-gestao-cf.sptn201169.workers.dev` + Redeploy � sem ela o chat no site principal responde "disponivel apenas no Worker".
---

## URL canonica = Worker; Vercel vira so API SEFAZ (14/09/2026)

- `src/server.ts`: na Vercel (host `*.vercel.app`), tudo que nao for `/api/sefaz*` redireciona 308 para o Worker (preserva metodo/corpo). `/api/sefaz` e `/api/sefaz-cron` seguem normais; `/api/ai/chat` antigo passa a cair no Worker em vez de 404.
- MDF-e validado antes: emite/consulta/encerra via proxy `/api/sefaz`, funciona servido pelo Worker � redirect nao quebra nada fiscal.
- PENDENTE: repointar o exe Electron (desktop carrega a URL da Vercel; redirect leva ao Worker sozinho, mas o ideal e apontar direto).
Commits CF `d49b494` + Vercel `30ff3a0` (+ `f664f64` trigger) + Worker `227f5885`.
---

## Fundo claro mais suave (14/09/2026)

- `--background` 0.985 -> 0.95 (papel quente, menos glare); `--muted`, `--secondary` e `--sidebar` desceram junto p/ manter a hierarquia. Cards seguem brancos, modo escuro intocado.
---

## Caixas off-white quente (14/09/2026)

- `--card` e `--popover` 1.0 -> 0.975 quente: caixas seguem claras contra a pagina, sem o claro de branco puro.
---

## Coleta/Entrega travadas nas origens (14/09/2026)

- Coleta/Entrega (municipio+UF) viraram somente-leitura com tooltip ("Segue o remetente" / "Segue redespacho/destinatario"); fora do tab.
- Efeito novo: coleta segue o remetente (NF-e emitente + contato). Entrega (ja automatica) ganhou fallback de contato quando a NF-e vem sem cidade.
---

## Sidebar com tom proprio (14/09/2026)

- Sidebar em taupe quente (0.87) com borda e destaque de selecao acompanhando; texto escuro mantido (contraste ok). Modo escuro intocado.
---

## Sidebar escura com tom proprio (14/09/2026)

- `.dark --sidebar` 0.20 -> 0.24 (painel elevado sobre a pagina 0.18) e `--sidebar-accent` acompanhando.
---

## Tema claro neutro de baixo contraste (14/09/2026)

- Superficies claras (fundo, caixas, muted, sidebar, bordas, textos) migradas do creme quente p/ cinza neutro frio; pagina (0.92) e caixas (0.935) quase no mesmo tom. Terracota e cores semanticas mantidos; modo escuro intocado.
---

## Sidebar terracota clara (14/09/2026)

- Sidebar do tema claro com banho terracota (fundo, selecao e borda); texto escuro mantido.
---

## Botao importar sem amarelo chapado (14/09/2026)

- Labels de importacao (CT-e e veiculos) com `bg-amber-100` fixo migrados p/ tokens `accent` do tema � acompanham claro/escuro sem gritar.
---

## HTML sem cache (14/09/2026)

- Respostas `text/html` com `Cache-Control: no-cache`: sem isso o navegador reaproveitava o shell antigo no F5 simples (sem validadores p/ revalidar) e o tema novo nao aparecia.
---

## Tema claro bem mais escuro (14/09/2026)

- Prova via console: o neutro anterior (0.92) estava aplicado, mas claro demais. Pagina 0.92->0.86, caixas 0.935->0.89, demais superficies acompanhando; sidebar terracota segue distinta.
---

## Offwhite quente de volta (14/09/2026)

- Cinza neutro revertido: fundo offwhite quente (0.94), caixas (0.97), textos e bordas na familia quente; sidebar terracota mantida.
---

## Marca verde no claro (14/09/2026)

- Primario/anel/graficos/sidebar/accent: terracota -> verde profundo, combinando com o offwhite. Ambar semantico (alertas) mantido; modo escuro intocado.
---

## IE aceita ISENTO digitado (14/09/2026)

- Os 4 campos de IE (tomador, destinatario, consignatario, redespacho) apagavam letras a cada tecla (`replace(/\D/g)`), tornando ISENTO impossivel de digitar. Agora aceitam A-Z0-9 em maiusculas (numeros como antes). Validacao e XML ja tratavam ISENTO.
---

## Pedagio "sem" sempre marcado (14/09/2026)

- Valores legados de `pedagio_pagto` (ex. "sem") nao casavam com nenhum radio e deixavam tudo desmarcado. `pagtoSeguro()` normaliza qualquer valor p/ um dos 4 validos (padrao sem-pagamento) nos radios, no calculo, ao aplicar percurso e ao salvar; select do percurso com a mesma guarda.
---

## DACTE igual ao modelo oficial (14/09/2026)

- `dacte-pdf.ts` reescrito no layout exato da referencia (Juvenal 37105): cabecalho com subquadros, barras+chave, protocolo/versao, meta 5 itens, CFOP pontuado, previsao viagem, blocos rotulados, tomador com cidade/UF, produto+averbacao, carga+seguro combinados, componentes em grade fixa 4x3 + totais, ICMS/IBS no formato oficial, documentos em 2 colunas (Tipo/Serie-Nro/Chave), linha IBPT, info adicionais, modal lotacao completo (conjunto, vale-pedagio, motorista, lacres), canhoto oficial. Saiu: caixa de consulta, peso avulso, rodape de impressao.
- Chamador extrai do XML: dhEmi, versao, toma, proPred, xOutCat, infQ, IBSCBS, vTotTrib, compl, IE toma, rodo completo (veic/moto/lacres/prop/valePed/CIOT/dPrev), CFOP/ide corrigido; pjForm p/ seguro/apolice/averbacao/formaPagto; lookups p/ CNPJ seguradora, CPF motorista, fones.
- Validado gerando o PDF do 37105: 1 pagina A4.
---

## DACTE: toast unico, dest via contato, header sem tilt (14/09/2026)

- Toast de percurso some apos o 1o aviso por documento (sessionStorage por chave).
- Destinatario: CNPJ cai p/ o achado via NF-e + endereco/IE/fone via contato full (antes so percurso); fones emit/rem via contato.
- Cabecalho: textos do emitente saiam INCLINADOS (size passado como angulo no doc.text!) + estouravam a caixa. Travados retos, linhas reequilibradas p/ caber. QR validado nitido no render local.
---

## Tipo de logradouro via CEP no DACTE (14/09/2026)

- Novo `lib/endereco.ts`: detecta prefixo (Av/Rua/Alameda/...) e, se ausente, busca a rua pelo CEP na BrasilAPI conferindo o nome. Validado: NAZARE+66035445 -> Avenida Nazare.
- DACTE (rem/dest/emit/toma) usa o logradouro enriquecido; dado gravado intacto. Form e contatos seguem exibindo a origem.
---

## Enriquecido volta p/ o cadastro (14/09/2026)

- Ao gerar o DACTE, se o contato esta sem prefixo e o enriquecido tem, grava de volta (rem/dest). Dado manual com prefixo nunca e sobrescrito; idempotente.
---

## DACTE tudo maiusculo (14/09/2026)

- Rua vinda da API em caixa alta + `cut()` do PDF forca maiusculas em nomes/enderecos/cidades. Obs e info adicionais seguem livres.
---

## Ordem dos icones do CT-e (14/09/2026)

- Acoes: olho, XML, PDF, cancelar, lupa por ultimo (fora do rascunho).
---

## Cabecalho estilo imagem 2 (14/09/2026)

- Emitente com logo a esquerda + linhas rotuladas (Endereco/Bairro+CEP/Cidade+Tel/CNPJ+IE), sem nome em texto e sem QR no cabecalho ( segue no padrao da imagem 2; barras+chave+protocolo cobrem a consulta). Suframa sem corte.
---

## Cabecalho imagem 2 + QR de volta (14/09/2026)

- Emitente: logo + nome + linhas rotuladas iguais a referencia. QR 20mm ao lado das barras/chave (cabecalho sem espaco p/ os 25mm do MOC); blocos compactados p/ manter 1 pagina (validado no render local).
---

## Subcolunas DACTE reequilibradas (14/09/2026)

- Data Emissao (16 chars) invadia a coluna do Modal; larguras 13/12/15/8/14 -> 13/11/13/7/18.
---

## Legenda das barras centralizada + respiro sublinha (14/09/2026)

- Caption da chave centralizada com barras e numero; sublinha DACTE com folga da borda; obs box 8 p/ manter 1 pagina.
---

## Operacao em 14/09/2026 (nota)

- Deploys 100% automaticos: push na main -> CF Builds (Worker) + Vercel (API SEFAZ). Sem `wrangler deploy` manual.
- URL canonica = Worker; Vercel redireciona tudo (exceto `/api/sefaz*`) p/ o Worker (308).
- Vercel precisa das envs `VITE_AI_URL` (chat) e `SUPABASE_SERVICE_ROLE_KEY` (proxy); Worker precisa do secret `SUPABASE_SERVICE_ROLE_KEY` (sem ele, `/api/sefaz` retorna 401).
- HTML com `no-cache`: sem isso o navegador reaproveita o shell velho no F5.
- Incidentes do dia (resolvidos): token do CF Builds rolado (recriar em Settings -> Builds), trigger GitHub->Vercel mudo (disconnect/reconnect do repo destravou).
---

## Sucesso em teal (14/09/2026)

- `--success` e `--chart-2` do claro: oliva -> teal, separando do verde da marca. Escuro intocado.
---

## Toast de percurso: 1x para sempre (15/09/2026)

- Guard era sessionStorage (morria a cada dia). Agora localStorage por chave: avisou uma vez, nao repete.
---

## Percurso garantido na emissao e na cura (15/09/2026)

- Causa do toast fantasma: `persistirPercursoSilencioso` (emissao/rascunho) e a cura do DACTE exigiam tomador 14 digitos; doc sem tomador resolvido nunca ganhava percurso. Cura agora so exige rem+dest; erro do insert aparece no toast (1x) em vez de silencio; match do form normaliza digitos.
---

## Cabecalho 2 colunas + QR 25mm (15/09/2026)

- Esquerda: emitente + DACTE + faixa Modal; direita: QR 25mm (MOC) + barras + chave. Compactado p/ 1 pagina.
---

## Metades alinhadas + divisor QR/barras (15/09/2026)

- Caixa direita ancorada no topo (estava 1mm deslocada); linha separando QR do codigo de barras.
---

## Arquivos com nome da chave (15/09/2026)

- Download do XML e do PDF salvam como `<chave>.xml` / `<chave>.pdf` (cai p/ numero se sem chave).
---

## Remetente via NF-e, nao via emitente (15/09/2026)

- Simplificado nao tem grupo `rem`: o codigo usava o emitente (Juvenal) como remetente. Agora: XML rem -> NF-e emitente -> percurso -> contato -> emit. Vale p/ CNPJ/nome/cidade/UF/endereco/IE/fone. Mesmo vale p/ dest nome/cidade/UF via NF-e.
- Com remD correto, o match do percurso (TECNO->INSS) acerta e o toast some; fone do emitente separado do remetente.
---

## Cabecalho meio a meio (15/09/2026)

- Colunas 98/98 (antes 116/80 que esticava o endereco); conteudo da esquerda reequilibrado.
---

## DACTE centralizado (teste) + CEP sem cola (15/09/2026)

- Titulo/subtitulo centralizados na coluna; CEP deslocado (colava no bairro).
---

## DACTE emitente com endereco proprio (15/09/2026)

- Bug: `emitEndereco` do DACTE (doc autorizado) montado com rua/numero do REMETENTE (`remLogEnr/remNroRaw`); caixa do emitente misturava rua do remetente com resto do emitente.
- Fix: le `enderEmit > xLgr/nro/CEP` do XML autorizado + `completarLogradouro`; preview/rascunho ja usavam `empresas` (ok).
---

## Tabela CT-e: chave completa + acoes a direita (15/09/2026)

- Coluna Chave sem truncate: exibe os 44 digitos (`break-all`, mono 11px).
- Coluna Acoes alinhada ao canto direito (`justify-end`, header `text-right`).
---

## Tabela CT-e: chave colada no olho (15/09/2026)

- Digitos da chave alinhados a direita (`text-right pr-1`); celula de acoes com `pl-1`: respiro minimo sem sobrepor.
---

## DACTE emitente: dois-pontos + valores a esquerda (15/09/2026)

- Rotulo `Endere�o :`; coluna de valores 17->14mm (bairro nao encosta mais no CEP); CNPJ alinhado junto.
---

## Tabela CT-e: titulos centralizados (15/09/2026)

- Todos os `TableHead` (Numero, Serie, Status, Notas, Valor, Chave, Acoes) com `text-center`; celulas de dados inalteradas.
---

## DACTE emitente: bairro completo (15/09/2026)

- Bairro corta em 13 (era 10): `SAO SEBASTIAO` inteiro; rotulo/valor do CEP 2mm a direita.
---

## DACTE emitente: bairro ate 20 letras (15/09/2026)

- Bairro corta em 20 (fonte 5.5); CEP deslocado para a direita; validado com 20 letras sem encostar.
---

## DACTE: protocolo na coluna esquerda (15/09/2026)

- Pilha esquerda: emitente + DACTE (11) + modal (5) + protocolo com Versao (6); total 43 igual a coluna QR (intacta).
- Removida a faixa de protocolo largura total (duplicava); 1 pagina mantida.
---

## DACTE emitente: CEP/Tel/Insc alinhados (15/09/2026)

- Rotulos em ex+38; valores/IE compensados; bairro 20 em fonte 5 (validado sem colar).
---

## DACTE faixa meta: tipo, responsavel, tomador (15/09/2026)

- Tipo `EMISSAO NORMAL` separado; Responsavel = usuario logado (`user_metadata.nome`, fallback email) nos 2 fluxos.
- Tomador pela identidade dos CNPJs (rem/dest/exp/rec), nao pelo codigo; `<toma>` direto lido no Simplificado.
---

## DACTE: CFOP + inicio/termino na mesma linha (15/09/2026)

- Faixa unica: CFOP primeiro (natureza por inteiro) + Inicio + Termino; Previsao Inicio Viagem removida.
---

## DACTE: CFOP oficial + responsavel do cadastro (15/09/2026)

- CFOP mostra descricao oficial da tabela (`6.352 - Prestacao ... a comercio`); natOp vira fallback.
- Responsavel = `empresa_users.nome` (cadastro da conta) + metadata; sem fragmento de email.
---

## DACTE: protocolo com : + logradouro sem tipo (15/09/2026)

- Protocolo/Versao com `:` e numeros colados (2mm).
- `completarLogradouro` aceita rua da API sem tipo conhecido (Vereador/Deputado/Doutor); writeback acompanha.
---

## Contatos refeitos com dados do XML da NF-e (15/09/2026)

- Import le `enderEmit/enderDest > nro` (nunca lido); numero vai ao contato.
- `upsertContatoFromNfe` ATUALIZA existente com endereco do XML (prefixo Rua/Av, numero, bairro, CEP, IE, fone); antes ignorava. Nome so se vazio; tipo preservado.
---

## Cancelamento usa ambiente do documento (15/09/2026)

- 216 acontecia pq o cancel ia p/ producao (nfe_config) mesmo p/ CT-e de homologacao; agora usa body.ambiente > documento > global.
---

## Fiscal > Cadastro (clientes+fornecedores) (15/09/2026)

- Nova rota `/fiscal/cadastro`: contatos cliente/fornecedor/ambos juntos, com busca, filtro por tipo e CRUD completo (IE, endereco com numero, lookup CNPJ).
- Item `Cadastro` no menu Fiscal apos Percursos (mesmo modulo fiscal, sem permissao nova).
---

## Fiscal isolado em fiscal_cadastros (15/09/2026)

- Tabela propria `fiscal_cadastros` (RLS membros, trigger updated_at) + backfill de 13 contatos; Cadastro sem tipo; CT-e (import, percursos, preview, DACTE) le/grava so nela.
---

## Numeracao CT-e por ambiente, homologacao do 500 (15/09/2026)

- 539: proxy reusava numero sem filtrar ambiente; agora max numerico por empresa+ambiente, homologacao `max+1,500`.
---

## Logradouro: acento no meio da palavra + fallback tomador (15/09/2026)

- `norm()` trocava acento por espaco (DECIO->DE CIO) e a conferencia falhava; agora remove diacriticos. Caso real validado: VEREADOR DECIO DE PAULA + 35574825 -> RUA VEREADOR DECIO DE PAULA.
- Tomador usa cadastro (logr/nro/cep/fone) quando o XML nao traz; fone do tomador no DACTE.
---

## DACTE: quantidade medida/cobrada em pt-BR (15/09/2026)

- `fmtQtd`: ponto no milhar + virgula no decimal, preservando as casas (6750.0000 -> 6.750,0000).
---

## Mercadorias: coluna Qtde (qVol do XML) (15/09/2026)

- Import le `transp/vol/qVol`; coluna `qvol` nova; tela mostra Qtde por NF + total de volumes; rascunho preserva.
---

## DACTE: valor da carga + volumes (15/09/2026)

- `valorCarga` le `vCarga` do Simplificado (vMerc so no normal); `qtdVol` soma `qvol` das NF-es (doc e preview).
---

## DACTE: componentes centralizados (15/09/2026)

- Fileiras Nome/Valor centralizadas na faixa (estavam no pe); totais com respiro da borda.
---

## DACTE: faixa IBS dentro da pagina (15/09/2026)

- Colunas do IBS somavam 210mm (pagina tem 198); reequilibradas p/ 188 + folga no ICMS ST.
---

## Emissao persiste form p/ DACTE (seguradora/apolice) (15/09/2026)

- `xml_assinado` do autorizado vira `{xml, form}`; seguradora, apolice, averbacao e demais campos do form saem no DACTE. Leitores (download, tabela, revert) compativeis.
- DACTE: caixa Observacoes com altura dinamica (LIM - y - resto, +1mm folga p/ 
eed(17)) p/ canhoto encostar no rodape; tomador RUA, NUMERO - BAIRRO - CIDADE / UF em 1 linha (ec6abc/24726f4).

- DACTE item 2.8: dashH tracejada entre linhas de componentes, Servico/Receber, obs/homolog; canhoto 4 colunas (Nome/RG|Assinatura|Prestacao|CT-e) (29a6d11/790e4b7).

- DACTE componentes: tracejada y+8 em largura total (grade+totais), y+12 na grade.

- DACTE: divisorias do canhoto e trecho Servico/Receber em linha continua (grade segue tracejada).

- DACTE canhoto: Nome/RG no topo (espaco p/ escrita), Assinatura embaixo, Inicio em cima/T�rmino embaixo a esquerda.

- DACTE modal: verticais entre RNTRC/CIOT/Data/Legislacao; 5 colunas do conjunto (tipo/placa/renavam/uf/rntrc) com verticais.

- DACTE veiculos: emissao grava <veic> (tracao); autorizado/preview caem p/ formulario+frota (renavam/rntrc); frase legislacao 4.5 sem corte.

- DACTE conjunto: subcabecalho Tipo/Placa/Renavam/UF/RNTRC; vale-pedagio exibido uma unica vez.

- CTE: RNTRC do modal puxa de ntrc_lista (match CNPJ emissora); emissao bloqueada sem RNTRC (nunca ISENTO).

- DACTE vale-pedagio: subcabecalho CNPJ Fornecedor/Numero Comprovante/CNPJ Responsavel/Vale Pedagio; comprovante ate 20 chars.

- CTE: 8 operadoras de pedagio pre-cadastradas (CONECTCAR, DB TRANS, MOVE MAIS, PAMCARD, REPOM, SEM PARAR, TARGET, VELOE); selecao preenche CNPJ.

- CTE pedagio: operadora em dropdown (8 pre-cadastradas); novos campos CNPJ Resp, Identificador VPO, Data Operacao, Saldo Cartao; CNPJ resp cai no DACTE.

- Frota: coluna eiculos.tag_pedagio (migration 20260916120000); campo TAG no cadastro; CTE preenche N� TAG ao escolher a tracao.

- Vale-pedagio (Lei 10.209/Res 6.024/NT 2025.001): CNPJ resp + IDVPO obrigatorios; comprovante = IDVPO; coluna eiculos.tag_pedagio aplicada no banco.

- CTE: TAG digitada volta p/ eiculos.tag_pedagio ao autorizar (sync com a placa); campo Saldo Cartao removido.

- CTE: preview DACTE fullscreen; editarRascunho pula auto-apply do percurso (pedagio preservado).

- Preview DACTE: mescla form vivo + input; passa infQ (peso), motoNome/CPF, CIOT, numeroAverbacao, segCNPJ.

- Pedagio 100% por viagem: removido do apply e do save de percurso + bloco na tela de percursos.
- DACTE modal: vale-pedagio lado direito em box unico (titulo + rotulos + 1 linha de dados, sem caixas/linhas por veiculo); conjunto segue com linhas por veiculo.
- DACTE componentes: grade sem Pedagio e sem ICMS (vale so no campo proprio, fora do total); Frete com fallback valorServico menos demais comps na reimpressao (XML sem Comp).
- Reimpressao DACTE: comps restaurados do formulario salvo quando o XML nao traz Comp (Outros/Desconto/Coleta/Entrega voltam a aparecer).
- DACTE componentes: grade 3x3 sem Sec/Cat (rotulo morto sempre zerado, removido); linhas com respiro e tracejados separadores inteiros entre as fileiras.
- DACTE totais: Valor do Servico = soma bruta dos servicos; Valor a Receber = total fiscal vTPrest (bruto menos desconto); preview valorServico = totalPrestacao.
- DACTE componentes: separadores entre fileiras em linha continua (sem tracejado).
- DACTE componentes: linha continua tambem sob o cabecalho; texto centralizado verticalmente mantido a esquerda.
- DACTE componentes: nomes a esquerda, valores e cabecalho Valor a direita (grade e totais).
- DP/RH: Calculadora trabalhista avulsa (/rh/calculadora) em 4 abas (salario, ferias, 13o, horas extras), tabelas 2026, sem vinculo com funcionario.
- Calculadora salario: VT 6% automatico + saude/odonto/alimentacao discriminados.
- Calculadora: deducao de dependentes (R$ 189,59 cada) na base do IRRF nas abas salario/ferias/13o.
- Calculadora: aba Rescisao (5 tipos, aviso/ferias/13o, multa FGTS 40/20%).
- Calculadora: salarios iniciais zerados.
- Calculadora rescisao: avos de 13o/ferias pelas datas (regra 15+ dias), vencidas via checkbox + dropdown 30/60.
- Calculadora rescisao: removidos dias de saldo, linha de avos e saldo FGTS; saldo automatico pelo dia da rescisao.
- Calculadora: removidos campos de dependentes de todas as abas.
- DACTE: visor proprio em tela cheia (sem barra do navegador) com Baixar, Imprimir, zoom e Esc; vale p/ olho e preview.
- DACTE visor: PDF em largura total.
- DACTE visor: zoom inicial preenche a largura da tela.
- DACTE visor: zoom via parametro nativo do leitor (CSS nao afeta plugin).
- Usuarios: nome editavel no Minha conta (todos) e na tela de usuarios (admin, incl. dono).
- Minha conta renomeado para Dados da conta (nome + senha).
- Sidebar: mostra nome do usuario; menu fixo na viewport com rodape preso (s� o conteudo rola).
- Homologacao: tomador SEM VALOR FISCAL com espaco (comparacoes toleram docs antigos).
- CTe: pagina em 5 abas (embarque, aguardando envio, autorizados, rejeitados, cancelados).
- Redespacho habilitado: selecao por remetente, tpServ 2 no XML, modo no form/rascunho.
- CTe: botao Limpar Rejeitados movido para a aba Rejeitados.
- Redespacho: ao marcar uma NF, pergunta se seleciona todas do remetente.
- Redespacho: confirmacao de selecionar todas em dialogo proprio (sem confirm do navegador).
- Redespacho: Gerar preserva o modo (nao reseta); titulo do dialogo indica tpServ 2.
- Redespacho: trava exige CNPJ do redespachante para emitir.
- Redespacho: infDocAnt por item (chCTe + total/parcial) + validacoes G016/G026.
- Redespacho: docAnt com chaves unicas (G025).
- Simplificado: avulso junta remetentes/destinatarios com tomador unico (NT 2024.002).
- Embarque virou Simplificado (tpServ 0, sem docAnt/trava).
- DACTE originarios: numero da NF via chave quando ausente; chave continua sem espacos.
- DACTE impostos: titulos centrais estilo imagem 2 (Informacoes Relativas ao Imposto + Reforma Tributaria).
- DACTE IBS: classificacao com nome por extenso.
- DACTE IBS: tabela CClassTrib completa (164 codigos, LC 214/2025).
- DACTE enderecos rem/dest/exp/rec com virgula apos logradouro.
- DACTE pessoas: bairro acima do municipio; CPF/CNPJ com J.
- DACTE pessoas em 2 colunas estilo oficial.
- DACTE pessoas: dois-pontos em todos os rotulos.
- DACTE pessoas: Pais colado na UF igual modelo.
- DACTE pessoas: rotulos em negrito.
- DACTE pessoas: rotulos alinhados a direita, valores na mesma reta.
- DACTE pessoas: campos a esquerda fluindo apos rotulo.
- DACTE pessoas: dois-pontos alinhados no do CNPJ.
- DACTE pessoas: volta ao fluxo encostado do modelo oficial.
- DACTE pessoas: volta alinhamento dos dois-pontos (zoom confirmou).
- DACTE 1 pagina garantido (compressao + resto exato); canhoto sempre pag 1.
- DACTE pessoas: rotulos na lateral + dois-pontos alinhados.
- Visor DACTE com marcador de revisao (diagnostico).
- DACTE pessoas: colunas fixas verificadas por medida.
- DACTE pessoas: rotulos na lateral, colons no do CNPJ, valores a frente.
- DACTE pessoas: acentos refeitos (Ender/Munic/Pais).
- Marcador rev-d no visor.
- Visor mostra revisao do PDF (diagnostico de deploy).
- DACTE pessoas: padrao imagem 2 (rotulos+colons juntos, valores alinhados).
- DACTE pessoas: colunas fixas com acentos (rev p3).
- DACTE pessoas: padrao imagem 2 definitivo (rev p4).

---

## Regra: HISTORICO atualizado a cada push (22/09/2026)

- A partir desta data, todo commit+push nos dois repos (`norvo-gestao` e
  `norvo-gestao-cf`) ganha entrada aqui no mesmo push. Os dois HISTORICOs
  seguem espelhados (mesmo hash).

## CT-e: rodada de UX + motorista no XML (22/09/2026)

Backfill — 21 commits que estavam sem registro:

- **DACTE pessoas**: `:` da esquerda alinhados no fim do `CPF / CNPJ`
  (ancora medida, rotulo intacto); `:` da direita alinhados no fim do
  `Insc. Est`; `:` do Pais pelo fim do proprio rotulo (`dacte-pdf.ts:party`).
- **Header**: linha `CNPJ/IE` sob Tomador do Servico removida.
- **Transporte sem rolagem**: 4 cards em 2 colunas (`xl:grid-cols-2`) +
  paddings enxutos; **Seguro em 3 linhas** (seguradora+apolice /
  resp+averb+base+doc / demais, seguradora em 7/12).
- **Veiculo**: `% Agregados` (campo morto) removido; Motorista em 2/3.
- **2o motorista utilizavel**: checkbox + dropdown inline, trava de emissao,
  linha condicional no DACTE, vai no rascunho.
- **Moto no XML**: `<moto><xNome><CPF>` no `<rodo>` apos RNTRC (1o + 2o);
  trava exige CPF valido no RH; preview mostra o XML antes de enviar.
  (Se voltar 225, ajustar posicao do grupo no XSD do Simp.)
- **Componentes**: ordem Frete, Coleta, Entrega, Ad Valorem, GRIS, Outros,
  Desconto; Adicional saiu da tela (segue no total p/ rascunhos antigos).
- **Pedagio**: ordem Operadora, CNPJ Op, Vale, Data; CNPJs mascarados;
  label por extenso; campos travados em Sem Pagamento; tudo em 3 linhas.
- **Tributacao**: card unico **Impostos** (era ICMS + Outros); valores R$
  por imposto (base = total da prestacao); **IR/CSLL fora da tela**
  (apuracao trimestral no Presumido: IR 15% s/ 8%, CSLL 9% s/ 12%);
  aba 100% visual — CST e impostos editam so no Percurso.
- **Status**: botao verde na linha reabre o dialogo na Situacao com dados
  reais (chave, protocolo, data, motivo); footer travado no modo view.
- **Aba Status excluida**: Finalidade vai p/ o Transporte
  (menu unico Finalidade/Tipo: Normal, Complemento, Subcontratacao,
  Redespacho, Redespacho Intermediario; refs so se nao-Normal);
  Anulacao nao existe mais; **Substituicao so via icone** roxo na linha
  (preenche novo CT-e com chave referenciada).
- **Complemento**: Motivo (Descarga, Adicional de frete, Retorno, etc.) +
  CT-e Original filtrado por remetente/destinatario/tomador do percurso
  (query `cte-nfes-todas` cruzando chaves do XML); chaves manuais e Data
  Declaracao removidos.

Commits CF `ddeb6e4..37d5da0` (+ ajustes de X do dono) espelhados na Vercel.

## CT-e pedágio em 2 linhas (22/09/2026)

- Linha 1: Operadora (2/6) + CNPJ Operadora (2/6) + Vale (1/6) + Data
  Operação (1/6); linha 2: TAG + CNPJ Responsável + ID VPO (2/6 cada).
  Espelhado na Vercel.

## CT-e complemento: motivos A-Z + Original em subcontratação/redespacho (22/09/2026)

- Motivos em ordem alfabética (Outros por último).
- CT-e Original também em Subcontratação, Redespacho e Redespacho
  Intermediário (antes só Complemento/Substituição). Motivo segue só
  no Complemento. Espelhado na Vercel.

## CT-e Original de terceiro em subcontratação/redespacho (22/09/2026)

- Complemento/Substituição seguem no dropdown dos nossos autorizados;
  Subcontratação/Redespacho voltam a pedir a chave digitada (44 dígitos),
  pois o CT-e original é de outra empresa. Espelhado na Vercel.

## DACTE obs completa + canhoto na borda (22/09/2026)

- Observações: limite fixo de 2 linhas removido — imprime quantas
  couberem na caixa (`maxObs` pela altura; excedente corta sem quebrar
  a página). Marca d'água de homologação só se sobrar espaço.
-   Canhoto: `LIM` 291→293, margem inferior ~7mm→~5mm (mínimo seguro;
  abaixo disso impressora comum corta). Espelhado na Vercel.

## DACTE obs em 3 linhas + tarja sempre (22/09/2026)

- Observações limitadas a 3 linhas (suficiente) com espaço reservado;
  tarja de homologação sempre visível. Espelhado na Vercel.
- Tarja de homologação incondicional em ambiente de teste (sem exceção
  por tamanho da caixa). Espelhado na Vercel.

## NF sem percurso em vermelho + cadastro com volta (22/09/2026)
- Embarque: NF sem percurso (rem+dest+toma) em vermelho com tooltip.
- Gerar com NF sem percurso leva a Fiscal → Percursos com rascunho
  pré-preenchido (chave travada); salvar cria (insert + código sequencial)
  e volta ao CT-e. Espelhado na Vercel.

## Coleta/Entrega auto + PIS/COFINS padrão (22/09/2026)
- Percurso novo vindo do CT-e já nasce com coleta=remetente e
  entrega=destinatário (cidade/UF da NF ou do cadastro); coleta amarrada
  no remetente como a entrega já era no destino/redespacho.
- PIS 0,65 / COFINS 3,00: zeros do percurso não apagam mais o regime no
  apply; rascunho de percurso já nasce no padrão. Total segue sem somar
  PIS/COFINS (só informativo) e ICMS por dentro. Espelhado na Vercel.

## Percurso com km/h + só 5 impostos no CT-e (22/09/2026)

- Rascunho de percurso já nasce com distância/duração calculadas
  (CEP/cidade da NF ou cadastro).
- CT-e: saiu INSS; entraram IBS 0,10 e CBS 0,90 fixos (fase teste 2026)
  com valores. Ficam ICMS, PIS, COFINS, IBS, CBS. Espelhado na Vercel.
- Percurso: IR/INSS/CSLL fora da tela do Fiscal (ficam ICMS, PIS,
  COFINS). Espelhado na Vercel.
- Percurso: IBS 0,10 e CBS 0,90 fixos no Fiscal. Espelhado na Vercel.
- Percurso: Seguradora virou dropdown do cadastro (preenche apólice e
  averbação). Espelhado na Vercel.

## MDF-e: lista, fullscreen e via autorizados (22/09/2026)
- Query sem `cfop` (coluna inexistente derrubava a lista) + erro visível.
- Dialog Novo MDF-e em tela cheia.
- Autorizados ganhou checkbox por CT-e + botão Gerar MDF-e: abre o
  manifesto já com os selecionados. Espelhado na Vercel.

## MDF-e espelha CT-es + percurso UFs + emissão real (22/09/2026)

- Sem escolher motorista/veículo: tração, reboques e motoristas
  (1º+2º, com CPF) vêm dos CT-es vinculados; emissão usa o primeiro.
- Percurso: checklist multi-UF (padrão UF descarga) vai ao
  `<infPercurso>` do XML; obs/percurso gravados no `xml_assinado`.
- Proxy Vercel saiu do stub fase 1: emitir/encerrar/cancelar MDF-e
  executam de verdade (SVRS). Espelhado na Vercel.
- MDF-e: tração escolhida primeiro filtra os CT-es; percurso com ordem
  numerada (clique adiciona na sequência). Espelhado na Vercel.

## MDF-e tela única estilo referência (22/09/2026)

- Sem abas: cabeçalho (empresa, tipo, data, situação), veículo/CIOT/
  seguro vindos dos CT-es, tabela CT-e (emissão, CTRC, placa, reboques,
  coleta/entrega, NFs, valor, peso) com Marcar/Limpar, totais +
  responsável, motoristas, percurso UFs, observação + info fisco.
  Espelhado na Vercel.## Novo CT-e pede o percurso (22/09/2026)

- Botões Novo CT-e (topo e avulso) abrem seletor de percurso (busca por
  número/nome); ao confirmar, o form zera por completo e os dados vêm
  do percurso via `aplicarPercurso` — nada do último CT-e é reaproveitado.
  Espelhado na Vercel.
- Dois cliques no percurso já confirma direto. Espelhado na Vercel.

## Complemento puxa dados do original (22/09/2026)

- Ao escolher o CT-e Original no Complemento: motoristas, placas,
  CIOT zerado, pedágio zerado (sem-pagamento) e seguro vêm do original
  (complemento mantém demais dados; sem averbação nova). Valores ficam
  para preencher a diferença. Espelhado na Vercel.

## Complemento sem seguro (22/09/2026)

- Correção: complemento (ex. descarga) não gera novo transporte, então
  NÃO puxa seguro do original (evita averbação duplicada); trava de
  seguradora/apólice/responsável pula no Complemento. Espelhado na Vercel.

## Complemento trava pedágio e CIOT (22/09/2026)

- Radios do pedágio + campo CIOT desabilitados no Complemento.
  Espelhado na Vercel.

## MDF-e: transbordo na tela + XML (22/09/2026)

- Transbordo na tela do Novo MDF-e: radios Tipo MDF-e (Normal /
  Globalizado) + checkbox "Manifesto Transbordo" que abre campos
  1º/2º/3º Transbordo (chave/locais). Vindo do remoto (commit
  117d87a, que também trouxe percurso editável em ordem e placa
  digitável filtrando CT-es). Espelhado na Vercel.
- Esta rodada de 9 commits do remoto saiu sem entrada no HISTORICO
  (regra violada lá); registrada aqui no retrofit.

## MDF-e: XML corrigido (groups faltantes) (22/09/2026)

- `buildMdfXml` montava `infMunCarregaXml`, `infPercursoXml` e
  `infDocXml` mas NUNCA os inseriu no XML final — corrigido:
  `infMunCarrega` e `infPercurso` agora entram dentro do `<ide>` e o
  `<infDoc>` é emitido após o `<infModal>`.
- Tag do percurso corrigida de `UFFim` para `UFPer` (schema 3.00).
- Novo grupo `<tot>` (qCTe/qMDFe, vCarga, cUnid=01, qCarga) — era
  obrigatório e não existia.
- `<infCTe>` corrigido: tags inválidas `pesoB`/`vCarga` substituídas
  por `infCarga` (cUnid/qCarga/vCarga).
- Tag inválida `<tpAmbiente>` removida do `<ide>`.
- Transbordo vai para o XML: quando checked, gera `infMDFeTransp`
  (chMDFe) em cada `infMunDescarga` usando as chaves de 44 dígitos
  digitadas (1º/2º/3º). Obs: no leiaute esse grupo é validação F43/F44
  para modal Aquaviário —   vale validar na SEFAZ se o rodo aceita.
  Espelhado na Vercel.

## Novo MDF-e em boxes separados (23/09/2026)

- Cabeçalho em 2 boxes lado a lado: esquerda = Nome da Empresa +
  radios Normal/Globalizado + checkbox Manifesto Transbordo ao lado;
  direita = linha 1 (Nº Manifesto, Série editável, Data/Hora emissão,
  Responsável), linha 2 (Cidade/UF início, Cidade/UF encerramento),
  linha 3 (Seguradora RC-V, Chave de acesso), linha 4 (Averbação RC-V,
  CNPJ ANTT autorizado, Local emissão). Box de Situação excluído.
- Box do veículo: Veículo com CIOT embaixo; 1º/2º/3º Transbordo ao
  lado do veículo quando marcado (Reboques/Tipo Frota/Apólice descem
  para a 2ª linha nesse caso).
- Cidades de início/encerramento ficam em branco no MDF-e avulso
  (antes puxavam a cidade da empresa, ex. São Paulo); com CT-es,
  continuam vindo dos CT-es (encerramento mantém select entre
  destinos). Série agora editável (antes fixa "1") e vai pro XML.
  Espelhado na Vercel.


## MDF-e serie 000 fixa + ambiente do nfe_config (23/09/2026)

- Serie padrao do MDF-e = "000", somente leitura (sem edicao).
- Chave corrigida: gerarChaveMdf nao incluia a serie (41 digitos,
  invalida); agora monta os 44 (cUF+AAMM+CNPJ+58+serie+numero+
  tpEmis+codigo+DV).
- Ambiente nao e mais fixo em homologacao no XML: o dialogo le
  nfe_config.ambiente (mesma fonte do servidor) e mostra selo
  Homologacao/Producao no titulo. Espelhado na Vercel.

## MDF-e travado em homologacao (23/09/2026)

- MDF-e SEMPRE em homologacao: dialogo (XML tpAmb=2), server
  (getCertAndAmbiente ignora nfe_config) e proxy (emitir/encerrar/
  cancelar) forcados para homologacao. Selo no titulo mostra
  Homologacao. Espelhado na Vercel.

## Configuracoes/Empresas crash Select (23/09/2026)

- Pagina quebrava com ReferenceError: Select is not defined
  (faltava o import de @/components/ui/select, usado no campo
  Regime tributario). Erro ja apontado pelo tsc no baseline.
  Espelhado na Vercel.

## MDF-e box empresa com veiculo/transbordo (23/09/2026)

- Box da empresa: Nome + radios Normal/Globalizado a direita;
  checkbox Transbordo logo abaixo; 1o/2o/3o Transbordo sempre
  visiveis mas desabilitados sem o checkbox; Veiculo/Reboque(s)/
  CIOT abaixo do nome. Box seguinte fica com Tipo Frota + Apolice.
  Espelhado na Vercel.

## MDF-e box empresa em 3 colunas (23/09/2026)

- Box da empresa em 3 colunas como no desenho: esquerda Nome/
  Veiculo+RENAVAM/Reboque(s)+RENAVAM/CIOT/Cidade+UF de Inicio;
  meio Tipo MDF-e (radios empilhados) + Cidade+UF de Encerramento;
  direita Manifesto Transbordo + 1o/2o/3o (sempre visiveis,
  editaveis so com o checkbox).
- Linha de Cidades/UFs removida do box de dados ao lado.
  Espelhado na Vercel.

## MDF-e veiculo selecionado no box da empresa (23/09/2026)

- Campo Veiculo no box da empresa virou dropdown (placas do
  cadastro + placas dos CT-es, com RENAVAM abaixo); filtrar os
  CT-es e a emissao usam essa selecao. Dropdown de Tracao
  removido do box de Conhecimentos (ficam rotulo + Marcar/Limpar).
  Espelhado na Vercel.

## MDF-e cidades/UFs mesma linha + avulso zerado (23/09/2026)

- Cidade+UF de Inicio e Cidade+UF de Encerramento na mesma linha
  no box da empresa (cidades largas, UFs com 68px); saidas do box
  de dados. UFs iniciam em branco e so preenchem via CT-es (antes
  MG/SP fixos); reset apos emitir tambem zera.
- Tipo Frota excluido; Apolice foi para o box direito (linha
  Seguradora/Apolice/Chave). Espelhado na Vercel.

## MDF-e veiculo so tracao + box direito 2 colunas (23/09/2026)

- Dropdown de Veiculo exclui Carreta/Bitrem do cadastro (so
  tracao: Cavalo, Truck, Toco, 3/4, Van; placas vindas de CT-e
  continuam, pois ja sao tracao).
- Box direito dividido em 2 colunas a partir da linha 2 (linha 1
  intacta): esquerda Seguradora/Averbacao/Apolice, direita Chave
  de acesso (em branco, sem placeholder)/CNPJ ANTT/Local.
- Transbordos 1-3 sem placeholder, sempre em branco.
  Espelhado na Vercel.

## MDF-e linha cidades/UFs alinhada (23/09/2026)

- Labels encurtados (Cidade/UF Inicio/Encerramento) com nowrap e
  colunas de UF em 88px: nada mais quebra de linha nem desalinha.
  Espelhado na Vercel.

## MDF-e overflow UF + RENAVAM no select (23/09/2026)

- Linha cidades/UFs com minmax(0,1fr): UF Encerramento nao
  passa mais da borda do box.
- Select do Veiculo com largura fixa (220px) e RENAVAM dentro
  do proprio campo (linha abaixo removida).
  Espelhado na Vercel.

## MDF-e overflow blindado + RENAVAM cheio + UFs zeram (23/09/2026)

- Box da empresa com overflow-hidden: UF Encerramento nao passa
  mais da borda em nenhuma largura.
- Select do Veiculo encolhe pro conteudo (w-fit): mostra placa +
  RENAVAM inteiros, mesmo padrao do Reboque.
- Ao desselecionar todos os CT-es, UFs de Inicio/Encerramento
  zeram junto com as cidades (antes ficavam presos).
  Espelhado na Vercel.

## MDF-e labels UF curtos + Reboque em caixa (23/09/2026)

- Causa do estouro: o proprio rotulo "UF Encerramento" com
  nowrap (~90px) era mais largo que a coluna de 88px. Labels
  viraram "UF" (titulo completo no hover); contexto Inicio/
  Encerramento segue na cidade ao lado.
- Reboque(s) na mesma caixa do Veiculo (borda, mono, h-6),
  somente leitura, mesmo formato placa + RENAVAM.
  Espelhado na Vercel.

## MDF-e Reboque igual ao Veiculo (23/09/2026)

- Caixa do Reboque(s) com as mesmas classes do Trigger
  (bg-stone-200, shadow-sm, px-3, chevron): formato e cor
  identicos aos do Veiculo. Espelhado na Vercel.

## MDF-e cidades com fundo cinza (23/09/2026)

- Caixas Cidade Inicio/Encerramento com fundo cinza sempre
  (bg-stone-200, igual aos selects). Espelhado na Vercel.

## MDF-e sem seta no Reboque (23/09/2026)

- Setinha removida da caixa do Reboque (so o Veiculo, que e
  selecionavel, mantem). Espelhado na Vercel.

## MDF-e Motorista ao lado do CIOT (23/09/2026)

- Coluna da empresa: linha Veiculo/Reboque e linha Motorista/
  CIOT. Box Motoristas de baixo excluido (vira Percurso + Obs).
  Espelhado na Vercel.

## MDF-e percurso sem auto-preenchimento (23/09/2026)

- UF de Encerramento nao entra mais na lista ao selecionar
  CT-e (efeito removido + sync nao toca mais no percurso).
  Percurso inicia vazio e so tem as UFs entre inicio e fim
  adicionadas pelo usuario; reset tambem zera.
  Espelhado na Vercel.

## MDF-e Reboque/CIOT na 2a coluna + Percurso limpo (23/09/2026)

- Coluna 1: Nome/Veiculo/Motorista; coluna 2: Tipo + Reboque(s)
  + CIOT (caixas mais largas, sem truncar).
- Percurso: removidos select "Adicionar UF na ordem" e
  observacao do titulo (vira "Percurso *"); botoes Exclui/▲▼
  foram para o cabecalho; adicionar segue pelos botoes de UF.
  Espelhado na Vercel.

## MDF-e selecionar todos + colunas ordenaveis (23/09/2026)

- Checkbox no cabecalho da tabela marca/desmarca todos os
  CT-es listados; clique no titulo de qualquer coluna ordena
  (asc/desc, terceiro clique limpa, com seta indicativa).
  Espelhado na Vercel.

## MDF-e CIOT no XML + peso do CT-e (23/09/2026)

- CIOT ia para a tela mas nunca entrava no input do buildMdfXml:
  agora vai em veicTrac.ciot e sai em rodo/infANTT/infCIOT
  (CIOT + CNPJ emitente), conforme MOC 3.00. RNTRC movido para
  dentro do infANTT (estava solto sob rodo, fora do schema);
  tag invalida CIOT-dentro-de-veicTracao removida.
- Peso: proxy nao gravava peso_carga no CT-e (so valor) e o
  MDF-e somava zero; proxy agora grava peso_carga e o dialogo
  usa fallback pesoDe() = coluna ou form.peso do CT-e (tabela,
  totais, ordenacao e XML).
  Espelhado na Vercel.

## MDF-e totais no canto + percurso em cima (23/09/2026)

- Responsavel sai do box de totais (ja esta no topo direito).
  Percurso sobe ao lado dos totais (2/3 + 1/3): Valor/Peso
  empilhados no canto direito; Obs/Fisco em linha cheia abaixo.
  Espelhado na Vercel.

## MDF-e obs na coluna direita (23/09/2026)

- Coluna direita: Totais + Observacao/Info Fisco empilhados;
  esquerda exclusiva do Percurso. Espelhado na Vercel.

## MDF-e percurso 1/4 da largura (23/09/2026)

- Grade percurso/totais-obs passa de 2/3+1/3 para 1/4+3/4.
  Espelhado na Vercel.

## MDF-e totais no header dos CT-es (23/09/2026)

- Valor/Peso total no cabecalho da caixa de selecao de CT-es
  (ao lado de Marcar/Limpar); segunda coluna fica so com
  Observacao/Info Fisco. Espelhado na Vercel.

## MDF-e recepcao assincrona com recibo (23/09/2026)

- Erro real da SEFAZ: action MDFeRecepcaoSinc nao existe no SVRS
  (HTTP 500). MDF-e 3.00 so tem recepcao assincrona: volta para
  MDFeRecepcao (103 + nRec) + polling do MDFeRetRecepcao (10x3s:
  105 aguarda, 104 le infProt com cStat/xMotivo/nProt).
  Espelhado na Vercel.

## MDF-e emite sem percurso (23/09/2026)

- infPercurso virou opcional de verdade (0-25, sem fallback
  para UF de descarga; filtra so siglas validas). Validacao e
  botao nao exigem mais UF no percurso.
  Espelhado na Vercel.

## MDF-e URLs SVRS corretas + trava percurso (23/09/2026)

- 404 porque o path estava minusculo (/ws/mdferecepcao/...);
  padrao oficial e /ws/MDFeRecepcao/MDFeRecepcao.asmx (idem
  RetRecepcao/Status/Consulta/Evento/Distribuicao/ConsNaoEnc,
  homologacao e producao). Sinc removido do mapa.
- Trava: sem UF de inicio/fim (vêm dos CT-es) nao emite;
  lista intermediaria continua opcional.
  Espelhado na Vercel.

## Retrigger deploy Vercel/Worker (23/09/2026)

- Vercel servia bundle antigo (404 legado) mesmo com o fix no
  GitHub; commit para forcar novo deploy nos dois alvos.
  Espelhado na Vercel.

## MDF-e envio sincrono correto (23/09/2026)

- Raiz do 404/500: SVRS removeu o assincrono (tabelas oficiais
  so listam RecepcaoSinc) e a action Sinc exige
  .../mdfe/wsdl/MDFeRecepcaoSinc/mdfeRecepcao (era mdf/.../
  MDFeRecepcaoSinc). Envio agora: enviMDFe com XML assinado em
  gzip+base64 em mdfeDadosMsg; resposta le infProt (100 =
  autorizado). Espelhado na Vercel.

## MDF-e log diagnostico do POST (23/09/2026)

- HTTP 400 vazio no Sinc: soapRequest passa a logar URL, action,
  tamanhos e headers da resposta para diagnostico preciso.
  Espelhado na Vercel.

## MDF-e Sinc formato ACBr (23/09/2026)

- 400 vazio porque o payload ia com enviMDFe/idLote e sem
  header: formato certo (fonte ACBr) e mdfeDadosMsg =
  base64(gzip(<MDFe>...</MDFe>)) puro + header SOAP mdfeCabecMsg
  (cUF da chave + versaoDados 3.00). Espelhado na Vercel.

## MDF-e namespace mdfe (cStat 598) (23/09/2026)

- Rejeicao 598/D02: namespace padrao e .../mdfe (com E),
  confirmado no XSD 3.00; trocado em MDFe, eventoMDFe,
  consSitMDFe e nos WSDLs (Consulta/Evento). Toast de erro
  passa a mostrar cStat + motivo. Espelhado na Vercel.

## MDF-e reemitir rejeitado (23/09/2026)

- Linha rejeitada ganha botao Tentar novamente (RotateCcw,
  tooltip com o motivo): reabre o Novo MDF-e com os mesmos
  CT-es pre-selecionados (chaves extraidas do XML guardado).
  Espelhado na Vercel.

## MDF-e fix 215 + sem duplicar rejeitado (23/09/2026)

- 215 porque o <MDFe> raiz levava versao="3.00" (so infMDFe
  tem versao no schema): atributo removido da raiz.
- Rejeitado nao duplica mais: ao rejeitar, apaga rejeitado
  anterior com os mesmos documentos (server + proxy) e a
  linha ganha botao excluir (RLS permite DELETE).
  Espelhado na Vercel.

## MDF-e sem whitespace (fix 599) (23/09/2026)

- 599/D03: template tinha LF/indentacao entre tags; agora
  buildMdfXml comprime (><) antes de assinar (digest valido).
  Espelhado na Vercel.

## MDF-e XML reescrito pelo XSD 3.00 (23/09/2026)

- ide na ordem do XSD: tpEmit 1/3 (era tpEmis fora de lugar),
  cDV, modal 1, tpEmis 1, procEmi 0, verProc, UFIni/UFFim,
  infMunCarrega, infPercurso, dhIniViagem; removidos tpProd,
  modFrete, cMunIni, cMunFim (nao existem); serie "0" e nMDF
  sem zeros (TSerie/TNF); dhEmi -03:00 sem millis.
- Nomes corrigidos: veicTracao/veicReboque/tpCar; RNTRC fora
  do veiculo; condutor xNome+CPF; infCTe so chCTe; infDoc
  agrupa por municipio real do CT-e; IE omitida se nao
  numerica; infSolicNFF vazio removido; lacres no nivel certo.
- Dialogo: emit/enderEmit/cMun reais (empresa + CT-e),
  RENAVAM/tpRod (mapa do tipo)/reboques, tpEmit 1/3, trava
  sem cMunIni. Validado contra o XSD oficial localmente.
  Espelhado na Vercel.

## MDF-e Signature sem whitespace (fix 599) (23/09/2026)

- 599 voltava porque o signXml pretty-printa a Signature
  (LF/indentacao): agora comprime tudo EXCETO o SignedInfo
  (assinado, intocavel; base64 de SignatureValue/X509 tambem
  sem quebras). Validado em teste local: 0 ws fora do SI.
  Espelhado na Vercel.

## MDF-e log aponta tag com whitespace (23/09/2026)

- WS-check no XML assinado: loga bytes + tags com whitespace
  apos abertura / antes de fecho para achar o 599 exato.
  Espelhado na Vercel.

## Assinatura em linha unica (fix 599 raiz) (24/09/2026)

- WS-check apontou o whitespace dentro do SignedInfo
  (Transforms/Reference): como e assinado, nao da para limpar
  depois — SignedInfo e Signature agora saem em linha unica
  nos dois caminhos (forge e nativo), igual ao ACBr. Vale para
  NFe/CT-e/MDF-e (assinatura continua valida: SEFAZ
  canonicaliza o recebido). Observar proximas emissoes de
  CT-e/NFe. Espelhado na Vercel.

## MDF-e digest no elemento (fix 297) (24/09/2026)

- 297 porque o digest cobria o documento cheio; SVRS valida
  o elemento canonizado: signXml aceita digestInput opt-in
  (CT-e/NFe intactos) e o MDF-e passa infMDFe com xmlns
  redundante (= c14n do subset). Espelhado na Vercel.

## MDF-e log modo digest (24/09/2026)

- WS-check passa a mostrar digest=element:N ou full, para
  provar qual codigo rodou em producao. Espelhado na Vercel.

## MDF-e digest nos bytes transportados (fix 297) (24/09/2026)

- Modelo que explica tudo: SVRS valida digest sobre os bytes
  pos-gunzip menos Signature (CT-e passa com declaracao porque
  ela viaja junto; MDFe extrai so o <MDFe>). Digest agora =
  template sem declaracao. Espelhado na Vercel.

## MDF-e digest substring crua (24/09/2026)

-Digest elemento+ns e doc sem declaracao deram 297; SVRS e
.NET e as regras D02/D03 sao verificacao por string: digest
agora e o <infMDFe> cru como viaja (OuterXml, sem injecao).
Espelhado na Vercel.

## MDF-e trava percurso errado (G060/663) (24/09/2026)

- SEFAZ valida sim (NT 2014/001 G060, 663): vizinhos/iguais
  = percurso vazio; senao, cadeia completa com divisas em
  ordem Origem->Destino, sem repetir ini/fim. Mapa de
  vizinhanca das 27 UFs + BFS no dialogo: avisa em vermelho
  sob o percurso e trava o Emitir. Ex.: MG->PA via RJ trava;
  via GO,TO passa. Espelhado na Vercel.

## Revert assinatura pretty + digest full-doc (24/09/2026)

- Evidencia: com template comprimido o teste deu 215 (schema),
  nao 599 — pretty na Signature nunca quebrou D03. Single-line
  e digests alternativos deram 297 sempre. Volta a formula
  identica ao CT-e (pretty + full-doc) nos dois caminhos.
  Espelhado na Vercel.
