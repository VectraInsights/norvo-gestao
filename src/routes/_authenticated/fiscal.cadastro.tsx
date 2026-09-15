import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Search, Trash2, Users, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fiscal/cadastro")({
  component: Cadastro,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

type Contato = {
  id: string; nome: string;
  documento: string | null; ie: string | null; email: string | null; telefone: string | null;
  cep: string | null; logradouro: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; cidade: string | null;
  uf: string | null; observacoes: string | null;
};

const emptyForm = () => ({
  nome: "", documento: "", ie: "", email: "", telefone: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", observacoes: "",
});

function onlyDigits(s: string) { return s.replace(/\D/g, ""); }

function Cadastro() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Contato | null>(null);
  const [deleting, setDeleting] = useState<Contato | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [busca, setBusca] = useState("");

  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["fiscal-cadastro", empresa?.id] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("fiscal_cadastros")
        .select("id,nome,documento,ie,email,telefone,cep,logradouro,numero,complemento,bairro,cidade,uf,observacoes")
        .eq("empresa_id", empresa!.id)
        .order("nome").abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Contato[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (contatos ?? []).filter((c) => {
      if (!q) return true;
      return (c.nome || "").toLowerCase().includes(q)
        || (c.documento || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
        || (c.cidade || "").toLowerCase().includes(q);
    });
  }, [contatos, busca]);

  const lookupCnpj = async () => {
    const digits = onlyDigits(form.documento);
    if (digits.length === 11) { toast.info("CPF sem consulta automática — preencha manualmente"); return; }
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    setLookingUp(true);
    try {
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


  const criar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm>) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente } = await supabase.from("fiscal_cadastros")
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).maybeSingle();
        if (existente) throw new Error(`Já cadastrado: ${existente.nome}`);
      }
      const { error } = await supabase.from("fiscal_cadastros").insert({
        empresa_id: empresa.id, nome: input.nome,
        documento: doc || null, ie: input.ie || null, email: input.email || null, telefone: input.telefone || null,
        cep: input.cep || null, logradouro: input.logradouro || null, numero: input.numero || null,
        complemento: input.complemento || null, bairro: input.bairro || null,
        cidade: input.cidade || null, uf: input.uf || null, observacoes: input.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setOpen(false); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["fiscal-cadastro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm> & { id: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente } = await supabase.from("fiscal_cadastros")
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).neq("id", input.id).maybeSingle();
        if (existente) throw new Error(`Já existe outro contato com este CPF/CNPJ: ${existente.nome}`);
      }
      const { error } = await supabase.from("fiscal_cadastros").update({
        nome: input.nome,
        documento: doc || null, ie: input.ie || null, email: input.email || null, telefone: input.telefone || null,
        cep: input.cep || null, logradouro: input.logradouro || null, numero: input.numero || null,
        complemento: input.complemento || null, bairro: input.bairro || null,
        cidade: input.cidade || null, uf: input.uf || null, observacoes: input.observacoes || null,
      }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato atualizado");
      setOpen(false); setEditing(null); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["fiscal-cadastro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fiscal_cadastros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato excluído");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["fiscal-cadastro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Contato) => {
    setEditing(c);
    setForm({
      nome: c.nome, documento: c.documento ?? "", ie: c.ie ?? "", email: c.email ?? "", telefone: c.telefone ?? "",
      cep: c.cep ?? "", logradouro: c.logradouro ?? "", numero: c.numero ?? "",
      complemento: c.complemento ?? "", bairro: c.bairro ?? "", cidade: c.cidade ?? "",
      uf: c.uf ?? "", observacoes: c.observacoes ?? "",
    });
    setOpen(true);
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Cadastro" description="Clientes e fornecedores juntos — remetentes, destinatários e tomadores usados no CT-e."
        actions={
          <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Novo contato</Button>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome, CPF/CNPJ ou cidade..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !filtrados?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description={busca ? "Nada encontrado para a busca." : "Cadastre o primeiro contato (cliente ou fornecedor)."} />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Documento</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Contato</TableHead><TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-tabular">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.telefone ?? c.email ?? "—"}</TableCell>
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

      <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending && !editar.isPending) { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm()); } } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar contato" : "Novo contato"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (editing) { editar.mutate({ ...form, id: editing.id }); } else { criar.mutate(form); } }} className="space-y-3">
            <div>
              <Label>CPF/CNPJ</Label>
              <div className="flex gap-2">
                <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupCnpj(); } }} />
                <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.documento}>
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>IE / ISENTO</Label><Input value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value.toUpperCase() })} /></div>
              <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
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
            <div><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" disabled={criar.isPending || editar.isPending}>
                {(criar.isPending || editar.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              onClick={() => deleting && excluir.mutate(deleting.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
