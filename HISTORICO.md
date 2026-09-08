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

Commits: CF `[pendente]` + Vercel `[pendente]`

---

## Regras de segurança

- NUNCA commitar tokens/senhas (GitHub PAT, senhas de banco, service keys).
- Credenciais coladas em conversas anteriores devem ser rotacionadas quando possível.
