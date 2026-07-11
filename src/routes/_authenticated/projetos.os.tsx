import { createFileRoute } from "@tanstack/react-router";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projetos/os")({
  component: OSPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro ao carregar ordens de serviço: {error.message}
    </div>
  ),
});

type OS = {
  id: string; numero: number | null; titulo: string; descricao: string | null;
  status: string; prioridade: string; valor: number;
  data_abertura: string; data_prevista: string | null; data_conclusao: string | null;
  cliente_id: string | null; projeto_id: string | null; observacoes: string | null;
  contatos?: { nome: string } | null;
  projetos?: { nome: string; cor: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta", em_execucao: "Em execução", aguardando: "Aguardando",
  concluida: "Concluída", cancelada: "Cancelada", faturada: "Faturada",
};
const STATUS_COLOR: Record<string, string> = {
  aberta: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  em_execucao: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  aguardando: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  concluida: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelada: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  faturada: "bg-violet-500/10 text-violet-600 border-violet-500/20",
};
const PRIO_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };
const PRIO_COLOR: Record<string, string> = {
  baixa: "text-slate-500", media: "text-blue-500", alta: "text-amber-500", urgente: "text-rose-600 font-semibold",
};

function OSPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OS | null>(null);
  const [tab, setTab] = useState("abertas");

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cliente, setCliente] = useState<string>("none");
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
      const { data, error } = await supabase.from("ordens_servico" as never)
        .select("*, contatos:cliente_id(nome), projetos:projeto_id(nome,cor)")
        .eq("empresa_id", empresa!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OS[];
    },
  });

  const { data: clientes = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cliente", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("contatos").select("id,nome")
        .eq("empresa_id", empresa!.id).in("tipo", ["cliente", "ambos"]).order("nome");
      return data ?? [];
    },
  });

  const { data: projetos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["projetos-select", empresa?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("projetos" as never) as any)
        .select("id,nome").eq("empresa_id", empresa!.id).order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const filtered = useMemo(() => {
    if (!ordens) return [];
    if (tab === "abertas") return ordens.filter((o) => ["aberta", "em_execucao", "aguardando"].includes(o.status));
    if (tab === "concluidas") return ordens.filter((o) => ["concluida", "faturada"].includes(o.status));
    if (tab === "canceladas") return ordens.filter((o) => o.status === "cancelada");
    return ordens;
  }, [ordens, tab]);

  const reset = () => {
    setEditing(null); setTitulo(""); setDescricao(""); setCliente("none"); setProjeto("none");
    setStatus("aberta"); setPrioridade("media"); setDataPrev(""); setValor("0"); setObs("");
  };
  const openEdit = (o: OS) => {
    setEditing(o); setTitulo(o.titulo); setDescricao(o.descricao ?? "");
    setCliente(o.cliente_id ?? "none"); setProjeto(o.projeto_id ?? "none");
    setStatus(o.status); setPrioridade(o.prioridade);
    setDataPrev(o.data_prevista ?? ""); setValor(String(o.valor ?? 0));
    setObs(o.observacoes ?? ""); setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!titulo.trim()) throw new Error("Título é obrigatório");
      const payload: any = {
        empresa_id: empresa.id, titulo: titulo.trim(), descricao: descricao || null,
        cliente_id: cliente === "none" ? null : cliente,
        projeto_id: projeto === "none" ? null : projeto,
        status, prioridade, data_prevista: dataPrev || null,
        valor: Number(valor) || 0, observacoes: obs || null,
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
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("ordens_servico" as never) as any).delete().eq("id", id);
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
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova OS</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? `OS #${editing.numero ?? ""}` : "Nova ordem de serviço"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
                <div><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={cliente} onValueChange={setCliente}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— sem cliente —</SelectItem>
                        {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Projeto</Label>
                    <Select value={projeto} onValueChange={setProjeto}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— sem projeto —</SelectItem>
                        {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={prioridade} onValueChange={setPrioridade}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Previsão</Label><Input type="date" value={dataPrev} onChange={(e) => setDataPrev(e.target.value)} /></div>
                  <div><Label>Valor</Label><MoneyInput value={valor} onChange={setValor} /></div>
                </div>
                <div><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

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
          <div className="p-6"><Skeleton className="h-32 w-full" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhuma OS" description="Crie sua primeira ordem de serviço." />
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
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => openEdit(o)}>
                  <TableCell className="text-tabular">#{o.numero}</TableCell>
                  <TableCell className="font-medium">{o.titulo}</TableCell>
                  <TableCell>{o.contatos?.nome ?? "—"}</TableCell>
                  <TableCell>
                    {o.projetos ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: o.projetos.cor ?? "#3b82f6" }} />
                        {o.projetos.nome}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell><span className={PRIO_COLOR[o.prioridade]}>{PRIO_LABEL[o.prioridade]}</span></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${STATUS_COLOR[o.status] ?? ""}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </TableCell>
                  <TableCell>{o.data_prevista ? dateBR(o.data_prevista) : "—"}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(o.valor ?? 0)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir OS #{o.numero}?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(o.id)}>Excluir</AlertDialogAction>
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
