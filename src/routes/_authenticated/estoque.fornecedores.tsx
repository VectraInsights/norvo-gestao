import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  Pencil,
} from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { maskDoc } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque/fornecedores")({
  component: Fornecedores,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center shadow-sm animate-in fade-in zoom-in duration-300 sm:p-10"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
        <Search className="h-6 w-6 text-destructive" />
      </div>
      <p className="mt-4 text-base font-semibold tracking-tight text-foreground">
        Não foi possível carregar os fornecedores
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro desconhecido"}
      </p>
    </div>
  ),
});

type Contato = {
  id: string;
  nome: string;
  tipo: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
};

const emptyForm = () => ({
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  observacoes: "",
  isCliente: false,
  isFornecedor: true,
});

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function Fornecedores() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState<Contato | null>(null);
  const [deleting, setDeleting] = useState<Contato | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["fornecedores", empresa?.id] as const,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async ({ signal }) => {
      // Busca em páginas para nunca cortar a lista (sem limite silencioso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("contatos")
          .select(
            "id,nome,tipo,documento,email,telefone,cep,logradouro,numero,complemento,bairro,cidade,uf,observacoes",
          )
          .eq("empresa_id", empresa!.id)
          .in("tipo", ["fornecedor", "ambos"])
          .order("nome")
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as Contato[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    return (contatos ?? []).filter((c) => {
      if (!q) return true;
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
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const contatosVisiveis = filtrados.slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );

  const lookupCnpj = async () => {
    const digits = onlyDigits(form.documento);
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    setLookingUp(true);
    try {
      let d: Record<string, string | undefined> | null = null;
      // Tenta BrasilAPI primeiro, depois ReceitaWS como fallback
      for (const url of [
        `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
        `https://receitaws.com.br/v1/cnpj/${digits}`,
      ]) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            d = await res.json();
            break;
          }
        } catch {
          /* tenta próxima */
        }
      }
      if (!d) throw new Error("CNPJ não encontrado nas APIs públicas");
      setForm((f) => ({
        ...f,
        documento: maskDoc(digits),
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
      const tipo =
        input.isCliente && input.isFornecedor
          ? "ambos"
          : input.isFornecedor
            ? "fornecedor"
            : "cliente";
      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente } = await supabase
          .from("contatos")
          .select("id,nome")
          .eq("empresa_id", empresa.id)
          .eq("documento", doc)
          .maybeSingle();
        if (existente) throw new Error(`Já cadastrado: ${existente.nome}`);
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
      toast.success("Fornecedor criado");
      setOpen(false);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      qc.invalidateQueries({ queryKey: ["contatos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm> & { id: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const tipo =
        input.isCliente && input.isFornecedor
          ? "ambos"
          : input.isFornecedor
            ? "fornecedor"
            : "cliente";
      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente } = await supabase
          .from("contatos")
          .select("id,nome")
          .eq("empresa_id", empresa.id)
          .eq("documento", doc)
          .neq("id", input.id)
          .maybeSingle();
        if (existente)
          throw new Error(`Já existe outro contato com este CPF/CNPJ: ${existente.nome}`);
      }
      const { error } = await supabase
        .from("contatos")
        .update({
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
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornecedor atualizado");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      qc.invalidateQueries({ queryKey: ["contatos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornecedor excluído");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      qc.invalidateQueries({ queryKey: ["contatos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Contato) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      documento: maskDoc(c.documento ?? ""),
      email: c.email ?? "",
      telefone: c.telefone ?? "",
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numero: c.numero ?? "",
      complemento: c.complemento ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      uf: c.uf ?? "",
      observacoes: c.observacoes ?? "",
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
      <PageHeader
        eyebrow="Estoque"
        title="Fornecedores"
        description="Fornecedores cadastrados para compras e reposição de estoque."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 rounded-xl pl-10 pr-10 shadow-sm" placeholder="Buscar por nome, CPF/CNPJ ou cidade..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreate} className="h-9 rounded-xl px-4 shadow-sm transition-all hover:shadow-md active:scale-95">
            <Plus className="mr-1 h-4 w-4" />
            Novo fornecedor
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        </Card>
      ) : !filtrados?.length ? (
        <EmptyState
          icon={Users}
          title="Nenhum fornecedor"
          description={busca ? "Nada encontrado para a busca." : "Cadastre seu primeiro fornecedor."}
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatosVisiveis.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-tabular">{c.documento ? maskDoc(c.documento) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ?? c.telefone ?? "—"}
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
                              onClick={() => openEdit(c)}
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
                              onClick={() => setDeleting(c)}
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
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Mostrando {(paginaAtual - 1) * pageSize + 1}–
              {Math.min(paginaAtual * pageSize, filtrados?.length ?? 0)} de {filtrados?.length ?? 0}
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!criar.isPending && !editar.isPending) {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setForm(emptyForm());
            }
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) {
                editar.mutate({ ...form, id: editing.id });
              } else {
                criar.mutate(form);
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: maskDoc(e.target.value) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupCnpj();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupCnpj}
                  disabled={lookingUp || !form.documento}
                >
                  {lookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label>Nome / Razão social *</Label>
              <Input
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.isCliente}
                    onCheckedChange={(v) => setForm({ ...form, isCliente: v === true })}
                  />{" "}
                  Cliente
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.isFornecedor}
                    onCheckedChange={(v) => setForm({ ...form, isFornecedor: v === true })}
                  />{" "}
                  Fornecedor
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>CEP</Label>
                <Input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Logradouro</Label>
                <Input
                  value={form.logradouro}
                  onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Número</Label>
                <Input
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Complemento</Label>
                <Input
                  value={form.complemento}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Bairro</Label>
                <Input
                  value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </div>
              <div>
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={criar.isPending || editar.isPending} className="h-10 rounded-xl px-6">
                {(criar.isPending || editar.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor</AlertDialogTitle>
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
