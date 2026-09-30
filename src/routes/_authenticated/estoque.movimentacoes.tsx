import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Combobox } from "@/components/erp/combobox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Boxes, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR, num } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type MovTipo = Database["public"]["Enums"]["estoque_movimento"];

type ProdutoSelect = {
  id: string;
  nome: string;
  unidade: string | null;
  estoque_atual: number | null;
};

type Movimentacao = {
  id: string;
  data: string;
  tipo: MovTipo;
  quantidade: number;
  custo_unitario: number | null;
  observacoes: string | null;
  produto: { nome: string | null; unidade: string | null } | null;
  deposito: { nome: string } | null;
};

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes")({
  component: Movimentacoes,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
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
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [trOpen, setTrOpen] = useState(false);
  const [tr, setTr] = useState({
    produto_id: "",
    quantidade: "1",
    origem: "",
    destino: "",
    obs: "",
  });

  const { data: movs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["movs", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select(
          "id,data,tipo,quantidade,custo_unitario,observacoes,produto:produtos(nome,unidade),deposito:depositos(nome)",
        )
        .eq("empresa_id", empresa!.id)
        .order("data", { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Movimentacao[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (movs ?? []).filter((m) => {
      if (!q) return true;
      return (m.produto?.nome || "").toLowerCase().includes(q)
        || (m.tipo || "").toLowerCase().includes(q)
        || (m.deposito?.nome || "").toLowerCase().includes(q)
        || (m.observacoes || "").toLowerCase().includes(q);
    });
  }, [movs, busca]);

  const { data: depositos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["depositos-mov", empresa?.id],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("depositos")
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
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
        .limit(1000)
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

  const transferirMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!tr.produto_id) throw new Error("Selecione um produto");
      if (!tr.origem || !tr.destino) throw new Error("Selecione origem e destino");
      if (tr.origem === tr.destino) throw new Error("Origem e destino devem ser diferentes");
      const qtd = Number(tr.quantidade.replace(",", "."));
      if (!qtd || qtd <= 0) throw new Error("Quantidade deve ser positiva");
      const { data, error } = await supabase.rpc(
        "transferir_estoque" as never,
        {
          _produto: tr.produto_id,
          _quantidade: qtd,
          _deposito_origem: tr.origem,
          _deposito_destino: tr.destino,
          _observacao: tr.obs.trim() || null,
        } as never,
      );
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },
    onSuccess: (ref) => {
      toast.success(ref ? `${ref} concluída` : "Transferência registrada");
      setTrOpen(false);
      setTr({ produto_id: "", quantidade: "1", origem: "", destino: "", obs: "" });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomeDeposito = (id: string) => depositos.find((d) => d.id === id)?.nome;

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Movimentações"
        description="Entradas, saídas e ajustes de invent��rio."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por produto, depósito ou observação..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
            <Dialog
              open={trOpen}
              onOpenChange={(v) => {
                if (!transferirMut.isPending) setTrOpen(v);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowLeftRight className="mr-1 h-4 w-4" />
                  Transferir
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transferir entre depósitos</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    transferirMut.mutate();
                  }}
                  className="space-y-3"
                >
                  <div>
                    <Label>Produto</Label>
                    <Combobox
                      value={tr.produto_id}
                      onChange={(v) => setTr({ ...tr, produto_id: v })}
                      options={(produtos ?? []).map((p) => ({ value: p.id, label: `${p.nome} · estoque ${num(p.estoque_atual ?? 0)}` }))}
                      placeholder="Selecione"
                      searchPlaceholder="Digite para buscar..."
                      emptyText="Nenhum item encontrado."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>De (origem)</Label>
                      <Combobox value={tr.origem} onChange={(v) => setTr({ ...tr, origem: v })} options={depositos.map((d) => ({ value: d.id, label: d.nome }))} placeholder="Selecione" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." />
                    </div>
                    <div>
                      <Label>Para (destino)</Label>
                      <Combobox
                        value={tr.destino}
                        onChange={(v) => setTr({ ...tr, destino: v })}
                        options={depositos.map((d) => ({ value: d.id, label: d.nome }))}
                        placeholder="Selecione"
                        searchPlaceholder="Digite para buscar..."
                        emptyText="Nenhum item encontrado."
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <MoneyInput prefix="" decimals={3} value={tr.quantidade} onChange={(v) => setTr({ ...tr, quantidade: v })} />
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Textarea
                      rows={2}
                      value={tr.obs}
                      onChange={(e) => setTr({ ...tr, obs: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={transferirMut.isPending}>
                      {transferirMut.isPending ? "Transferindo…" : "Confirmar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                if (!registrarMut.isPending) setOpen(v);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />
                  Nova movimentação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova movimentação</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                  <div>
                    <Label>Produto</Label>
                    <Combobox
                      value={form.produto_id}
                      onChange={(v) => setForm({ ...form, produto_id: v })}
                      options={(produtos ?? []).map((p) => ({ value: p.id, label: `${p.nome} · estoque ${num(p.estoque_atual ?? 0)}` }))}
                      placeholder="Selecione"
                      searchPlaceholder="Digite para buscar..."
                      emptyText="Nenhum item encontrado."
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={form.tipo}
                        onValueChange={(v) => setForm({ ...form, tipo: v as MovTipo })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                          <SelectItem value="ajuste">Ajuste (± com sinal)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Quantidade</Label>
                      <MoneyInput prefix="" decimals={3} value={form.quantidade} onChange={(v) => setForm({ ...form, quantidade: v })} />
                    </div>
                    <div>
                      <Label>Custo unit.</Label>
                      <MoneyInput
                        value={form.custo_unitario}
                        onChange={(v) => setForm({ ...form, custo_unitario: v })}
                        prefix=""
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea
                      rows={2}
                      value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={registrarMut.isPending}>
                      {registrarMut.isPending ? "Registrando…" : "Registrar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !filtrados?.length ? (
        <EmptyState
          icon={Boxes}
          title="Sem movimentações"
          description={busca ? "Nada encontrado para a busca." : "Registre a primeira entrada de compras ou ajuste de inventário."}
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead>Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-tabular">{dateBR(m.data)}</TableCell>
                  <TableCell className="font-medium">{m.produto?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={TIPO_COLOR[m.tipo]} variant="secondary">
                      {m.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.deposito?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-tabular">
                    {num(m.quantidade)} {m.produto?.unidade ?? ""}
                  </TableCell>
                  <TableCell className="text-right text-tabular">
                    {m.custo_unitario ? brl(m.custo_unitario) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.observacoes ?? "—"}
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
