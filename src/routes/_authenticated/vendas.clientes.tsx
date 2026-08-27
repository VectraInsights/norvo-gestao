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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Search, Trash2, Users, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", observacoes: "",
  isCliente: true, isFornecedor: false,
});

function onlyDigits(s: string) { return s.replace(/\D/g, ""); }

function Clientes() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lookingUp, setLookingUp] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Contato | null>(null);
  const [deleting, setDeleting] = useState<Contato | null>(null);
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const lookupCnpj = async () => {
    const digits = onlyDigits(form.documento);
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    if (!empresa) return toast.error("Empresa não selecionada");
    setLookingUp(true);
    try {
      const { data: existente } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresa.id).eq("documento", digits).maybeSingle();
      if (existente) {
        toast.error(`Já cadastrado: ${existente.nome}`);
        return;
      }
      let d: any = null;
      for (const url of [
        `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
        `https://receitaws.com.br/v1/cnpj/${digits}`,
      ]) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) { d = await res.json(); break; }
        } catch { /* tenta próxima */ }
      }
      if (!d) throw new Error("CNPJ não encontrado nas APIs públicas");
      setForm((f) => ({
        ...f,
        documento: digits,
        nome: d.razao_social || d.nome || d.nome_fantasia || f.nome,
        email: d.email ?? f.email,
        telefone: d.ddd_telefone_1 || d.telefone || f.telefone,
        cep: d.cep ?? f.cep,
        logradouro: d.logradouro ?? f.logradouro,
        numero: d.numero ?? f.numero,
        complemento: d.complemento ?? f.complemento,
        bairro: d.bairro ?? f.bairro,
        cidade: d.municipio || d.city || f.cidade,
        uf: d.uf || d.state || f.uf,
      }));
      toast.success("Dados preenchidos a partir da Receita");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  const handleCnpjKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!lookingUp && form.documento) lookupCnpj();
  };

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
        cep: input.cep || null,
        logradouro: input.logradouro || null,
        numero: input.numero || null,
        complemento: input.complemento || null,
        bairro: input.bairro || null,
        cidade: input.cidade || null,
        uf: input.uf || null,
        observacoes: input.observacoes || null,
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

  const editar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm> & { id: string }) => {
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
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).neq("id", input.id).maybeSingle();
        if (errBusca) throw errBusca;
        if (existente) throw new Error(`Já existe outro contato com este CPF/CNPJ: ${existente.nome}`);
      }

      const { error } = await supabase.from("contatos").update({
        nome: input.nome,
        tipo,
        documento: doc || null,
        email: input.email || null,
        telefone: input.telefone || null,
        cep: input.cep || null,
        logradouro: input.logradouro || null,
        numero: input.numero || null,
        complemento: input.complemento || null,
        bairro: input.bairro || null,
        cidade: input.cidade || null,
        uf: input.uf || null,
        observacoes: input.observacoes || null,
      }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato atualizado");
      setOpen(false); setEditing(null); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["contatos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("contatos").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} contato(s) excluído(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Contato) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      documento: c.documento ?? "",
      email: c.email ?? "",
      telefone: c.telefone ?? "",
      cep: "", logradouro: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "",
      isCliente: c.tipo === "cliente" || c.tipo === "ambos",
      isFornecedor: c.tipo === "fornecedor" || c.tipo === "ambos",
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  return (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Clientes e fornecedores" description="Cadastro unificado de contatos."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Adicionar trilha de auditoria
            </Button>
            <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending && !editar.isPending) { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm()); } } }}>
              <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Novo contato</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar contato" : "Novo contato"}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (editing) { editar.mutate({ ...form, id: editing.id }); } else { criar.mutate(form); } }} className="space-y-3">
                <div>
                  <Label>CPF/CNPJ</Label>
                  <div className="flex gap-2">
                    <Input value={form.documento}
                      onChange={(e) => setForm({ ...form, documento: e.target.value })}
                      onKeyDown={handleCnpjKeyDown} />
                    <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.documento}>
                      {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                  <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                  <div><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending || editar.isPending || (!form.isCliente && !form.isFornecedor)}>
                    {(criar.isPending || editar.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        }
      />
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !contatos?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description="Cadastre clientes, fornecedores e transportadoras." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          {selected.size > 0 && (
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-sm">
              <span>{selected.size} selecionado(s)</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={excluir.isPending}>
                    <Trash2 className="mr-1 h-4 w-4" />Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir contatos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação removerá {selected.size} contato(s). Não é possível desfazer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => excluir.mutate(Array.from(selected))}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={contatos.length > 0 && selected.size === contatos.length}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(contatos.map((c) => c.id)) : new Set())}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead><TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatos.map((c) => (
                <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Selecionar ${c.nome}`} />
                  </TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{c.tipo}</TableCell>
                  <TableCell className="text-tabular">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? c.telefone ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setDeleting(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleting?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && excluir.mutate([deleting.id])}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
