# Changelog

Todas as mudanças relevantes do **Norvo Gestão** são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/):

- **MAJOR** — mudança incompatível (migração obrigatória, ruptura de contrato/treinamento).
- **MINOR** — funcionalidade nova, compatível.
- **PATCH** — correção de bug, ajuste visual ou de texto.

O identificador do deploy (SHA do commit) aparece no rodapé do menu lateral.

## [Não publicado]

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
