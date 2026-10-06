import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/erp/app-shell";
import { RouteErrorState } from "@/components/erp/route-error-state";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  pendingComponent: () => (
    <main className="grid min-h-screen place-items-center bg-background px-4" aria-busy="true" aria-label="Carregando página">
      <div className="erp-surface flex w-full max-w-xs flex-col items-center gap-3 p-8 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Preparando seu painel…</p>
        <p className="text-xs text-muted-foreground">Buscando sessão e permissões</p>
      </div>
    </main>
  ),
  errorComponent: RouteErrorState,
  component: () => (
    <AppShell>
      <RequireEmpresa>
        <Outlet />
      </RequireEmpresa>
    </AppShell>
  ),
});

// Usuário sem nenhuma empresa visível é levado ao onboarding para criar a primeira.
function RequireEmpresa({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["empresas", "gate"],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
    queryFn: async () => {
      // Gate só precisa saber se existe ao menos uma empresa.
      const { data, error } = await supabase.from("empresas").select("id,created_at").order("created_at").limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const vazio = !isLoading && !isError && Array.isArray(data) && data.length === 0;
  useEffect(() => {
    if (vazio) navigate({ to: "/onboarding", replace: true });
  }, [vazio, navigate]);

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-4">
        <div className="erp-surface flex w-full max-w-xs flex-col items-center gap-3 p-8 text-center">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Carregando empresa…</p>
          <p className="text-xs text-muted-foreground">Verificando seu acesso</p>
        </div>
      </div>
    );
  }
  if (vazio) return null;
  if (isError) return <RouteErrorState />;
  return <>{children}</>;
}
