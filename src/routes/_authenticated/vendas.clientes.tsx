import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vendas/clientes")({
  component: Clientes,
});

function Clientes() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", documento: "", email: "", telefone: "", tipo: "cliente" as "cliente" | "fornecedor" | "ambos" | "transportadora" });

  const { data: contatos } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contatos").select("*").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error; return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!empresa) return;
    const { error } = await supabase.from("contatos").insert({ empresa_id: empresa.id, ...form });
    if (error) return toast.error(error.message);
    toast.success("Contato criado"); setOpen(false);
    setForm({ nome: "", documento: "", email: "", telefone: "", tipo: "cliente" });
    qc.invalidateQueries({ queryKey: ["contatos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Clientes e fornecedores" description="Cadastro unificado de contatos."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Novo contato</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Nome / Razão social</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label>
                    <Select value={form.tipo} onValueChange={(v: any) => setForm({ ...form, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cliente">Cliente</SelectItem>
                        <SelectItem value="fornecedor">Fornecedor</SelectItem>
                        <SelectItem value="ambos">Ambos</SelectItem>
                        <SelectItem value="transportadora">Transportadora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>CPF/CNPJ</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {!contatos?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description="Cadastre clientes, fornecedores e transportadoras." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead></TableRow></TableHeader>
            <TableBody>
              {contatos.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{c.tipo}</TableCell>
                  <TableCell className="text-tabular">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? c.telefone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
