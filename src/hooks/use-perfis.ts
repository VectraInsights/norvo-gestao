import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Mapa userId -> nome do usuário (colegas da mesma empresa). */
export function usePerfisMap(enabled = true) {
  const { data } = useQuery({
    enabled,
    staleTime: 5 * 60 * 1000,
    queryKey: ["perfis-map"] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,nome,email");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.nome || p.email || "Usuário";
      return map;
    },
  });
  return data ?? {};
}
