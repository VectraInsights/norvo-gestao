# Plano: ERP completo — Nimbo

O esqueleto atual já tem schema multi-tenant, autenticação, sidebar e telas iniciais. Agora vou transformar cada módulo em algo utilizável ponta a ponta, com regras de negócio reais (não só CRUD isolado).

Escopo grande — vou executar em blocos, começando pelos fluxos que geram valor primeiro (vendas→estoque→financeiro→fiscal). Se preferir priorizar outra ordem, me avise antes de aprovar.

---

## 1. Banco de dados (uma migration)

**Novas tabelas / campos**
- `categorias_dre` (receita/despesa/imposto) e `categoria_id` em `lancamentos_financeiros` já existente — só popular defaults.
- `condicoes_pagamento` (à vista, 30/60/90, parcelado) para usar em vendas.
- `vendas.status` estender: `rascunho | proposta | pedido | faturado | cancelado`.
- `vendas.numero` sequencial por empresa (trigger).
- `venda_itens` já tem — adicionar `desconto_pct`.
- `nfe_config` por empresa (ambiente homolog/prod, série, próximo número, certificado stub).
- `contas_recorrentes` (para lançamentos que se repetem mensalmente).
- `conciliacao_bancaria` (import OFX básico — parser simples).
- `alertas` (contas vencendo, estoque baixo).

**Funções/triggers**
- `fn_gerar_numero_venda(empresa_id)` → sequencial.
- Trigger em `vendas` ao virar `faturado`:
  - baixa estoque (`movimentacoes_estoque` tipo saída) respeitando `condicoes_pagamento`;
  - gera N `lancamentos_financeiros` a receber conforme parcelas;
  - cria registro em `notas_fiscais` status `pendente`.
- Trigger em `movimentacoes_estoque` atualiza `produtos.estoque_atual`.
- View `vw_dashboard_kpis` (receita mês, despesa mês, saldo, inadimplência, ticket médio).
- View `vw_fluxo_caixa_projetado` (90 dias).

Todas com GRANT + RLS via `is_empresa_member`.

## 2. Server functions (`src/lib/*.functions.ts`)

- `vendas.functions.ts`: `criarVenda`, `adicionarItem`, `mudarStatus` (proposta→pedido→faturado dispara triggers), `duplicarVenda`.
- `financeiro.functions.ts`: `quitarLancamento` (marca pago + cria movimento na conta bancária), `conciliarOFX`, `gerarRecorrencias`.
- `estoque.functions.ts`: `ajusteInventario`, `transferencia`.
- `fiscal.functions.ts`: `emitirNFe` (stub — gera XML mock, chave de acesso fake, PDF via jsPDF), `cancelarNFe`.
- `dashboard.functions.ts`: KPIs agregados por período.
- Todas com `requireSupabaseAuth` + checagem de papel via `has_empresa_role`.

## 3. Frontend — telas completas

### Vendas & CRM
- `/vendas/pedidos`: tabela com filtros por status, busca; botão "Nova venda" abre wizard drawer (cliente → itens com autocomplete de produtos, cálculo automático de subtotal/desconto/total → condição de pagamento → observações).
- Detalhe da venda: timeline de status, ações contextualizadas (Aprovar proposta, Faturar, Cancelar, Duplicar, Gerar NF-e, Baixar PDF).
- `/vendas/clientes`: incrementar com histórico de compras, ticket médio, última compra, limite de crédito.

### Estoque
- `/estoque/produtos`: colunas de estoque atual/mínimo, badge "abaixo do mínimo", preço custo/venda, margem.
- `/estoque/movimentacoes`: form de entrada/saída/ajuste/transferência entre depósitos, kardex por produto.

### Financeiro
- `/financeiro/receber` e `/pagar`: filtros (status, vencimento, categoria, cliente/fornecedor), ações em lote (quitar, exportar CSV), formulário com anexo, recorrência, parcelamento.
- `/financeiro/contas`: saldo em tempo real (calculado por lançamentos), extrato, botão "Importar OFX".
- `/financeiro/fluxo`: além do gráfico atual, tabela projetada 90 dias, DRE simplificado por categoria, exportar.

### Fiscal
- `/fiscal/notas`: listagem por status (rascunho/autorizada/cancelada), botões emitir/cancelar/baixar XML+PDF (stubs funcionais), config de série/ambiente por empresa.

### Dashboard
- 6 KPIs reais alimentados pela view (receita, despesa, saldo, a receber, a pagar, inadimplência).
- Gráfico receita vs despesa 12 meses.
- Top 5 clientes, top 5 produtos, alertas (contas vencendo, estoque baixo).

### Configurações
- Empresa: dados fiscais completos (regime tributário, IE, CNAE).
- Usuários: convidar por email, atribuir papel.
- Categorias financeiras (CRUD).
- Condições de pagamento (CRUD).
- Configuração NF-e (série, ambiente, logo).

## 4. Infra / DX

- Utilitários `src/lib/format.ts` (BRL, CNPJ, data BR).
- Componentes reutilizáveis: `DataTable` com filtros/paginação, `MoneyInput`, `StatusBadge`, `ConfirmDialog`, `DrawerForm`.
- Loading skeletons e empty states consistentes.
- Toasts em todas as mutações.

## 5. Fora de escopo (declarar explicitamente)

- Integração real com SEFAZ / Focus NFe (fica com stub — plugável depois via secret).
- App mobile, boleto/PIX real (mocks), OCR de nota, integração bancária Open Finance real.

---

## Ordem de execução

1. Migration única com tudo do bloco 1.
2. Server fns e utilitários.
3. Vendas (wizard + detalhe) — é o coração operacional.
4. Financeiro completo.
5. Estoque completo + integração automática.
6. Fiscal (stub emissão).
7. Dashboard com dados reais.
8. Configurações estendidas.

Aprova esse plano ou quer ajustar prioridades / cortar algo?
