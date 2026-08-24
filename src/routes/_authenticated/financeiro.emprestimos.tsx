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
import { Banknote, Plus, ChevronRight, Trash2, CheckCircle2 } from "lucide-react";
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
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
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

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["emprestimos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimos" as never)
        .select("*").eq("empresa_id", empresa!.id).order("data_contratacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Emprestimo[];
    },
  });

  const { data: parcelasSel = [] } = useQuery({
    enabled: !!sel,
    queryKey: ["emprestimo-parcelas", sel],
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimo_parcelas" as never)
        .select("*").eq("emprestimo_id", sel!).order("numero");
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

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Empréstimos e financiamentos"
        description="Controle contratos, parcelas (tabela Price), juros e amortização, e gere as contas a pagar."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> Novo contrato</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emprestimo">Empréstimo</SelectItem>
                        <SelectItem value="financiamento">Financiamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Credor</Label>
                    <Input value={credor} onChange={(e) => setCredor(e.target.value)} placeholder="Banco / instituição" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Capital de giro" />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Valor contratado</Label>
                    <MoneyInput value={principal} onChange={setPrincipal} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Juros % a.m.</Label>
                    <Input type="number" step="0.01" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Parcelas</Label>
                    <Input type="number" min={1} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Contratação</Label>
                    <DateInput value={contratacao} onChange={setContratacao} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>1º vencimento</Label>
                    <DateInput value={primeiro} onChange={setPrimeiro} />
                  </div>
                </div>
                {previa && (
                  <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                    Parcela estimada: <strong className="text-foreground">{brl(previa.parcela)}</strong> ·
                    Total a pagar: <strong className="text-foreground">{brl(previa.total)}</strong>
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                  {criar.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !lista?.length ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum contrato"
          description="Cadastre empréstimos e financiamentos para acompanhar parcelas, juros e impacto no fluxo de caixa."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card className="shadow-panel">
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
                {lista.map((e) => (
                  <TableRow
                    key={e.id}
                    className={sel === e.id ? "bg-muted/50" : "cursor-pointer"}
                    onClick={() => setSel(e.id)}
                  >
                    <TableCell>
                      <div className="font-medium">{e.descricao}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.tipo === "financiamento" ? "Financiamento" : "Empréstimo"}
                        {e.credor ? ` · ${e.credor}` : ""} · {dateBR(e.data_contratacao)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{brl(e.valor_principal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{e.parcelas}x</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="shadow-panel">
            {!emprestimoSel ? (
              <p className="p-6 text-sm text-muted-foreground">Selecione um contrato para ver as parcelas.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{emprestimoSel.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {emprestimoSel.parcelas}x · {Number(emprestimoSel.taxa_juros_mensal)}% a.m.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => gerarContasPagar.mutate(emprestimoSel.id)}
                      disabled={gerarContasPagar.isPending}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Gerar contas a pagar
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Excluir contrato" onClick={() => excluir.mutate(emprestimoSel.id)}>
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
                        <TableRow key={p.id}>
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
