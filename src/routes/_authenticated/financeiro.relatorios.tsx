import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl } from "@/lib/format";
import { differenceInCalendarDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/relatorios")({
  component: RelatoriosPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm">
      Erro: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  ),
});

type Lanc = {
  id: string; valor: number; valor_pago: number; tipo: "receber" | "pagar";
  status: string; data_vencimento: string; contato_id: string | null; categoria_id: string | null;
};

const FAIXAS = [
  { label: "No prazo (a vencer)", test: (d: number) => d < 0 },
  { label: "Atrasado 0–30 dias", test: (d: number) => d >= 0 && d <= 30 },
  { label: "Atrasado 31–60 dias", test: (d: number) => d > 30 && d <= 60 },
  { label: "Atrasado 61–90 dias", test: (d: number) => d > 60 && d <= 90 },
  { label: "Atrasado +90 dias", test: (d: number) => d > 90 },
];

function RelatoriosPage() {
  const { data: empresa } = useEmpresaAtual();

  const { data, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["relatorios-fin", empresa?.id],
    queryFn: async () => {
      // Busca em páginas de 1000 para nunca cortar o relatório (sem limite silencioso)
      const lancs: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("lancamentos_financeiros")
          .select("id,valor,valor_pago,tipo,status,data_vencimento,contato_id,categoria_id")
          .eq("empresa_id", empresa!.id).neq("status", "cancelado").is("transferencia_id", null)
          .range(ini, ini + 999);
        if (error) throw error;
        lancs.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const contatos: { id: string; nome: string }[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data } = await supabase.from("contatos").select("id,nome")
          .eq("empresa_id", empresa!.id).range(ini, ini + 999);
        contatos.push(...((data ?? []) as { id: string; nome: string }[]));
        if (!data || data.length < 1000) break;
      }
      const { data: cats } = await supabase.from("categorias_financeiras").select("id,nome").eq("empresa_id", empresa!.id);
      return {
        lancs: lancs as Lanc[],
        contatos: new Map(contatos.map((c) => [c.id, c.nome as string])),
        cats: new Map(((cats ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome as string])),
      };
    },
  });

  const rel = useMemo(() => {
    const lancs = data?.lancs ?? [];
    const hoje = new Date();
    const aberto = lancs.filter((l) => ["aberto", "parcial", "vencido"].includes(l.status));
    const saldo = (l: Lanc) => Number(l.valor) - Number(l.valor_pago ?? 0);

    const aging = (tipo: "receber" | "pagar") =>
      FAIXAS.map((f) => {
        const itens = aberto.filter(
          (l) => l.tipo === tipo && f.test(differenceInCalendarDays(hoje, parseISO(l.data_vencimento))),
        );
        return { faixa: f.label, qtd: itens.length, total: itens.reduce((s, l) => s + saldo(l), 0) };
      });

    const ranking = (tipo: "receber" | "pagar") => {
      const map = new Map<string, number>();
      for (const l of lancs) {
        if (l.tipo !== tipo) continue;
        const v = Number(l.valor_pago ?? 0);
        if (v <= 0) continue;
        const nome = data?.contatos.get(l.contato_id ?? "") ?? "Sem contato";
        map.set(nome, (map.get(nome) ?? 0) + v);
      }
      return [...map.entries()].map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total).slice(0, 10);
    };

    const porCategoria = (tipo: "receber" | "pagar") => {
      const map = new Map<string, number>();
      for (const l of lancs) {
        if (l.tipo !== tipo) continue;
        const v = Number(l.valor_pago ?? 0);
        if (v <= 0) continue;
        const nome = data?.cats.get(l.categoria_id ?? "") ?? "Sem categoria";
        map.set(nome, (map.get(nome) ?? 0) + v);
      }
      const rows = [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
      const soma = rows.reduce((s, r) => s + r.total, 0) || 1;
      let acc = 0;
      return rows.map((r) => {
        acc += r.total;
        const acumulado = (acc / soma) * 100;
        return { ...r, pct: (r.total / soma) * 100, acumulado, classe: acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C" };
      });
    };

    return {
      agingReceber: aging("receber"),
      agingPagar: aging("pagar"),
      topClientes: ranking("receber"),
      topFornecedores: ranking("pagar"),
      inadimplencia: aberto
        .filter((l) => l.tipo === "receber" && differenceInCalendarDays(hoje, parseISO(l.data_vencimento)) > 0)
        .reduce((s, l) => s + saldo(l), 0),
      abertoReceber: aberto.filter((l) => l.tipo === "receber").reduce((s, l) => s + saldo(l), 0),
      abertoPagar: aberto.filter((l) => l.tipo === "pagar").reduce((s, l) => s + saldo(l), 0),
      curvaDespesas: porCategoria("pagar"),
      curvaReceitas: porCategoria("receber"),
    };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Financeiro" title="Relatórios financeiros" />
        <div className="space-y-2.5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Relatórios financeiros"
        description="Contas em aberto por tempo de atraso, maiores clientes e fornecedores e gastos por categoria."
      />

      <div className="mb-6 grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">A receber em aberto</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-success text-tabular">{brl(rel.abertoReceber)}</p>
        </Card>
        <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">A pagar em aberto</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-destructive text-tabular">{brl(rel.abertoPagar)}</p>
        </Card>
        <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inadimplência a receber</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-destructive text-tabular">{brl(rel.inadimplencia)}</p>
        </Card>
      </div>

      <Tabs defaultValue="atrasos">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="atrasos">Atrasos por tempo</TabsTrigger>
          <TabsTrigger value="ranking">Clientes e fornecedores</TabsTrigger>
          <TabsTrigger value="abc">Gastos por categoria</TabsTrigger>
        </TabsList>

        <TabsContent value="atrasos" className="mt-4 grid gap-4 sm:mt-5 lg:grid-cols-2 lg:gap-5">
          <p className="text-sm text-muted-foreground lg:col-span-2">
            Contas em aberto agrupadas pelo tempo de atraso a partir do vencimento. "No prazo" ainda não venceu.
          </p>
          {([["A receber", rel.agingReceber], ["A pagar", rel.agingPagar]] as const).map(([titulo, linhas]) => (
            <Card key={titulo} className="overflow-hidden rounded-2xl shadow-panel">
              <div className="border-b border-border/60 px-5 py-3.5">
                <p className="text-sm font-semibold tracking-tight">{titulo}</p>
                <p className="text-xs text-muted-foreground">Em aberto, por tempo de atraso</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.faixa} className="transition-colors hover:bg-accent/30">
                      <TableCell>{l.faixa}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.qtd}</TableCell>
                      <TableCell className="text-right font-medium">{brl(l.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>Total em aberto</TableCell>
                    <TableCell className="text-right text-tabular">{linhas.reduce((s, l) => s + l.qtd, 0)}</TableCell>
                    <TableCell className="text-right text-tabular">{brl(linhas.reduce((s, l) => s + l.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="ranking" className="mt-4 grid gap-4 sm:mt-5 lg:grid-cols-2 lg:gap-5">
          <p className="text-sm text-muted-foreground lg:col-span-2">
            Quem mais movimentou: soma dos valores já recebidos e já pagos por contato.
          </p>
          {([["Maiores clientes (valores recebidos)", rel.topClientes], ["Maiores fornecedores (valores pagos)", rel.topFornecedores]] as const).map(([titulo, linhas]) => (
            <Card key={titulo} className="overflow-hidden rounded-2xl shadow-panel">
              <div className="border-b border-border/60 px-5 py-3.5">
                <p className="text-sm font-semibold tracking-tight">{titulo}</p>
                <p className="text-xs text-muted-foreground">Top 10 por valor movimentado</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Valor</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">Sem dados.</TableCell></TableRow>
                  ) : linhas.map((l) => (
                    <TableRow key={l.nome} className="transition-colors hover:bg-accent/30">
                      <TableCell className="max-w-[240px] truncate">{l.nome}</TableCell>
                      <TableCell className="text-right font-medium">{brl(l.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="abc" className="mt-4 grid gap-4 sm:mt-5 lg:grid-cols-2 lg:gap-5">
          <p className="text-sm text-muted-foreground lg:col-span-2">
            Onde o dinheiro entra e sai por categoria. Classe A: categorias que somam 80% do total; B: até 95%; C: o resto.
          </p>
          {([["Despesas por categoria", rel.curvaDespesas], ["Receitas por categoria", rel.curvaReceitas]] as const).map(([titulo, linhas]) => (
            <Card key={titulo} className="overflow-hidden rounded-2xl shadow-panel">
              <div className="border-b border-border/60 px-5 py-3.5">
                <p className="text-sm font-semibold tracking-tight">{titulo}</p>
                <p className="text-xs text-muted-foreground">Só valores já recebidos/pagos</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Classe</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Acum.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Sem dados.</TableCell></TableRow>
                  ) : linhas.map((l) => (
                    <TableRow key={l.nome} className="transition-colors hover:bg-accent/30">
                      <TableCell>
                        <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {l.classe}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{l.nome}</TableCell>
                      <TableCell className="text-right font-medium">{brl(l.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.pct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.acumulado.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
