import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ReceiptText, Users, Boxes, FileText, Settings, LogOut,
  Wallet, TrendingUp, Banknote, ShoppingCart, UserSquare2, Package, ChevronDown,
} from "lucide-react";
import norvoLogo from "@/assets/norvo-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { ShortcutsDialog } from "@/components/erp/shortcuts-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setSelectedEmpresaId, useSelectedEmpresaId } from "@/hooks/use-empresa";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "Visão geral", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { label: "Financeiro", items: [
    { to: "/financeiro/receber", label: "Contas a receber", icon: TrendingUp },
    { to: "/financeiro/pagar",   label: "Contas a pagar",   icon: ReceiptText },
    { to: "/financeiro/fluxo",   label: "Fluxo de caixa",   icon: Wallet },
    { to: "/financeiro/contas",  label: "Contas bancárias", icon: Banknote },
  ]},
  { label: "Vendas & CRM", items: [
    { to: "/vendas/clientes", label: "Clientes",  icon: UserSquare2 },
    { to: "/vendas/pedidos",  label: "Pedidos e propostas", icon: ShoppingCart },
  ]},
  { label: "Estoque", items: [
    { to: "/estoque/produtos", label: "Produtos", icon: Package },
    { to: "/estoque/movimentacoes", label: "Movimentações", icon: Boxes },
  ]},
  { label: "Fiscal", items: [
    { to: "/fiscal/notas", label: "Notas fiscais", icon: FileText },
  ]},
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: empresas } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const selectedId = useSelectedEmpresaId();
  const currentEmpresa = (selectedId && empresas?.find((e) => e.id === selectedId)) || empresas?.[0];

  const handleSelectEmpresa = (id: string) => {
    setSelectedEmpresaId(id);
    qc.invalidateQueries();
  };

  // Fecha ao navegar (mobile)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Atalhos globais de teclado (Alt+tecla)
  useEffect(() => {
    const shortcuts: Record<string, string> = {
      d: "/financeiro/pagar",
      r: "/financeiro/receber",
      c: "/vendas/clientes",
      f: "/vendas/clientes",
      p: "/vendas/pedidos",
      e: "/estoque/produtos",
      h: "/dashboard",
    };
    const onKey = (ev: KeyboardEvent) => {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const to = shortcuts[ev.key.toLowerCase()];
      if (!to) return;
      ev.preventDefault();
      navigate({ to });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "fixed inset-y-0 left-0 z-40 w-[260px] -translate-x-full transition-transform lg:static lg:translate-x-0",
          open && "translate-x-0"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <img src={norvoLogo} alt="Norvo" width={32} height={32} className="h-8 w-8" />
          <div>
            <div className="text-display text-lg leading-none">Norvo</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cloud ERP</div>
          </div>
        </div>

        {/* Empresa switcher */}
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md bg-sidebar-accent/60 px-3 py-2 text-left text-sm hover:bg-sidebar-accent">
                <div className="min-w-0">
                  <div className="truncate font-medium">{currentEmpresa?.nome_fantasia ?? "Nenhuma empresa"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {currentEmpresa?.cnpj ?? "Cadastre sua empresa"}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>Empresas</DropdownMenuLabel>
              {empresas?.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => handleSelectEmpresa(e.id)}>
                  {e.nome_fantasia} {currentEmpresa?.id === e.id ? "✓" : ""}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/configuracoes/empresas" })}>
                + Nova empresa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-sidebar-accent">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {user?.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{user?.email}</div>
                  <div className="truncate text-xs text-muted-foreground">Minha conta</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => navigate({ to: "/configuracoes" })}>
                <Settings className="mr-2 h-4 w-4" /> Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Backdrop mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>Menu</Button>
            <div className="flex items-center gap-2 lg:hidden">
              <img src={norvoLogo} alt="Norvo" width={24} height={24} className="h-6 w-6" />
              <span className="text-display">Norvo</span>
            </div>
          </div>
          <ShortcutsDialog />
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
