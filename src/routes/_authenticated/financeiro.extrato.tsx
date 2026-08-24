import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListTree, Search, X, Download, ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { usePerfisMap } from "@/hooks/use-perfis";
import { PeriodoFilter, type Periodo } from "@/components/erp/periodo-filter";
import { format, startOfMonth, endOfMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/extrato")({
  component: ExtratoPage,
  head: () => ({
    meta: [
      { title: "Extrato de movimentações — Norvo" },
      { name: "description", content: "Extrato consolidado de entradas e saídas por conta financeira, categoria e centro de custo." },
      { property: "og:title", content: "Extrato de movimentações — Norvo" },
      { property: "og:description", content: "Extrato consolidado de entradas e saídas por conta financeira, categoria e centro de custo." },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Datas "YYYY-MM-DD" (colunas DATE) precisam virar meia-noite LOCAL — new Date() direto
// interpreta como UTC e, no fuso -3, mostra o dia anterior.
const parseDia = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

type Mov = {
  id: string;
  descricao: string;
  tipo: "receber" | "pagar";
  valor: number;
  valor_pago: number;
  status: string;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  created_at: string;
  created_by: string | null;
  documento: string | null;
  forma_pagamento: string | null;
  contato: { nome: string } | null;
  categoria: { nome: string } | null;
  conta: { nome: string } | null;
  centro: { nome: string } | null;
};

function mesAtual(): Periodo {
  const d = new Date();
  return { from: startOfMonth(d), to: endOfMonth(d), label: "Mês atual" };
}

function ExtratoPage() {
  const { data: empresa } = useEmpresaAtual();
  const perfis = usePerfisMap(!!empresa);

  const [periodo, setPeriodo] = useState<Periodo>(mesAtual);
  const [base, setBase] = useState<"pagamento" | "vencimento" | "emissao">("pagamento");
  const [tipo, setTipo] = useState<"todos" | "receber" | "pagar">("todos");
  const [contaId, setContaId] = useState("todas");
  const [categoriaId, setCategoriaId] = useState("todas");
  const [centroId, setCentroId] = useState("todos");
  const [somenteQuitados, setSomenteQuitados] = useState<"todos" | "quitados">("quitados");
  const [busca, setBusca] = useState("");

  const { data: movs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["extrato", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<Mov[]> => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select(
          "id,descricao,tipo,valor,valor_pago,status,data_emissao,data_vencimento,data_pagamento,created_at,created_by,documento,forma_pagamento," +
            "contato:contatos(nome),categoria:categorias_financeiras(nome),conta:contas_bancarias(nome),centro:centros_custo(nome)",
        )
        .eq("empresa_id", empresa!.id)
        .order("data_vencimento", { ascending: false })
        .limit(5000)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Mov[];
    },
  });

  const { data: contas } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-opt", empresa?.id] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categorias } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-todas", empresa?.id] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome,tipo").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: centros } = useQuery({
    enabled: !!empresa,
    queryKey: ["centros-custo", empresa?.id] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("centros_custo")
        .select("id,nome").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const dataRef = (m: Mov) =>
    base === "pagamento" ? (m.data_pagamento ?? m.data_vencimento)
      : base === "emissao" ? m.data_emissao : m.data_vencimento;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (movs ?? [])
      .filter((m) => {
        if (somenteQuitados === "quitados" && m.status !== "pago" && m.status !== "parcial") return false;
        if (tipo !== "todos" && m.tipo !== tipo) return false;
        if (contaId !== "todas" && (m.conta?.nome ?? "") !== (contas?.find((c) => c.id === contaId)?.nome ?? "")) return false;
        if (categoriaId !== "todas" && (m.categoria?.nome ?? "") !== (categorias?.find((c) => c.id === categoriaId)?.nome ?? "")) return false;
        if (centroId !== "todos" && (m.centro?.nome ?? "") !== (centros?.find((c) => c.id === centroId)?.nome ?? "")) return false;
        const d = parseDia(dataRef(m));
        if (periodo.from && d < periodo.from) return false;
        if (periodo.to && d > periodo.to) return false;
        if (q && !`${m.descricao} ${m.contato?.nome ?? ""} ${m.documento ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => dataRef(a).localeCompare(dataRef(b)));
  }, [movs, busca, tipo, contaId, categoriaId, centroId, periodo, base, somenteQuitados, contas, categorias, centros]);

  const linhas = useMemo(() => {
    let saldo = 0;
    return filtrados.map((m) => {
      const valor = m.status === "pago" || m.status === "parcial" ? (m.valor_pago || m.valor) : m.valor;
      const assinado = m.tipo === "receber" ? valor : -valor;
      saldo += assinado;
      return { m, assinado, saldo };
    });
  }, [filtrados]);

  const entradas = linhas.filter((l) => l.assinado > 0).reduce((s, l) => s + l.assinado, 0);
  const saidas = linhas.filter((l) => l.assinado < 0).reduce((s, l) => s + Math.abs(l.assinado), 0);

  const exportarCsv = () => {
    const head = ["Data", "Descrição", "Contato", "Categoria", "Centro de custo", "Conta", "Documento", "Forma", "Entrada", "Saída", "Saldo", "Lançado por", "Lançado em"];
    const rows = linhas.map(({ m, assinado, saldo }) => [
      format(parseDia(dataRef(m)), "dd/MM/yyyy"),
      m.descricao, m.contato?.nome ?? "", m.categoria?.nome ?? "", m.centro?.nome ?? "",
      m.conta?.nome ?? "", m.documento ?? "", m.forma_pagamento ?? "",
      assinado > 0 ? assinado.toFixed(2) : "", assinado < 0 ? Math.abs(assinado).toFixed(2) : "",
      saldo.toFixed(2),
      m.created_by ? (perfis[m.created_by] ?? "—") : "—",
      format(new Date(m.created_at), "dd/MM/yyyy HH:mm"),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Extrato de movimentações"
        description="Consulte entradas e saídas por período, conta financeira, categoria e centro de custo."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Adicionar trilha de auditoria
            </Button>
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!linhas.length}>
              <Download className="mr-1 h-4 w-4" />Exportar CSV
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <ArrowDownCircle className="h-8 w-8 text-success" />
          <div>
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-lg font-semibold text-tabular">{brl(entradas)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <ArrowUpCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-lg font-semibold text-tabular">{brl(saidas)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Scale className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Resultado do período</p>
            <p className="text-lg font-semibold text-tabular">{brl(entradas - saidas)}</p>
          </div>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodoFilter value={periodo} onChange={setPeriodo} />
        <Select value={base} onValueChange={(v) => setBase(v as typeof base)}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pagamento">Data de pagamento</SelectItem>
            <SelectItem value="vencimento">Data de vencimento</SelectItem>
            <SelectItem value="emissao">Data de emissão</SelectItem>
          </SelectContent>
        </Select>
        <Select value={somenteQuitados} onValueChange={(v) => setSomenteQuitados(v as typeof somenteQuitados)}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quitados">Somente realizados</SelectItem>
            <SelectItem value="todos">Realizados e previstos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="receber">Entradas</SelectItem>
            <SelectItem value="pagar">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contaId} onValueChange={setContaId}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Conta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as contas</SelectItem>
            {contas?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoriaId} onValueChange={setCategoriaId}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={centroId} onValueChange={setCentroId}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Centro de custo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os centros</SelectItem>
            {centros?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar…" className="h-9 pl-8 pr-8" />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-label="Carregando">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}
        </div>
      ) : !linhas.length ? (
        <EmptyState icon={ListTree} title="Nenhuma movimentação no período" description="Ajuste os filtros acima para ampliar a consulta." />
      ) : (
        <Card className="overflow-x-auto shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead className="text-right">Saída</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Lançado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ m, assinado, saldo }) => (
                <TableRow key={m.id}>
                  <TableCell className="text-tabular whitespace-nowrap">{format(parseDia(dataRef(m)), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-medium">
                    {m.descricao}
                    {m.status !== "pago" && (
                      <Badge variant="secondary" className="ml-2 bg-accent text-accent-foreground">{m.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.contato?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.categoria?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.centro?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.conta?.nome ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular text-success">{assinado > 0 ? brl(assinado) : ""}</TableCell>
                  <TableCell className="text-right text-tabular text-destructive">{assinado < 0 ? brl(Math.abs(assinado)) : ""}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(saldo)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {m.created_by ? (perfis[m.created_by] ?? "—") : "—"}
                    <br />
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
