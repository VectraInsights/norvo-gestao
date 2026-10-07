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
import { Combobox } from "@/components/erp/combobox";
import { NovoContatoDialog } from "@/components/erp/novo-contato-dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, Plus, Trash2, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projetos/os")({
  component: OSPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Erro ao carregar ordens de serviço: {error.message}
    </div>
  ),
});

type OS = {
  id: string;
  numero: number | null;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  valor: number;
  data_abertura: string;
  data_prevista: string | null;
  data_conclusao: string | null;
  cliente_id: string | null;
  projeto_id: string | null;
  observacoes: string | null;
  contatos?: { nome: string } | null;
  projetos?: { nome: string; cor: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando: "Aguardando",
  concluida: "Concluída",
  cancelada: "Cancelada",
  faturada: "Faturada",
};
const STATUS_COLOR: Record<string, string> = {
  aberta: "bg-primary/10 text-primary border-primary/20",
  em_execucao: "bg-primary/10 text-primary border-primary/20",
  aguardando: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  concluida: "bg-success/10 text-success border-success/20",
  cancelada: "bg-destructive/10 text-destructive border-destructive/20",
  faturada: "bg-success/10 text-success border-success/20",
};
const PRIO_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};
const PRIO_COLOR: Record<string, string> = {
  baixa: "text-muted-foreground",
  media: "text-primary",
  alta: "text-amber-600 dark:text-amber-400",
  urgente: "text-destructive font-semibold",
};

function OSPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OS | null>(null);
  const [tab, setTab] = useState("abertas");
  const [busca, setBusca] = useState("");

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cliente, setCliente] = useState<string>("none");
  const [novoClienteOpen, setNovoClienteOpen] = useState(false);
  const [projeto, setProjeto] = useState<string>("none");
  const [status, setStatus] = useState<string>("aberta");
  const [prioridade, setPrioridade] = useState<string>("media");
  const [dataPrev, setDataPrev] = useState("");
  const [valor, setValor] = useState("0");
  const [obs, setObs] = useState("");

  const { data: ordens, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["ordens_servico", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_servico" as never)
        .select(
          "id,empresa_id,cliente_id,projeto_id,numero,titulo,descricao,status,data_abertura,data_prevista,data_conclusao,valor,created_at,contatos:cliente_id(nome), projetos:projeto_id(nome,cor)",
        )
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OS[];
    },
  });

  const { data: clientes = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cliente", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contatos")
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .in("tipo", ["cliente", "ambos"])
        .order("nome");
      return data ?? [];
    },
  });

  const { data: projetos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["projetos-select", empresa?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("projetos" as never) as any)
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = !ordens
      ? []
      : tab === "abertas"
        ? ordens.filter((o) => ["aberta", "em_execucao", "aguardando"].includes(o.status))
        : tab === "concluidas"
          ? ordens.filter((o) => ["concluida", "faturada"].includes(o.status))
          : tab === "canceladas"
            ? ordens.filter((o) => o.status === "cancelada")
            : ordens;
    if (!q) return base;
    const qNum = q.replace(/^#/, "");
    return base.filter((o) =>
      (o.titulo || "").toLowerCase().includes(q)
      || (o.contatos?.nome || "").toLowerCase().includes(q)
      || (o.projetos?.nome || "").toLowerCase().includes(q)
      || (o.numero != null && String(o.numero).includes(qNum)),
    );
  }, [ordens, tab, busca]);

  const reset = () => {
    setEditing(null);
    setTitulo("");
    setDescricao("");
    setCliente("none");
    setProjeto("none");
    setStatus("aberta");
    setPrioridade("media");
    setDataPrev("");
    setValor("0");
    setObs("");
  };
  const openEdit = (o: OS) => {
    setEditing(o);
    setTitulo(o.titulo);
    setDescricao(o.descricao ?? "");
    setCliente(o.cliente_id ?? "none");
    setProjeto(o.projeto_id ?? "none");
    setStatus(o.status);
    setPrioridade(o.prioridade);
    setDataPrev(o.data_prevista ?? "");
    setValor(String(o.valor ?? 0));
    setObs(o.observacoes ?? "");
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!titulo.trim()) throw new Error("Título é obrigatório");
      const payload: any = {
        empresa_id: empresa.id,
        titulo: titulo.trim(),
        descricao: descricao || null,
        cliente_id: cliente === "none" ? null : cliente,
        projeto_id: projeto === "none" ? null : projeto,
        status,
        prioridade,
        data_prevista: dataPrev || null,
        valor: Number(valor) || 0,
        observacoes: obs || null,
      };
      const tbl = supabase.from("ordens_servico" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "OS atualizada" : "OS criada");
      qc.invalidateQueries({ queryKey: ["ordens_servico"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("ordens_servico" as never) as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("OS excluída");
      qc.invalidateQueries({ queryKey: ["ordens_servico"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordens de serviço"
        description="Registre chamados, execute e feche entregas com prazos e responsáveis."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por título, cliente, projeto ou número..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
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
                Nova OS
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editing ? `OS #${editing.numero ?? ""}` : "Nova ordem de serviço"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Título *</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    rows={2}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente</Label>
                    <Combobox
                      value={cliente}
                      onChange={setCliente}
                      options={[
                        { value: "none", label: "— sem cliente —" },
                        ...clientes.map((c) => ({ value: c.id, label: c.nome })),
                      ]}
                      placeholder="Selecione"
                      searchPlaceholder="Digite para buscar..."
                      emptyText="Nenhum item encontrado."
                      footer={{ label: "Novo cliente", onClick: () => setNovoClienteOpen(true) }}
                    />
                  </div>
                  <div>
                    <Label>Projeto</Label>
                    <Combobox
                      value={projeto}
                      onChange={setProjeto}
                      options={[
                        { value: "none", label: "— sem projeto —" },
                        ...projetos.map((p) => ({ value: p.id, label: p.nome })),
                      ]}
                      placeholder="Selecione"
                      searchPlaceholder="Digite para buscar..."
                      emptyText="Nenhum item encontrado."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={prioridade} onValueChange={setPrioridade}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIO_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Previsão</Label>
                    <DateInput value={dataPrev} onChange={setDataPrev} />
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <MoneyInput value={valor} onChange={setValor} />
                  </div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
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
          <NovoContatoDialog
            empresaId={empresa?.id}
            tipoFixo="cliente"
            open={novoClienteOpen}
            onOpenChange={setNovoClienteOpen}
            onCriado={(c) => setCliente(c.id)}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="abertas">Abertas</TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
          <TabsTrigger value="canceladas">Canceladas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Nenhuma OS"
            description={busca ? "Nada encontrado para a busca." : "Crie sua primeira ordem de serviço."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Nº</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-tabular">#{o.numero}</TableCell>
                  <TableCell className="font-medium">{o.titulo}</TableCell>
                  <TableCell>{o.contatos?.nome ?? "—"}</TableCell>
                  <TableCell>
                    {o.projetos ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: o.projetos.cor ?? "#3b82f6" }}
                        />
                        {o.projetos.nome}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={PRIO_COLOR[o.prioridade]}>{PRIO_LABEL[o.prioridade]}</span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${STATUS_COLOR[o.status] ?? ""}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </TableCell>
                  <TableCell>{o.data_prevista ? dateBR(o.data_prevista) : "—"}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(o.valor ?? 0)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Editar"
                        onClick={() => openEdit(o)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir OS #{o.numero}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction data-acao onClick={() => del.mutate(o.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </span>
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
