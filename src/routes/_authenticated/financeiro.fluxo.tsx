import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfDay } from "date-fns";
import type { FluxoPoint } from "@/components/erp/fluxo-chart";

// Split de ~120KB (recharts) para fora do bundle principal do app autenticado.
const FluxoChart = lazy(() => import("@/components/erp/fluxo-chart"));

export const Route = createFileRoute("/_authenticated/financeiro/fluxo")({
  component: FluxoCaixa,
  errorComponent: FluxoError,
});

type LancamentoRow = {
  tipo: "receber" | "pagar";
  valor: number | string;
  valor_pago: number | string | null;
  data_vencimento: string;
  status: string;
};

function FluxoCaixa() {
  const { data: empresa } = useEmpresaAtual();
  const { data, isLoading, error } = useQuery({
    enabled: !!empresa,
    queryKey: ["fluxo", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<FluxoPoint[]> => {
      const hoje = startOfDay(new Date());
      const fim = addDays(hoje, 30);
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("tipo,valor,valor_pago,data_vencimento,status")
        .eq("empresa_id", empresa!.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .gte("data_vencimento", format(hoje, "yyyy-MM-dd"))
        .lte("data_vencimento", format(fim, "yyyy-MM-dd"))
        .abortSignal(signal);
      if (error) throw error;

      const buckets = new Map<string, FluxoPoint>();
      for (let i = 0; i <= 30; i++) {
        const d = addDays(hoje, i);
        buckets.set(format(d, "yyyy-MM-dd"), { data: format(d, "dd/MM"), entradas: 0, saidas: 0, saldo: 0 });
      }
      for (const l of (data ?? []) as LancamentoRow[]) {
        const b = buckets.get(l.data_vencimento);
        if (!b) continue;
        const v = Number(l.valor) - Number(l.valor_pago ?? 0);
        if (l.tipo === "receber") b.entradas += v;
        else b.saidas += v;
      }
      let saldo = 0;
      return [...buckets.values()].map((b) => {
        saldo += b.entradas - b.saidas;
        return { ...b, saldo };
      });
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Fluxo de caixa"
        description="Projeção de entradas e saídas dos próximos 30 dias."
      />
      <Card className="shadow-panel">
        <CardContent className="p-6">
          {error ? (
            <p className="text-sm text-destructive">Falha ao carregar fluxo: {(error as Error).message}</p>
          ) : isLoading || !data ? (
            <div className="h-80 animate-pulse rounded-md bg-muted/30" aria-label="Carregando gráfico" />
          ) : (
            <Suspense fallback={<div className="h-80 animate-pulse rounded-md bg-muted/30" />}>
              <FluxoChart data={data} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function FluxoError({ error }: { error: Error }) {
  return (
    <div className="p-6 text-sm text-destructive" role="alert">
      Não foi possível carregar o fluxo de caixa: {error.message}
    </div>
  );
}
