import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TipoContato = Database["public"]["Enums"]["contato_tipo"];
type Contato = {
  id: string; nome: string; tipo: TipoContato;
  documento: string | null; email: string | null; telefone: string | null;
};

export const Route = createFileRoute("/_authenticated/vendas/clientes")({
  component: Clientes,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const emptyForm = () => ({
  nome: "", documento: "", email: "", telefone: "",
  isCliente: true, isFornecedor: false,
});

function onlyDigits(s: string) { return s.replace(/\D/g, ""); }

function Clientes() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<Contato[]> => {
      const { data, error } = await supabase.from("contatos")
        .select("id,nome,tipo,documento,email,telefone")
        .eq("empresa_id", empresa!.id).order("nome").abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Contato[];
    },
  });

  const criar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm>) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!input.isCliente && !input.isFornecedor) {
        throw new Error("Selecione ao menos um tipo: Cliente ou Fornecedor");
      }
      const tipo: TipoContato =
        input.isCliente && input.isFornecedor ? "ambos"
        : input.isCliente ? "cliente" : "fornecedor";

      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente, error: errBusca } = await supabase.from("contatos")
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).maybeSingle();
        if (errBusca) throw errBusca;
        if (existente) throw new Error(`Já existe um contato com este CPF/CNPJ: ${existente.nome}`);
      }

      const { error } = await supabase.from("contatos").insert({
        empresa_id: empresa.id,
        nome: input.nome,
        tipo,
        documento: doc || null,
        email: input.email || null,
        telefone: input.telefone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setOpen(false); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Clientes e fornecedores" description="Cadastro unificado de contatos."
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Novo contato</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); criar.mutate(form); }} className="space-y-3">
                <div><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div>
                  <Label>Tipo *</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.isCliente} onCheckedChange={(v) => setForm({ ...form, isCliente: v === true })} />
                      Cliente
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.isFornecedor} onCheckedChange={(v) => setForm({ ...form, isFornecedor: v === true })} />
                      Fornecedor
                    </label>
                  </div>
                </div>
                <div><Label>CPF/CNPJ</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending || (!form.isCliente && !form.isFornecedor)}>
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !contatos?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description="Cadastre clientes, fornecedores e transportadoras." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead></TableRow></TableHeader>
            <TableBody>
              {contatos.map((c) => (
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
