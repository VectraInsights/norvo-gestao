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
import { Loader2, Plus, Search, Trash2, Users, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { completarLogradouro } from "@/lib/endereco";
import { maskDoc } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiscal/cadastro")({
  component: Cadastro,
  errorComponent: ({ error }) => (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm" role="alert">Falha: {error instanceof Error ? error.message : "erro desconhecido"}</div>
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
  const [pageSize, setPageSize] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState<{ key: "nome" | "documento" | "ie" | "cidade" | "endereco" | "contato"; dir: 1 | -1 }>({
    key: "nome",
    dir: 1,
  });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmLote, setConfirmLote] = useState(false);

  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["fiscal-cadastro", empresa?.id] as const,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("fiscal_cadastros")
        .select("id,nome,documento,ie,email,telefone,cep,logradouro,numero,complemento,bairro,cidade,uf,observacoes")
        .eq("empresa_id", empresa!.id)
        .order("nome")
        .limit(500)
        .abortSignal(signal);
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

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const chOrd = (c: Contato): string => {
    if (ordem.key === "documento") return (c.documento || "").replace(/\D/g, "");
    if (ordem.key === "ie") return (c.ie || "").toLowerCase();
    if (ordem.key === "cidade") return `${c.cidade || ""} ${c.uf || ""}`.toLowerCase();
    if (ordem.key === "endereco") return (c.logradouro || "").toLowerCase();
    if (ordem.key === "contato") return (c.telefone || c.email || "").toLowerCase();
    return (c.nome || "").toLowerCase();
  };
  const ordenados = [...filtrados].sort((a, b) => chOrd(a).localeCompare(chOrd(b), "pt-BR") * ordem.dir);
  const visiveis = ordenados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const alternarOrdem = (key: typeof ordem.key) => {
    setOrdem((o) => (o.key === key ? { key, dir: o.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  };
  const setaOrdem = (key: typeof ordem.key) =>
    ordem.key === key ? (ordem.dir === 1 ? " ▲" : " ▼") : "";
  const todosVisiveisSel = visiveis.length > 0 && visiveis.every((c) => selecionados.has(c.id));
  const alternarTodosVisiveis = () => {
    setSelecionados((ant) => {
      const prox = new Set(ant);
      if (todosVisiveisSel) visiveis.forEach((c) => prox.delete(c.id));
      else visiveis.forEach((c) => prox.add(c.id));
      return prox;
    });
  };
  const alternarUm = (id: string) => {
    setSelecionados((ant) => {
      const prox = new Set(ant);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  };

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
        documento: maskDoc(digits),
        nome: d.razao_social || d.nome || d.nome_fantasia || f.nome,
        email: d.email ?? f.email,
        telefone: d.ddd_telefone_1 || d.telefone || f.telefone,
        cep: d.cep ?? f.cep,
        logradouro: [d.descricao_tipo_de_logradouro || (d as any).tipo_logradouro || "", d.logradouro || ""].filter(Boolean).join(" ") || f.logradouro,
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
      const logrFinal = await completarLogradouro(input.logradouro || "", input.cep || "");
      const { error } = await supabase.from("fiscal_cadastros").insert({
        empresa_id: empresa.id, nome: input.nome,
        documento: doc || null, ie: input.ie || null, email: input.email || null, telefone: input.telefone || null,
        cep: input.cep || null, logradouro: logrFinal || null, numero: input.numero || null,
        complemento: input.complemento || null, bairro: input.bairro || null,
        cidade: input.cidade || null, uf: input.uf || null, observacoes: input.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro criado");
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
        if (existente) throw new Error(`Já existe outro cadastro com este CPF/CNPJ: ${existente.nome}`);
      }
      const logrFinal = await completarLogradouro(input.logradouro || "", input.cep || "");
      const { error } = await supabase.from("fiscal_cadastros").update({
        nome: input.nome,
        documento: doc || null, ie: input.ie || null, email: input.email || null, telefone: input.telefone || null,
        cep: input.cep || null, logradouro: logrFinal || null, numero: input.numero || null,
        complemento: input.complemento || null, bairro: input.bairro || null,
        cidade: input.cidade || null, uf: input.uf || null, observacoes: input.observacoes || null,
      }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro atualizado");
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
      toast.success("Cadastro excluído");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["fiscal-cadastro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirLote = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("fiscal_cadastros").delete().eq("empresa_id", empresa.id).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} cadastro(s) excluído(s)`);
      setSelecionados(new Set());
      setConfirmLote(false);
      setPagina(1);
      qc.invalidateQueries({ queryKey: ["fiscal-cadastro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Contato) => {
    setEditing(c);
    setForm({
      nome: c.nome, documento: maskDoc(c.documento ?? ""), ie: c.ie ?? "", email: c.email ?? "", telefone: c.telefone ?? "",
      cep: c.cep ?? "", logradouro: c.logradouro ?? "", numero: c.numero ?? "",
      complemento: c.complemento ?? "", bairro: c.bairro ?? "", cidade: c.cidade ?? "",
      uf: c.uf ?? "", observacoes: c.observacoes ?? "",
    });
    setOpen(true);
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Cadastro" description="Clientes e fornecedores juntos — remetentes, destinatários e tomadores usados no CT-e." />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por nome, CPF/CNPJ ou cidade..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
        </div>
        <div className="flex items-center gap-2">
          {selecionados.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmLote(true)} className="h-10 rounded-xl px-4">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir selecionados ({selecionados.size})
            </Button>
          )}
          <Button onClick={openCreate} className="h-10 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Novo cadastro</Button>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}</div>
      ) : !filtrados?.length ? (
        <EmptyState icon={Users} title="Nenhum cadastro" description={busca ? "Nada encontrado para a busca." : "Cadastre o primeiro cadastro (cliente ou fornecedor)."} />
      ) : (
        <Card className="overflow-hidden rounded-2xl shadow-panel">
          <div className="overflow-x-auto">
          <Table className="min-w-[1280px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={todosVisiveisSel} onCheckedChange={alternarTodosVisiveis} aria-label="Selecionar visíveis" />
                </TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("nome")} title="Ordenar por nome">Nome{setaOrdem("nome")}</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("documento")} title="Ordenar por CPF/CNPJ">CPF/CNPJ{setaOrdem("documento")}</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("ie")} title="Ordenar por IE">IE{setaOrdem("ie")}</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("cidade")} title="Ordenar por cidade">Cidade/UF{setaOrdem("cidade")}</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("endereco")} title="Ordenar por endereço">Endereço{setaOrdem("endereco")}</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("contato")} title="Ordenar por contato">Contato{setaOrdem("contato")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((c) => (
                <TableRow key={c.id} className="transition-colors hover:bg-accent/30">
                  <TableCell>
                    <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => alternarUm(c.id)} aria-label={`Selecionar ${c.nome}`} />
                  </TableCell>                  <TableCell className="font-medium whitespace-nowrap">{c.nome}</TableCell>
                  <TableCell className="text-tabular whitespace-nowrap">{c.documento ? maskDoc(c.documento) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.ie || "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap" title={[c.logradouro, c.numero, c.bairro].filter(Boolean).join(", ")}>
                    {([c.logradouro, c.numero].filter(Boolean).join(", ") || "—") + (c.bairro ? ` — ${c.bairro}` : "")}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.telefone ?? c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{c.telefone ?? c.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0 text-destructive hover:bg-destructive/10" onClick={() => setDeleting(c)}>
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
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {filtrados.length} cadastro(s){selecionados.size > 0 && ` · ${selecionados.size} selecionado(s)`}
            </span>
            <div className="flex items-center gap-1.5">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPagina(1); }}>
                <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / pág.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-tabular">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending && !editar.isPending) { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm()); } } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">{editing ? "Editar cadastro" : "Novo cadastro"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (editing) { editar.mutate({ ...form, id: editing.id }); } else { criar.mutate(form); } }} className="space-y-4">
            <div className="grid gap-1.5">
              <Label>CPF/CNPJ</Label>
              <div className="flex gap-2">
                <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: maskDoc(e.target.value) })} className="h-10 rounded-xl"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupCnpj(); } }} />
                <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.documento} className="h-10 w-10 shrink-0 rounded-xl shadow-sm">
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-10 rounded-xl" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>IE / ISENTO</Label><Input value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value.toUpperCase() })} className="h-10 rounded-xl" /></div>
              <div className="grid gap-1.5"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="h-10 rounded-xl" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="h-10 rounded-xl" /></div>
              <div className="col-span-2 grid gap-1.5"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="h-10 rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="h-10 rounded-xl" /></div>
              <div className="col-span-2 grid gap-1.5"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="h-10 rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="h-10 rounded-xl" /></div>
              <div className="grid gap-1.5"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="h-10 rounded-xl" /></div>
              <div className="grid gap-1.5"><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="h-10 rounded-xl" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="rounded-xl" /></div>
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={criar.isPending || editar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                {(criar.isPending || editar.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir cadastro</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Tem certeza que deseja excluir <strong>{deleting?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && excluir.mutate(deleting.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLote} onOpenChange={(v) => { if (!v) setConfirmLote(false); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir selecionados</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Tem certeza que deseja excluir <strong>{selecionados.size} cadastro(s)</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluirLote.mutate([...selecionados])}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
