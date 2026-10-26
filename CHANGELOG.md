# Changelog

Todas as mudanças relevantes do **Norvo Gestão** são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/):

- **MAJOR** — mudança incompatível (migração obrigatória, ruptura de contrato/treinamento).
- **MINOR** — funcionalidade nova, compatível.
- **PATCH** — correção de bug, ajuste visual ou de texto.

O identificador do deploy (SHA do commit) aparece no rodapé do menu lateral.

## [Não publicado]

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
