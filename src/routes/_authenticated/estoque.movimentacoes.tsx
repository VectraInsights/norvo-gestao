import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Boxes, Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR, num } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type MovTipo = Database["public"]["Enums"]["estoque_movimento"];

type ProdutoSelect = { id: string; nome: string; unidade: string | null; estoque_atual: number | null };

type Movimentacao = {
  id: string;
  data: string;
  tipo: MovTipo;
  quantidade: number;
  custo_unitario: number | null;
  observacoes: string | null;
  produto: { nome: string | null; unidade: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes")({
  component: Movimentacoes,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Não foi possível carregar as movimentações: {error.message}
    </div>
  ),
});

const TIPO_COLOR: Record<MovTipo, string> = {
  entrada: "bg-success/15 text-success",
  saida: "bg-destructive/10 text-destructive",
  ajuste: "bg-warning/20 text-warning-foreground",
  transferencia: "bg-primary/15 text-primary",
};

const EMPTY_FORM = {
  produto_id: "",
  tipo: "entrada" as MovTipo,
  quantidade: "1",
  custo_unitario: "0",
  observacoes: "",
};

function Movimentacoes() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: movs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["movs", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select("id,data,tipo,quantidade,custo_unitario,observacoes,produto:produtos(nome,unidade)")
        .eq("empresa_id", empresa!.id)
        .order("data", { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Movimentacao[];
    },
  });

  const { data: produtos } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos-select-mov", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,nome,unidade,estoque_atual")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as ProdutoSelect[];
    },
  });

  const registrarMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!form.produto_id) throw new Error("Selecione um produto");
      const qtd = Number(form.quantidade);
      if (!qtd || Number.isNaN(qtd)) throw new Error("Quantidade obrigatória");
      if (form.tipo !== "ajuste" && qtd <= 0) throw new Error("Quantidade deve ser positiva");
      const prod = produtos?.find((p) => p.id === form.produto_id);
      if (form.tipo === "saida" && prod && Number(prod.estoque_atual ?? 0) < qtd) {
        throw new Error(`Estoque insuficiente (atual: ${num(prod.estoque_atual ?? 0)})`);
      }
      const custo = Number(form.custo_unitario);
      const { error } = await supabase.from("movimentacoes_estoque").insert({
        empresa_id: empresa.id,
        produto_id: form.produto_id,
        tipo: form.tipo,
        quantidade: qtd,
        custo_unitario: custo || null,
        observacoes: form.observacoes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimentação registrada");
      setOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    registrarMut.mutate();
  };

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Movimentações"
        description="Entradas, saídas e ajustes de inventário."
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!registrarMut.isPending) setOpen(v); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" />Nova movimentação</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label>Produto</Label>
                  <Select value={form.produto_id} onValueChange={(v) => setForm({ ...form, produto_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {produtos?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} · estoque {num(p.estoque_atual ?? 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as MovTipo })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                        <SelectItem value="ajuste">Ajuste (± com sinal)</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" step="0.001" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                  </div>
                  <div>
                    <Label>Custo unit.</Label>
                    <MoneyInput value={form.custo_unitario} onChange={(v) => setForm({ ...form, custo_unitario: v })} prefix="" />
                  </div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={registrarMut.isPending}>
                    {registrarMut.isPending ? "Registrando…" : "Registrar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </Card>
      ) : !movs?.length ? (
        <EmptyState icon={Boxes} title="Sem movimentações" description="Registre a primeira entrada de compras ou ajuste de inventário." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead>Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movs.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-tabular">{dateBR(m.data)}</TableCell>
                  <TableCell className="font-medium">{m.produto?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={TIPO_COLOR[m.tipo]} variant="secondary">{m.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-tabular">
                    {num(m.quantidade)} {m.produto?.unidade ?? ""}
                  </TableCell>
                  <TableCell className="text-right text-tabular">
                    {m.custo_unitario ? brl(m.custo_unitario) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.observacoes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
