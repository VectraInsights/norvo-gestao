import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { DateInput } from "@/components/erp/date-input";
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
import { HandCoins, Plus, Trash2 } from "lucide-react";
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
  motivo: string | null; recorrente: boolean; dia_recorrente: number | null;
  status: string; lancamento_id: string | null;
  colaboradores?: { nome: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Em aberto", descontado: "Pago", cancelado: "Cancelado",
};

function AdiantamentosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [colaborador, setColaborador] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [valor, setValor] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [diaRec, setDiaRec] = useState("20");

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
    setColaborador(""); setValor("0"); setMotivo("");
    setRecorrente(false); setDiaRec("20");
    setData(format(new Date(), "yyyy-MM-dd"));
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!colaborador) throw new Error("Selecione o colaborador");
      if ((Number(valor) || 0) <= 0) throw new Error("Informe o valor");
      if (recorrente && !(Number(diaRec) >= 1 && Number(diaRec) <= 31))
        throw new Error("Escolha o dia do mês do adiantamento recorrente");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("adiantamentos" as never) as any).insert({
        empresa_id: empresa.id, colaborador_id: colaborador, data,
        valor: Number(valor) || 0, motivo: motivo || null,
        recorrente,
        dia_recorrente: recorrente ? Number(diaRec) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(recorrente
        ? `Adiantamento recorrente criado — conta gerada automaticamente todo dia ${diaRec}`
        : "Adiantamento registrado");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
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
        description="Adiantamentos a colaboradores com integração automática ao contas a pagar — o status acompanha a baixa/conciliação do lançamento."
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
                <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={recorrente}
                    onChange={(e) => setRecorrente(e.target.checked)}
                  />
                  <span>
                    Recorrente mensal
                    <span className="block text-xs text-muted-foreground">
                      Gera automaticamente a conta a pagar todo mês no dia escolhido (ex.: adiantamento previsto em CLT/contrato).
                    </span>
                  </span>
                </label>
                {recorrente && (
                  <div className="space-y-1.5">
                    <Label>Dia do pagamento</Label>
                    <Select value={diaRec} onValueChange={setDiaRec}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-56">
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>Todo dia {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {Number(diaRec) >= 29 && (
                      <p className="text-xs text-muted-foreground">
                        Em meses sem dia {diaRec}, a conta é gerada no último dia do mês.
                      </p>
                    )}
                  </div>
                )}
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
          description="Registre adiantamentos salariais — avulsos ou recorrentes mensais."
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
                <TableHead>Recorrência</TableHead>
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
                  <TableCell>
                    {a.recorrente ? (
                      <Badge variant="secondary">Todo dia {a.dia_recorrente}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Avulso</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{STATUS_LABEL[a.status] ?? a.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon" variant="ghost" aria-label="Gerar conta a pagar"
                      title={a.recorrente
                        ? "Recorrente: as contas são geradas automaticamente pelo sistema"
                        : a.lancamento_id ? "Já lançado no financeiro" : "Gerar conta a pagar"}
                      disabled={!!a.lancamento_id || a.recorrente || gerarPagamento.isPending}
                      onClick={() => gerarPagamento.mutate(a)}
                    >
                      <HandCoins className="h-4 w-4" />
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
