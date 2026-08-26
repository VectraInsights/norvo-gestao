import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/erp/app-shell";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function getSupabaseFromRequest(request: Request) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
  const accessToken = match ? decodeURIComponent(match[1]) : null;

  const client = createClient<Database>(url, key, {
    global: { fetch: (input, init) => fetch(input, init) },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (accessToken) {
    client.auth.setSession({ access_token: accessToken, refresh_token: "" });
  }
  return client;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: true,
  loader: async ({ context }) => {
    const request = (context as { request?: Request }).request;
    if (!request) throw redirect({ to: "/auth" });

    const supabaseServer = getSupabaseFromRequest(request);
    const { data, error } = await supabaseServer.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
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
  return <>{children}</>;
}
