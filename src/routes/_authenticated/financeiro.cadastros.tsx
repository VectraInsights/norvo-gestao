import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, FolderCog, Loader2 } from "lucide-react";
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
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Página não encontrada.</div>,
});

type Categoria = { id: string; nome: string; tipo: "receber" | "pagar"; parent_id: string | null; cor: string | null };
type Centro = { id: string; nome: string; codigo: string | null; descricao: string | null; ativo: boolean };

function CadastrosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();

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
      const duplicada = (categorias ?? []).some(
        (c) => c.id !== catForm.id && norm(c.nome) === norm(catForm.nome),
      );
      if (duplicada) throw new Error("Já existe uma categoria com esse nome");
      const payload = {
        empresa_id: empresa.id,
        nome: catForm.nome.trim(),
        tipo: catForm.tipo,
        parent_id: catForm.parent_id === "none" ? null : catForm.parent_id,
      };
      const { error } = catForm.id
        ? await supabase.from("categorias_financeiras").update(payload).eq("id", catForm.id)
        : await supabase.from("categorias_financeiras").insert(payload);
      if (error) throw error;
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

  const pais = (categorias ?? []).filter((c) => !c.parent_id);
  const nomePai = (id: string | null) => pais.find((p) => p.id === id)?.nome ?? "—";
  const [catTipoTab, setCatTipoTab] = useState<"pagar" | "receber">("pagar");
  const categoriasFiltradas = (categorias ?? []).filter((c) => c.tipo === catTipoTab);

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

  return (
    <div className="p-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Cadastros"
        description="Gerencie as categorias financeiras e os centros de custo utilizados nos lançamentos."
        actions={
          <Button variant="outline" size="sm">
            Adicionar trilha de auditoria
          </Button>
        }
      />

      <Tabs defaultValue="categorias">
        <TabsList>
          <TabsTrigger value="categorias">Categorias financeiras</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
        </TabsList>

        {/* Categorias */}
        <TabsContent value="categorias" className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Tabs value={catTipoTab} onValueChange={(v) => setCatTipoTab(v as "pagar" | "receber")}>
              <TabsList>
                <TabsTrigger value="pagar">Despesas</TabsTrigger>
                <TabsTrigger value="receber">Receitas</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => { setCatForm({ nome: "", tipo: catTipoTab, parent_id: "none" }); setCatOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Nova categoria
            </Button>
          </div>
          {loadingCat ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
          ) : !categoriasFiltradas.length ? (
            <EmptyState
              icon={FolderCog}
              title={catTipoTab === "pagar" ? "Nenhuma categoria de despesa" : "Nenhuma categoria de receita"}
              description="Crie a primeira categoria financeira deste tipo."
            />
          ) : (
            <Card className="overflow-hidden shadow-panel">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria pai</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoriasFiltradas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className={c.parent_id ? "pl-8 text-muted-foreground" : "font-medium"}>{c.nome}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.tipo === "receber" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                          {c.tipo === "receber" ? "Receita" : "Despesa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.parent_id ? nomePai(c.parent_id) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" aria-label="Editar"
                          onClick={() => { setCatForm({ id: c.id, nome: c.nome, tipo: c.tipo, parent_id: c.parent_id ?? "none" }); setCatOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" className="text-destructive"
                          onClick={() => { if (confirm(`Excluir a categoria "${c.nome}"?`)) excluirCat.mutate(c.id); }}>
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

        <TabsContent value="centros" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => { setCcForm({ nome: "", codigo: "", descricao: "", ativo: true }); setCcOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Novo centro de custo
            </Button>
          </div>
          {loadingCc ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
          ) : !centros?.length ? (
            <EmptyState icon={FolderCog} title="Nenhum centro de custo" description="Crie centros de custo para classificar os lançamentos." />
          ) : (
            <Card className="overflow-hidden shadow-panel">
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
                  {centros.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-tabular">{c.codigo ?? "—"}</TableCell>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                          {c.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" aria-label="Editar"
                          onClick={() => { setCcForm({ id: c.id, nome: c.nome, codigo: c.codigo ?? "", descricao: c.descricao ?? "", ativo: c.ativo }); setCcOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" className="text-destructive"
                          onClick={() => { if (confirm(`Excluir o centro de custo "${c.nome}"?`)) excluirCc.mutate(c.id); }}>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{catForm.id ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarCat.mutate(); }} className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input required value={catForm.nome} onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })} />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={catForm.tipo} onValueChange={(v) => setCatForm({ ...catForm, tipo: v as "receber" | "pagar", parent_id: "none" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receber">Receita</SelectItem>
                  <SelectItem value="pagar">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria pai</Label>
              <Select value={catForm.parent_id} onValueChange={(v) => setCatForm({ ...catForm, parent_id: v })}>
                <SelectTrigger><SelectValue placeholder="Nenhuma (categoria principal)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (categoria principal)</SelectItem>
                  {pais.filter((p) => p.tipo === catForm.tipo && p.id !== catForm.id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={salvarCat.isPending}>
                {salvarCat.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog centro de custo */}
      <Dialog open={ccOpen} onOpenChange={setCcOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{ccForm.id ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); salvarCc.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Código</Label>
                <Input value={ccForm.codigo} onChange={(e) => setCcForm({ ...ccForm, codigo: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input required value={ccForm.nome} onChange={(e) => setCcForm({ ...ccForm, nome: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={ccForm.descricao} onChange={(e) => setCcForm({ ...ccForm, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={ccForm.ativo ? "1" : "0"} onValueChange={(v) => setCcForm({ ...ccForm, ativo: v === "1" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ativo</SelectItem>
                  <SelectItem value="0">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={salvarCc.isPending}>
                {salvarCc.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
