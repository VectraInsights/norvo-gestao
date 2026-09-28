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
    <main className="grid h-screen place-items-center" aria-busy="true" aria-label="Carregando página">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
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
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const vazio = !isLoading && !isError && Array.isArray(data) && data.length === 0;
  useEffect(() => {
    if (vazio) navigate({ to: "/onboarding", replace: true });
  }, [vazio, navigate]);

  if (isLoading) {
    return (
      <div className="grid h-full min-h-[50vh] place-items-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }
  if (vazio) return null;
  if (isError) return <RouteErrorState />;
  return <>{children}</>;
}
