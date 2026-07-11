import { Bell, Check, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedEmpresaId } from "@/hooks/use-empresa";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const SEV_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  critical: AlertCircle,
} as const;

const SEV_COLOR: Record<string, string> = {
  info: "text-primary",
  warning: "text-warning",
  error: "text-destructive",
  critical: "text-destructive",
};

export function NotificationsBell() {
  const empresaId = useSelectedEmpresaId();
  const qc = useQueryClient();

  const { data: alertas = [] } = useQuery({
    queryKey: ["alertas", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("alertas")
        .select("*").eq("empresa_id", empresaId!).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const naoLidos = alertas.filter((a) => !a.lido).length;

  const marcarLido = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alertas").update({ lido: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const marcarTodos = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("alertas").update({ lido: true })
        .eq("empresa_id", empresaId!).eq("lido", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {naoLidos > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {naoLidos > 9 ? "9+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-sm font-medium">Notificações</div>
          {naoLidos > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarTodos.mutate()}>
              <Check className="mr-1 h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {alertas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</div>
          ) : (
            <ul className="divide-y">
              {alertas.map((a) => {
                const Icon = SEV_ICON[a.severidade as keyof typeof SEV_ICON] ?? Info;
                return (
                  <li key={a.id} className={"flex gap-3 p-3 " + (a.lido ? "opacity-60" : "bg-accent/30")}>
                    <Icon className={"mt-0.5 h-4 w-4 shrink-0 " + (SEV_COLOR[a.severidade] ?? "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.titulo}</div>
                      {a.mensagem && <div className="mt-0.5 text-xs text-muted-foreground">{a.mensagem}</div>}
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                    {!a.lido && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => marcarLido.mutate(a.id)} aria-label="Marcar como lida">
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
