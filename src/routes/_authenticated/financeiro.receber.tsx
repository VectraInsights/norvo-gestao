import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, TrendingUp, Trash2, MoreHorizontal, Check, RotateCcw, Ban, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { format } from "date-fns";
import { LancamentosToolbar } from "@/components/erp/lancamentos-toolbar";

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <LancamentosPage tipo="receber" />,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_TONE: Record<string, string> = {
  aberto: "bg-accent text-accent-foreground",
  pago: "bg-success/15 text-success",
  parcial: "bg-warning/20 text-warning-foreground",
  vencido: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  status: string;
  data_vencimento: string;
  contato: { nome: string } | null;
};

const emptyForm = () => ({
  descricao: "", valor: "",
  data_emissao: format(new Date(), "yyyy-MM-dd"),
  data_vencimento: format(new Date(), "yyyy-MM-dd"),
  contato_id: "", categoria_id: "", conta_bancaria_id: "",
  documento: "", observacoes: "",
});

export function LancamentosPage({ tipo }: { tipo: "receber" | "pagar" }) {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const listKey = ["lancamentos", empresa?.id, tipo] as const;

  const { data: lancamentos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: listKey,
    queryFn: async ({ signal }): Promise<Lancamento[]> => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("id,descricao,valor,status,data_vencimento,contato:contatos(nome)")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", tipo)
        .order("data_vencimento", { ascending: false })
        .limit(100)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Lancamento[];
    },
  });

  const { data: contatosOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-opt", empresa?.id, tipo] as const,
    queryFn: async () => {
      const tipos = (tipo === "receber" ? ["cliente", "ambos"] : ["fornecedor", "ambos"]) as ("cliente" | "fornecedor" | "ambos")[];
      const { data, error } = await supabase.from("contatos")
        .select("id,nome,tipo").eq("empresa_id", empresa!.id).in("tipo", tipos).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-opt", empresa?.id] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categoriasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-opt", empresa?.id, tipo] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome").eq("empresa_id", empresa!.id).eq("tipo", tipo).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["fluxo"] });
  };

  // useMutation dá: guard de in-flight (impede double-submit / double-click),
  // rollback em erro e centralização do invalidateQueries.
  const criar = useMutation({
    mutationFn: async (input: typeof form) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const valor = Number(input.valor);
      if (!(valor > 0)) throw new Error("Valor deve ser maior que zero");
      const { error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresa.id,
        tipo,
        descricao: input.descricao,
        valor,
        data_emissao: input.data_emissao,
        data_vencimento: input.data_vencimento,
        contato_id: input.contato_id || null,
        categoria_id: input.categoria_id || null,
        conta_bancaria_id: input.conta_bancaria_id || null,
        documento: input.documento || null,
        observacoes: input.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento criado");
      setOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guard `status = 'aberto'` na UPDATE evita marcar duas vezes o mesmo título
  // se dois usuários clicarem simultaneamente (defensa além da RLS).
  const marcarPago = useMutation({
    mutationFn: async (l: Pick<Lancamento, "id" | "valor">) => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: l.valor, data_pagamento: format(new Date(), "yyyy-MM-dd") })
        .eq("id", l.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Já foi baixado por outro usuário");
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = (lancamentos ?? []).map((l) => l.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds));
  const clearSel = () => setSelected(new Set());

  const excluirLote = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("lancamentos_financeiros").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lançamentos excluídos"); clearSel(); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarStatusLote = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "aberto" | "pago" | "cancelado" | "vencido" | "parcial" }) => {
      const patch = status === "pago"
        ? { status, data_pagamento: format(new Date(), "yyyy-MM-dd") }
        : { status };
      const { error } = await supabase.from("lancamentos_financeiros").update(patch).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status alterado"); clearSel(); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Edição
  const [editing, setEditing] = useState<null | { id: string } & ReturnType<typeof emptyForm>>(null);
  const abrirEdicao = async (id: string) => {
    const { data, error } = await supabase.from("lancamentos_financeiros")
      .select("id,descricao,valor,data_emissao,data_vencimento,contato_id,categoria_id,conta_bancaria_id,documento,observacoes")
      .eq("id", id).maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Não encontrado"); return; }
    setEditing({
      id: data.id,
      descricao: data.descricao ?? "",
      valor: String(data.valor ?? ""),
      data_emissao: data.data_emissao ?? format(new Date(), "yyyy-MM-dd"),
      data_vencimento: data.data_vencimento ?? format(new Date(), "yyyy-MM-dd"),
      contato_id: data.contato_id ?? "",
      categoria_id: data.categoria_id ?? "",
      conta_bancaria_id: data.conta_bancaria_id ?? "",
      documento: data.documento ?? "",
      observacoes: data.observacoes ?? "",
    });
  };
  const salvarEdicao = useMutation({
    mutationFn: async (input: NonNullable<typeof editing>) => {
      const valor = Number(input.valor);
      if (!(valor > 0)) throw new Error("Valor deve ser maior que zero");
      const { error } = await supabase.from("lancamentos_financeiros").update({
        descricao: input.descricao, valor,
        data_emissao: input.data_emissao, data_vencimento: input.data_vencimento,
        contato_id: input.contato_id || null, categoria_id: input.categoria_id || null,
        conta_bancaria_id: input.conta_bancaria_id || null,
        documento: input.documento || null, observacoes: input.observacoes || null,
      }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lançamento atualizado"); setEditing(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ordenação
  type SortKey = "descricao" | "contato" | "data_vencimento" | "valor" | "status";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "data_vencimento", dir: "desc" });
  const toggleSort = (key: SortKey) =>
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const sorted = [...(lancamentos ?? [])].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const va = sort.key === "contato" ? (a.contato?.nome ?? "") : (a as unknown as Record<string, unknown>)[sort.key];
    const vb = sort.key === "contato" ? (b.contato?.nome ?? "") : (b as unknown as Record<string, unknown>)[sort.key];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
  });
  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children}
        {sort.key !== k ? <ArrowUpDown className="h-3 w-3 opacity-50" />
          : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>
    </TableHead>
  );

  // Aba: Vencidos (aberto/parcial e vencimento < hoje) | A vencer (aberto/parcial e vencimento >= hoje) | Quitados (pago, vencimento < hoje)
  type Aba = "vencidos" | "avencer" | "quitados";
  const [aba, setAba] = useState<Aba>("avencer");
  const hojeStr = format(new Date(), "yyyy-MM-dd");
  const emAberto = (s: string) => s === "aberto" || s === "parcial" || s === "vencido";
  const filtrados = sorted.filter((l) => {
    if (aba === "vencidos") return emAberto(l.status) && l.data_vencimento < hojeStr;
    if (aba === "avencer") return emAberto(l.status) && l.data_vencimento >= hojeStr;
    return l.status === "pago" && l.data_vencimento < hojeStr;
  });
  const cont = {
    vencidos: sorted.filter((l) => emAberto(l.status) && l.data_vencimento < hojeStr).length,
    avencer: sorted.filter((l) => emAberto(l.status) && l.data_vencimento >= hojeStr).length,
    quitados: sorted.filter((l) => l.status === "pago" && l.data_vencimento < hojeStr).length,
  };
  const abaLabelQuitado = tipo === "receber" ? "Recebidos" : "Pagos";

  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const desc = tipo === "receber" ? "Recebimentos futuros e realizados." : "Compromissos financeiros a vencer e pagos.";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title={titulo}
        description={desc}
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) setOpen(v); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Novo lançamento — {titulo}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); criar.mutate(form); }} className="space-y-3">
                <div>
                  <Label>Descrição *</Label>
                  <Input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Valor (R$) *</Label>
                    <Input required type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                  </div>
                  <div>
                    <Label>Emissão</Label>
                    <Input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
                  </div>
                  <div>
                    <Label>Vencimento *</Label>
                    <Input required type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{tipo === "receber" ? "Cliente" : "Fornecedor"}</Label>
                  <Select value={form.contato_id} onValueChange={(v) => setForm({ ...form, contato_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
                    <SelectContent>
                      {contatosOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Conta bancária</Label>
                    <Select value={form.conta_bancaria_id} onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {contasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {categoriasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Nº documento / NF</Label>
                  <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending}>
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-3 inline-flex rounded-md border bg-muted/30 p-1 text-sm">
        {([
          { k: "vencidos", label: `Vencidos (${cont.vencidos})` },
          { k: "avencer", label: `A vencer (${cont.avencer})` },
          { k: "quitados", label: `${abaLabelQuitado} (${cont.quitados})` },
        ] as { k: Aba; label: string }[]).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => { setAba(t.k); clearSel(); }}
            className={`rounded px-3 py-1.5 transition-colors ${aba === t.k ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <LancamentosToolbar
        tipo={tipo}
        empresaId={empresa?.id}
        lancamentos={lancamentos}
        contatos={contatosOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        categorias={categoriasOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        contas={contasOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        onImported={invalidate}
      />

      {isLoading ? (
        <div className="space-y-2" aria-label="Carregando">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : !lancamentos?.length ? (
        <EmptyState icon={TrendingUp} title="Sem lançamentos" description={`Crie o primeiro lançamento de ${titulo.toLowerCase()}.`} />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{selected.size} selecionado(s)</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Select onValueChange={(v) => alterarStatusLote.mutate({ ids: [...selected], status: v as "aberto" })}>
                  <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Alterar status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" disabled={excluirLote.isPending}
                  onClick={() => { if (confirm(`Excluir ${selected.size} lançamento(s)?`)) excluirLote.mutate([...selected]); }}>
                  <Trash2 className="mr-1 h-4 w-4" />Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSel}>Limpar</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                </TableHead>
                <SortHead k="descricao">Descrição</SortHead>
                <SortHead k="contato">Contato</SortHead>
                <SortHead k="data_vencimento">Vencimento</SortHead>
                <SortHead k="valor" className="text-right">Valor</SortHead>
                <SortHead k="status">Status</SortHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((l) => {
                const emAndamento = marcarPago.isPending && marcarPago.variables?.id === l.id;
                return (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} aria-label="Selecionar" />
                    </TableCell>
                    <TableCell className="font-medium cursor-pointer hover:underline" onClick={() => abrirEdicao(l.id)}>{l.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{l.contato?.nome ?? "—"}</TableCell>
                    <TableCell className="text-tabular">{format(new Date(l.data_vencimento), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(l.valor)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONE[l.status] ?? ""} variant="secondary">{l.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {l.status !== "pago" && (
                            <DropdownMenuItem disabled={emAndamento} onClick={() => marcarPago.mutate({ id: l.id, valor: l.valor })}>
                              <Check className="mr-2 h-4 w-4" />Informar pagamento
                            </DropdownMenuItem>
                          )}
                          {l.status !== "aberto" && (
                            <DropdownMenuItem onClick={() => alterarStatusLote.mutate({ ids: [l.id], status: "aberto" })}>
                              <RotateCcw className="mr-2 h-4 w-4" />Voltar para aberto
                            </DropdownMenuItem>
                          )}
                          {l.status !== "cancelado" && (
                            <DropdownMenuItem onClick={() => alterarStatusLote.mutate({ ids: [l.id], status: "cancelado" })}>
                              <Ban className="mr-2 h-4 w-4" />Cancelar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={() => { if (confirm("Excluir lançamento?")) excluirLote.mutate([l.id]); }}>
                            <Trash2 className="mr-2 h-4 w-4" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v && !salvarEdicao.isPending) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar lançamento</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); salvarEdicao.mutate(editing); }} className="space-y-3">
              <div>
                <Label>Descrição *</Label>
                <Input required value={editing.descricao} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input required type="number" step="0.01" min="0.01" value={editing.valor} onChange={(e) => setEditing({ ...editing, valor: e.target.value })} />
                </div>
                <div>
                  <Label>Emissão</Label>
                  <Input type="date" value={editing.data_emissao} onChange={(e) => setEditing({ ...editing, data_emissao: e.target.value })} />
                </div>
                <div>
                  <Label>Vencimento *</Label>
                  <Input required type="date" value={editing.data_vencimento} onChange={(e) => setEditing({ ...editing, data_vencimento: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{tipo === "receber" ? "Cliente" : "Fornecedor"}</Label>
                <Select value={editing.contato_id} onValueChange={(v) => setEditing({ ...editing, contato_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
                  <SelectContent>
                    {contatosOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Conta bancária</Label>
                  <Select value={editing.conta_bancaria_id} onValueChange={(v) => setEditing({ ...editing, conta_bancaria_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {contasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={editing.categoria_id} onValueChange={(v) => setEditing({ ...editing, categoria_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {categoriasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Nº documento / NF</Label>
                <Input value={editing.documento} onChange={(e) => setEditing({ ...editing, documento: e.target.value })} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={2} value={editing.observacoes} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={salvarEdicao.isPending}>
                  {salvarEdicao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
