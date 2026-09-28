import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FiltroSalvo = {
  id: string;
  empresa_id: string;
  user_id: string;
  nome: string;
  modulo: string;
  filtros: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function useFiltrosSalvos(empresaId: string | null | undefined, userId: string | null | undefined, modulo: string) {
  const queryClient = useQueryClient();
  const queryKey = ["filtros-salvos", empresaId, userId, modulo];

  const query = useQuery({
    queryKey,
    enabled: Boolean(empresaId && userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filtros_salvos" as never)
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("user_id", userId!)
        .eq("modulo", modulo)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as FiltroSalvo[];
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ nome, filtros }: { nome: string; filtros: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("filtros_salvos" as never)
        .upsert({ empresa_id: empresaId!, user_id: userId!, modulo, nome: nome.trim(), filtros }, { onConflict: "empresa_id,user_id,modulo,nome" })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FiltroSalvo;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("filtros_salvos" as never).delete().eq("id", id).eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, filtros: query.data ?? [], salvar, excluir };
}

export async function registrarAuditoria(evento: {
  empresaId: string;
  userId: string;
  modulo: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("auditoria_eventos" as never).insert({
    empresa_id: evento.empresaId,
    user_id: evento.userId,
    modulo: evento.modulo,
    acao: evento.acao,
    entidade: evento.entidade ?? null,
    entidade_id: evento.entidadeId ?? null,
    detalhes: evento.detalhes ?? {},
  });
  if (error) throw error;
}
