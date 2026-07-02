import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { format, addDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/fluxo")({
  component: FluxoCaixa,
});

function brl(n: number) { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }

function FluxoCaixa() {
  const { data: empresa } = useEmpresaAtual();
  const { data } = useQuery({
    enabled: !!empresa,
    queryKey: ["fluxo", empresa?.id],
    queryFn: async () => {
      const hoje = startOfDay(new Date());
      const fim = addDays(hoje, 30);
      const { data } = await supabase.from("lancamentos_financeiros")
        .select("tipo,valor,valor_pago,data_vencimento,status")
        .eq("empresa_id", empresa!.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .gte("data_vencimento", hoje.toISOString().slice(0,10))
        .lte("data_vencimento", fim.toISOString().slice(0,10));
      const buckets: Record<string, { data: string; entradas: number; saidas: number; saldo: number }> = {};
      for (let i = 0; i <= 30; i++) {
        const d = addDays(hoje, i); const k = format(d, "yyyy-MM-dd");
        buckets[k] = { data: format(d, "dd/MM"), entradas: 0, saidas: 0, saldo: 0 };
      }
      (data ?? []).forEach((l: any) => {
        const b = buckets[l.data_vencimento]; if (!b) return;
        const v = Number(l.valor) - Number(l.valor_pago);
        if (l.tipo === "receber") b.entradas += v; else b.saidas += v;
      });
      let saldo = 0;
      return Object.values(buckets).map((b) => { saldo += b.entradas - b.saidas; return { ...b, saldo }; });
    },
  });

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Fluxo de caixa" description="Projeção de entradas e saídas dos próximos 30 dias." />
      <Card className="shadow-panel">
        <CardContent className="p-6">
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="data" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={brl} />
                <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Line type="monotone" dataKey="entradas" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} name="Entradas" />
                <Line type="monotone" dataKey="saidas" stroke="var(--color-destructive)" strokeWidth={2} dot={false} name="Saídas" />
                <Line type="monotone" dataKey="saldo" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Saldo acumulado" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
