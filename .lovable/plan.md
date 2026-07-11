# Roadmap para tornar o Norvo um ERP profissional

Como o escopo é grande, vou entregar em **5 fases** incrementais. Cada fase é independente e utilizável ao final. Confirma a ordem antes de eu começar.

---

## Fase 1 — Refino visual premium + produtividade global (base)
Impacto imediato em todo o app, sem tocar em regras de negócio.

- **Design system v2**: revisar tokens em `src/styles.css` (sombras em camadas, escala tipográfica editorial, espaçamento consistente, focus-rings acessíveis, motion tokens).
- **Componentes**: `PageHeader`, `Card`, `Table`, `Badge`, `EmptyState`, `Toolbar` padronizados com micro-interações (hover elevation, transições suaves).
- **Command Palette (Ctrl/⌘+K)**: busca global de rotas, clientes, produtos, lançamentos.
- **Centro de notificações**: badge no header lendo `public.alertas` (já existe) com dropdown e "marcar como lida".
- **Breadcrumbs** automáticos por rota + skeletons padronizados.

## Fase 2 — Módulo Compras / Ordens de Compra
- Tabelas novas: `ordens_compra`, `ordem_compra_itens`, `recebimentos`.
- Fluxo: rascunho → enviada → parcial/recebida → lançamento em Contas a Pagar automático + entrada de estoque.
- Rotas: `/compras/ordens`, `/compras/recebimentos`.
- Integração com Fornecedores e Produtos existentes.

## Fase 3 — CRM avançado (Funil de vendas)
- Tabelas: `oportunidades`, `funil_estagios`, `atividades` (tarefas/ligações/e-mails).
- Kanban drag-and-drop por estágio, valor ponderado, forecast do mês.
- Conversão Oportunidade → Orçamento → Venda (reaproveita `vendas`).
- Timeline de atividades por cliente.

## Fase 4 — Projetos / Ordens de Serviço
- Tabelas: `projetos`, `os` (ordem de serviço), `os_itens`, `apontamentos_horas`.
- Kanban de tarefas, cronômetro de horas, faturamento gera lançamento a receber.
- Vínculo com Cliente e Colaborador.

## Fase 5 — RH básico + Dashboard executivo + Auditoria
- **RH**: `colaboradores`, `folha_pagamento` (competência, salário, encargos, pró-labore) → gera lançamentos a pagar mensais.
- **Dashboard executivo**: DRE simplificado, comparativo m/m e a/a, top clientes/fornecedores, aging de recebíveis/pagáveis, saúde de caixa 90 dias.
- **Auditoria** (`audit_log`): trigger genérico registrando INSERT/UPDATE/DELETE em tabelas críticas + tela de consulta.
- **Permissões**: refinar `app_role` (owner/admin/financeiro/vendas/estoque/fiscal) e aplicar RLS por role em módulos novos.

---

## Detalhes técnicos

- Todas as tabelas novas em `public` com **RLS + GRANTs** (padrão do projeto, `is_empresa_member` / `has_empresa_role`).
- Cada módulo adiciona: migration → tipos regenerados → rota TanStack → item no `app-shell` NAV → tela CRUD com `useSuspenseQuery` + `useMutation`.
- Reuso de `MoneyInput`, `PeriodoFilter`, `StatusBadge`, `EmptyState`.
- Command Palette com `cmdk` (já compatível com shadcn).
- Kanban com `@dnd-kit/core` (leve e SSR-safe).
- Dashboard com Recharts (já usado em `receita-chart`/`fluxo-chart`).

---

## Como quer prosseguir?

Sugiro executar na ordem **Fase 1 → 2 → 3 → 4 → 5** (base visual primeiro, depois módulos por impacto de negócio). Cada fase é uma entrega fechada.

Se preferir outra ordem, me diga. Senão, começo pela **Fase 1** agora.