import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShoppingCart, Plus, Trash2, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/compras")({
  component: Compras,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro ao carregar ordens de compra: {error.message}
    </div>
  ),
});

type OC = {
  id: string; numero: number | null; status: string; total: number;
  data_emissao: string; data_prevista: string | null;
  fornecedor_id: string | null; observacoes: string | null;
  conta_bancaria_id: string | null;
  contatos?: { nome: string } | null;
};

type ItemRow = { produto_id: string; quantidade: string; custo_unitario: string };

function Compras() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [fornecedor, setFornecedor] = useState<string>("");
  const [dataPrev, setDataPrev] = useState("");
  const [contaBanco, setContaBanco] = useState<string>("");
  const [obs, setObs] = useState("");
  const [itens, setItens] = useState<ItemRow[]>([{ produto_id: "", quantidade: "1", custo_unitario: "0" }]);

  const { data: ordens, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["ordens_compra", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_compra" as never)
        .select("*, contatos:fornecedor_id(nome)")
        .eq("empresa_id", empresa!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OC[];
    },
  });

  const { data: fornecedores = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-fornecedor", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("contatos").select("id,nome")
        .eq("empresa_id", empresa!.id).in("tipo", ["fornecedor", "ambos"]).order("nome");
      return data ?? [];
    },
  });

  const { data: produtos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos-oc", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("produtos")
        .select("id,nome,preco_custo").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: contas = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-oc", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("contas_bancarias").select("id,nome").eq("empresa_id", empresa!.id);
      return data ?? [];
    },
  });

  const totalPrevisto = useMemo(
    () => itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.custo_unitario || 0), 0),
    [itens],
  );

  const reset = () => {
    setFornecedor(""); setDataPrev(""); setContaBanco(""); setObs("");
    setItens([{ produto_id: "", quantidade: "1", custo_unitario: "0" }]);
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!fornecedor) throw new Error("Selecione um fornecedor");
      const validos = itens.filter((i) => i.produto_id && Number(i.quantidade) > 0);
      if (!validos.length) throw new Error("Adicione ao menos um item");

      const { data: oc, error } = await supabase.from("ordens_compra" as never).insert({
        empresa_id: empresa.id,
        fornecedor_id: fornecedor,
        data_prevista: dataPrev || null,
        conta_bancaria_id: contaBanco || null,
        observacoes: obs || null,
      } as never).select("id").single();
      if (error) throw error;

      const rows = validos.map((i) => ({
        ordem_id: (oc as { id: string }).id,
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        custo_unitario: Number(i.custo_unitario),
        subtotal: Number(i.quantidade) * Number(i.custo_unitario),
      }));
      const { error: e2 } = await supabase.from("ordens_compra_itens" as never).insert(rows as never);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Ordem de compra criada");
      qc.invalidateQueries({ queryKey: ["ordens_compra"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("ordens_compra" as never)
        .update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "recebida" ? "OC recebida — estoque e conta a pagar atualizados" : "Status atualizado");
      qc.invalidateQueries({ queryKey: ["ordens_compra"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ordens_compra" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ordem excluída");
      qc.invalidateQueries({ queryKey: ["ordens_compra"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-inventario"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const lista = (ordens ?? []).filter((o) => {
    if (!busca) return true;
    const s = busca.toLowerCase();
    return String(o.numero).includes(s) || o.contatos?.nome?.toLowerCase().includes(s);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Estoque"
        title="Ordens de compra"
        description="Cadastre compras, receba mercadoria e gere contas a pagar automaticamente."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Nova ordem</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>Nova ordem de compra</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Fornecedor</Label>
                    <Select value={fornecedor} onValueChange={setFornecedor}>
                      <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Previsão de entrega</Label>
                    <DateInput value={dataPrev} onChange={setDataPrev} />
                  </div>
                  <div>
                    <Label>Conta p/ pagamento</Label>
                    <Select value={contaBanco} onValueChange={setContaBanco}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Itens</Label>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setItens((r) => [...r, { produto_id: "", quantidade: "1", custo_unitario: "0" }])}>
                      <Plus className="mr-1 h-3 w-3" /> Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {itens.map((it, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_100px_140px_auto] items-end gap-2">
                        <Select value={it.produto_id} onValueChange={(v) => {
                          const prod = produtos.find((p) => p.id === v);
                          setItens((r) => r.map((x, i) => i === idx
                            ? { ...x, produto_id: v, custo_unitario: prod?.preco_custo ? String(prod.preco_custo) : x.custo_unitario }
                            : x));
                        }}>
                          <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                          <SelectContent>
                            {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" min="0" step="0.001" value={it.quantidade}
                          onChange={(e) => setItens((r) => r.map((x, i) => i === idx ? { ...x, quantidade: e.target.value } : x))} />
                        <MoneyInput value={it.custo_unitario}
                          onChange={(v) => setItens((r) => r.map((x, i) => i === idx ? { ...x, custo_unitario: v } : x))} />
                        <Button type="button" variant="ghost" size="icon"
                          onClick={() => setItens((r) => r.filter((_, i) => i !== idx))}
                          disabled={itens.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-right text-sm">
                    Total previsto: <span className="font-semibold text-tabular">{brl(totalPrevisto)}</span>
                  </div>
                </div>

                <div>
                  <Label>Observações</Label>
                  <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                  {criar.isPending ? "Salvando…" : "Criar ordem"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex max-w-sm">
        <Input placeholder="Buscar por número ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : lista.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nenhuma ordem de compra"
            description="Registre pedidos aos fornecedores para controlar entregas, estoque e pagamentos." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Prev. entrega</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">#{o.numero}</TableCell>
                  <TableCell>{o.contatos?.nome ?? "—"}</TableCell>
                  <TableCell>{dateBR(o.data_emissao)}</TableCell>
                  <TableCell>{dateBR(o.data_prevista)}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(o.total)}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {o.status === "rascunho" && (
                        <Button variant="outline" size="sm"
                          onClick={() => mudarStatus.mutate({ id: o.id, status: "enviada" })}>
                          Enviar
                        </Button>
                      )}
                      {(o.status === "rascunho" || o.status === "enviada") && (
                        <Button size="sm" onClick={() => mudarStatus.mutate({ id: o.id, status: "recebida" })}>
                          <Check className="mr-1 h-3 w-3" /> Receber
                        </Button>
                      )}
                      {o.status !== "cancelada" && o.status !== "recebida" && (
                        <Button variant="ghost" size="sm"
                          onClick={() => mudarStatus.mutate({ id: o.id, status: "cancelada" })}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir ordem #{o.numero}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os itens serão removidos. Movimentações de estoque e lançamentos já gerados NÃO serão apagados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluir.mutate(o.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
