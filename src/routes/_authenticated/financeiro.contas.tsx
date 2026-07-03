import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, Upload, Loader2, Link2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect } from "react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { parseOfx } from "@/lib/ofx";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/contas")({
  component: ContasBancarias,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ContaBancaria = {
  id: string; nome: string | null; banco: string | null;
  agencia: string | null; conta: string | null; saldo_atual: number;
};

type OfxRow = {
  id: string; data_transacao: string; valor: number; tipo: string;
  memo: string | null; status: string; lancamento_id: string | null;
};

function ContasBancarias() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ banco: "", agencia: "", conta: "", saldo_inicial: "0" });
  const [autoConciliar, setAutoConciliar] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadContaId, setUploadContaId] = useState<string | null>(null);

  const { data: contas } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-bancarias", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<ContaBancaria[]> => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco,agencia,conta,saldo_atual")
        .eq("empresa_id", empresa!.id).order("nome").abortSignal(signal);
      if (error) throw error; return (data ?? []) as ContaBancaria[];
    },
  });

  const criar = useMutation({
    mutationFn: async (input: typeof form) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const saldo = Number(input.saldo_inicial);
      const { error } = await supabase.from("contas_bancarias").insert({
        empresa_id: empresa.id, ...input, nome: input.banco, saldo_inicial: saldo, saldo_atual: saldo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta criada"); setOpen(false);
      setForm({ banco: "", agencia: "", conta: "", saldo_inicial: "0" });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerUpload = (contaId: string) => {
    setUploadContaId(contaId);
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadContaId || !empresa) return;
    setImporting(uploadContaId);
    try {
      const text = await file.text();
      const txs = parseOfx(text);
      if (!txs.length) { toast.error("Nenhuma transação encontrada no OFX"); return; }
      const rows = txs.map((t) => ({
        empresa_id: empresa.id,
        conta_bancaria_id: uploadContaId,
        fitid: t.fitid,
        data_transacao: t.data,
        valor: t.valor,
        tipo: t.tipo,
        memo: t.memo,
      }));
      const { error, count } = await supabase.from("ofx_transacoes")
        .upsert(rows, { onConflict: "conta_bancaria_id,fitid", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      toast.success(`${count ?? rows.length} transações importadas`);
      qc.invalidateQueries({ queryKey: ["ofx", uploadContaId] });
      setReconcilingId(uploadContaId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar OFX");
    } finally {
      setImporting(null);
      setUploadContaId(null);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".ofx,.OFX,text/plain" className="hidden" onChange={handleFile} />
      <PageHeader eyebrow="Financeiro" title="Contas bancárias" description="Cadastro de contas, importação OFX e conciliação."
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nova conta</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova conta bancária</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); criar.mutate(form); }} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Banco</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} placeholder="Bradesco" /></div>
                  <div><Label>Agência</Label><Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                  <div><Label>Conta</Label><Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></div>
                </div>
                <div><Label>Saldo inicial (R$)</Label><Input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} /></div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending}>
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {!contas?.length ? (
        <EmptyState icon={Banknote} title="Sem contas bancárias" description="Cadastre suas contas para acompanhar saldos e realizar conciliação." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Banco</TableHead><TableHead>Ag/Conta</TableHead>
              <TableHead className="text-right">Saldo atual</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {contas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.banco ?? "—"}</TableCell>
                  <TableCell className="text-tabular">{c.agencia ?? "—"}/{c.conta ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(c.saldo_atual)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" disabled={importing === c.id} onClick={() => triggerUpload(c.id)}>
                      {importing === c.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                      Importar OFX
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setReconcilingId(c.id)}>
                      <Link2 className="mr-1 h-3 w-3" />Conciliar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ReconcileDialog
        contaId={reconcilingId}
        empresaId={empresa?.id ?? null}
        onClose={() => setReconcilingId(null)}
      />
    </>
  );
}

function ReconcileDialog({ contaId, empresaId, onClose }: { contaId: string | null; empresaId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!contaId;

  const { data: txs, isLoading } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["ofx", contaId] as const,
    queryFn: async (): Promise<OfxRow[]> => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("id,data_transacao,valor,tipo,memo,status,lancamento_id")
        .eq("conta_bancaria_id", contaId!).order("data_transacao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lancamentosAbertos } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["lanc-abertos", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos_financeiros")
        .select("id,descricao,valor,tipo,data_vencimento")
        .eq("empresa_id", empresaId!).in("status", ["aberto", "vencido", "parcial"])
        .order("data_vencimento").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const conciliar = useMutation({
    mutationFn: async ({ ofxId, lancamentoId, valor }: { ofxId: string; lancamentoId: string; valor: number }) => {
      const { error: e1 } = await supabase.from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: Math.abs(valor), data_pagamento: format(new Date(), "yyyy-MM-dd"), conta_bancaria_id: contaId })
        .eq("id", lancamentoId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lancamentoId }).eq("id", ofxId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Transação conciliada");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarLanc = useMutation({
    mutationFn: async (tx: OfxRow) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      const tipo = tx.valor >= 0 ? "receber" : "pagar";
      const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresaId, tipo, descricao: tx.memo || "Importado OFX",
        valor: Math.abs(tx.valor), valor_pago: Math.abs(tx.valor),
        data_emissao: tx.data_transacao, data_vencimento: tx.data_transacao,
        data_pagamento: tx.data_transacao, status: "pago", conta_bancaria_id: contaId,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lanc.id }).eq("id", tx.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Lançamento criado e conciliado");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Conciliação bancária</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : !txs?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma transação importada. Use "Importar OFX" para começar.
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Memo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vincular</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {txs.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-tabular whitespace-nowrap">
                    {format(new Date(tx.data_transacao), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-sm">{tx.memo ?? "—"}</TableCell>
                  <TableCell className={`text-right text-tabular ${tx.valor < 0 ? "text-destructive" : "text-success"}`}>
                    {brl(tx.valor)}
                  </TableCell>
                  <TableCell>
                    {tx.status === "conciliada" ? (
                      <Badge variant="secondary" className="bg-success/15 text-success"><Check className="mr-1 h-3 w-3" />Conciliada</Badge>
                    ) : (
                      <div className="flex gap-2">
                        <Select onValueChange={(v) => conciliar.mutate({ ofxId: tx.id, lancamentoId: v, valor: tx.valor })}>
                          <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Vincular lançamento" /></SelectTrigger>
                          <SelectContent>
                            {lancamentosAbertos?.filter((l) => Math.abs(Number(l.valor) - Math.abs(tx.valor)) < 0.01)
                              .concat(lancamentosAbertos?.filter((l) => Math.abs(Number(l.valor) - Math.abs(tx.valor)) >= 0.01) ?? [])
                              .map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {format(new Date(l.data_vencimento), "dd/MM")} — {l.descricao} ({brl(Number(l.valor))})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => criarLanc.mutate(tx)}>
                          Novo
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
