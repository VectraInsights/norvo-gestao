import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/erp/money-input";
import { DateInput } from "@/components/erp/date-input";
import { Combobox } from "@/components/erp/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { format } from "date-fns";

type Conta = { id: string; nome: string | null; banco: string | null; saldo_atual: number };

// Diálogo compartilhado de transferência entre contas (mesma empresa).
// As pernas nascem `aberto` para aparecerem na conciliação.
export function TransferenciaDialog({
  open,
  onOpenChange,
  origemInicial = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  origemInicial?: string;
}) {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [origem, setOrigem] = useState(origemInicial);
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

  const reset = () => {
    setOrigem(origemInicial); setDestino(""); setValor("0"); setObs("");
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
      onOpenChange(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
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
  );
}
