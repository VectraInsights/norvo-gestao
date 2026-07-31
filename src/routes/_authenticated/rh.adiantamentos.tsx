import { createFileRoute } from "@tanstack/react-router";
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
import { HandCoins, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/rh/adiantamentos")({
  component: AdiantamentosPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type Adiantamento = {
  id: string; colaborador_id: string | null; data: string; valor: number;
  motivo: string | null; parcelas_desconto: number; status: string; lancamento_id: string | null;
  colaboradores?: { nome: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em aberto", descontado: "Descontado", cancelado: "Cancelado",
};

function AdiantamentosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [colaborador, setColaborador] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [parcelas, setParcelas] = useState("1");

  const { data: colabs = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores-ativos", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("colaboradores" as never)
        .select("id,nome").eq("empresa_id", empresa!.id).eq("status", "ativo").order("nome");
      return (data ?? []) as unknown as { id: string; nome: string }[];
    },
  });

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["adiantamentos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("adiantamentos" as never)
        .select("*, colaboradores:colaborador_id(nome)")
        .eq("empresa_id", empresa!.id).order("data", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Adiantamento[];
    },
  });

  const emAberto = (lista ?? []).filter((a) => a.status === "aberto")
    .reduce((s, a) => s + Number(a.valor), 0);

  const reset = () => {
    setColaborador(""); setValor("0"); setMotivo(""); setParcelas("1");
    setData(format(new Date(), "yyyy-MM-dd"));
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!colaborador) throw new Error("Selecione o colaborador");
      if ((Number(valor) || 0) <= 0) throw new Error("Informe o valor");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("adiantamentos" as never) as any).insert({
        empresa_id: empresa.id, colaborador_id: colaborador, data,
        valor: Number(valor) || 0, motivo: motivo || null,
        parcelas_desconto: Math.max(1, Number(parcelas) || 1),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adiantamento registrado");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarPagamento = useMutation({
    mutationFn: async (a: Adiantamento) => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (a.lancamento_id) throw new Error("Adiantamento já lançado no financeiro");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lanc, error } = await (supabase.from("lancamentos_financeiros") as any).insert({
        empresa_id: empresa.id, tipo: "pagar", status: "aberto",
        descricao: `Adiantamento — ${a.colaboradores?.nome ?? "colaborador"}`,
        valor: a.valor, data_emissao: a.data, data_vencimento: a.data,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("adiantamentos" as never)
        .update({ lancamento_id: lanc.id } as never).eq("id", a.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Conta a pagar gerada");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarDescontado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("adiantamentos" as never)
        .update({ status: "descontado" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adiantamento marcado como descontado");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("adiantamentos" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adiantamento excluído");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="DP"
        title="Adiantamentos"
        description="Adiantamentos a colaboradores, com desconto parcelado e integração com contas a pagar."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> Novo adiantamento</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Novo adiantamento</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label>Colaborador</Label>
                  <Select value={colaborador} onValueChange={setColaborador}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Data</Label>
                    <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor</Label>
                    <MoneyInput value={valor} onChange={setValor} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Parcelas</Label>
                    <Input type="number" min={1} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                  {criar.isPending ? "Salvando..." : "Registrar"}
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
          icon={HandCoins}
          title="Nenhum adiantamento"
          description="Registre adiantamentos salariais e acompanhe o desconto em folha."
        />
      ) : (
        <Card className="shadow-panel">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{lista.length} registro(s)</span>
            <span className="font-semibold">Em aberto: {brl(emAberto)}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Parcelas</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.colaboradores?.nome ?? "—"}</TableCell>
                  <TableCell>{dateBR(a.data)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">{a.motivo ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{brl(a.valor)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.parcelas_desconto}x</TableCell>
                  <TableCell><Badge variant="secondary">{STATUS_LABEL[a.status] ?? a.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon" variant="ghost" aria-label="Gerar conta a pagar"
                      disabled={!!a.lancamento_id || gerarPagamento.isPending}
                      onClick={() => gerarPagamento.mutate(a)}
                    >
                      <HandCoins className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" aria-label="Marcar como descontado"
                      disabled={a.status !== "aberto"}
                      onClick={() => marcarDescontado.mutate(a.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir.mutate(a.id)}>
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
