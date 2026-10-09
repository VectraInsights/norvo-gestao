/* eslint-disable @typescript-eslint/no-explicit-any -- colunas novas (modulos/nome/email) ainda não estão em types.ts */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Plus, Search, ShieldCheck, KeyRound, Trash2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { usePermissoes } from "@/hooks/use-permissoes";
import { criarUsuarioEmpresaFn, resetarSenhaUsuarioFn } from "@/lib/usuarios-api";
import { MODULOS } from "@/lib/permissoes";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/usuarios")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "usuarios" } });
  },
});

type MembroRow = {
  id: string;
  user_id: string;
  role: string;
  modulos: string[] | null;
  nome: string | null;
  email: string | null;
};

const PAPEL_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Admin",
  viewer: "Membro",
};

const SENHA_PADRAO = "Norvo@2026";

export function UsuariosPage() {
  const { data: empresa } = useEmpresaAtual();
  const { ehAdmin, souSuperAdmin } = usePermissoes();
  const qc = useQueryClient();

  const lista = useQuery({
    enabled: !!empresa && ehAdmin,
    queryKey: ["empresa-users-list", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresa_users")
        .select("id, user_id, role, modulos, nome, email")
        .eq("empresa_id", empresa!.id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as MembroRow[];
    },
  });

  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista.data ?? []).filter((m) => {
      if (!q) return true;
      return (m.nome || "").toLowerCase().includes(q)
        || (m.email || "").toLowerCase().includes(q);
    });
  }, [lista.data, busca]);

  const token = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session!.access_token;
  };

  // ---- Novo usuário ----
  const [openNovo, setOpenNovo] = useState(false);
  const [formN, setFormN] = useState({
    nome: "",
    email: "",
    senha: SENHA_PADRAO,
    papel: "viewer",
    modulos: [] as string[],
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!formN.nome.trim()) throw new Error("Informe o nome");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formN.email)) throw new Error("E-mail inválido");
      if (formN.senha.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
      return criarUsuarioEmpresaFn({
        data: {
          token: await token(),
          empresa_id: empresa.id,
          nome: formN.nome.trim(),
          email: formN.email,
          senha: formN.senha,
          modulos: formN.papel === "admin" ? [] : formN.modulos,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        `Usuário criado! Envie a senha temporária para ${formN.email} — ele poderá trocá-la no menu Minha conta.`,
      );
      qc.invalidateQueries({ queryKey: ["empresa-users-list"] });
      setOpenNovo(false);
      setFormN({ nome: "", email: "", senha: SENHA_PADRAO, papel: "viewer", modulos: [] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Editar permissões ----
  const [editando, setEditando] = useState<MembroRow | null>(null);
  const [formE, setFormE] = useState({ papel: "viewer", modulos: [] as string[], nome: "" });

  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!editando || !empresa) throw new Error("Nada para salvar");
      if (!formE.nome.trim()) throw new Error("Informe o nome");
      const payload: any =
        editando.role === "owner"
          ? { nome: formE.nome.trim() }
          : {
              role: formE.papel,
              nome: formE.nome.trim(),
              modulos: formE.papel === "admin" ? [] : formE.modulos,
            };
      const { error } = await (supabase.from("empresa_users") as any)
        .update(payload)
        .eq("id", editando.id)
        .eq("empresa_id", empresa.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados");
      qc.invalidateQueries({ queryKey: ["empresa-users-list"] });
      qc.invalidateQueries({ queryKey: ["minha-permissao"] });
      setEditando(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Resetar senha ----
  const [resetando, setResetando] = useState<MembroRow | null>(null);
  const [novaSenha, setNovaSenha] = useState(SENHA_PADRAO);

  const resetar = useMutation({
    mutationFn: async () => {
      if (!resetando || !empresa) throw new Error("Nada para fazer");
      if (novaSenha.length < 6) throw new Error("Senha deve ter ao menos 6 caracteres");
      return resetarSenhaUsuarioFn({
        data: {
          token: await token(),
          empresa_id: empresa.id,
          empresa_user_id: resetando.id,
          novaSenha,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Senha redefinida para ${resetando?.email}`);
      setResetando(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Remover acesso ----
  const remover = useMutation({
    mutationFn: async (id: string) => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const { error } = await supabase
        .from("empresa_users")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresa.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso removido");
      qc.invalidateQueries({ queryKey: ["empresa-users-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ehAdmin) {
    return (
      <Card className="rounded-2xl p-8 text-center text-sm leading-relaxed text-muted-foreground shadow-panel sm:p-10">
        Apenas administradores da empresa acessam esta página.
      </Card>
    );
  }

  const abrirEdicao = (m: MembroRow) => {
    setEditando(m);
    setFormE({
      papel: m.role === "admin" ? "admin" : "viewer",
      modulos: m.modulos ?? [],
      nome: m.nome ?? "",
    });
  };

  const toggleModulo = (listaAtual: string[], key: string) =>
    listaAtual.includes(key) ? listaAtual.filter((k) => k !== key) : [...listaAtual, key];

  const labelModulos = (m: MembroRow) =>
    m.role === "owner" || m.role === "admin"
      ? "Todos"
      : (m.modulos ?? []).length === 0
        ? "—"
        : (m.modulos ?? []).map((k) => MODULOS.find((x) => x.key === k)?.label ?? k).join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configurações"
        title="Usuários e acessos"
        description={
          souSuperAdmin
            ? "Crie usuários com senha padrão e defina quais módulos cada um pode usar."
            : "Gerencie os usuários desta empresa e os módulos que podem usar."
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por nome ou e-mail..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setOpenNovo(true)} className="h-10 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl p-0 shadow-panel">
        {lista.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-2/3 rounded-xl" />
          </div>
        ) : !filtrados || filtrados.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState icon={Users} title="Nenhum usuário" description={busca ? "Nada encontrado para a busca." : "Crie o primeiro acesso."} />
          </div>
        ) : (
          <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:px-3">
            <TableHeader className="static bg-card supports-[backdrop-filter]:bg-card">
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((m) => (
                <TableRow key={m.id} className="transition-colors hover:bg-accent/30">
                  <TableCell className="font-medium">{m.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        m.role === "owner"
                          ? "bg-primary/10 text-primary"
                          : m.role === "admin"
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {PAPEL_LABEL[m.role] ?? m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{labelModulos(m)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          title="Editar permissões"
                          onClick={() => abrirEdicao(m)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {m.role !== "owner" && (
                        <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          title="Resetar senha"
                          onClick={() => {
                            setResetando(m);
                            setNovaSenha(SENHA_PADRAO);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                              title="Remover acesso"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl">
                            <AlertDialogHeader className="gap-1.5">
                              <AlertDialogTitle className="tracking-tight">Remover acesso de {m.nome}?</AlertDialogTitle>
                              <AlertDialogDescription className="leading-relaxed">
                                Ele perderá o acesso a esta empresa imediatamente. A conta de login
                                continua existindo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="gap-2">
                              <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
                              <AlertDialogAction data-acao onClick={() => remover.mutate(m.id)} className="h-10 rounded-xl">
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        </>
                        )}
                      </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Novo usuário */}
      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Criar acesso de usuário</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={formN.nome}
                onChange={(e) => setFormN((f) => ({ ...f, nome: e.target.value }))}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={formN.email}
                  onChange={(e) => setFormN((f) => ({ ...f, email: e.target.value }))}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Senha padrão *</Label>
                <Input
                  value={formN.senha}
                  onChange={(e) => setFormN((f) => ({ ...f, senha: e.target.value }))}
                  className="h-10 rounded-xl"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  A pessoa troca a senha em “Minha conta”.
                </p>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Papel</Label>
              <Select
                value={formN.papel}
                onValueChange={(v) => setFormN((f) => ({ ...f, papel: v }))}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Membro — usa só os módulos marcados</SelectItem>
                  <SelectItem value="admin">Admin — gerencia usuários e vê tudo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formN.papel === "viewer" && (
              <div className="grid gap-1.5">
                <Label>Módulos permitidos</Label>
                <div className="grid grid-cols-1 gap-1 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
                  {MODULOS.map((m) => (
                    <label key={m.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={formN.modulos.includes(m.key)}
                        onChange={() =>
                          setFormN((f) => ({ ...f, modulos: toggleModulo(f.modulos, m.key) }))
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Sem marcação, o usuário vê apenas o Dashboard.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenNovo(false)} className="h-10 rounded-xl">
              Cancelar
            </Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
              Criar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar permissões */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Dados de {editando?.nome}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Nome</Label>
                <Input value={formE.nome} onChange={(e) => setFormE((f) => ({ ...f, nome: e.target.value }))} className="h-10 rounded-xl" />
              </div>
              {editando.role !== "owner" && (
                <div className="grid gap-1.5">
                  <Label>Papel</Label>
                  <Select
                    value={formE.papel}
                    onValueChange={(v) => setFormE((f) => ({ ...f, papel: v }))}
                  >
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Membro — usa só os módulos marcados</SelectItem>
                      <SelectItem value="admin">Admin — gerencia usuários e vê tudo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editando.role !== "owner" && formE.papel === "viewer" && (
                <div className="grid gap-1.5">
                  <Label>Módulos permitidos</Label>
                  <div className="grid grid-cols-1 gap-1 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
                    {MODULOS.map((m) => (
                      <label key={m.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={formE.modulos.includes(m.key)}
                          onChange={() =>
                            setFormE((f) => ({ ...f, modulos: toggleModulo(f.modulos, m.key) }))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditando(null)} className="h-10 rounded-xl">
              Cancelar
            </Button>
            <Button onClick={() => salvarEdicao.mutate()} disabled={salvarEdicao.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resetar senha */}
      <Dialog open={!!resetando} onOpenChange={(o) => !o && setResetando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Redefinir senha de {resetando?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Nova senha padrão</Label>
            <Input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetando(null)} className="h-10 rounded-xl">
              Cancelar
            </Button>
            <Button onClick={() => resetar.mutate()} disabled={resetar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
