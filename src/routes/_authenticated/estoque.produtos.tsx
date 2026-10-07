import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Combobox } from "@/components/erp/combobox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, num } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

export const Route = createFileRoute("/_authenticated/estoque/produtos")({
  component: Produtos,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar os produtos: {error.message}
    </div>
  ),
});

type Produto = {
  id: string;
  codigo: string | null;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  preco_custo: number | null;
  preco_venda: number | null;
  ativo: boolean;
};

const EMPTY_FORM = {
  codigo: "",
  nome: "",
  categoria: "",
  unidade: "UN",
  preco_venda: "0",
  preco_custo: "0",
  estoque_atual: "0",
  estoque_minimo: "0",
};

function Produtos() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState("todas");
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [deleting, setDeleting] = useState<Produto | null>(null);

  // Trilha de auditoria (tabela auditoria_eventos): quem criou/editou/excluiu
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
        modulo: "estoque",
        acao,
        entidade: "produto",
        detalhes: { ...detalhes, descricao, user_nome: nome, user_email: u.email || "" },
      } as any);
    } catch { /* trilha indisponível: não bloqueia o fluxo */ }
  };
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-produtos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "estoque")
        .eq("entidade", "produto")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: produtos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos", empresa?.id],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("produtos")
        .select(
          "id,codigo,nome,categoria,unidade,estoque_atual,estoque_minimo,preco_custo,preco_venda,ativo",
        )
        .eq("empresa_id", empresa!.id)
        .order("nome")
        .limit(1000)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Produto[];
    },
  });

  const categorias = useMemo(
    () => [...new Set((produtos ?? []).map((p) => p.categoria).filter(Boolean))].sort() as string[],
    [produtos],
  );

  const criarMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const nome = form.nome.trim();
      if (!nome) throw new Error("Nome é obrigatório");
      const custo = Number(form.preco_custo);
      const venda = Number(form.preco_venda);
      if (Number.isNaN(custo) || Number.isNaN(venda)) throw new Error("Preços inválidos");
      if (venda > 0 && custo > venda) throw new Error("Preço de venda menor que o custo");
      const { error } = await supabase.from("produtos").insert({
        empresa_id: empresa.id,
        codigo: form.codigo.trim() || null,
        nome,
        categoria: form.categoria.trim() || null,
        unidade: form.unidade.trim() || "UN",
        preco_custo: custo,
        preco_venda: venda,
        estoque_atual: Number(form.estoque_atual) || 0,
        estoque_minimo: Number(form.estoque_minimo) || 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto criado");
      void registrarAuditoria("criar", `Produto "${form.nome.trim()}" criado`, { nome: form.nome.trim() });
      setOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editarMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nenhum produto selecionado");
      const nome = form.nome.trim();
      if (!nome) throw new Error("Nome é obrigatório");
      const custo = Number(form.preco_custo);
      const venda = Number(form.preco_venda);
      if (Number.isNaN(custo) || Number.isNaN(venda)) throw new Error("Preços inválidos");
      const { error } = await supabase
        .from("produtos")
        .update({
          codigo: form.codigo.trim() || null,
          nome,
          categoria: form.categoria.trim() || null,
          unidade: form.unidade.trim() || "UN",
          preco_custo: custo,
          preco_venda: venda,
          estoque_atual: Number(form.estoque_atual) || 0,
          estoque_minimo: Number(form.estoque_minimo) || 0,
        } as never)
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto atualizado");
      void registrarAuditoria("alterar", `Produto "${form.nome.trim()}" alterado`, { nome: form.nome.trim() });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Produto excluído");
      void registrarAuditoria("excluir", "Produto excluído", { produto_id: id });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["produtos-inventario"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = useMemo(() => {
    if (!produtos) return [];
    let base = produtos;
    if (filtroCat !== "todas") base = base.filter((p) => p.categoria === filtroCat);
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) => p.nome.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q),
    );
  }, [produtos, busca, filtroCat]);

  const pageSize = 25;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const produtosVisiveis = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      editarMut.mutate();
    } else {
      criarMut.mutate();
    }
  };

  const openEdit = (p: Produto) => {
    setEditing(p);
    setForm({
      codigo: p.codigo ?? "",
      nome: p.nome,
      categoria: p.categoria ?? "",
      unidade: p.unidade ?? "UN",
      preco_custo: String(p.preco_custo ?? 0),
      preco_venda: String(p.preco_venda ?? 0),
      estoque_atual: String(p.estoque_atual ?? 0),
      estoque_minimo: String(p.estoque_minimo ?? 0),
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Produtos"
        description="Cadastro de produtos, preços e saldos."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            className="flex-1"
            placeholder="Buscar por nome ou código…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
        </div>
        <div className="w-48">
          <Combobox
            value={filtroCat}
            onChange={(value) => {
              setFiltroCat(value);
              setPagina(1);
            }}
            options={[{ value: "todas", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]}
            placeholder="Selecione"
            searchPlaceholder="Digite para buscar..."
            emptyText="Nenhum item encontrado."
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTrilhaOpen(true)} className="h-9 rounded-xl px-4 active:scale-95">
            Trilha de auditoria
          </Button>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                if (!criarMut.isPending && !editarMut.isPending) {
                  setOpen(v);
                  if (!v) {
                    setEditing(null);
                    setForm(EMPTY_FORM);
                  }
                }
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="mr-1 h-4 w-4" />
                  Novo produto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-[1fr_2fr] gap-3">
                    <div>
                      <Label>Código</Label>
                      <Input
                        value={form.codigo}
                        onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Nome</Label>
                      <Input
                        required
                        value={form.nome}
                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Combobox
                      value={form.categoria || "__none__"}
                      onChange={(v) =>
                        setForm({ ...form, categoria: v === "__none__" ? "" : v })
                      }
                      options={[{ value: "__none__", label: "Sem categoria" }, ...categorias.map((c) => ({ value: c, label: c }))]}
                      placeholder="Selecione uma categoria"
                      searchPlaceholder="Digite para buscar..."
                      emptyText="Nenhum item encontrado."
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Unidade</Label>
                      <Input
                        value={form.unidade}
                        onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Preço custo</Label>
                      <MoneyInput
                        value={form.preco_custo}
                        onChange={(v) => setForm({ ...form, preco_custo: v })}
                        prefix=""
                      />
                    </div>
                    <div>
                      <Label>Preço venda</Label>
                      <MoneyInput
                        value={form.preco_venda}
                        onChange={(v) => setForm({ ...form, preco_venda: v })}
                        prefix=""
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Estoque inicial</Label>
                      <MoneyInput
                        prefix=""
                        decimals={3}
                        value={form.estoque_atual}
                        onChange={(v) => setForm({ ...form, estoque_atual: v })}
                      />
                    </div>
                    <div>
                      <Label>Estoque mínimo</Label>
                      <MoneyInput
                        prefix=""
                        decimals={3}
                        value={form.estoque_minimo}
                        onChange={(v) => setForm({ ...form, estoque_minimo: v })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={criarMut.isPending || editarMut.isPending}>
                      {criarMut.isPending || editarMut.isPending ? "Salvando…" : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !filtrados.length ? (
        <EmptyState
          icon={Package}
          title={busca ? "Nenhum resultado" : "Nenhum produto"}
          description={
            busca
              ? "Ajuste o filtro de busca."
              : "Cadastre seu primeiro produto para começar a movimentar o estoque."
          }
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>UN</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosVisiveis.map((p) => {
                const atual = Number(p.estoque_atual ?? 0);
                const min = Number(p.estoque_minimo ?? 0);
                const baixo = min > 0 && atual <= min;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-tabular text-muted-foreground">
                      {p.codigo ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>
                      {p.categoria ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          {p.categoria}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{p.unidade ?? "—"}</TableCell>
                    <TableCell className="text-right text-tabular">
                      <div className="inline-flex items-center gap-2">
                        {baixo && (
                          <Badge
                            variant="secondary"
                            className="bg-warning/20 text-warning-foreground"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            baixo
                          </Badge>
                        )}
                        {num(atual)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-tabular">
                      {brl(p.preco_custo ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-tabular font-medium">
                      {brl(p.preco_venda ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleting(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Mostrando {(paginaAtual - 1) * pageSize + 1}–
              {Math.min(paginaAtual * pageSize, filtrados.length)} de {filtrados.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Página anterior"
                disabled={paginaAtual === 1}
                onClick={() => setPagina((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Próxima página"
                disabled={paginaAtual === totalPaginas}
                onClick={() => setPagina((value) => Math.min(totalPaginas, value + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleting?.nome}</strong>? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && excluirMut.mutate(deleting.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trilhaOpen} onOpenChange={setTrilhaOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Trilha de auditoria — Produtos</DialogTitle>
          </DialogHeader>
          {trilhaQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : trilhaQuery.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Trilha indisponível no momento.</p>
          ) : (trilhaQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">Nenhum evento registrado ainda. Criar, editar ou excluir gera registros aqui.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(trilhaQuery.data ?? []).map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                    ev.acao === "excluir" ? "bg-destructive/10 text-destructive"
                    : ev.acao === "alterar" ? "bg-primary/10 text-primary"
                    : "bg-success/10 text-success"
                  }`}>
                    {ev.acao === "excluir" ? "Excluiu" : ev.acao === "alterar" ? "Alterou" : "Criou"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{ev.detalhes?.descricao || "—"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ev.detalhes?.user_nome || ev.detalhes?.user_email || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
