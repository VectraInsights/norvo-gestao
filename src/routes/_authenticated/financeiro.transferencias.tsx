import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/erp/combobox";
import { ArrowLeftRight, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/transferencias")({
  component: TransferenciasPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm">
      Erro: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  ),
});

type Conta = { id: string; nome: string | null; banco: string | null; saldo_atual: number };
type Transferencia = {
  id: string; data: string; valor: number; descricao: string; observacoes: string | null;
  conta_origem_id: string; conta_destino_id: string;
};

function TransferenciasPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("0");
  const [descricao, setDescricao] = useState("Transferência entre contas");
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");

  const { data: contas = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-transf", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco,saldo_atual").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Conta[];
    },
  });

  const nomeConta = (id: string) => {
    const c = contas.find((x) => x.id === id);
    return c ? (c.nome || c.banco || "Conta") : "—";
  };

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["transferencias", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("transferencias_contas" as never)
        .select("id,empresa_id,data,conta_origem_id,conta_destino_id,valor,descricao,observacoes").eq("empresa_id", empresa!.id).order("data", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Transferencia[];
    },
  });

  const reset = () => {
    setOrigem(""); setDestino(""); setValor("0"); setObs("");
    setDescricao("Transferência entre contas"); setData(format(new Date(), "yyyy-MM-dd"));
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter((t) => {
      if (!q) return true;
      return (t.descricao || "").toLowerCase().includes(q)
        || (t.observacoes || "").toLowerCase().includes(q)
        || nomeConta(t.conta_origem_id).toLowerCase().includes(q)
        || nomeConta(t.conta_destino_id).toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, busca, contas]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!origem || !destino) throw new Error("Informe conta de origem e destino");
      if (origem === destino) throw new Error("Origem e destino devem ser diferentes");
      const v = Number(valor) || 0;
      if (v <= 0) throw new Error("Informe um valor maior que zero");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tr, error } = await (supabase.from("transferencias_contas" as never) as any).insert({
        empresa_id: empresa.id, data, conta_origem_id: origem, conta_destino_id: destino,
        valor: v, descricao: descricao || "Transferência entre contas", observacoes: obs || null,
      }).select("id").single();
      if (error) throw error;

      const base = {
        empresa_id: empresa.id, data_emissao: data, data_vencimento: data,
        status: "aberto", valor: v, transferencia_id: tr.id,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase.from("lancamentos_financeiros") as any).insert([
        { ...base, tipo: "pagar", conta_bancaria_id: origem, descricao: `${descricao} → ${nomeConta(destino)}` },
        { ...base, tipo: "receber", conta_bancaria_id: destino, descricao: `${descricao} ← ${nomeConta(origem)}` },
      ]);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Transferência registrada");
      qc.invalidateQueries({ queryKey: ["transferencias"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      qc.invalidateQueries({ queryKey: ["contas-transf"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // Desvincula do extrato antes de excluir (perna conciliada volta a "em aberto")
      const { data: pernas } = await supabase.from("lancamentos_financeiros")
        .select("id").eq("transferencia_id", id);
      const ids = (pernas ?? []).map((p: { id: string }) => p.id);
      if (ids.length) {
        const { error: eOfx } = await supabase.from("ofx_transacoes")
          .update({ status: "aberto", lancamento_id: null }).in("lancamento_id", ids);
        if (eOfx) throw eOfx;
      }
      const { error } = await supabase.from("transferencias_contas" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência excluída");
      qc.invalidateQueries({ queryKey: ["transferencias"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      qc.invalidateQueries({ queryKey: ["contas-transf"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Transferências entre contas"
        description="Registro de controle interno: move o saldo entre contas da mesma empresa (não executa TED/PIX no banco)."
      />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 rounded-xl pl-10 shadow-sm" placeholder="Buscar por descrição, conta de origem ou destino..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 rounded-xl px-4 text-sm shadow-sm transition-all hover:shadow-md active:scale-95"><Plus className="mr-1 h-3.5 w-3.5" /> Nova transferência</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
              <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">Nova transferência</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Data</Label>
                    <DateInput value={data} onChange={setData} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Valor</Label>
                    <MoneyInput value={valor} onChange={setValor} className="h-10" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Conta de origem</Label>
                    <Combobox value={origem} onChange={setOrigem} options={contas.map((c) => ({ value: c.id, label: `${c.nome || c.banco} · ${brl(c.saldo_atual)}` }))} placeholder="Selecione" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Conta de destino</Label>
                    <Combobox value={destino} onChange={setDestino} options={contas.filter((c) => c.id !== origem).map((c) => ({ value: c.id, label: `${c.nome || c.banco} · ${brl(c.saldo_atual)}` }))} placeholder="Selecione" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." className="h-10" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-10 rounded-xl" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Observações</Label>
                  <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className="h-10 rounded-xl" />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                  {criar.isPending ? "Salvando..." : "Transferir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : !filtrados?.length ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Nenhuma transferência"
          description={busca ? "Nada encontrado para a busca." : "Registre movimentações de saldo entre as contas financeiras da empresa."}
        />
      ) : (
        <Card className="overflow-hidden rounded-2xl shadow-panel">
          <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((t) => (
                <TableRow key={t.id} className="transition-colors hover:bg-accent/30">
                  <TableCell className="text-tabular">{dateBR(t.data)}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{t.descricao}</TableCell>
                  <TableCell className="text-muted-foreground">{nomeConta(t.conta_origem_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{nomeConta(t.conta_destino_id)}</TableCell>
                  <TableCell className="text-right font-medium text-tabular">{brl(t.valor)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon" aria-label="Excluir transferência"
                      className="h-8 w-8 rounded-lg"
                      onClick={() => excluir.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
