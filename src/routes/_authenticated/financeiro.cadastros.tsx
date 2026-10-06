import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, FolderCog, Loader2, Search, PlusCircle, ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/financeiro/cadastros")({
  component: CadastrosPage,
  head: () => ({
    meta: [
      { title: "Cadastros financeiros — Norvo" },
      { name: "description", content: "Cadastre e altere categorias financeiras e centros de custo da empresa." },
      { property: "og:title", content: "Cadastros financeiros — Norvo" },
      { property: "og:description", content: "Cadastre e altere categorias financeiras e centros de custo da empresa." },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm" role="alert">Falha: {error instanceof Error ? error.message : "erro desconhecido"}</div>
  ),
  notFoundComponent: () => <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-panel">Página não encontrada.</div>,
});

type Categoria = { id: string; nome: string; tipo: "receber" | "pagar"; parent_id: string | null; cor: string | null };
type Centro = { id: string; nome: string; codigo: string | null; descricao: string | null; ativo: boolean };

function CadastrosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  /* ---------------- Categorias ---------------- */
  const catKey = ["cadastros-categorias", empresa?.id] as const;
  const { data: categorias, isLoading: loadingCat } = useQuery({
    enabled: !!empresa,
    queryKey: catKey,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome,tipo,parent_id,cor").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState<{ id?: string; nome: string; tipo: "receber" | "pagar"; parent_id: string }>({
    nome: "", tipo: "pagar", parent_id: "none",
  });

  const salvarCat = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!catForm.nome.trim()) throw new Error("Informe o nome");
      const norm = (s: string) =>
        s.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
      const paiAlvo = catForm.parent_id === "none" ? null : catForm.parent_id;
      const duplicada = (categorias ?? []).some(
        (c) => c.id !== catForm.id && c.tipo === catForm.tipo && (c.parent_id ?? null) === paiAlvo && norm(c.nome) === norm(catForm.nome),
      );
      if (duplicada) throw new Error("Já existe uma categoria com esse nome para este tipo");
      const payload = {
        empresa_id: empresa.id,
        nome: catForm.nome.trim(),
        tipo: catForm.tipo,
        parent_id: catForm.parent_id === "none" ? null : catForm.parent_id,
      };
      const { error } = catForm.id
        ? await supabase.from("categorias_financeiras").update(payload).eq("id", catForm.id)
        : await supabase.from("categorias_financeiras").insert(payload);
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe uma categoria com esse nome para este tipo");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Categoria salva");
      setCatOpen(false);
      qc.invalidateQueries({ queryKey: ["cadastros-categorias"] });
      qc.invalidateQueries({ queryKey: ["categorias-opt"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categorias_financeiras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria excluída");
      qc.invalidateQueries({ queryKey: ["cadastros-categorias"] });
      qc.invalidateQueries({ queryKey: ["categorias-opt"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [expandCat, setExpandCat] = useState<Set<string>>(new Set());
  const toggleCat = (id: string) => {
    setExpandCat((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const filtrarTipo = (tipo: "pagar" | "receber") => {
    const q = busca.trim().toLowerCase();
    const porTipo = (categorias ?? []).filter((c) => c.tipo === tipo);
    if (!q) return porTipo;
    return porTipo.filter((c) => (c.nome || "").toLowerCase().includes(q));
  };
  const receitasFiltradas = filtrarTipo("receber");
  const despesasFiltradas = filtrarTipo("pagar");

  /* ---------------- Centros de custo ---------------- */
  const ccKey = ["cadastros-centros", empresa?.id] as const;
  const { data: centros, isLoading: loadingCc } = useQuery({
    enabled: !!empresa,
    queryKey: ccKey,
    queryFn: async (): Promise<Centro[]> => {
      const { data, error } = await supabase.from("centros_custo")
        .select("id,nome,codigo,descricao,ativo").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return (data ?? []) as Centro[];
    },
  });

  const [ccOpen, setCcOpen] = useState(false);
  const [confCat, setConfCat] = useState<Categoria | null>(null);
  const [exclInfo, setExclInfo] = useState<{ lanc: number; filhos: number } | null>(null);
  const [substituta, setSubstituta] = useState("none");

  const iniciarExclusaoCat = async (c: Categoria) => {
    setConfCat(c);
    setExclInfo(null);
    setSubstituta("none");
    if (!empresa) return;
    const [{ count: lanc }, { data: filhos }] = await Promise.all([
      supabase.from("lancamentos_financeiros").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("categoria_id", c.id),
      supabase.from("categorias_financeiras").select("id").eq("empresa_id", empresa.id).eq("parent_id", c.id),
    ]);
    setExclInfo({ lanc: lanc ?? 0, filhos: (filhos ?? []).length });
  };

  const confirmarExclusaoCat = async () => {
    if (!confCat || !empresa) return;
    const precisa = (exclInfo?.lanc ?? 0) > 0 || (exclInfo?.filhos ?? 0) > 0;
    if (precisa && substituta === "none") {
      toast.error("Escolha a categoria que vai receber os lançamentos e subcategorias");
      return;
    }
    try {
      if (substituta !== "none") {
        const { error: e1 } = await supabase.from("lancamentos_financeiros")
          .update({ categoria_id: substituta }).eq("empresa_id", empresa.id).eq("categoria_id", confCat.id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("categorias_financeiras")
          .update({ parent_id: substituta }).eq("empresa_id", empresa.id).eq("parent_id", confCat.id);
        if (e2) throw e2;
      }
      await excluirCat.mutateAsync(confCat.id);
      setConfCat(null);
      setExclInfo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
    }
  };
  const [confCc, setConfCc] = useState<Centro | null>(null);
  const [ccForm, setCcForm] = useState<{ id?: string; nome: string; codigo: string; descricao: string; ativo: boolean }>({
    nome: "", codigo: "", descricao: "", ativo: true,
  });

  const salvarCc = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!ccForm.nome.trim()) throw new Error("Informe o nome");
      const payload = {
        empresa_id: empresa.id,
        nome: ccForm.nome.trim(),
        codigo: ccForm.codigo.trim() || null,
        descricao: ccForm.descricao.trim() || null,
        ativo: ccForm.ativo,
      };
      const { error } = ccForm.id
        ? await supabase.from("centros_custo").update(payload).eq("id", ccForm.id)
        : await supabase.from("centros_custo").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Centro de custo salvo");
      setCcOpen(false);
      qc.invalidateQueries({ queryKey: ["cadastros-centros"] });
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("centros_custo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Centro de custo excluído");
      qc.invalidateQueries({ queryKey: ["cadastros-centros"] });
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const centrosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return centros ?? [];
    return (centros ?? []).filter((c) =>
      (c.nome || "").toLowerCase().includes(q)
      || (c.codigo || "").toLowerCase().includes(q)
      || (c.descricao || "").toLowerCase().includes(q),
    );
  }, [centros, busca]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Cadastros"
        description="Gerencie as categorias financeiras e os centros de custo utilizados nos lançamentos."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por nome, código ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 rounded-xl px-4 shadow-sm">
            Adicionar trilha de auditoria
          </Button>
        </div>
      </div>

      <Tabs defaultValue="categorias">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="categorias">Categorias financeiras</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
        </TabsList>

        {/* Categorias */}
        <TabsContent value="categorias" className="mt-4 space-y-4">
          {loadingCat ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[0, 1].map((col) => (
                <div key={col} className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}</div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              {([
                { tipo: "receber", titulo: "Receitas", lista: receitasFiltradas },
                { tipo: "pagar", titulo: "Despesas", lista: despesasFiltradas },
              ] as const).map((col) => {
                const emBusca = busca.trim() !== "";
                const pais = col.lista.filter((c) => !c.parent_id);
                const filhosDe = new Map<string, typeof col.lista>();
                for (const c of col.lista) {
                  if (!c.parent_id) continue;
                  if (!filhosDe.has(c.parent_id)) filhosDe.set(c.parent_id, []);
                  filhosDe.get(c.parent_id)!.push(c);
                }
                const idsPais = new Set(pais.map((p) => p.id));
                const orfas = col.lista.filter((c) => c.parent_id && !idsPais.has(c.parent_id));
                const acoes = (c: (typeof col.lista)[number]) => (
                  <div className="flex items-center justify-end gap-1">
                    {!c.parent_id && (
                      <Button variant="ghost" size="icon" aria-label="Cadastrar subcategoria" title="Cadastrar subcategoria" className="h-8 w-8 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); setCatForm({ nome: "", tipo: c.tipo, parent_id: c.id }); setCatOpen(true); }}>
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Editar categoria" title="Editar categoria" className="h-8 w-8 rounded-lg"
                      onClick={(e) => { e.stopPropagation(); setCatForm({ id: c.id, nome: c.nome, tipo: c.tipo, parent_id: c.parent_id ?? "none" }); setCatOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Remover categoria" title="Remover categoria" className="h-8 w-8 rounded-lg text-destructive"
                      onClick={(e) => { e.stopPropagation(); void iniciarExclusaoCat(c); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
                return (
                <Card key={col.tipo} className="overflow-hidden rounded-2xl shadow-panel">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tracking-tight">{col.titulo}</span>
                      <Badge variant="secondary">{col.lista.length}</Badge>
                    </div>
                    <Button size="sm" onClick={() => { setCatForm({ nome: "", tipo: col.tipo, parent_id: "none" }); setCatOpen(true); }} className="h-8 rounded-lg px-3 text-xs shadow-sm">
                      <Plus className="mr-1 h-3.5 w-3.5" />Nova categoria
                    </Button>
                  </div>
                  {col.lista.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {busca ? "Nada encontrado para a busca." : `Nenhuma categoria de ${col.tipo === "pagar" ? "despesa" : "receita"}.`}
                    </p>
                  ) : emBusca ? (
                    <Table>
                      <TableBody>
                        {col.lista.map((c) => (
                          <TableRow key={c.id} className="transition-colors hover:bg-accent/30">
                            <TableCell className={c.parent_id ? "text-muted-foreground" : "font-medium"}>
                              <span className="flex items-center gap-2">
                                {c.parent_id && <span className="h-4 w-1 shrink-0 rounded-full bg-primary/30" />}
                                {c.nome}
                              </span>
                            </TableCell>
                            <TableCell className="w-28">{acoes(c)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableBody>
                        {pais.map((p) => {
                          const filhos = filhosDe.get(p.id) ?? [];
                          const aberto = expandCat.has(p.id);
                          return (
                            <Fragment key={p.id}>
                              <TableRow
                                className="cursor-pointer bg-muted/40 transition-colors hover:bg-muted/60"
                                onClick={() => filhos.length > 0 && toggleCat(p.id)}
                              >
                                <TableCell className="font-medium">
                                  <span className="flex items-center gap-1.5">
                                    {filhos.length > 0 ? (
                                      <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`} />
                                    ) : (
                                      <span className="w-4 shrink-0" />
                                    )}
                                    {p.nome}
                                    {filhos.length > 0 && (
                                      <Badge variant="secondary" className="ml-1">{filhos.length}</Badge>
                                    )}
                                  </span>
                                </TableCell>
                                <TableCell className="w-28">{acoes(p)}</TableCell>
                              </TableRow>
                              {aberto && filhos.map((f) => (
                                <TableRow key={f.id} className="bg-background transition-colors hover:bg-accent/30">
                                  <TableCell className="text-muted-foreground">
                                    <span className="flex items-center gap-2 pl-6">
                                      <span className="h-4 w-1 shrink-0 rounded-full bg-primary/30" />
                                      {f.nome}
                                    </span>
                                  </TableCell>
                                  <TableCell className="w-28">{acoes(f)}</TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          );
                        })}
                        {orfas.map((c) => (
                          <TableRow key={c.id} className="bg-background transition-colors hover:bg-accent/30">
                            <TableCell className="text-muted-foreground">
                              <span className="flex items-center gap-2">
                                <span className="h-4 w-1 shrink-0 rounded-full bg-primary/30" />
                                {c.nome}
                              </span>
                            </TableCell>
                            <TableCell className="w-28">{acoes(c)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="centros" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setCcForm({ nome: "", codigo: "", descricao: "", ativo: true }); setCcOpen(true); }} className="h-10 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
              <Plus className="mr-1.5 h-4 w-4" />Novo centro de custo
            </Button>
          </div>
          {loadingCc ? (
            <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}</div>
          ) : !centrosFiltrados?.length ? (
            <EmptyState icon={FolderCog} title="Nenhum centro de custo" description={busca ? "Nada encontrado para a busca." : "Crie centros de custo para classificar os lançamentos."} />
          ) : (
            <Card className="overflow-hidden rounded-2xl shadow-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {centrosFiltrados.map((c) => (
                    <TableRow key={c.id} className="transition-colors hover:bg-accent/30">
                      <TableCell className="text-tabular">{c.codigo ?? "—"}</TableCell>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" aria-label="Editar" className="h-8 w-8 rounded-lg"
                          onClick={() => { setCcForm({ id: c.id, nome: c.nome, codigo: c.codigo ?? "", descricao: c.descricao ?? "", ativo: c.ativo }); setCcOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" className="h-8 w-8 rounded-lg text-destructive"
                          onClick={() => setConfCc(c)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog categoria */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-md sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:max-h-[90vh] sm:w-full">
          <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">{catForm.id ? "Editar categoria" : catForm.parent_id !== "none" ? "Nova subcategoria" : "Nova categoria"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarCat.mutate(); }} className="space-y-4">
            {catForm.parent_id !== "none" && !catForm.id ? (
              <>
                <div className="grid gap-1.5">
                  <Label>Categoria</Label>
                  <div className="flex h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm font-medium">
                    {(categorias ?? []).find((c) => c.id === catForm.parent_id)?.nome ?? "—"}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Subcategoria *</Label>
                  <Input required value={catForm.nome} onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })} className="h-10 rounded-xl" placeholder="Ex.: Material de escritório" />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label>{catForm.id ? "Nome *" : "Categoria *"}</Label>
                  <Input required value={catForm.nome} onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })} className="h-10 rounded-xl" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Tipo *</Label>
                  <Select value={catForm.tipo} onValueChange={(v) => setCatForm({ ...catForm, tipo: v as "receber" | "pagar", parent_id: "none" })}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receber">Receita</SelectItem>
                      <SelectItem value="pagar">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={salvarCat.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                {salvarCat.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog centro de custo */}
      <Dialog open={ccOpen} onOpenChange={setCcOpen}>
        <DialogContent className="sm:max-w-md sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:max-h-[90vh] sm:w-full">
          <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">{ccForm.id ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarCc.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>Código</Label>
                <Input value={ccForm.codigo} onChange={(e) => setCcForm({ ...ccForm, codigo: e.target.value })} className="h-10 rounded-xl" />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label>Nome *</Label>
                <Input required value={ccForm.nome} onChange={(e) => setCcForm({ ...ccForm, nome: e.target.value })} className="h-10 rounded-xl" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea value={ccForm.descricao} onChange={(e) => setCcForm({ ...ccForm, descricao: e.target.value })} className="rounded-xl" />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={ccForm.ativo ? "1" : "0"} onValueChange={(v) => setCcForm({ ...ccForm, ativo: v === "1" })}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ativo</SelectItem>
                  <SelectItem value="0">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={salvarCc.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                {salvarCc.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confCat} onOpenChange={(v) => { if (!v) { setConfCat(null); setExclInfo(null); } }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir categoria</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confCat ? `Excluir a categoria "${confCat.nome}"?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confCat && exclInfo !== null && (exclInfo.lanc > 0 || exclInfo.filhos > 0) && (
            <div className="grid gap-3 rounded-2xl border bg-muted/40 p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{exclInfo.lanc}</strong> lançamento(s) e{" "}
                <strong className="text-foreground">{exclInfo.filhos}</strong> subcategoria(s) usam esta categoria.
                Escolha abaixo para onde movê-los.
              </p>
              <div className="grid gap-1.5">
                <Label>Mover para *</Label>
                <Select value={substituta} onValueChange={setSubstituta}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {(categorias ?? [])
                      .filter((c) => c.tipo === confCat.tipo && c.id !== confCat.id && c.parent_id !== confCat.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.parent_id ? `↳ ${c.nome}` : c.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={exclInfo === null || excluirCat.isPending}
              onClick={() => void confirmarExclusaoCat()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confCc} onOpenChange={(v) => { if (!v) setConfCc(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir centro de custo</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confCc ? `Excluir o centro de custo "${confCc.nome}"?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confCc) excluirCc.mutate(confCc.id); setConfCc(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
