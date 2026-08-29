import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from "recharts";
import { 
  BarChart3, FileSpreadsheet, Calendar, 
  ArrowUpRight, Landmark, FileText, Ban 
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";

export const Route = createFileRoute("/_authenticated/fiscal/relatorios")({
  component: RelatoriosFiscais,
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const COLORS = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#ec4899", "#10b981", "#6366f1"];

function RelatoriosFiscais() {
  const { data: empresa } = useEmpresaAtual();
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
  });

  const { data: notas, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["notas-importadas-relatorio", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("notas_importadas" as never)
        .select("id, emitente, cnpj_emitente, numero_nf, data_emissao, valor_total, situacao")
        .eq("empresa_id", empresa!.id)
        .order("data_emissao", { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const stats = useMemo(() => {
    if (!notas) return null;
    const [mes, ano] = periodo.split("-");
    const periodoKey = `${ano}-${mes}`;

    const notasPeriodo = notas.filter(n => (n.data_emissao || "").startsWith(periodoKey));
    const totalNotas = notasPeriodo.length;
    const valorTotal = notasPeriodo.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0);
    const notasAutorizadas = notasPeriodo.filter(n => n.situacao === "lancada" || n.situacao === "importada").length;
    const notasCanceladas = notasPeriodo.filter(n => n.situacao === "cancelada").length;

    // Faturamento por fornecedor (top 5)
    const porFornecedor: Record<string, { nome: string; valor: number; qtd: number }> = {};
    notasPeriodo.forEach(n => {
      const key = n.cnpj_emitente || n.emitente;
      if (!porFornecedor[key]) porFornecedor[key] = { nome: n.emitente, valor: 0, qtd: 0 };
      porFornecedor[key].valor += Number(n.valor_total) || 0;
      porFornecedor[key].qtd += 1;
    });
    const fornecedoresSorted = Object.values(porFornecedor)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Evolução mensal (últimos 6 meses)
    const evolucao: { mes: string; valor: number; qtd: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      const notasMes = notas.filter(n => (n.data_emissao || "").startsWith(key));
      evolucao.push({
        mes: label,
        valor: notasMes.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0),
        qtd: notasMes.length,
      });
    }

    // Notas por mês (todas, para o período filtrado)
    const todasNotasMes = notas.filter(n => (n.data_emissao || "").startsWith(periodoKey));

    return {
      totalNotas,
      valorTotal,
      notasAutorizadas,
      notasCanceladas,
      fornecedoresSorted,
      evolucao,
      todasNotasMes,
    };
  }, [notas, periodo]);

  const handleExportExcel = () => {
    if (!stats) return toast.error("Nenhum dado para exportar");
    const resumo = stats.todasNotasMes.map(n => ({
      "NF-e": n.numero_nf,
      Emitente: n.emitente,
      CNPJ: n.cnpj_emitente,
      "Data Emissão": n.data_emissao,
      Valor: Number(n.valor_total) || 0,
      Situação: n.situacao,
    }));
    const fornecedores = stats.fornecedoresSorted.map(f => ({
      Fornecedor: f.nome,
      "Qtd Notas": f.qtd,
      "Valor Total": f.valor,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Notas do Mês");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fornecedores), "Por Fornecedor");
    XLSX.writeFile(wb, `Relatorio_Fiscal_${periodo}.xlsx`);
    toast.success("Relatório exportado!");
  };

  const periodos = useMemo(() => {
    const meses = new Set<string>();
    (notas ?? []).forEach(n => {
      if (n.data_emissao) meses.add(n.data_emissao.slice(0, 7));
    });
    return Array.from(meses).sort().reverse().map(m => {
      const [ano, mes] = m.split("-");
      return { value: m, label: `${MESES[parseInt(mes) - 1]} / ${ano}` };
    });
  }, [notas]);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader 
          eyebrow="Gestão Fiscal" 
          title="Relatórios e Dashboards" 
          description="Análise detalhada de notas de compra, fornecedores e resumo de operações." 
        />
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {periodos.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <Button onClick={handleExportExcel} variant="outline" className="shadow-sm" disabled={!stats}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar XLS
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Valor Total Notas</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{brl(stats.valorTotal)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{stats.totalNotas} nota(s) no período</p>
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Fornecedores</CardTitle>
                <Landmark className="h-4 w-4 text-sky-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.fornecedoresSorted.length}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Fornecedores distintos no período</p>
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Notas Importadas</CardTitle>
                <FileText className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.notasAutorizadas}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Notas recebidas e processadas</p>
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Canceladas</CardTitle>
                <Ban className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stats.notasCanceladas}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Notas canceladas no período</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle>Evolução de Notas de Compra</CardTitle>
                <CardDescription>Valor total de notas recebidas nos últimos 6 meses.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.evolucao} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `R$ ${v / 1000}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                      <Legend verticalAlign="top" height={36} iconSize={12} iconType="rect" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="valor" name="Valor Notas" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle>Top Fornecedores</CardTitle>
                <CardDescription>Maiores fornecedores por valor no período.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                {stats.fornecedoresSorted.length > 0 ? (
                  <>
                    <div className="h-60 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.fornecedoresSorted}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={3}
                            dataKey="valor"
                            nameKey="nome"
                          >
                            {stats.fornecedoresSorted.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-2 mt-4">
                      {stats.fornecedoresSorted.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                            <span className="text-muted-foreground truncate max-w-[140px]">{item.nome}</span>
                          </div>
                          <strong className="text-foreground font-semibold">{brl(item.valor)}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum fornecedor no período</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabela Detalhada */}
          <Card className="mt-6 border-muted bg-card/60 backdrop-blur-sm shadow-panel overflow-hidden">
            <CardHeader className="border-b border-muted">
              <CardTitle>Notas no Período</CardTitle>
              <CardDescription>Lista de todas as notas recebidas no período selecionado.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground">NF-e</TableHead>
                    <TableHead className="font-semibold text-foreground">Emitente</TableHead>
                    <TableHead className="font-semibold text-foreground">Data</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Valor</TableHead>
                    <TableHead className="font-semibold text-foreground">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.todasNotasMes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma nota no período selecionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.todasNotasMes.map((n) => (
                      <TableRow key={n.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="font-mono text-xs">{n.numero_nf || "—"}</TableCell>
                        <TableCell className="font-medium text-foreground">{n.emitente}</TableCell>
                        <TableCell className="text-tabular text-muted-foreground">{n.data_emissao}</TableCell>
                        <TableCell className="text-right text-tabular font-medium text-foreground">{brl(Number(n.valor_total) || 0)}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium ${n.situacao === "lancada" ? "text-emerald-600" : n.situacao === "cancelada" ? "text-destructive" : "text-muted-foreground"}`}>
                            {n.situacao || "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
