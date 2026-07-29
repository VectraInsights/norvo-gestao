import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ReceiptText, Users, Boxes, FileText, Settings, LogOut,
  Wallet, TrendingUp, Banknote, ShoppingCart, UserSquare2, Package, ChevronDown,
  Sun, Moon, PanelLeftClose, PanelLeftOpen, Kanban, Briefcase, Wrench, UsersRound,
} from "lucide-react";
import norvoLogo from "@/assets/norvo-logo.png";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { ShortcutsDialog } from "@/components/erp/shortcuts-dialog";
import { CommandPalette } from "@/components/erp/command-palette";
import { NotificationsBell } from "@/components/erp/notifications-bell";
import { Breadcrumbs } from "@/components/erp/breadcrumbs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setSelectedEmpresaId, useSelectedEmpresaId } from "@/hooks/use-empresa";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavItem[] };

const NAV: NavGroup[] = [
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


export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("norvo-sidebar-collapsed") === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem("norvo-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const { theme, toggle: toggleTheme } = useTheme();

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
    <TooltipProvider delayDuration={200}>
    <div className={cn("grid min-h-screen bg-background", collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[260px_1fr]")}>
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col",
          "fixed inset-y-0 left-0 z-40 -translate-x-full transition-all lg:static lg:translate-x-0",
          collapsed ? "w-[72px]" : "w-[260px]",
          open && "translate-x-0"
        )}
      >
        <div className={cn("flex h-16 items-center gap-3 border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5") }>
          <div className="relative shrink-0">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/40 via-primary/20 to-transparent blur-lg opacity-70" aria-hidden />
            <div className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_4px_16px_-4px_var(--color-primary)] ring-1 ring-primary/30">
              <span className="text-display text-lg font-semibold leading-none">N</span>
            </div>
          </div>
          {!collapsed && (
            <span className="text-display text-2xl leading-none tracking-tight bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
              Norvo
            </span>
          )}
        </div>

        {/* Empresa switcher */}
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex w-full items-center rounded-md bg-sidebar-accent/60 text-left text-sm hover:bg-sidebar-accent", collapsed ? "justify-center p-2" : "justify-between px-3 py-2")}>
                {collapsed ? (
                  <span className="grid h-7 w-7 place-items-center rounded bg-primary/10 text-xs font-semibold">
                    {currentEmpresa?.nome_fantasia?.[0]?.toUpperCase() ?? "?"}
                  </span>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{currentEmpresa?.nome_fantasia ?? "Nenhuma empresa"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {currentEmpresa?.cnpj ?? "Cadastre sua empresa"}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  </>
                )}
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
          {NAV.map((group) => {
            const groupActive = group.items.some(
              (i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/")
            );
            const isOpen = collapsed || (openGroups[group.label] ?? groupActive);
            const GroupIcon = group.icon;
            return (
              <div key={group.label} className="mb-2">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label, groupActive)}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      groupActive && !isOpen
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 opacity-60 transition-transform", isOpen && "rotate-180")}
                    />
                  </button>
                )}
                {isOpen && (
                  <div className={cn(!collapsed && "mt-1 space-y-0.5 pl-4")}>
                    {group.items.map((item) => {
                      const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                      const link = (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "flex items-center rounded-md text-sm transition-colors",
                            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2",
                            active
                              ? "bg-sidebar-primary text-sidebar-primary-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && item.label}
                        </Link>
                      );
                      return collapsed ? (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : link;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>


        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex w-full items-center rounded-md text-left text-sm hover:bg-sidebar-accent", collapsed ? "justify-center p-2" : "gap-2 px-3 py-2")}>
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {user?.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{user?.email}</div>
                    <div className="truncate text-xs text-muted-foreground">Minha conta</div>
                  </div>
                )}
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
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
            <div className="flex items-center gap-2 lg:hidden">
              <img src={norvoLogo} alt="Norvo" width={24} height={24} className="h-6 w-6" />
              <span className="text-display">Norvo</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <CommandPalette />
            <NotificationsBell />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <ShortcutsDialog />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6 lg:p-8">
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
    </TooltipProvider>
  );
}
