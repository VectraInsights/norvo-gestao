import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "./use-empresa";
import { souSuperAdminFn } from "@/lib/usuarios-api";

export type Permissoes = {
  role: string | null;
  modulos: string[];
  ehAdmin: boolean;
  souSuperAdmin: boolean;
  pode: (modulo: string | null) => boolean;
  isLoading: boolean;
};

/** Papel e módulos do usuário logado na empresa atual.
 *  Regras: owner/admin (ou super admin da plataforma) veem tudo;
 *  membro vê apenas os módulos marcados em empresa_users.modulos. */
export function usePermissoes(): Permissoes {
  const { data: empresa } = useEmpresaAtual();

  const q = useQuery({
    queryKey: ["minha-permissao", empresa?.id],
    enabled: !!empresa,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !empresa) return null;
      const { data } = await supabase
        .from("empresa_users")
        .select("role, modulos")
        .eq("empresa_id", empresa.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return (data ?? null) as unknown as { role: string; modulos: string[] } | null;
    },
  });

  const sa = useQuery({
    queryKey: ["sou-super-admin"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return false;
      return souSuperAdminFn({ data: { token: session.access_token } });
    },
    staleTime: 5 * 60 * 1000,
  });

  const role = q.data?.role ?? null;
  const modulos = Array.isArray(q.data?.modulos) ? q.data!.modulos : [];
  const souSuperAdmin = sa.data === true;
  const ehAdmin = souSuperAdmin || role === "owner" || role === "admin";

  const pode = (modulo: string | null) => {
    if (!modulo) return true;
    if (ehAdmin) return true;
    return modulos.includes(modulo);
  };

  return { role, modulos, ehAdmin, souSuperAdmin, pode, isLoading: q.isLoading };
}
