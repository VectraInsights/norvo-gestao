import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronDown,
  Star,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import norvoLogo from "@/assets/norvo-logo.png";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { ShortcutsDialog } from "@/components/erp/shortcuts-dialog";
import { CommandPalette } from "@/components/erp/command-palette";
import { NotificationsBell } from "@/components/erp/notifications-bell";
import { Breadcrumbs } from "@/components/erp/breadcrumbs";
import { MenuSettingsDialog } from "@/components/erp/menu-settings-dialog";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { useFavorites } from "@/hooks/use-favorites";
import { ALL_NAV_ITEMS, FAVORITES_LABEL, OVERVIEW_LABEL } from "@/components/erp/nav-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setSelectedEmpresaId, useSelectedEmpresaId } from "@/hooks/use-empresa";
import { usePermissoes } from "@/hooks/use-permissoes";
import { moduloDaRota } from "@/lib/permissoes";
import { AlterarSenhaDialog } from "@/components/erp/alterar-senha-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

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
      try {
        window.localStorage.setItem("norvo-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // localStorage indisponível
      }
      return next;
    });
  };
  // Todos os grupos começam fechados por padrão
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const closeAllGroups = useCallback(() => setOpenGroups({}), []);
  const toggleGroup = (label: string) => {
    setOpenGroups((g) => ({ ...g, [label]: !g[label] }));
  };
  const sidebarRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
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
  const currentEmpresa =
    (selectedId && empresas?.find((e) => e.id === selectedId)) || empresas?.[0];

  const handleSelectEmpresa = (id: string) => {
    setSelectedEmpresaId(id);
    qc.invalidateQueries();
  };

  // Preferências de menu por usuário (ordem + visibilidade)
  const { prefs, groups: prefGroups, save: savePrefs, reset: resetPrefs } = useMenuPrefs(user?.id);
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites(user?.id);

  // Permissões por módulo da empresa atual
  const { pode, ehAdmin, souSuperAdmin } = usePermissoes();
  const visivel = (to: string) => {
    if (to === "/configuracoes/usuarios") return ehAdmin;
    return pode(moduloDaRota(to));
  };

  // Visão geral é um link direto (Dashboard); Favoritos sempre visível; demais conforme personalização
  const favItems = ALL_NAV_ITEMS.filter((i) => favorites.includes(i.to))
    .filter((i) => visivel(i.to))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
  const showOverview = prefGroups.some((g) => g.label === OVERVIEW_LABEL);
  const navGroups = [
    { label: FAVORITES_LABEL, icon: Star, items: favItems },
    ...prefGroups
      .filter((g) => g.label !== OVERVIEW_LABEL)
      .map((g) => ({ ...g, items: g.items.filter((i) => visivel(i.to)) }))
      .filter((g) => g.items.length > 0),
  ];

  // Bloqueia páginas de módulos que o usuário não tem permissão para acessar
  const moduloAtual = moduloDaRota(location.pathname);
  const semAcesso = !pode(moduloAtual);

  // Grupo que contém a rota atual — deve permanecer aberto
  const activeGroupLabel = navGroups.find((g) =>
    g.items.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/")),
  )?.label;
  const keepActiveOpen = useCallback(() => {
    setOpenGroups(activeGroupLabel ? { [activeGroupLabel]: true } : {});
  }, [activeGroupLabel]);

  // Fecha o drawer mobile e os dropdowns ao navegar, mantendo o grupo ativo aberto
  useEffect(() => {
    setOpen(false);
    keepActiveOpen();
  }, [location.pathname, keepActiveOpen]);

  // Fecha os dropdowns ao clicar fora da barra lateral (mantém o grupo ativo)
  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      const el = sidebarRef.current;
      if (!el) return;
      if (el.contains(ev.target as Node)) return;
      keepActiveOpen();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [keepActiveOpen]);

  // Navegação por teclado dentro do menu: setas, Home/End, Enter/Espaço e Esc
  const onNavKeyDown = useCallback(
    (ev: ReactKeyboardEvent<HTMLElement>) => {
      const nav = navRef.current;
      if (!nav) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      if (ev.key === "Escape") {
        ev.preventDefault();
        const groupLabel = target.getAttribute("data-nav-group");
        closeAllGroups();
        const btn = groupLabel
          ? nav.querySelector<HTMLElement>(`button[data-nav-group="${CSS.escape(groupLabel)}"]`)
          : null;
        btn?.focus();
        return;
      }

      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        const groupLabel = target.getAttribute("data-nav-group");
        if (target.tagName === "BUTTON" && groupLabel) {
          ev.preventDefault();
          setOpenGroups((g) => ({ ...g, [groupLabel]: ev.key === "ArrowRight" }));
        }
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;

      const items = Array.from(nav.querySelectorAll<HTMLElement>("[data-nav-focusable]"));
      if (!items.length) return;
      ev.preventDefault();
      const current = items.indexOf(target.closest<HTMLElement>("[data-nav-focusable]") ?? target);
      let next = current;
      if (ev.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
      else if (ev.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
      else if (ev.key === "Home") next = 0;
      else next = items.length - 1;
      items[next]?.focus();
    },
    [closeAllGroups],
  );

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
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
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

  const [senhaOpen, setSenhaOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "grid min-h-screen bg-background",
          collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[260px_1fr]",
        )}
      >
        {/* Sidebar */}
        <aside
          ref={sidebarRef}
          className={cn(
            "border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col",
            "fixed inset-y-0 left-0 z-40 -translate-x-full transition-all lg:static lg:translate-x-0",
            collapsed ? "w-[72px]" : "w-[260px]",
            open && "translate-x-0",
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center gap-3 border-b border-sidebar-border",
              collapsed ? "justify-center px-2" : "px-5",
            )}
          >
            <div className="relative shrink-0">
              <div
                className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/40 via-primary/20 to-transparent blur-lg opacity-70"
                aria-hidden
              />
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
                <button
                  className={cn(
                    "flex w-full items-center rounded-md bg-sidebar-accent/60 text-left text-sm hover:bg-sidebar-accent",
                    collapsed ? "justify-center p-2" : "justify-between px-3 py-2",
                  )}
                >
                  {collapsed ? (
                    <span className="grid h-7 w-7 place-items-center rounded bg-primary/10 text-xs font-semibold">
                      {currentEmpresa?.nome_fantasia?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {currentEmpresa?.nome_fantasia ?? "Nenhuma empresa"}
                        </div>
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
                {souSuperAdmin && (
                  <DropdownMenuItem onSelect={() => navigate({ to: "/configuracoes/empresas" })}>
                    + Nova empresa
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav
            ref={navRef}
            className="flex-1 overflow-y-auto p-3"
            aria-label="Navegação principal"
            onKeyDown={onNavKeyDown}
          >
            {showOverview &&
              (() => {
                const active =
                  location.pathname === "/dashboard" || location.pathname.startsWith("/dashboard/");
                const link = (
                  <Link
                    to="/dashboard"
                    data-nav-focusable
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "mb-2 flex touch-manipulation items-center rounded-md text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      collapsed ? "justify-center p-2" : "min-h-11 gap-2.5 px-3 py-2 lg:min-h-0",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent",
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    {!collapsed && OVERVIEW_LABEL}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{OVERVIEW_LABEL}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })()}
            {navGroups.map((group) => {
              const groupActive = group.items.some(
                (i) => location.pathname === i.to || location.pathname.startsWith(i.to + "/"),
              );
              const isOpen = collapsed || !!openGroups[group.label];
              const GroupIcon = group.icon;
              const panelId = `nav-group-${group.label.replace(/\W+/g, "-").toLowerCase()}`;
              return (
                <div key={group.label} className="mb-2">
                  {!collapsed && (
                    <button
                      type="button"
                      data-nav-focusable
                      data-nav-group={group.label}
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className={cn(
                        "flex w-full touch-manipulation select-none items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
                        "min-h-11 py-2 lg:min-h-0 lg:py-2",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        groupActive && !isOpen
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <GroupIcon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{group.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 opacity-60 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                  )}
                  {isOpen && (
                    <div
                      id={panelId}
                      role="group"
                      className={cn(!collapsed && "mt-1 space-y-0.5 pl-4")}
                    >
                      {group.items.map((item) => {
                        const active =
                          location.pathname === item.to ||
                          location.pathname.startsWith(item.to + "/");
                        const link = (
                          <Link
                            to={item.to}
                            data-nav-focusable
                            data-nav-group={group.label}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex flex-1 touch-manipulation items-center rounded-md text-sm transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                              collapsed
                                ? "justify-center p-2"
                                : "min-h-11 gap-2.5 px-3 py-2 lg:min-h-0",
                              active
                                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent",
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && item.label}
                          </Link>
                        );
                        if (collapsed) {
                          return (
                            <Tooltip key={item.to}>
                              <TooltipTrigger asChild>{link}</TooltipTrigger>
                              <TooltipContent side="right">{item.label}</TooltipContent>
                            </Tooltip>
                          );
                        }
                        const fav = isFavorite(item.to);
                        return (
                          <div
                            key={`${group.label}-${item.to}`}
                            className="flex items-center gap-1"
                          >
                            {link}
                            <button
                              type="button"
                              onClick={() => toggleFavorite(item.to)}
                              aria-pressed={fav}
                              aria-label={
                                fav
                                  ? `Remover ${item.label} dos favoritos`
                                  : `Adicionar ${item.label} aos favoritos`
                              }
                              title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                              className={cn(
                                "shrink-0 rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                                fav
                                  ? "text-amber-400"
                                  : "text-sidebar-foreground/40 hover:text-sidebar-foreground",
                              )}
                            >
                              <Star className={cn("h-3.5 w-3.5", fav && "fill-current")} />
                            </button>
                          </div>
                        );
                      })}
                      {!collapsed && group.items.length === 0 && (
                        <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                          Nenhum favorito ainda
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {!collapsed && (
            <div className="border-t border-sidebar-border p-3 pb-2">
              <MenuSettingsDialog prefs={prefs} onSave={savePrefs} onReset={resetPrefs} />
            </div>
          )}

          <div className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex w-full items-center rounded-md text-left text-sm hover:bg-sidebar-accent",
                    collapsed ? "justify-center p-2" : "gap-2 px-3 py-2",
                  )}
                >
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
                <DropdownMenuItem onSelect={() => setSenhaOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" /> Alterar senha
                </DropdownMenuItem>
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
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur lg:px-8">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
                Menu
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
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
            {semAcesso ? (
              <Card className="mx-auto mt-10 max-w-md p-8 text-center">
                <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <h2 className="mb-1 text-lg font-semibold">Sem acesso a este módulo</h2>
                <p className="text-sm text-muted-foreground">
                  Seu usuário não tem permissão para esta área. Solicite acesso ao administrador da
                  sua empresa.
                </p>
              </Card>
            ) : (
              <>
                <Breadcrumbs />
                {children}
              </>
            )}
          </main>
        </div>
        <AlterarSenhaDialog open={senhaOpen} onOpenChange={setSenhaOpen} />
      </div>
    </TooltipProvider>
  );
}
