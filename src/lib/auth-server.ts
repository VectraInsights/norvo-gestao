import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function getSupabaseFromRequest(request: Request) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;

  // Extrai access_token do cookie sb-<ref>-auth-token
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
  const accessToken = match ? decodeURIComponent(match[1]) : null;

  const supabase = createClient<Database>(url, key, {
    global: { fetch: (input, init) => fetch(input, init) },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (accessToken) {
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: "", // não temos o refresh token no cookie
    });
  }

  return supabase;
}

export const getServerSessionFn = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    // Em TanStack Start, o context contém o request
    const request = (context as { request?: Request }).request;
    if (!request) return null;

    const supabase = getSupabaseFromRequest(request);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { user: data.user };
  });