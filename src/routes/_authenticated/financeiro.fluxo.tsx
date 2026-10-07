import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfDay, endOfDay, differenceInCalendarDays } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useState } from "react";
import { PeriodoFilter, type Periodo } from "@/components/erp/periodo-filter";
import type { FluxoPoint } from "@/components/erp/fluxo-chart";

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const hoje = new Date();
    return { from: startOfDay(hoje), to: endOfDay(addDays(hoje, 30)), label: "Próximos 30 dias" };
  });
  const { data, isLoading, error } = useQuery({
    enabled: !!empresa,
    queryKey: ["fluxo", empresa?.id, periodo.from?.getTime() ?? null, periodo.to?.getTime() ?? null] as const,
    queryFn: async ({ signal }): Promise<FluxoPoint[]> => {
      const hoje = startOfDay(new Date());
      const ini = periodo.from ?? hoje;
      const fimRaw = periodo.to ?? addDays(hoje, 30);
      const dias = Math.min(Math.max(differenceInCalendarDays(fimRaw, ini), 1), 366);
      const fim = addDays(ini, dias);
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("tipo,valor,valor_pago,data_vencimento,status")
        .eq("empresa_id", empresa!.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .is("transferencia_id", null)
        .gte("data_vencimento", format(ini, "yyyy-MM-dd"))
        .lte("data_vencimento", format(fim, "yyyy-MM-dd"))
        .abortSignal(signal);
      if (error) throw error;

      const buckets = new Map<string, FluxoPoint>();
      for (let i = 0; i <= dias; i++) {
        const d = addDays(ini, i);
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
        description="Projeção de entradas e saídas do período selecionado."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2.5 sm:mb-6">
        <div className="shrink-0">
          <PeriodoFilter value={periodo} onChange={setPeriodo} />
        </div>
      </div>
      {/* KPIs compactos — mesma hierarquia secundária do Dashboard */}
      <div className="grid gap-3 sm:grid-cols-3">
        {isLoading || !data ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-2xl shadow-panel">
              <CardContent className="flex h-[96px] items-center gap-3 p-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="mt-2 h-6 w-28 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          [
            {
              label: "Entradas previstas",
              value: brl(data.reduce((s, p) => s + p.entradas, 0)),
              icon: ArrowUpRight,
              tone: "text-success",
            },
            {
              label: "Saídas previstas",
              value: brl(data.reduce((s, p) => s + p.saidas, 0)),
              icon: ArrowDownRight,
              tone: "text-destructive",
            },
            {
              label: "Saldo projetado",
              value: brl(data.length ? data[data.length - 1].saldo : 0),
              icon: Wallet,
              tone: "text-foreground",
            },
          ].map((c) => (
            <Card key={c.label} className="rounded-2xl bg-muted/30 shadow-panel">
              <CardContent className="flex h-[96px] items-center gap-3 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background shadow-sm">
                  <c.icon className={`h-4 w-4 ${c.tone}`} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-muted-foreground">{c.label}</span>
                  <span className="mt-0.5 block truncate text-xl font-semibold leading-tight text-tabular">
                    {c.value}
                  </span>
                </span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Card className="mt-4 rounded-2xl shadow-panel">
        <CardContent className="p-4 sm:p-6">
          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive">Falha ao carregar fluxo: {(error as Error).message}</p>
          ) : isLoading || !data ? (
            <div className="h-80 animate-pulse rounded-2xl bg-muted/30" aria-label="Carregando gráfico" />
          ) : (
            <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted/30" />}>
              <FluxoChart data={data} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function FluxoError({ error }: { error: unknown }) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm" role="alert">
      Não foi possível carregar o fluxo de caixa: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  );
}
