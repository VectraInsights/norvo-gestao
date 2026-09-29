import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  financeiro: "Financeiro",
  receber: "Contas a receber",
  pagar: "Contas a pagar",
  fluxo: "Fluxo de caixa",
  contas: "Contas financeiras",
  vendas: "Vendas",
  clientes: "Clientes",
  pedidos: "Orçamentos",
  crm: "Funil (CRM)",
  estoque: "Estoque",
  produtos: "Produtos",
  fornecedores: "Fornecedores",
  compras: "Ordens de compra",
  movimentacoes: "Movimentações",
  fiscal: "Fiscal",
  notas: "Notas fiscais",
  emitidas: "Notas emitidas",
  recebidas: "Notas de compra",
  relatorios: "Relatórios fiscais",
  contador: "Painel do contador",
  configuracoes: "Configurações",
  empresas: "Empresas",
  projetos: "Projetos",
  os: "Ordens de serviço",
  rh: "RH",
  colaboradores: "Colaboradores",
  folha: "Folha de pagamento",
  calculadora: "Calculadora",
};

export function Breadcrumbs() {
  const { pathname } = useLocation();
  // CT-e tem cabeçalho próprio compacto — sem breadcrumb
  if (pathname === "/fiscal/cte") return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <nav aria-label="Navegação estrutural" className="mb-4 flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground scrollbar-subtle">
      <Link to="/dashboard" aria-label="Ir para o Dashboard" className="flex shrink-0 items-center gap-1 rounded-md p-1 hover:bg-muted hover:text-foreground">
        <Home className="h-3 w-3" aria-hidden="true" />
      </Link>
      {parts.map((seg, i) => {
        const label = LABELS[seg] ?? seg;
        const last = i === parts.length - 1;
        return (
          <span key={i} className="flex shrink-0 items-center gap-1.5">
            <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
            <span className={last ? "rounded-md bg-muted/70 px-1.5 py-0.5 font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
          </span>
        );
      })}
    </nav>
  );
}
