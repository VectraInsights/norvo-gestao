/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas ainda não estão em types.ts; padrão do projeto é cast as never/as any */
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/erp/money-input";
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
import { Users, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rh/colaboradores")({
  component: ColaboradoresPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Erro: {error.message}
    </div>
  ),
});

type Colab = {
  id: string;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  salario_base: number;
  data_admissao: string | null;
  data_demissao: string | null;
  status: string;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  observacoes: string | null;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
};

const STATUS: Record<string, string> = {
  ativo: "Ativo",
  ferias: "Férias",
  afastado: "Afastado",
  demitido: "Demitido",
};

const soDigitos = (s: string) => s.replace(/\D/g, "");

function validarForm(form: ReturnType<typeof formInicial>) {
  if (!form.nome.trim()) throw new Error("Nome é obrigatório");
  if (soDigitos(form.cpf).length !== 11) throw new Error("CPF deve ter 11 dígitos");
  if (!form.cargo.trim()) throw new Error("Cargo é obrigatório");
  if (form.cargo.toLowerCase().includes("motorist")) {
    if (!form.cnh_numero.trim())
      throw new Error("Para o cargo de motorista, informe o número da CNH");
    if (!form.cnh_categoria.trim())
      throw new Error("Para o cargo de motorista, informe a categoria da CNH");
  }
  const tels = form.telefones.map((t) => t.trim()).filter(Boolean);
  if (tels.length === 0) throw new Error("Informe pelo menos um telefone");
  for (const t of tels)
    if (soDigitos(t).length < 10) throw new Error(`Telefone inválido: "${t}" (use DDD + número)`);
  if (!(Number(form.salario_base) > 0)) throw new Error("Salário base é obrigatório");
  if (!form.data_admissao) throw new Error("Data de admissão é obrigatória");
  if (form.status === "demitido" && !form.data_demissao)
    throw new Error("Informe a data de demissão para colaboradores demitidos");
}

function formInicial() {
  return {
    nome: "",
    cpf: "",
    cargo: "",
    email: "",
    telefones: [""] as string[],
    salario_base: "0",
    data_admissao: "",
    data_demissao: "",
    status: "ativo",
    pix: "",
    banco: "",
    agencia: "",
    conta: "",
    observacoes: "",
    cnh_numero: "",
    cnh_categoria: "",
    cnh_validade: "",
  };
}

function ColaboradoresPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Colab | null>(null);
  const [form, setForm] = useState(formInicial);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: colabs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Colab[];
    },
  });

  const { data: cargos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["cargos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("cargos" as never)
        .select("id,nome,empresa_id")
        .or(`empresa_id.is.null,empresa_id.eq.${empresa!.id}`)
        .order("empresa_id", { ascending: false })
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; nome: string; empresa_id: string | null }[];
    },
  });

  // quantos funcionários usam cada cargo (vínculo pelo NOME do cargo)
  const usoCargo = (nome: string) =>
    (colabs ?? []).filter(
      (x) => (x.cargo ?? "").trim().toLowerCase() === nome.trim().toLowerCase(),
    ).length;

  // autocomplete do campo cargo: mostra todos ao focar, filtra conforme digita
  const [cargoFoco, setCargoFoco] = useState(false);
  const cargoSugestoes = useMemo(() => {
    const q = form.cargo.trim().toLowerCase();
    const nomes: string[] = [];
    for (const c of cargos) {
      if (
        (!q || c.nome.toLowerCase().includes(q)) &&
        !nomes.some((n) => n.toLowerCase() === c.nome.toLowerCase())
      ) {
        nomes.push(c.nome);
      }
    }
    return nomes.slice(0, 12);
  }, [cargos, form.cargo]);

  const [cargosOpen, setCargosOpen] = useState(false);
  const [novoCargo, setNovoCargo] = useState("");
  const [cargoEditId, setCargoEditId] = useState<string | null>(null);
  const [cargoEditNome, setCargoEditNome] = useState("");

  // filtra a lista de cargos conforme o campo "novo cargo" (vazio = mostra todos), ordem alfabética
  const cargosFiltrados = useMemo(() => {
    const q = novoCargo.trim().toLowerCase();
    const base = q ? cargos.filter((c) => c.nome.toLowerCase().includes(q)) : [...cargos];
    return base.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cargos, novoCargo]);

  const criarCargo = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const nome = novoCargo.trim();
      if (!nome) throw new Error("Informe o nome do cargo");
      const existe = cargos.some((c) => c.nome.toLowerCase() === nome.toLowerCase());
      if (existe) throw new Error("Já existe um cargo com esse nome");
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.insert({ empresa_id: empresa.id, nome });
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Já existe um cargo com esse nome");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cargo criado");
      setNovoCargo("");
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renomearCargo = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const novo = nome.trim();
      if (!novo) throw new Error("Informe o nome do cargo");
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.update({ nome: novo }).eq("id", id);
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Já existe um cargo com esse nome");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      setCargoEditId(null);
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCargo = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo excluído");
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setEditing(null);
    setForm(formInicial());
  };

  const openEdit = (c: Colab) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      cpf: c.cpf ?? "",
      cargo: c.cargo ?? "",
      email: c.email ?? "",
      telefones: (c.telefone ?? "").split(" / ").filter(Boolean) || [""],
      salario_base: String(c.salario_base ?? 0),
      data_admissao: c.data_admissao ?? "",
      data_demissao: c.data_demissao ?? "",
      status: c.status,
      pix: c.pix ?? "",
      banco: c.banco ?? "",
      agencia: c.agencia ?? "",
      conta: c.conta ?? "",
      observacoes: c.observacoes ?? "",
      cnh_numero: c.cnh_numero ?? "",
      cnh_categoria: c.cnh_categoria ?? "",
      cnh_validade: c.cnh_validade ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      validarForm(form);
      if (form.cpf) {
        const tbl2 = supabase.from("colaboradores" as never) as any;
        const q = tbl2.select("id").eq("empresa_id", empresa.id).eq("cpf", form.cpf.trim()).limit(1);
        const { data: existente } = await (editing ? q.neq("id", editing.id) : q);
        if (existente && existente.length > 0) {
          throw new Error("Já existe um colaborador com esse CPF nesta empresa");
        }
      }
      const payload: any = {
        empresa_id: empresa.id,
        nome: form.nome.trim(),
        cpf: form.cpf || null,
        cargo: form.cargo.trim() || null,
        email: form.email || null,
        telefone:
          form.telefones
            .map((t) => t.trim())
            .filter(Boolean)
            .join(" / ") || null,
        salario_base: Number(form.salario_base) || 0,
        data_admissao: form.data_admissao || null,
        data_demissao: form.data_demissao || null,
        status: form.status,
        pix: form.pix || null,
        banco: form.banco || null,
        agencia: form.agencia || null,
        conta: form.conta || null,
        observacoes: form.observacoes || null,
        cnh_numero: form.cnh_numero.trim() || null,
        cnh_categoria: form.cnh_categoria.trim() || null,
        cnh_validade: form.cnh_validade || null,
      };
      const tbl = supabase.from("colaboradores" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Colaborador atualizado" : "Colaborador cadastrado");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("colaboradores" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador excluído");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Cadastro de funcionários, cargos e dados de pagamento."
        actions={
          <div className="flex gap-2">
            <Dialog open={cargosOpen} onOpenChange={setCargosOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Cargos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Cargos</DialogTitle>
                </DialogHeader>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Novo cargo</Label>
                    <Input
                      placeholder="Digite para filtrar ou criar"
                      value={novoCargo}
                      onChange={(e) => setNovoCargo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && novoCargo.trim()) {
                          e.preventDefault();
                          criarCargo.mutate();
                        }
                      }}
                    />
                  </div>
                  <Button onClick={() => criarCargo.mutate()} disabled={criarCargo.isPending}>
                    {criarCargo.isPending ? "Criando…" : "Criar"}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  {!cargosFiltrados.length && !novoCargo.trim() ? (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum cargo cadastrado.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {cargosFiltrados.map((c) => {
                        const usos = usoCargo(c.nome);
                        const emEdicao = cargoEditId === c.id;
                        return (
                          <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            {emEdicao ? (
                              <form
                                className="flex flex-1 items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  renomearCargo.mutate({ id: c.id, nome: cargoEditNome });
                                }}
                              >
                                <Input
                                  autoFocus
                                  value={cargoEditNome}
                                  onChange={(e) => setCargoEditNome(e.target.value)}
                                  onBlur={() => setCargoEditId(null)}
                                />
                                <Button type="submit" size="sm" disabled={renomearCargo.isPending}>
                                  Salvar
                                </Button>
                              </form>
                            ) : (
                              <>
                                <span>
                                  {c.nome}
                                  {usos > 0 && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {usos} funcionário{usos > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </span>
                                <span className="flex shrink-0 gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Renomear"
                                    onClick={() => { setCargoEditId(c.id); setCargoEditNome(c.nome); }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Excluir"
                                    title={usos > 0 ? "Vinculado a funcionário(s) — não pode ser excluído" : "Excluir"}
                                    disabled={usos > 0}
                                    onClick={() => excluirCargo.mutate(c.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Crie, renomeie e exclua qualquer cargo. Só não é possível excluir um cargo
                  vinculado ao cadastro de algum funcionário. Viagens consideram motoristas
                  todos os colaboradores com cargo contendo "Motorista".
                </p>
              </DialogContent>
            </Dialog>
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) reset();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo colaborador
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 max-h-[70vh] overflow-y-auto p-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>CPF *</Label>
                      <Input
                        placeholder="000.000.000-00"
                        value={form.cpf}
                        onChange={(e) => set("cpf", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Cargo *</Label>
                      <div className="relative">
                        <Input
                          placeholder="Digite ou selecione o cargo"
                          value={form.cargo}
                          onChange={(e) => set("cargo", e.target.value)}
                          onFocus={() => setCargoFoco(true)}
                          onBlur={() => setTimeout(() => setCargoFoco(false), 200)}
                          autoComplete="off"
                        />
                        {cargoFoco && cargoSugestoes.length > 0 && (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                            {cargoSugestoes.map((nome) => (
                              <button
                                type="button"
                                key={nome}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  set("cargo", nome);
                                  setCargoFoco(false);
                                }}
                              >
                                {nome}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => set("status", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Telefone(s) *</Label>
                      <div className="space-y-2">
                        {form.telefones.map((tel, i) => (
                          <div key={i} className="flex gap-1">
                            <Input
                              placeholder="(00) 00000-0000"
                              value={tel}
                              onChange={(e) =>
                                set(
                                  "telefones",
                                  form.telefones.map((t, j) => (j === i ? e.target.value : t)),
                                )
                              }
                            />
                            {form.telefones.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 shrink-0"
                                onClick={() =>
                                  set(
                                    "telefones",
                                    form.telefones.filter((_, j) => j !== i),
                                  )
                                }
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => set("telefones", [...form.telefones, ""])}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Outro número
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Salário base *</Label>
                      <MoneyInput
                        value={form.salario_base}
                        onChange={(v) => set("salario_base", v)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Data de admissão *</Label>
                      <DateInput
                        value={form.data_admissao}
                        onChange={(v) => set("data_admissao", v)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Data de demissão</Label>
                      <DateInput
                        value={form.data_demissao}
                        onChange={(v) => set("data_demissao", v)}
                      />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>PIX</Label>
                      <Input value={form.pix} onChange={(e) => set("pix", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Banco</Label>
                      <Input value={form.banco} onChange={(e) => set("banco", e.target.value)} />
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      CNH
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>
                          Nº da CNH {form.cargo.toLowerCase().includes("motorist") ? "*" : ""}
                        </Label>
                        <Input
                          value={form.cnh_numero}
                          onChange={(e) => set("cnh_numero", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>
                          Categoria {form.cargo.toLowerCase().includes("motorist") ? "*" : ""}
                        </Label>
                        <Select
                          value={form.cnh_categoria || undefined}
                          onValueChange={(v) => set("cnh_categoria", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"].map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Validade</Label>
                        <DateInput
                          value={form.cnh_validade}
                          onChange={(v) => set("cnh_validade", v)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Agência</Label>
                      <Input
                        value={form.agencia}
                        onChange={(e) => set("agencia", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Conta</Label>
                      <Input value={form.conta} onChange={(e) => set("conta", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Observações</Label>
                    <Textarea
                      rows={2}
                      value={form.observacoes}
                      onChange={(e) => set("observacoes", e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !colabs || colabs.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum colaborador ainda"
            description="Cadastre o primeiro colaborador."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colabs.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => openEdit(c)}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.cargo ?? "—"}</TableCell>
                  <TableCell>{STATUS[c.status] ?? c.status}</TableCell>
                  <TableCell>{c.data_admissao ? dateBR(c.data_admissao) : "—"}</TableCell>
                  <TableCell className="text-right text-tabular">
                    {brl(c.salario_base ?? 0)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
                          <AlertDialogDescription>
                            As folhas vinculadas também serão removidas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(c.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
