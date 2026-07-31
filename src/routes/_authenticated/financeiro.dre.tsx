import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/financeiro/dre")({
  component: DrePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type Lanc = {
  valor: number; valor_pago: number; tipo: "receber" | "pagar";
  status: string; data_vencimento: string; data_pagamento: string | null;
  categoria_id: string | null;
};
type Cat = { id: string; nome: string; tipo: "receber" | "pagar" };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function DrePage() {
  const { data: empresa } = useEmpresaAtual();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");

  const { data, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["dre", empresa?.id, ano],
    queryFn: async () => {
      const [{ data: lancs, error }, { data: cats }] = await Promise.all([
        supabase.from("lancamentos_financeiros")
          .select("valor,valor_pago,tipo,status,data_vencimento,data_pagamento,categoria_id")
          .eq("empresa_id", empresa!.id)
          .neq("status", "cancelado")
          .gte("data_vencimento", `${ano - 1}-01-01`)
          .lte("data_vencimento", `${ano + 1}-12-31`)
          .limit(20000),
        supabase.from("categorias_financeiras")
          .select("id,nome,tipo").eq("empresa_id", empresa!.id),
      ]);
      if (error) throw error;
      return { lancs: (lancs ?? []) as Lanc[], cats: (cats ?? []) as Cat[] };
    },
  });

  const linhas = useMemo(() => {
    const cats = data?.cats ?? [];
    const nomeCat = new Map(cats.map((c) => [c.id, c.nome]));
    const receitas = new Map<string, number[]>();
    const despesas = new Map<string, number[]>();
    const zeros = () => Array(12).fill(0) as number[];

    for (const l of data?.lancs ?? []) {
      const ref = regime === "caixa" ? l.data_pagamento : l.data_vencimento;
      if (!ref) continue;
      if (regime === "caixa" && !["pago", "parcial"].includes(l.status)) continue;
      const [y, m] = ref.split("-").map(Number);
      if (y !== ano) continue;
      const v = regime === "caixa" ? Number(l.valor_pago ?? 0) : Number(l.valor ?? 0);
      if (!v) continue;
      const alvo = l.tipo === "receber" ? receitas : despesas;
      const key = nomeCat.get(l.categoria_id ?? "") ?? "Sem categoria";
      if (!alvo.has(key)) alvo.set(key, zeros());
      alvo.get(key)![m - 1] += v;
    }

    const toRows = (map: Map<string, number[]>) =>
      [...map.entries()]
        .map(([nome, meses]) => ({ nome, meses, total: meses.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total);

    const rec = toRows(receitas);
    const desp = toRows(despesas);
    const somaCols = (rows: { meses: number[] }[]) =>
      Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + r.meses[i], 0));
    const totRec = somaCols(rec);
    const totDesp = somaCols(desp);
    const resultado = totRec.map((v, i) => v - totDesp[i]);
    return { rec, desp, totRec, totDesp, resultado };
  }, [data, ano, regime]);

  const total = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const anos = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="DRE — Demonstração do resultado"
        description="Receitas e despesas por categoria, mês a mês, com resultado do período."
        actions={
          <div className="flex gap-2">
            <Select value={regime} onValueChange={(v) => setRegime(v as "caixa" | "competencia")}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Regime de caixa</SelectItem>
                <SelectItem value="competencia">Competência</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Receitas</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">{brl(total(linhas.totRec))}</p>
            </Card>
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Despesas</p>
              <p className="mt-1 text-2xl font-semibold text-destructive">{brl(total(linhas.totDesp))}</p>
            </Card>
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Resultado</p>
              <p className={cn("mt-1 text-2xl font-semibold", total(linhas.resultado) < 0 && "text-destructive")}>
                {brl(total(linhas.resultado))}
              </p>
            </Card>
          </div>

          <Card className="overflow-x-auto shadow-panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Categoria</TableHead>
                  {MESES.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Receitas</TableCell>
                  {linhas.totRec.map((v, i) => <TableCell key={i} className="text-right font-medium">{brl(v)}</TableCell>)}
                  <TableCell className="text-right font-semibold">{brl(total(linhas.totRec))}</TableCell>
                </TableRow>
                {linhas.rec.map((r) => (
                  <TableRow key={`r-${r.nome}`}>
                    <TableCell className="pl-6 text-muted-foreground">{r.nome}</TableCell>
                    {r.meses.map((v, i) => <TableCell key={i} className="text-right">{v ? brl(v) : "—"}</TableCell>)}
                    <TableCell className="text-right font-medium">{brl(r.total)}</TableCell>
                  </TableRow>
                ))}

                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Despesas</TableCell>
                  {linhas.totDesp.map((v, i) => <TableCell key={i} className="text-right font-medium">{brl(v)}</TableCell>)}
                  <TableCell className="text-right font-semibold">{brl(total(linhas.totDesp))}</TableCell>
                </TableRow>
                {linhas.desp.map((r) => (
                  <TableRow key={`d-${r.nome}`}>
                    <TableCell className="pl-6 text-muted-foreground">{r.nome}</TableCell>
                    {r.meses.map((v, i) => <TableCell key={i} className="text-right">{v ? brl(v) : "—"}</TableCell>)}
                    <TableCell className="text-right font-medium">{brl(r.total)}</TableCell>
                  </TableRow>
                ))}

                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Resultado</TableCell>
                  {linhas.resultado.map((v, i) => (
                    <TableCell key={i} className={cn("text-right font-medium", v < 0 && "text-destructive")}>{brl(v)}</TableCell>
                  ))}
                  <TableCell className={cn("text-right font-semibold", total(linhas.resultado) < 0 && "text-destructive")}>
                    {brl(total(linhas.resultado))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
