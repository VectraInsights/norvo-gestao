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
};

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link to="/dashboard" className="flex items-center gap-1 hover:text-foreground">
        <Home className="h-3 w-3" />
      </Link>
      {parts.map((seg, i) => {
        const label = LABELS[seg] ?? seg;
        const last = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className={last ? "font-medium text-foreground" : ""}>{label}</span>
          </span>
        );
      })}
    </nav>
  );
}
