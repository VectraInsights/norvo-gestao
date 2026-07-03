import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Plus, ShoppingCart, Trash2, MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type VendaStatus = Database["public"]["Enums"]["venda_status"];

export const Route = createFileRoute("/_authenticated/vendas/pedidos")({
  component: VendasPage,
});

type Item = {
  produto_id: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_pct: number;
};

function VendasPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const { data: vendas, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["vendas", empresa?.id, statusFilter],
    queryFn: async () => {
      let q = supabase.from("vendas")
        .select("*, cliente:contatos(nome), condicao:condicoes_pagamento(nome)")
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "todos") q = q.eq("status", statusFilter as VendaStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["vendas"] });
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["notas"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  };

  const mudarStatus = async (id: string, novo: VendaStatus) => {
    const { error } = await supabase.from("vendas").update({ status: novo }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Venda marcada como ${novo}`);
    invalidateAll();
  };

  return (
    <>
      <PageHeader
        eyebrow="Vendas & CRM"
        title="Pedidos e propostas"
        description="Proposta → pedido → faturamento. Ao faturar, o sistema baixa estoque, gera contas a receber e cria a nota fiscal."
        actions={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="proposta">Proposta</SelectItem>
                <SelectItem value="pedido">Pedido</SelectItem>
                <SelectItem value="faturado">Faturado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nova venda</Button></SheetTrigger>
              <NovaVendaSheet onClose={() => { setOpen(false); invalidateAll(); }} />
            </Sheet>
          </div>
        }
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : !vendas?.length ? (
        <EmptyState icon={ShoppingCart} title="Nenhuma venda ainda" description="Crie sua primeira proposta ou pedido para começar." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Condição</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendas.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="text-tabular font-medium">#{v.numero}</TableCell>
                  <TableCell>{v.cliente?.nome ?? "—"}</TableCell>
                  <TableCell className="text-tabular">{dateBR(v.data)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{v.condicao?.nome ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(v.total)}</TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {v.status === "rascunho" && <DropdownMenuItem onSelect={() => mudarStatus(v.id, "proposta")}>Enviar como proposta</DropdownMenuItem>}
                        {(v.status === "proposta" || v.status === "rascunho") && <DropdownMenuItem onSelect={() => mudarStatus(v.id, "pedido")}>Aprovar → Pedido</DropdownMenuItem>}
                        {v.status === "pedido" && <DropdownMenuItem onSelect={() => mudarStatus(v.id, "faturado")}>Faturar venda</DropdownMenuItem>}
                        {v.status !== "cancelado" && v.status !== "faturado" && <DropdownMenuItem className="text-destructive" onSelect={() => mudarStatus(v.id, "cancelado")}>Cancelar</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

function NovaVendaSheet({ onClose }: { onClose: () => void }) {
  const { data: empresa } = useEmpresaAtual();
  const [clienteId, setClienteId] = useState<string>("");
  const [condicaoId, setCondicaoId] = useState<string>("");
  const [observacoes, setObs] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: clientes } = useQuery({
    enabled: !!empresa, queryKey: ["contatos-clientes", empresa?.id],
    queryFn: async () => (await supabase.from("contatos").select("id,nome").eq("empresa_id", empresa!.id).in("tipo", ["cliente", "ambos"]).order("nome")).data ?? [],
  });
  const { data: condicoes } = useQuery({
    enabled: !!empresa, queryKey: ["condicoes", empresa?.id],
    queryFn: async () => (await supabase.from("condicoes_pagamento").select("id,nome").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome")).data ?? [],
  });
  const { data: produtos } = useQuery({
    enabled: !!empresa, queryKey: ["produtos-select", empresa?.id],
    queryFn: async () => (await supabase.from("produtos").select("id,nome,preco_venda").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome")).data ?? [],
  });

  const addItem = (produto_id: string) => {
    const p = produtos?.find((x) => x.id === produto_id);
    if (!p) return;
    setItens((s) => [...s, { produto_id: p.id, descricao: p.nome, quantidade: 1, preco_unitario: Number(p.preco_venda ?? 0), desconto_pct: 0 }]);
  };
  const updateItem = (i: number, patch: Partial<Item>) =>
    setItens((s) => s.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItens((s) => s.filter((_, idx) => idx !== i));

  const totals = useMemo(() => {
    const linhas = itens.map((it) => {
      const bruto = it.quantidade * it.preco_unitario;
      const desc = bruto * (it.desconto_pct / 100);
      return { bruto, desc, total: bruto - desc };
    });
    const subtotal = linhas.reduce((s, l) => s + l.bruto, 0);
    const desconto = linhas.reduce((s, l) => s + l.desc, 0);
    const total = subtotal - desconto;
    return { linhas, subtotal, desconto, total };
  }, [itens]);

  const salvar = async (status: "rascunho" | "proposta" | "pedido") => {
    if (!empresa) return;
    if (!clienteId) return toast.error("Selecione um cliente");
    if (!itens.length) return toast.error("Adicione ao menos um item");
    setSaving(true);
    const { data: venda, error: e1 } = await supabase.from("vendas").insert({
      empresa_id: empresa.id,
      cliente_id: clienteId,
      condicao_pagamento_id: condicaoId || null,
      observacoes: observacoes || null,
      status,
      subtotal: totals.subtotal,
      desconto: totals.desconto,
      total: totals.total,
    }).select("id").single();
    if (e1 || !venda) { setSaving(false); return toast.error(e1?.message ?? "Erro ao criar venda"); }

    const payload = itens.map((it, i) => ({
      venda_id: venda.id,
      produto_id: it.produto_id,
      descricao: it.descricao,
      quantidade: it.quantidade,
      preco_unitario: it.preco_unitario,
      desconto_pct: it.desconto_pct,
      desconto: totals.linhas[i].desc,
      total: totals.linhas[i].total,
    }));
    const { error: e2 } = await supabase.from("venda_itens").insert(payload);
    setSaving(false);
    if (e2) return toast.error(e2.message);
    toast.success("Venda criada");
    onClose();
  };

  return (
    <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
      <SheetHeader><SheetTitle>Nova venda</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condição de pagamento</Label>
            <Select value={condicaoId} onValueChange={setCondicaoId}>
              <SelectTrigger><SelectValue placeholder="À vista" /></SelectTrigger>
              <SelectContent>{condicoes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between">
            <Label>Itens</Label>
            <Select value="" onValueChange={addItem}>
              <SelectTrigger className="w-56"><SelectValue placeholder="+ Adicionar produto" /></SelectTrigger>
              <SelectContent>
                {produtos?.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} — {brl(p.preco_venda)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {itens.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum item — escolha um produto acima.</div>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="w-20">Qtd</TableHead><TableHead className="w-28">Preço</TableHead><TableHead className="w-20">Desc%</TableHead><TableHead className="w-28 text-right">Total</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                <TableBody>
                  {itens.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{it.descricao}</TableCell>
                      <TableCell><Input type="number" step="0.001" value={it.quantidade} onChange={(e) => updateItem(i, { quantidade: Number(e.target.value) })} className="h-8" /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={it.preco_unitario} onChange={(e) => updateItem(i, { preco_unitario: Number(e.target.value) })} className="h-8" /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={it.desconto_pct} onChange={(e) => updateItem(i, { desconto_pct: Number(e.target.value) })} className="h-8" /></TableCell>
                      <TableCell className="text-right text-tabular">{brl(totals.linhas[i].total)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={3} value={observacoes} onChange={(e) => setObs(e.target.value)} />
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="text-tabular">{brl(totals.subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span className="text-tabular">− {brl(totals.desconto)}</span></div>
          <div className="mt-1 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="text-tabular text-lg">{brl(totals.total)}</span></div>
        </div>
      </div>
      <SheetFooter className="mt-4 flex-row gap-2 sm:justify-end">
        <Button variant="outline" disabled={saving} onClick={() => salvar("rascunho")}>Salvar rascunho</Button>
        <Button variant="secondary" disabled={saving} onClick={() => salvar("proposta")}>Enviar proposta</Button>
        <Button disabled={saving} onClick={() => salvar("pedido")}>Criar pedido</Button>
      </SheetFooter>
    </SheetContent>
  );
}
