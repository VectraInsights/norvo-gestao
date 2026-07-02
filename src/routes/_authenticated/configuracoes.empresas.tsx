import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/empresas")({
  component: EmpresasPage,
});

function EmpresasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome_fantasia: "", razao_social: "", cnpj: "", email: "" });

  const { data: empresas } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error; return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Sessão expirada");
    const { error } = await supabase.from("empresas").insert({ ...form, created_by: u.user.id });
    if (error) return toast.error(error.message);
    toast.success("Empresa criada"); setOpen(false);
    setForm({ nome_fantasia: "", razao_social: "", cnpj: "", email: "" });
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Empresas" description="Empresas às quais você tem acesso."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nova empresa</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova empresa</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Nome fantasia</Label><Input required value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
                <div><Label>Razão social</Label><Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="overflow-hidden shadow-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Nome fantasia</TableHead><TableHead>Razão social</TableHead><TableHead>CNPJ</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
          <TableBody>
            {empresas?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nome_fantasia}</TableCell>
                <TableCell className="text-muted-foreground">{e.razao_social ?? "—"}</TableCell>
                <TableCell className="text-tabular">{e.cnpj ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.email ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
