import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, ChevronRight, Trash2, HandCoins, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { addMonths, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/emprestimos")({
  component: EmprestimosPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm">
      Erro: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  ),
});

type Emprestimo = {
  id: string; tipo: "emprestimo" | "financiamento"; descricao: string; credor: string | null;
  valor_principal: number; taxa_juros_mensal: number; parcelas: number;
  data_contratacao: string; primeiro_vencimento: string | null; status: string;
};
type Parcela = {
  id: string; emprestimo_id: string; numero: number; data_vencimento: string;
  valor: number; valor_juros: number; valor_amortizacao: number; status: string; lancamento_id: string | null;
};

/** Tabela Price: parcela fixa. Juros 0 → divisão simples. */
function gerarPrice(principal: number, taxaPct: number, n: number, primeiro: Date) {
  const i = taxaPct / 100;
  const pmt = i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
  let saldo = principal;
  return Array.from({ length: n }, (_, k) => {
    const juros = saldo * i;
    const amort = pmt - juros;
    saldo -= amort;
    return {
      numero: k + 1,
      data_vencimento: format(addMonths(primeiro, k), "yyyy-MM-dd"),
      valor: Number(pmt.toFixed(2)),
      valor_juros: Number(juros.toFixed(2)),
      valor_amortizacao: Number(amort.toFixed(2)),
    };
  });
}

function EmprestimosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"emprestimo" | "financiamento">("emprestimo");
  const [descricao, setDescricao] = useState("");
  const [credor, setCredor] = useState("");
  const [principal, setPrincipal] = useState("0");
  const [taxa, setTaxa] = useState("0");
  const [parcelas, setParcelas] = useState("12");
  const [contratacao, setContratacao] = useState(format(new Date(), "yyyy-MM-dd"));
  const [primeiro, setPrimeiro] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [busca, setBusca] = useState("");

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["emprestimos", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimos" as never)
        .select("id,tipo,descricao,credor,valor_principal,taxa_juros_mensal,parcelas,data_contratacao,primeiro_vencimento,status").eq("empresa_id", empresa!.id).order("data_contratacao", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Emprestimo[];
    },
  });

  const { data: parcelasSel = [] } = useQuery({
    enabled: !!sel,
    queryKey: ["emprestimo-parcelas", sel],
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimo_parcelas" as never)
        .select("id,emprestimo_id,numero,data_vencimento,valor,valor_juros,valor_amortizacao,status,lancamento_id").eq("emprestimo_id", sel!).order("numero").limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Parcela[];
    },
  });

  const previa = useMemo(() => {
    const p = Number(principal) || 0;
    const n = Number(parcelas) || 0;
    if (p <= 0 || n <= 0) return null;
    const linhas = gerarPrice(p, Number(taxa) || 0, n, new Date(`${primeiro}T00:00:00`));
    return { parcela: linhas[0]?.valor ?? 0, total: linhas.reduce((s, l) => s + l.valor, 0) };
  }, [principal, parcelas, taxa, primeiro]);

  const reset = () => {
    setTipo("emprestimo"); setDescricao(""); setCredor(""); setPrincipal("0");
    setTaxa("0"); setParcelas("12");
    setContratacao(format(new Date(), "yyyy-MM-dd"));
    setPrimeiro(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!descricao.trim()) throw new Error("Informe a descrição");
      const p = Number(principal) || 0;
      const n = Number(parcelas) || 0;
      if (p <= 0 || n <= 0) throw new Error("Informe valor e número de parcelas");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp, error } = await (supabase.from("emprestimos" as never) as any).insert({
        empresa_id: empresa.id, tipo, descricao, credor: credor || null,
        valor_principal: p, taxa_juros_mensal: Number(taxa) || 0, parcelas: n,
        data_contratacao: contratacao, primeiro_vencimento: primeiro,
      }).select("id").single();
      if (error) throw error;

      const linhas = gerarPrice(p, Number(taxa) || 0, n, new Date(`${primeiro}T00:00:00`))
        .map((l) => ({ ...l, empresa_id: empresa.id, emprestimo_id: emp.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase.from("emprestimo_parcelas" as never) as any).insert(linhas);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Contrato cadastrado com parcelas geradas");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarContasPagar = useMutation({
    mutationFn: async (emprestimoId: string) => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const pendentes = parcelasSel.filter((p) => !p.lancamento_id && p.status === "aberta");
      if (!pendentes.length) throw new Error("Nenhuma parcela pendente sem lançamento");
      const emp = (lista ?? []).find((e) => e.id === emprestimoId);
      for (const p of pendentes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lanc, error } = await (supabase.from("lancamentos_financeiros") as any).insert({
          empresa_id: empresa.id, tipo: "pagar", status: "aberto",
          descricao: `${emp?.descricao ?? "Empréstimo"} — parcela ${p.numero}/${emp?.parcelas ?? ""}`,
          valor: p.valor, data_emissao: format(new Date(), "yyyy-MM-dd"), data_vencimento: p.data_vencimento,
        }).select("id").single();
        if (error) throw error;
        await supabase.from("emprestimo_parcelas" as never)
          .update({ lancamento_id: lanc.id } as never).eq("id", p.id);
      }
    },
    onSuccess: () => {
      toast.success("Contas a pagar geradas");
      qc.invalidateQueries({ queryKey: ["emprestimo-parcelas"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emprestimos" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contrato excluído");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emprestimoSel = (lista ?? []).find((e) => e.id === sel) ?? null;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lista ?? [];
    return (lista ?? []).filter((e) =>
      (e.descricao || "").toLowerCase().includes(q)
      || (e.credor || "").toLowerCase().includes(q),
    );
  }, [lista, busca]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Empréstimos e financiamentos"
        description="Controle contratos, parcelas (tabela Price), juros e amortização, e gere as contas a pagar."
      />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por descrição ou credor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button className="h-10 rounded-xl px-5 shadow-md transition-all hover:-translate-y-px hover:shadow-lg"><Plus className="mr-1.5 h-4 w-4" /> Novo contrato</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
              <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">Novo contrato</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emprestimo">Empréstimo</SelectItem>
                        <SelectItem value="financiamento">Financiamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Credor</Label>
                    <Input value={credor} onChange={(e) => setCredor(e.target.value)} placeholder="Banco / instituição" className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Capital de giro" className="h-10 rounded-xl" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Valor contratado</Label>
                    <MoneyInput value={principal} onChange={setPrincipal} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Juros % a.m.</Label>
                    <MoneyInput prefix="" value={taxa} onChange={setTaxa} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Parcelas</Label>
                    <MoneyInput prefix="" decimals={0} value={parcelas} onChange={setParcelas} className="h-10" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Contratação</Label>
                    <DateInput value={contratacao} onChange={setContratacao} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>1º vencimento</Label>
                    <DateInput value={primeiro} onChange={setPrimeiro} className="h-10" />
                  </div>
                </div>
                {previa && (
                  <p className="rounded-xl border bg-muted/50 p-3.5 text-sm leading-relaxed text-muted-foreground shadow-sm">
                    Parcela estimada: <strong className="text-foreground">{brl(previa.parcela)}</strong> ·
                    Total a pagar: <strong className="text-foreground">{brl(previa.total)}</strong>
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                  {criar.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : !lista?.length ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum contrato"
          description="Cadastre empréstimos e financiamentos para acompanhar parcelas, juros e impacto no fluxo de caixa."
        />
      ) : !filtrados.length ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum contrato encontrado"
          description="Nada encontrado para a busca."
        />
      ) : (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_1.2fr]">
          <Card className="overflow-hidden rounded-2xl shadow-panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Parc.</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((e) => (
                  <TableRow
                    key={e.id}
                    className={sel === e.id ? "bg-muted/50" : "cursor-pointer transition-colors hover:bg-accent/30"}
                    onClick={() => setSel(e.id)}
                  >
                    <TableCell>
                      <div className="font-medium tracking-tight">{e.descricao}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {e.tipo === "financiamento" ? "Financiamento" : "Empréstimo"}
                        {e.credor ? ` · ${e.credor}` : ""} · {dateBR(e.data_contratacao)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(e.valor_principal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-tabular">{e.parcelas}x</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="overflow-hidden rounded-2xl shadow-panel">
            {!emprestimoSel ? (
              <p className="p-8 text-center text-sm leading-relaxed text-muted-foreground">Selecione um contrato para ver as parcelas.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold tracking-tight">{emprestimoSel.descricao}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {emprestimoSel.parcelas}x · {Number(emprestimoSel.taxa_juros_mensal)}% a.m.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => gerarContasPagar.mutate(emprestimoSel.id)}
                      disabled={gerarContasPagar.isPending}
                      className="h-9 rounded-xl px-4 shadow-sm"
                    >
                      <HandCoins className="mr-1.5 h-4 w-4" /> Gerar contas a pagar
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Excluir contrato" onClick={() => excluir.mutate(emprestimoSel.id)} className="h-9 w-9 rounded-xl">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Parcela</TableHead>
                        <TableHead className="text-right">Juros</TableHead>
                        <TableHead className="text-right">Amortização</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelasSel.map((p) => (
                        <TableRow key={p.id} className="transition-colors hover:bg-accent/30">
                          <TableCell>{p.numero}</TableCell>
                          <TableCell>{dateBR(p.data_vencimento)}</TableCell>
                          <TableCell className="text-right font-medium">{brl(p.valor)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{brl(p.valor_juros)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{brl(p.valor_amortizacao)}</TableCell>
                          <TableCell>
                            <Badge variant={p.lancamento_id ? "secondary" : "outline"}>
                              {p.lancamento_id ? "Lançada" : "Aberta"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
