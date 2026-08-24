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
import { Percent, Plus, Trash2, HandCoins } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/rh/comissoes")({
  component: ComissoesPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type Comissao = {
  id: string; colaborador_id: string | null; competencia: string; descricao: string | null;
  base_valor: number; percentual: number; valor: number; status: string; lancamento_id: string | null;
  colaboradores?: { nome: string } | null;
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS_LABEL: Record<string, string> = {
  prevista: "Prevista", aprovada: "Aprovada", paga: "Paga", cancelada: "Cancelada",
};

function ComissoesPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);

  const [colaborador, setColaborador] = useState("");
  const [descricao, setDescricao] = useState("");
  const [base, setBase] = useState("0");
  const [percentual, setPercentual] = useState("0");

  const competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const valor = useMemo(
    () => ((Number(base) || 0) * (Number(percentual) || 0)) / 100,
    [base, percentual],
  );

  // Comissão é de motorista/freteiro: lista apenas colaboradores com cargo de motorista
  const { data: colabs = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores-motoristas", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("colaboradores" as never)
        .select("id,nome").eq("empresa_id", empresa!.id).eq("status", "ativo")
        .ilike("cargo", "%motorist%").order("nome");
      return (data ?? []) as unknown as { id: string; nome: string }[];
    },
  });

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["comissoes", empresa?.id, competencia],
    queryFn: async () => {
      const { data, error } = await supabase.from("comissoes" as never)
        .select("*, colaboradores:colaborador_id(nome)")
        .eq("empresa_id", empresa!.id).eq("competencia", competencia)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Comissao[];
    },
  });

  const total = (lista ?? []).reduce((s, c) => s + Number(c.valor), 0);
  const reset = () => { setColaborador(""); setDescricao(""); setBase("0"); setPercentual("0"); };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!colaborador) throw new Error("Selecione o colaborador");
      if (valor <= 0) throw new Error("Informe base e percentual");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("comissoes" as never) as any).insert({
        empresa_id: empresa.id, colaborador_id: colaborador, competencia,
        descricao: descricao || null, base_valor: Number(base) || 0,
        percentual: Number(percentual) || 0, valor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comissão lançada");
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarPagamento = useMutation({
    mutationFn: async (c: Comissao) => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (c.lancamento_id) throw new Error("Comissão já lançada no financeiro");
      const nome = c.colaboradores?.nome ?? "colaborador";
      // categoria "Comissões" (cria se não existir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cats } = await (supabase.from("categorias_financeiras") as any)
        .select("id").eq("empresa_id", empresa.id).eq("tipo", "pagar").eq("nome", "Comissões").limit(1);
      let catId: string | null = cats?.[0]?.id ?? null;
      if (!catId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: nc, error: eCat } = await (supabase.from("categorias_financeiras") as any)
          .insert({ empresa_id: empresa.id, nome: "Comissões", tipo: "pagar" })
          .select("id").single();
        if (eCat) throw eCat;
        catId = nc.id;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lanc, error } = await (supabase.from("lancamentos_financeiros") as any).insert({
        empresa_id: empresa.id, tipo: "pagar", status: "aberto",
        descricao: `${nome} — ${MESES[mes - 1]}/${ano}`.trim(),
        valor: c.valor, data_emissao: format(new Date(), "yyyy-MM-dd"),
        data_vencimento: format(new Date(ano, mes, 5), "yyyy-MM-dd"),
        categoria_id: catId,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("comissoes" as never)
        .update({ lancamento_id: lanc.id, status: "aprovada" } as never).eq("id", c.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Conta a pagar gerada");
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comissoes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comissão excluída");
      qc.invalidateQueries({ queryKey: ["comissoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="DP"
        title="Comissões"
        description="Cálculo de comissões por colaborador e competência, com geração de contas a pagar."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-1.5 h-4 w-4" /> Nova comissão</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Nova comissão · {MESES[mes - 1]}/{ano}</DialogTitle></DialogHeader>
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label>Colaborador (motoristas)</Label>
                    <Select value={colaborador} onValueChange={setColaborador}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {colabs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum motorista ativo com cargo cadastrado — cadastre em DP → Colaboradores.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: vendas do mês" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Base de cálculo</Label>
                      <MoneyInput value={base} onChange={setBase} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Percentual (%)</Label>
                      <Input type="number" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
                    </div>
                  </div>
                  <p className="rounded-md bg-muted/50 p-3 text-sm">
                    Comissão: <strong>{brl(valor)}</strong>
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                    {criar.isPending ? "Salvando..." : "Lançar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !lista?.length ? (
        <EmptyState
          icon={Percent}
          title="Nenhuma comissão nesta competência"
          description="Lance comissões por colaborador e gere as contas a pagar automaticamente."
        />
      ) : (
        <Card className="shadow-panel">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{lista.length} comissão(ões)</span>
            <span className="font-semibold">Total: {brl(total)}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.colaboradores?.nome ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                  <TableCell className="text-right">{brl(c.base_valor)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{Number(c.percentual)}%</TableCell>
                  <TableCell className="text-right font-medium">{brl(c.valor)}</TableCell>
                  <TableCell><Badge variant="secondary">{STATUS_LABEL[c.status] ?? c.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon" variant="ghost" aria-label="Gerar conta a pagar"
                      disabled={!!c.lancamento_id || gerarPagamento.isPending}
                      onClick={() => gerarPagamento.mutate(c)}
                    >
                      <HandCoins className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir.mutate(c.id)}>
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
