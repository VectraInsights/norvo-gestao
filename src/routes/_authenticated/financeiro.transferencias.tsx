import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransferenciaDialog } from "@/components/erp/transferencia-dialog";
import { ArrowLeftRight, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

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
          <Button size="sm" onClick={() => setOpen(true)} className="h-9 rounded-xl px-4 text-sm shadow-sm transition-all hover:shadow-md active:scale-95"><Plus className="mr-1 h-3.5 w-3.5" /> Nova transferência</Button>
          <TransferenciaDialog open={open} onOpenChange={setOpen} />
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
