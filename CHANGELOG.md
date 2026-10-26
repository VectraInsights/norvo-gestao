# Changelog

Todas as mudanças relevantes do **Norvo Gestão** são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/):

- **MAJOR** — mudança incompatível (migração obrigatória, ruptura de contrato/treinamento).
- **MINOR** — funcionalidade nova, compatível.
- **PATCH** — correção de bug, ajuste visual ou de texto.

O identificador do deploy (SHA do commit) aparece no rodapé do menu lateral.

## [Não publicado]

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
