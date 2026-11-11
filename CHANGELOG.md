# Changelog

Todas as mudanças relevantes do **Norvo Gestão** são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/):

- **MAJOR** — mudança incompatível (migração obrigatória, ruptura de contrato/treinamento).
- **MINOR** — funcionalidade nova, compatível.
- **PATCH** — correção de bug, ajuste visual ou de texto.

O identificador do deploy (SHA do commit) aparece no rodapé do menu lateral.

## [Não publicado]

## [1.2.33] - 2026-11-11

### Alterado

- **CT-e complementar abre pelo motivo**: o botão "Emitir CT-e complementar" agora abre direto a tela "CT-e Complementar — CT-e Original" (motivo + CT-e de origem) e só depois do **Salvar** é que o formulário do CT-e abre, já com os dados do original carregados. O modal saiu de dentro do diálogo do formulário (ele só renderizava com o form aberto) e o cancelar antes do Salvar volta o estado para um CT-e novo.
- **Finalidade travada em COMPLEMENTAR**: no fluxo do botão a "Finalidade / Tipo de Serviço" fica travada em `COMPLEMENTAR` (não dá para trocar por Normal por engano); os demais fluxos (substituição, CT-e novo, rascunho, percurso) continuam liberados.

### Corrigido

- **Placas e motorista herdados do CT-e original**: o complementar herdava apenas remetente/destinatário. Agora herda **Tração, Reboque 1, Reboque 2 e o motorista** (com 2º motorista quando existe), lidos do form salvo do original e, na falta dele, direto do XML (`<veicTracao>`, `<veicReboque>`, `<moto>`) — inclusive o id do motorista no cadastro, para o `<moto>` com CPF sair no XML.
- **Finalidade que voltava para NORMAL**: ao abrir o formulário do complementar, um snapshot velho de "Gerar CT-e" (`cte_progress_snapshot`) era restaurado por cima do form e apagava finalidade, motorista e placas. O snapshot agora é ignorado no fluxo do complementar.
- **Motorista do CT-e escolhido no modal**: a herança passou a ter fallback no XML e não limpa mais os dados quando o CT-e escolhido está fora da lista.

### Adicionado

- **`src/lib/cte-original.ts`** + 8 testes: leitura dos veículos/motorista do CT-e original (XML ou form) e resolução do id do motorista por nome/CPF.

## [1.2.32] - 2026-11-09

### Alterado

- **Formatação do repo**: `npx prettier --write .` em 128 arquivos — o repo nunca havia sido formatado (~12.200 erros `prettier/prettier` acumulados). Os 3 blobs que ainda tinham CRLF no git (`HISTORICO.md`, `vite.config.ts`, `configuracoes.index.tsx`) foram normalizados para LF, alinhando-os ao `.gitattributes` (`eol=lf`); `PROJETO.json` (dump local) e `desktop/release` entraram no `.prettierignore`.
- **Regras do ESLint**: `no-empty` passou a aceitar `catch {}` vazio (`allowEmptyCatch` — os 149 casos são falha silenciosa intencional de melhor esforço); `@typescript-eslint/no-explicit-any` virou `warn` (~1.500 `any` legados do padrão `as never` das tabelas fora do `types.ts` — zerar exige tipagem incremental, não uma varredura cega).
- **Lint utilizável de novo**: `npm run lint` sai com exit 0 (0 erros, 1.555 avisos) — antes 14.673 problemas escondiam erros reais no ruído. Build, testes e deploy nunca foram afetados (não há CI nem hooks).

### Corrigido

- **Erros de lint sem mudança de comportamento**: escapes redundantes em regex (`crlv`, `sefaz-cte`, `sefaz-mdf`, `frota.veiculos`), ternários usados como expressão viraram `if/else` (`sefaz`, `sefaz-mdf`, `financeiro.contas`, `vendas.clientes`), `do/while (true)` → `for (;;)` em `sefaz.ts`, `require()` redundante removido em `mdf-c14n.ts` (`DOMParser` já importado no topo), tipo `Function` → assinatura concreta em `ai-chat.ts`, e o `catch` que só rethrow no DACTE (`fiscal.cte.tsx`) agora loga antes de propagar — o `try` envolve ~760 linhas de montagem e a falha não deixava rastro.

## [1.2.31] - 2026-11-07

### Corrigido

- **Versão exibida**: `src/lib/versao.ts` estava em `1.2.24` enquanto o histórico já tinha publicado a 1.2.30 — a versão mostrada ao lado da busca não refletia o deploy. Alinhada para `1.2.31`.
- **Testes**: o teste "CRT 1 sem CSOSN lança erro claro" falhava desde o commit `fb2e2dd` (remoção da validação de CSOSN, que travava a emissão do CT-e no Simples/MEI). Substituído por testes que cobrem o comportamento atual: `<ICMSSN>` com CST 90 em CRT 1 e CRT 4.
- **Documentação**: `HISTORICO.md` tinha 31 linhas corrompidas por 24 commits que gravaram acentos em codificação errada (o byte original virava `EF BF BD`, ou seja, o caractere era perdido de verdade). 10 linhas foram restauradas byte-exatas do histórico git e as outras 21 reconstruídas pelo contexto e confirmadas no código-fonte do mesmo commit.

### Removido

- **CT-e**: lista `CSOSN_SN` sem uso no gerador de XML (a validação correspondente foi removida em `fb2e2dd`).

## [1.2.30] - 2026-10-27

### Corrigido

- **Notas selecionadas na embarque não apareciam no CT-e**: na tela de embarque, marcar um checkbox individual atualizava apenas `selecionadas`, mas o checkbox dentro do diálogo CT-e lê `selecionadasAtivas`, que nunca era preenchido. Agora toda atualização de `selecionadas` na embarque (checkbox individual, "Selecionar Todos", "Mesmo percurso") também atualiza `selecionadasAtivas`, então as notas aparecem marcadas ao abrir o CT-e.

## [1.2.29] - 2026-10-27

### Corrigido

- **Notas não apareciam no CT-e ao abrir da embarque**: o `mercadorias` dentro do diálogo CT-e ficava vazio quando aberto diretamente da tela de embarque (sem rascunho/percurso), então a grade não mostrava nada. Agora o `useEffect` de abertura também repopula `mercadorias` e `form` a partir do snapshot quando o diálogo nasce vazio.

## [1.2.28] - 2026-10-27

### Corrigido

- **Notas selecionadas na embarque não apareciam no CT-e**: ao clicar em "Gerar CT-e" quando todas as notas já tinham percurso, o snapshot não era gravado antes de abrir o diálogo, então o `useEffect` de restauração apagava as seleções. Agora o snapshot com `selecionadas` é gravado antes de abrir o diálogo CT-e.

## [1.2.27] - 2026-10-27

### Corrigido

- **Notas selecionadas na embarque não eram preservadas ao abrir CT-e**: o `useEffect` que restaura seleções do snapshot agora só restaura se não houver seleção atual, evitando apagar as notas que o usuário selecionou na tela de NF Embarque antes de gerar o CT-e.

## [1.2.26] - 2026-10-27

### Corrigido

- **Notas vêm marcadas por padrão ao gerar CT-e**: o snapshot da tela de NF Embarque agora grava `selecionadas` junto com `chaves` antes de abrir o CT-e, então as notas escolhidas aparecem já marcadas na grade e somam no total ao carregar.

## [1.2.25] - 2026-10-27

### Corrigido

- **Notas vêm marcadas por padrão ao gerar CT-e**: o snapshot da tela de NF Embarque agora grava `selecionadas` junto com `chaves` antes de abrir o CT-e, então as notas escolhidas aparecem já marcadas na grade e somam no total ao carregar.

## [1.2.24] - 2026-10-27

### Corrigido

- **Snapshot do embarque inclui selecionadas para o CT-e**: ao gerar o CT-e da tela de NF Embarque, o snapshot agora grava as chaves selecionadas em `selecionadas` (além de `chaves`). Assim, ao abrir o CT-e, as notas originalmente escolhidas aparecem marcadas na grade e já somam no total. Antes, apenas `chaves` era gravado, fazendo `selecionadas` iniciar vazio e as notas aparecerem desmarcadas.

## [1.2.23] - 2026-10-27

### Corrigido

- **CT-e — notas carregam selecionadas por padrão e somam no total**: `selecionadasAtivas` inicia com as mesmas chaves de `selecionadas` (as notas escolhidas originalmente para o CT-e), então elas aparecem marcadas na grade e já somam no total ao carregar. Desmarcar uma nota mantém ela na grade, apenas para de somar. Marcar de novo volta a somar.

## [1.2.22] - 2026-10-27

### Corrigido

- **CT-e — checkbox individual permite desmarcar e selecionar novamente**: o `checked` do checkbox individual agora reflete `selecionadasAtivas` (o que está ativo/marcado), não `selecionadas` (o que aparece na grade). Assim, desmarcar uma nota tira ela do total e o checkbox fica realmente desmarcado, permitindo selecioná-la novamente depois. A nota continua visível na grade enquanto estiver em `selecionadas`.

## [1.2.21] - 2026-10-27

### Corrigido

- **CT-e — checkbox individual permite desmarcar e selecionar novamente**: o `checked` do checkbox individual agora reflete `selecionadasAtivas` (o que está ativo/marcado), não `selecionadas` (o que aparece na grade). Assim, desmarcar uma nota tira ela do total e o checkbox fica realmente desmarcado, permitindo selecioná-la novamente depois. A nota continua visível na grade enquanto estiver em `selecionadas`.

## [1.2.20] - 2026-10-27

### Corrigido

- **CT-e — fluxo de seleção entre embarque e CT-e**: "Selecionar Todos" na grade do CT-e seleciona apenas as notas que estão na grade (as originalmente escolhidas para o CT-e), não todas as 33 do embarque. "Deselecionar Todos" tira do total mas mantém as notas na grade (não apaga a listagem). Ao sair do CT-e via ESC/X, todas as notas são deselecionadas no NF Embarque, não deixando resíduos de seleção.

## [1.2.19] - 2026-10-27

### Corrigido

- **CT-e — grade exibe apenas as notas selecionadas para o CT-e**: a lista mostra somente as notas escolhidas originalmente para fazer o CT-e (notas do embarque que não foram selecionadas não aparecem). Desmarcar uma nota mantém ela na grade (desmarcada); apenas para de somar no total. A seleção ativa controla o que entra no total e no box de Resumo da Seleção.

## [1.2.18] - 2026-10-27

### Corrigido

- **CT-e — grade sempre exibe todas as notas**: desmarcar uma nota nao faz ela sumir da tela. A grade exibe sempre todas as NF-e; a selecao controla apenas o que entra no total e no box de Resumo da Selecao.

## [1.2.17] - 2026-10-27

### Alterado

- **CT-e — resumo mostra só as selecionadas**: o texto do box de resumo agora mostra apenas a quantidade de notas selecionadas (ex: "4 NF-e(s) selecionada(s)"), sem o "de X na grade". Assim, se há 33 notas na grade e 4 selecionadas, mostra "4 NF-e(s) selecionada(s)"; se desmarcar uma, mostra "3 NF-e(s) selecionada(s)".

## [1.2.16] - 2026-10-27

### Alterado

- **CT-e — resumo da seleção no espaço branco**: a faixa verde de totais saiu da base da caixa de notas. Agora o resumo (Qtde, Peso, Valor doc. com unidades) fica no rodapé interno do card da grade. Quando há poucas notas, sobra espaço em branco acima e o resumo fica fixo embaixo; quando há muitas, a tabela faz scroll e o resumo fica visível no rodapé.

## [1.2.15] - 2026-10-27

### Alterado

- **CT-e — resumo da seleção no espaço branco**: a faixa verde de totais saiu da base da caixa de notas. Agora o resumo (Qtde, Peso, Valor doc. com unidades) fica no rodapé interno do card da grade. Quando há poucas notas, sobra espaço em branco acima e o resumo fica fixo embaixo; quando há muitas, a tabela faz scroll e o resumo fica visível no rodapé.

## [1.2.14] - 2026-10-27

### Alterado

- **CT-e — grade sempre com espaço abaixo**: o card da grade agora ocupa sempre o espaço disponível (`min-h-0 flex-1`), independente de ter 1, 2, 3 ou mais notas selecionadas. Assim fica sempre com espaço em branco abaixo e os Impostos não colam na caixa de cima.

## [1.2.13] - 2026-10-27

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.12] - 2026-10-27

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.11] - 2026-10-27

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.10] - 2026-10-27

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.9] - 2026-10-27

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.8] - 2026-10-26

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: desmarcar uma nota fazia ela sumir da tela. Agora a grade sempre exibe todas as NF-e; a marcação controla apenas o que entra no total e na emissão. O rodapé mostra o total de selecionadas quando houver seleção.

## [1.2.7] - 2026-10-26

### Alterado

- **CT-e — grade Mercadorias Transportadas**: células mais compactas (header 7px, padding 1.5px, linha 0.5px) e tabela mínima reduzida de 1080px para 980px empilhada (920px em duas colunas). Com menos espaço vazio entre as colunas, a grade cabe em mais telas sem rolagem horizontal.

## [1.2.6] - 2026-10-26

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: a barra de rolagem horizontal ficava no wrapper
  interno da tabela (`erp-table-wrap`), que cresce com o número de linhas — por isso ela só
  aparecia depois da última NF-e. A rolagem passou para o container da grade: a barra fica
  sempre visível no rodapé do card.
- **CT-e — total da grade**: a linha de total estava num `<tfoot>` com `sticky`, que o Chrome
  não fixa — ela desaparecia ao rolar. Virou uma barra fixa abaixo da grade (sempre visível,
  logo abaixo da barra de rolagem) com total de NF-e(s), Qtde, Peso e Valor doc.

## [1.2.5] - 2026-10-26

### Removido

- **CT-e — grade Mercadorias Transportadas**: coluna **Valor Merc.** (o valor de mercadoria
  continua no XML/emissão; na tela fica só o **Valor Doc**).

### Alterado

- **CT-e — grade**: com uma coluna a menos a tabela ficou mais estreita (1210px empilhada,
  1040px no modo duas colunas), então na maioria das telas não há mais rolagem horizontal.
- **CT-e — grade**: a barra de rolagem (horizontal e vertical) agora tem estilo próprio e
  fica sempre visível no rodapé da grade, acima do total — mesmo com muitas notas.

## [1.2.4] - 2026-10-26

### Removido

- **CT-e — Impostos**: nota "Somente leitura — CST e impostos vêm do Percurso…" abaixo do card.

## [1.2.3] - 2026-10-26

### Alterado

- **CT-e — aba Tributação e Carga**: em janelas com **1500px ou mais** de largura, a grade
  "Mercadorias Transportadas" e o card "Impostos" ficam **lado a lado** (grade à esquerda,
  impostos numa coluna de 320px à direita); abaixo disso continua empilhado como antes.
  Com 4+ NF-es a grade ocupa a altura disponível e rola por dentro; com até 3 notas mantém a
  altura do próprio conteúdo.
- **CT-e — grade**: no modo duas colunas a tabela pode comprimir até 1120px (antes 1300px),
  sem esconder a chave da NF-e.
- **CT-e — Impostos**: o aviso de base zerada saiu do cabeçalho e virou nota embaixo do card:
  "informe o Valor Serviço na aba Transporte".

## [1.2.2] - 2026-10-26

### Removido

- **CT-e — Resumo da carga**: o card repetia os totais que já aparecem no rodapé da grade
  (volumes, peso, valor merc., valor doc.), então foi removido. A grade continua compacta com
  até 3 NF-es e o card de Impostos sobe logo abaixo.

### Alterado

- **CT-e — Impostos**: quando a base de cálculo está zerada, o cabeçalho avisa que é preciso
  informar o Valor Serviço em "Componentes do Frete" — o ICMS incide sobre o valor do serviço,
  não sobre a mercadoria, por isso a alíquota de 7% aparecia com ICMS `0,00`.

## [1.2.1] - 2026-10-26

### Corrigido

- **CT-e — Resumo da carga**: o card agora aparece com qualquer quantidade de NF-es (antes só
  com até 3, então um CT-e de 33 notas não mostrava o resumo). A grade continua compacta quando
  há até 3 notas e passa a dividir o espaço com o resumo quando há mais.
- **CT-e — Impostos**: o rótulo "Crédito outorgado/presumido (R$)" cabia em duas linhas e
  aumentava a altura da linha dos campos; virou "Crédito outorg./presum. (R$)" em uma linha (com
  o texto completo no tooltip) e o campo ganhou largura para o valor.

## [1.2.0] - 2026-10-26

### Adicionado

- **CT-e — Resumo da carga**: com até 3 NF-es, um card logo abaixo da grade mostra NF-e(s),
  volumes, peso, valor de mercadoria, valor do documento e ICMS destacado (valor + alíquota),
  preenchendo o espaço que antes ficava em branco.
- **CT-e — estado vazio da grade**: quando não há NF-e, a grade exibe um convite com os botões
  **Importar XML** (direto na aba) e **NF-e manual**.

## [1.1.3] - 2026-10-26

### Alterado

- **CT-e — aba Tributação e Carga**: com até 3 NF-es a grade `Mercadorias Transportadas` passa a ter
  altura do próprio conteúdo, e o card de Impostos sobe para logo abaixo — acaba o vão em branco
  quando o CT-e tem uma nota só. Com 4 ou mais notas a grade continua ocupando o espaço
  disponível, com rolagem interna.

## [1.1.2] - 2026-10-26

### Corrigido

- **CT-e — grade Mercadorias Transportadas**: a consulta das NF-es pendentes não trazia as
  colunas novas (`qvol`, `qtd_unit`, `valor_merc`, `especificacao` etc.), então Qtde Unit vinha
  vazia e Valor Merc. vinha `0,00` mesmo com os dados gravados no banco. Agora as colunas são
  selecionadas e a grade mostra a quantidade de volumes da nota (ex.: 23) e o valor dos produtos.
- **CT-e — grade Mercadorias Transportadas**: snapshots/rascunhos abertos na tela passam a ser
  completados com os dados do banco, evitando valores antigos em branco.

### Alterado

- **CT-e — grade Mercadorias Transportadas**: Desc. Mercadoria mostra sempre `CAIXAS`.
- **CT-e — Valor Merc.**: quando a nota não traz o valor dos produtos, a coluna usa o valor do
  documento como reserva.

## [1.1.1] - 2026-10-26

### Alterado

- **CT-e — grade Mercadorias Transportadas**: a chave da NF-e aparece sempre completa (sem
  truncar) e a coluna Desc. Mercadoria mostra a espécie da carga (`CAIXAS`), não mais o
  remetente/destinatário.
- **CT-e — grade Mercadorias Transportadas**: "Qtde Unit" passou a ser a quantidade dos itens da
  nota (soma de `det/prod/qCom`), em vez da quantidade de volumes.
- **CT-e — grade Mercadorias Transportadas**: removidas as colunas NCM, Valor Frete e Valor
  Serviço (e seus totais).

### Corrigido

- **CT-e — Qtde Unit**: o valor agora é gravado em `qtd_unit` (migration `20261026130000`), então
  permanece após recarregar a tela. Notas importadas antes disso precisam ser reimportadas para
  preencher a coluna.

## [1.1.0] - 2026-10-26

### Adicionado

- **CT-e — CIOT**: aviso na tração indicando `Frota própria` ou `Terceirizado` (comparação do
  `proprietario_doc` do veículo com o CNPJ do emissor).
- **CT-e — CIOT**: emissão bloqueada quando o veículo de tração é terceirizado e o CIOT está
  vazio (rascunho continua podendo ser salvo).
- **CT-e — CIOT**: indicação "CIOT obrigatório (veículo terceirizado)" na bolinha de aviso da
  aba **Transporte**.
- **CT-e — Mercadorias**: grade `Mercadorias Transportadas` na aba Tributação e Carga, com as
  colunas Modelo Doc, Chave NF-e, Desc. Mercadoria, Qtde Unit, Qtde Medida, Und. Med,
  Valor Frete, Valor Serviço, N. Doc, Série, Data Doc, NCM, Valor Merc. e Valor Doc, além da
  linha de totais fixa no rodapé.
- **CT-e — Mercadorias**: leitura de descrição do produto, NCM, unidade, `vProd`, `vFrete` e
  espécie direto do XML da NF-e no import.
- **Banco**: colunas `desc_mercadoria`, `ncm`, `und_med`, `valor_merc`, `valor_frete` e
  `especificacao` em `cte_nfes_pendentes` (migration `20261026120000`).

### Alterado

- **Versões**: o número exibido ao lado da busca passa a seguir SemVer (era um contador de
  deploy). Este release fecha o conjunto de mudanças feitas desde o 1.0.0.

### Corrigido

- **CT-e — percurso**: CST/ICMS/CFOP são aplicados mesmo sem tomador preenchido, independente
  do modal aberto e sempre que o percurso é encontrado.
- **CT-e — percurso**: CNPJ comparado com 14 dígitos normalizados e fallback para percurso
  único com remetente/destinatário iguais.
- **CT-e — tributação**: alíquota esperada 0% para operação interna MG/MG (isenção).
- **CT-e — CRT 1/4**: removida validação redundante de CSOSN que bloqueava a emissão no
  Simples/MEI (o CT-e usa `ICMSSN` com CST 90).
- **CT-e — CIOT**: aviso migrou da aba Tributação para a aba Transporte, onde o campo está.

## [1.0.0] - 2026-10-23

### Adicionado

- Versão do sistema visível ao lado da barra de busca, para conferir se o deploy entrou.
- Baseline do ERP: financeiro, vendas, estoque, fiscal (NF-e/CT-e/MDF-e), RH, frota e projetos,
  incluindo boleto Sicoob, leitura de CRLV (digital e impresso), tipos de veículo ampliados e
  o padrão de layout das telas de lista.
