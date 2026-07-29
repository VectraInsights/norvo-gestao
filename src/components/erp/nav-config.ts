import {
  LayoutDashboard, ReceiptText, Boxes, FileText,
  Wallet, TrendingUp, Banknote, ShoppingCart, UserSquare2, Package,
  Kanban, Briefcase, Wrench, UsersRound,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
export type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavItem[] };

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });

const RAW_NAV: NavGroup[] = [
  { label: "Visão geral", icon: LayoutDashboard, items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { label: "Financeiro", icon: Wallet, items: [
    { to: "/financeiro/receber", label: "Contas a receber", icon: TrendingUp },
    { to: "/financeiro/pagar",   label: "Contas a pagar",   icon: ReceiptText },
    { to: "/financeiro/fluxo",   label: "Fluxo de caixa",   icon: Wallet },
    { to: "/financeiro/contas",  label: "Contas financeiras", icon: Banknote },
  ]},
  { label: "Vendas & CRM", icon: ShoppingCart, items: [
    { to: "/vendas/crm",      label: "Funil (CRM)", icon: Kanban },
    { to: "/vendas/clientes", label: "Clientes",  icon: UserSquare2 },
    { to: "/vendas/vendas",   label: "Vendas",    icon: ShoppingCart },
    { to: "/vendas/pedidos",  label: "Orçamentos", icon: ShoppingCart },
  ]},
  { label: "Estoque", icon: Boxes, items: [
    { to: "/estoque/produtos", label: "Produtos", icon: Package },
    { to: "/estoque/fornecedores", label: "Fornecedores", icon: UserSquare2 },
    { to: "/estoque/compras", label: "Ordens de compra", icon: ShoppingCart },
    { to: "/estoque/movimentacoes", label: "Movimentações", icon: Boxes },
  ]},
  { label: "Projetos", icon: Briefcase, items: [
    { to: "/projetos/projetos", label: "Projetos", icon: Briefcase },
    { to: "/projetos/os", label: "Ordens de serviço", icon: Wrench },
  ]},
  { label: "RH", icon: UsersRound, items: [
    { to: "/rh/colaboradores", label: "Colaboradores", icon: UsersRound },
    { to: "/rh/folha", label: "Folha de pagamento", icon: Wallet },
  ]},
  { label: "Fiscal", icon: FileText, items: [
    { to: "/fiscal/notas", label: "Notas fiscais", icon: FileText },
  ]},
];

export const OVERVIEW_LABEL = "Visão geral";
export const FAVORITES_LABEL = "Favoritos";

export const NAV: NavGroup[] = [...RAW_NAV]
  .sort((a, b) =>
    a.label === OVERVIEW_LABEL ? -1 : b.label === OVERVIEW_LABEL ? 1 : byLabel(a, b),
  )
  .map((g) => ({ ...g, items: [...g.items].sort(byLabel) }));

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
