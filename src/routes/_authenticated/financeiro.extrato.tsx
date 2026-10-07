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
import { Combobox } from "@/components/erp/combobox";
import { TransferenciaDialog } from "@/components/erp/transferencia-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListTree, Search, X, Download, ArrowDownCircle, ArrowUpCircle, Scale, ArrowLeftRight } from "lucide-react";
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
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm" role="alert">Falha: {error instanceof Error ? error.message : "erro desconhecido"}</div>
  ),
  notFoundComponent: () => <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-panel">Página não encontrada.</div>,
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
  observacoes: string | null;
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
  const [transfOpen, setTransfOpen] = useState(false);

  // Auditoria (somente leitura: mostra eventos de lançamentos)
  const [trilhaOpen, setTrilhaOpen] = useState(false);
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-extrato", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "financeiro")
        .eq("entidade", "lancamento_financeiro")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: movs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["extrato", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<Mov[]> => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select(
          "id,descricao,tipo,valor,valor_pago,status,data_emissao,data_vencimento,data_pagamento,created_at,created_by,documento,forma_pagamento,observacoes," +
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

  // Autor + origem: lançamentos de adiantamento recorrente mostram o criador da recorrência
  const autorComOrigem = (m: Mov) => {
    const rec = (m.observacoes ?? "").includes("adiantamento recorrente");
    const nome = m.created_by ? (perfis[m.created_by] ?? "—") : null;
    if (!nome) return rec ? "Recorrência (sistema)" : "—";
    return rec ? `${nome} (recorrência)` : nome;
  };

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
      autorComOrigem(m),
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Extrato de movimentações"
        description="Consulte entradas e saídas por período, conta financeira, categoria e centro de custo."
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="flex items-center gap-4 rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success/10">
            <ArrowDownCircle className="h-6 w-6 text-success" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Entradas</p>
            <p className="mt-1 truncate text-xl font-semibold text-tabular">{brl(entradas)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-destructive/10">
            <ArrowUpCircle className="h-6 w-6 text-destructive" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saídas</p>
            <p className="mt-1 truncate text-xl font-semibold text-tabular">{brl(saidas)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <Scale className="h-6 w-6 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado do período</p>
            <p className="mt-1 truncate text-xl font-semibold text-tabular">{brl(entradas - saidas)}</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <PeriodoFilter value={periodo} onChange={setPeriodo} />
        <Select value={base} onValueChange={(v) => setBase(v as typeof base)}>
          <SelectTrigger className="h-10 w-[190px] rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pagamento">Data de pagamento</SelectItem>
            <SelectItem value="vencimento">Data de vencimento</SelectItem>
            <SelectItem value="emissao">Data de emissão</SelectItem>
          </SelectContent>
        </Select>
        <Select value={somenteQuitados} onValueChange={(v) => setSomenteQuitados(v as typeof somenteQuitados)}>
          <SelectTrigger className="h-10 w-[190px] rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quitados">Somente realizados</SelectItem>
            <SelectItem value="todos">Realizados e previstos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
          <SelectTrigger className="h-10 w-[150px] rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="receber">Entradas</SelectItem>
            <SelectItem value="pagar">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Combobox value={contaId} onChange={setContaId} options={[{ value: "todas", label: "Todas as contas" }, ...((contas ?? []).map((c) => ({ value: c.id, label: c.nome ?? "" })) )]} placeholder="Conta" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." className="h-10" />
        <Combobox value={categoriaId} onChange={setCategoriaId} options={[{ value: "todas", label: "Todas as categorias" }, ...((categorias ?? []).map((c) => ({ value: c.id, label: c.nome ?? "" })) )]} placeholder="Categoria" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." className="h-10" />
        <Combobox value={centroId} onChange={setCentroId} options={[{ value: "todos", label: "Todos os centros" }, ...((centros ?? []).map((c) => ({ value: c.id, label: c.nome ?? "" })) )]} placeholder="Centro de custo" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." className="h-10" />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar…" className="h-10 rounded-xl pl-10 pr-10 shadow-sm" />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTrilhaOpen(true)} className="h-9 rounded-xl px-4 active:scale-95">
            Auditoria
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="h-10 rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />Transferir
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!linhas.length} className="h-10 rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
            <Download className="mr-1.5 h-4 w-4" />Exportar CSV
          </Button>
        </div>
      </div>
      <TransferenciaDialog open={transfOpen} onOpenChange={setTransfOpen} />

      {isLoading ? (
        <div className="space-y-2.5" aria-label="Carregando">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
      ) : !linhas.length ? (
        <EmptyState icon={ListTree} title="Nenhuma movimentação no período" description="Ajuste os filtros acima para ampliar a consulta." />
      ) : (
        <Card className="overflow-x-auto rounded-2xl shadow-panel">
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
                <TableRow key={m.id} className="transition-colors hover:bg-accent/30">
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
                    {autorComOrigem(m)}
                    <br />
                    {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={trilhaOpen} onOpenChange={setTrilhaOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Auditoria — Extrato</DialogTitle>
          </DialogHeader>
          {trilhaQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : trilhaQuery.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Trilha indisponível no momento.</p>
          ) : (trilhaQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">Nenhum evento registrado ainda. Movimentações em Receber/Pagar geram registros aqui.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(trilhaQuery.data ?? []).map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                    ev.acao === "excluir" ? "bg-destructive/10 text-destructive"
                    : ev.acao === "alterar" ? "bg-primary/10 text-primary"
                    : "bg-success/10 text-success"
                  }`}>
                    {ev.acao === "excluir" ? "Excluiu" : ev.acao === "alterar" ? "Alterou" : "Criou"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{ev.detalhes?.descricao || "—"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ev.detalhes?.user_nome || ev.detalhes?.user_email || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
