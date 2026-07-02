import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque/produtos")({
  component: Produtos,
});

function brl(n: number) { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function Produtos() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: "", nome: "", unidade: "UN", preco_venda: "0", preco_custo: "0", estoque_atual: "0" });

  const { data: produtos } = useQuery({
    enabled: !!empresa, queryKey: ["produtos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error; return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!empresa) return;
    const { error } = await supabase.from("produtos").insert({
      empresa_id: empresa.id, ...form,
      preco_venda: Number(form.preco_venda), preco_custo: Number(form.preco_custo), estoque_atual: Number(form.estoque_atual),
    });
    if (error) return toast.error(error.message);
    toast.success("Produto criado"); setOpen(false);
    setForm({ codigo: "", nome: "", unidade: "UN", preco_venda: "0", preco_custo: "0", estoque_atual: "0" });
    qc.invalidateQueries({ queryKey: ["produtos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <>
      <PageHeader eyebrow="Estoque" title="Produtos" description="Cadastro de produtos, preços e saldos."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Novo produto</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
                  <div><Label>Nome</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Unidade</Label><Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} /></div>
                  <div><Label>Preço custo</Label><Input type="number" step="0.01" value={form.preco_custo} onChange={(e) => setForm({ ...form, preco_custo: e.target.value })} /></div>
                  <div><Label>Preço venda</Label><Input type="number" step="0.01" value={form.preco_venda} onChange={(e) => setForm({ ...form, preco_venda: e.target.value })} /></div>
                </div>
                <div><Label>Estoque inicial</Label><Input type="number" step="0.001" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })} /></div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {!produtos?.length ? (
        <EmptyState icon={Package} title="Nenhum produto" description="Cadastre seu primeiro produto para começar a movimentar o estoque." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>UN</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Venda</TableHead></TableRow></TableHeader>
            <TableBody>
              {produtos.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-tabular text-muted-foreground">{p.codigo ?? "—"}</TableCell>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{p.unidade}</TableCell>
                  <TableCell className="text-right text-tabular">{Number(p.estoque_atual).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(p.preco_custo)}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(p.preco_venda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
