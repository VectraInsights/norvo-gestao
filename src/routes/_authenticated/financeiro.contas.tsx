import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Banknote, Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/contas")({
  component: ContasBancarias,
});

function brl(n: number) { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function ContasBancarias() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", banco: "", agencia: "", conta: "", saldo_inicial: "0" });

  const { data: contas } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-bancarias", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias").select("*").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error; return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!empresa) return;
    const saldo = Number(form.saldo_inicial);
    const { error } = await supabase.from("contas_bancarias").insert({
      empresa_id: empresa.id, ...form, saldo_inicial: saldo, saldo_atual: saldo,
    });
    if (error) return toast.error(error.message);
    toast.success("Conta criada");
    setOpen(false); qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
  };

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Contas bancárias" description="Cadastro de contas e saldos para conciliação."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nova conta</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova conta bancária</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Nome</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Conta principal" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Banco</Label><Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                  <div><Label>Agência</Label><Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                  <div><Label>Conta</Label><Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></div>
                </div>
                <div><Label>Saldo inicial (R$)</Label><Input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} /></div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {!contas?.length ? (
        <EmptyState icon={Banknote} title="Sem contas bancárias" description="Cadastre suas contas para acompanhar saldos e realizar conciliação." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Banco</TableHead><TableHead>Ag/Conta</TableHead><TableHead className="text-right">Saldo atual</TableHead></TableRow></TableHeader>
            <TableBody>
              {contas.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.banco ?? "—"}</TableCell>
                  <TableCell className="text-tabular">{c.agencia}/{c.conta}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(c.saldo_atual)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
