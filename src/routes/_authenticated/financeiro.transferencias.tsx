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
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/transferencias")({
  component: TransferenciasPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
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
    queryFn: async () => {
      const { data, error } = await supabase.from("transferencias_contas" as never)
        .select("*").eq("empresa_id", empresa!.id).order("data", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Transferencia[];
    },
  });

  const reset = () => {
    setOrigem(""); setDestino(""); setValor("0"); setObs("");
    setDescricao("Transferência entre contas"); setData(format(new Date(), "yyyy-MM-dd"));
  };

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
        empresa_id: empresa.id, data_emissao: data, data_vencimento: data, data_pagamento: data,
        status: "pago", valor: v, valor_pago: v, transferencia_id: tr.id,
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
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> Nova transferência</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Nova transferência</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Data</Label>
                    <DateInput value={data} onChange={setData} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor</Label>
                    <MoneyInput value={valor} onChange={setValor} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Conta de origem</Label>
                    <Select value={origem} onValueChange={setOrigem}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome || c.banco} · {brl(c.saldo_atual)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Conta de destino</Label>
                    <Select value={destino} onValueChange={setDestino}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {contas.filter((c) => c.id !== origem).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome || c.banco} · {brl(c.saldo_atual)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                  {criar.isPending ? "Salvando..." : "Transferir"}
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
          icon={ArrowLeftRight}
          title="Nenhuma transferência"
          description="Registre movimentações de saldo entre as contas financeiras da empresa."
        />
      ) : (
        <Card className="shadow-panel">
          <Table>
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
              {lista.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{dateBR(t.data)}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{t.descricao}</TableCell>
                  <TableCell>{nomeConta(t.conta_origem_id)}</TableCell>
                  <TableCell>{nomeConta(t.conta_destino_id)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(t.valor)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon" aria-label="Excluir transferência"
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
