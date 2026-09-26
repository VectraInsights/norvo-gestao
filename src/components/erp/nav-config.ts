import {
  LayoutDashboard,
  ReceiptText,
  Boxes,
  FileText,
  Wallet,
  TrendingUp,
  Banknote,
  ShoppingCart,
  UserSquare2,
  Package,
  Kanban,
  Briefcase,
  Wrench,
  UsersRound,
  ListTree,
  FolderCog,
  ArrowLeftRight,
  Link2,
  PieChart,
  BarChart3,
  Percent,
  HandCoins,
  FileDown,
  Handshake,
  FileSearch,
  Settings2,
  FileOutput,
  FileInput,
  Sun,
  ShieldCheck,
  ClipboardList,
  PackagePlus,
  Truck,
  Route,
  MapPin,
  BookUser,
  OctagonAlert,
  Calculator,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
export type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavItem[]; color?: string; colorBg?: string };

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });

const RAW_NAV: NavGroup[] = [
  {
    label: "Visão geral",
    icon: LayoutDashboard,
    color: "text-primary",
    colorBg: "bg-primary/10",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    color: "text-emerald-600 dark:text-emerald-400",
    colorBg: "bg-emerald-500/10",
    items: [
      { to: "/financeiro/receber", label: "Contas a receber", icon: TrendingUp },
      { to: "/financeiro/pagar", label: "Contas a pagar", icon: ReceiptText },
      { to: "/financeiro/fluxo", label: "Fluxo de caixa", icon: Wallet },
      { to: "/financeiro/contas", label: "Contas financeiras", icon: Banknote },
      { to: "/financeiro/conciliacao", label: "Conciliação bancária", icon: Link2 },
      {
        to: "/financeiro/transferencias",
        label: "Transferências entre contas",
        icon: ArrowLeftRight,
      },
      { to: "/financeiro/emprestimos", label: "Empréstimos e financiamentos", icon: Banknote },
      { to: "/financeiro/dre", label: "DRE / Resultado", icon: PieChart },
      { to: "/financeiro/relatorios", label: "Relatórios financeiros", icon: BarChart3 },
      { to: "/financeiro/extrato", label: "Extrato de movimentações", icon: ListTree },
      { to: "/financeiro/cadastros", label: "Cadastros", icon: FolderCog },
    ],
  },
  {
    label: "Vendas & CRM",
    icon: ShoppingCart,
    color: "text-violet-600 dark:text-violet-400",
    colorBg: "bg-violet-500/10",
    items: [
      { to: "/vendas/crm", label: "Funil (CRM)", icon: Kanban },
      { to: "/vendas/clientes", label: "Clientes", icon: UserSquare2 },
      { to: "/vendas/vendas", label: "Vendas", icon: ShoppingCart },
      { to: "/vendas/pedidos", label: "Orçamentos", icon: ShoppingCart },
    ],
  },
  {
    label: "Estoque",
    icon: Boxes,
    color: "text-amber-600 dark:text-amber-400",
    colorBg: "bg-amber-500/10",
    items: [
      { to: "/estoque/produtos", label: "Produtos", icon: Package },
      { to: "/estoque/fornecedores", label: "Fornecedores", icon: UserSquare2 },
      { to: "/estoque/compras", label: "Ordens de compra", icon: ShoppingCart },
      { to: "/estoque/movimentacoes", label: "Movimentações", icon: Boxes },
      { to: "/estoque/inventario", label: "Inventário", icon: ClipboardList },
      { to: "/estoque/reposicao", label: "Reposição", icon: PackagePlus },
      { to: "/estoque/relatorios", label: "Relatórios de estoque", icon: BarChart3 },
    ],
  },
  {
    label: "Frota & Viagens",
    icon: Truck,
    color: "text-orange-600 dark:text-orange-400",
    colorBg: "bg-orange-500/10",
    items: [
      { to: "/frota/viagens", label: "Viagens", icon: ArrowLeftRight },
      { to: "/frota/veiculos", label: "Veículos", icon: Truck },
      { to: "/frota/multas", label: "Multas", icon: OctagonAlert },
    ],
  },
  {
    label: "Projetos",
    icon: Briefcase,
    color: "text-sky-600 dark:text-sky-400",
    colorBg: "bg-sky-500/10",
    items: [
      { to: "/projetos/projetos", label: "Projetos", icon: Briefcase },
      { to: "/projetos/os", label: "Ordens de serviço", icon: Wrench },
    ],
  },
  {
    label: "DP / RH",
    icon: UsersRound,
    color: "text-pink-600 dark:text-pink-400",
    colorBg: "bg-pink-500/10",
    items: [
      { to: "/rh/colaboradores", label: "Colaboradores", icon: UsersRound },
      { to: "/rh/folha", label: "Folha de pagamento", icon: Wallet },
      { to: "/rh/ferias", label: "Férias", icon: Sun },
      { to: "/rh/comissoes", label: "Comissões", icon: Percent },
      { to: "/rh/adiantamentos", label: "Adiantamentos", icon: HandCoins },
      { to: "/rh/calculadora", label: "Calculadora", icon: Calculator },
    ],
  },
  {
    label: "Fiscal",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    colorBg: "bg-blue-500/10",
    items: [
      { to: "/fiscal/emitidas", label: "Notas Emitidas", icon: FileOutput },
      { to: "/fiscal/recebidas", label: "Notas de Compra", icon: FileInput },
      { to: "/fiscal/cte", label: "CT-e", icon: Truck },
      { to: "/fiscal/mdf", label: "MDF-e", icon: Route },
      { to: "/fiscal/percursos", label: "Percursos", icon: MapPin },
      { to: "/fiscal/cadastro", label: "Cadastro", icon: BookUser },
      { to: "/fiscal/relatorios", label: "Relatórios e Dashboards", icon: BarChart3 },
      { to: "/fiscal/contador", label: "Painel do Contador", icon: Handshake },
      { to: "/fiscal/configuracoes", label: "Configurações Fiscais", icon: Settings2 },
    ],
  },
  {
    label: "Acessos",
    icon: ShieldCheck,
    color: "text-rose-600 dark:text-rose-400",
    colorBg: "bg-rose-500/10",
    items: [{ to: "/configuracoes/usuarios", label: "Usuários e acessos", icon: ShieldCheck }],
  },
];

export const OVERVIEW_LABEL = "Visão geral";
export const FAVORITES_LABEL = "Favoritos";

export const NAV: NavGroup[] = [...RAW_NAV]
  .sort((a, b) =>
    a.label === OVERVIEW_LABEL ? -1 : b.label === OVERVIEW_LABEL ? 1 : byLabel(a, b),
  )
  .map((g) => ({ ...g, items: g.label === "Fiscal" ? [...g.items] : [...g.items].sort(byLabel) }));

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
