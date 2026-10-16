import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { SearchField } from "@/components/erp/search-field";
import { AuditDialog } from "@/components/erp/audit-dialog";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/erp/primary-button";
import { Pagination } from "@/components/erp/pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, Search, Trash2, Users, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TipoContato = Database["public"]["Enums"]["contato_tipo"];
type Contato = {
  id: string; nome: string; tipo: TipoContato;
  documento: string | null; email: string | null; telefone: string | null;
  ie: string | null; cep: string | null; logradouro: string | null;
  numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; uf: string | null; observacoes: string | null;
};

export const Route = createFileRoute("/_authenticated/vendas/clientes")({
  component: Clientes,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const emptyForm = () => ({
  nome: "", documento: "", email: "", telefone: "", ie: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", observacoes: "",
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
  const [confLote, setConfLote] = useState(false);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Delete abre a confirmação de excluir selecionados.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setConfLote(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const lookupCnpj = async () => {
    const digits = onlyDigits(form.documento);
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    if (!empresa) return toast.error("Empresa não selecionada");
    setLookingUp(true);
    try {
      const { data: existente } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresa.id).eq("documento", digits).maybeSingle();
      // Se é outro contato (não o que está sendo editado), bloqueia; se é o próprio, atualiza
      if (existente && (!editing || existente.id !== editing.id)) {
        toast.error(`Já cadastrado: ${existente.nome} — abra a edição dele para atualizar`);
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
      if (!d || d.status === "ERROR") throw new Error("CNPJ não encontrado nas APIs públicas");
      setForm((f) => ({
        ...f,
        documento: digits,
        nome: d.razao_social || d.nome || d.nome_fantasia || f.nome,
        email: d.email || f.email,
        telefone: d.ddd_telefone_1 || d.telefone || d.phone || f.telefone,
        cep: String(d.cep ?? d.zip ?? f.cep ?? "").replace(/\D/g, "") || f.cep,
        logradouro: d.logradouro || d.street || f.logradouro,
        numero: String(d.numero ?? d.number ?? f.numero ?? "") || f.numero,
        complemento: d.complemento || f.complemento,
        bairro: d.bairro || d.district || f.bairro,
        cidade: d.municipio || d.city || f.cidade,
        uf: d.uf || d.state || f.uf,
      }));
      toast.success(editing ? "Dados atualizados da Receita — clique Salvar" : "Dados preenchidos a partir da Receita");
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
    queryKey: ["contatos-clientes", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<Contato[]> => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("contatos")
          .select("id,nome,tipo,documento,email,telefone,ie,cep,logradouro,numero,complemento,bairro,cidade,uf,observacoes")
          .eq("empresa_id", empresa!.id).eq("tipo", "cliente").order("nome").range(ini, ini + 999).abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as Contato[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contatos ?? [];
    const qDig = q.replace(/\D/g, "");
    return (contatos ?? []).filter((c) => {
      if ((c.nome || "").toLowerCase().includes(q)) return true;
      if (qDig && (c.documento || "").replace(/\D/g, "").includes(qDig)) return true;
      if ((c.cidade || "").toLowerCase().includes(q)) return true;
      if ((c.email || "").toLowerCase().includes(q)) return true;
      // Pesquisa por telefone: dígitos casam em qualquer formato
      if (qDig.length >= 4 && (c.telefone || "").replace(/\D/g, "").includes(qDig)) return true;
      return false;
    });
  }, [contatos, busca]);

  const pageSize = 25;

  // Cabeçalhos clicáveis ordenam (nome, tipo, documento, contato).
  type SortCol = "nome" | "tipo" | "documento" | "contato";
  const [sort, setSort] = useState<{ key: SortCol; dir: "asc" | "desc" }>({ key: "nome", dir: "asc" });
  const valCol = (c: Contato, k: SortCol) =>
    k === "contato" ? (c.email ?? c.telefone ?? "") : (c[k] ?? "");
  const ordenados = useMemo(() => {
    const arr = [...filtrados];
    const m = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => String(valCol(a, sort.key)).localeCompare(String(valCol(b, sort.key)), "pt-BR") * m);
    return arr;
  }, [filtrados, sort]);
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = ordenados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const SortTh = ({ k, children, className }: { k: SortCol; children: ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => { setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" })); setPagina(1); }}
        className="inline-flex items-center gap-1 font-medium uppercase hover:text-foreground"
      >
        {children}
        {sort.key !== k
          ? <ArrowUpDown className="h-3 w-3 opacity-40" />
          : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>
    </TableHead>
  );

  const criar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm>) => {
      if (!empresa) throw new Error("Empresa não selecionada");
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
        tipo: "cliente",
        documento: doc || null,
        email: input.email || null,
        telefone: input.telefone || null,
        ie: input.ie || null,
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
    onSuccess: (_d, input) => {
      toast.success("Contato criado");
      void registrarAuditoria("criar", `Contato "${input.nome}" criado`, { nome: input.nome });
      setOpen(false); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["contatos-clientes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm> & { id: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente, error: errBusca } = await supabase.from("contatos")
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).neq("id", input.id).maybeSingle();
        if (errBusca) throw errBusca;
        if (existente) throw new Error(`Já existe outro contato com este CPF/CNPJ: ${existente.nome}`);
      }

      const { error } = await supabase.from("contatos").update({
        nome: input.nome,
        documento: doc || null,
        email: input.email || null,
        telefone: input.telefone || null,
        ie: input.ie || null,
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
    onSuccess: (_d, input) => {
      toast.success("Contato atualizado");
      void registrarAuditoria("alterar", `Contato "${input.nome}" alterado`, { contato_id: input.id });
      setOpen(false); setEditing(null); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["contatos-clientes"] });
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
      void registrarAuditoria("excluir", `${ids.length} contato(s) excluído(s)`, { qtd: ids.length });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["contatos-clientes"] });
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
      ie: c.ie ?? "",
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numero: c.numero ?? "",
      complemento: c.complemento ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf ?? "",
      observacoes: c.observacoes ?? "",
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  // Auditoria (tabela auditoria_eventos): quem criou/editou/excluiu
  const [trilhaOpen, setTrilhaOpen] = useState(false);
  const registrarAuditoria = async (acao: string, descricao: string, detalhes: Record<string, any> = {}) => {
    try {
      if (!empresa) return;
      const { data: sess } = await supabase.auth.getUser();
      const u = sess?.user;
      if (!u) return;
      const nome = ((u.user_metadata as any)?.nome as string) || u.email || "";
      await supabase.from("auditoria_eventos" as never).insert({
        empresa_id: empresa.id,
        user_id: u.id,
        modulo: "vendas",
        acao,
        entidade: "contato",
        detalhes: { ...detalhes, descricao, user_nome: nome, user_email: u.email || "" },
      } as any);
    } catch { /* trilha indisponível: não bloqueia o fluxo */ }
  };
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-contatos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "vendas")
        .eq("entidade", "contato")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Clientes" description="Cadastro de clientes — vendas e documentos fiscais." />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField value={busca} onChange={(v) => { setBusca(v); setPagina(1); }} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTrilhaOpen(true)} className="h-9 rounded-xl px-4 active:scale-95">
            Auditoria
          </Button>
            <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending && !editar.isPending) { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm()); } } }}>
              <DialogTrigger asChild><PrimaryButton onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Novo contato</PrimaryButton></DialogTrigger>
              <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
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
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                  <div><Label>IE</Label><Input value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value })} /></div>
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
                  <Button type="submit" disabled={criar.isPending || editar.isPending}>
                    {(criar.isPending || editar.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !filtrados?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description={busca ? "Nada encontrado para a busca." : "Nenhum cliente cadastrado."} />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          {selected.size > 0 && (
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-sm">
              <span>{selected.size} selecionado(s)</span>
              <AlertDialog open={confLote} onOpenChange={setConfLote}>
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
                    <AlertDialogAction data-acao onClick={() => excluir.mutate(Array.from(selected))}>Confirmar</AlertDialogAction>
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
                    checked={filtrados.length > 0 && selected.size === filtrados.length}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(filtrados.map((c) => c.id)) : new Set())}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <SortTh k="nome">Nome</SortTh><SortTh k="tipo">Tipo</SortTh><SortTh k="documento">Documento</SortTh><SortTh k="contato">Contato</SortTh><TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((c) => (
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
          <Pagination
            pagina={paginaAtual}
            totalPaginas={totalPaginas}
            total={ordenados.length}
            pageSize={pageSize}
            onPagina={setPagina}
          />
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
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && excluir.mutate([deleting.id])}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuditDialog
        open={trilhaOpen}
        onOpenChange={setTrilhaOpen}
        title="Auditoria — Clientes e fornecedores"
        emptyText="Nenhum evento registrado ainda. Criar, editar ou excluir gera registros aqui."
        isLoading={trilhaQuery.isLoading}
        isError={trilhaQuery.isError}
        events={(trilhaQuery.data ?? [])}
      />
    </>
  );
}
