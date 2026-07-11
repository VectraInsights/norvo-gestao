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
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projetos/projetos")({
  component: ProjetosPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro ao carregar projetos: {error.message}
    </div>
  ),
});

type Projeto = {
  id: string; nome: string; descricao: string | null; status: string;
  data_inicio: string | null; data_prevista: string | null; data_conclusao: string | null;
  orcamento: number; cor: string | null; cliente_id: string | null;
  contatos?: { nome: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  planejado: "Planejado", em_andamento: "Em andamento", pausado: "Pausado",
  concluido: "Concluído", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  planejado: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  em_andamento: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  pausado: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  concluido: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelado: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

function ProjetosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Projeto | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cliente, setCliente] = useState<string>("none");
  const [status, setStatus] = useState<string>("planejado");
  const [dataInicio, setDataInicio] = useState("");
  const [dataPrev, setDataPrev] = useState("");
  const [orcamento, setOrcamento] = useState("0");
  const [cor, setCor] = useState("#3b82f6");

  const { data: projetos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["projetos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projetos" as never)
        .select("*, contatos:cliente_id(nome)")
        .eq("empresa_id", empresa!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Projeto[];
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

  const reset = () => {
    setEditing(null); setNome(""); setDescricao(""); setCliente("none");
    setStatus("planejado"); setDataInicio(""); setDataPrev(""); setOrcamento("0"); setCor("#3b82f6");
  };
  const openEdit = (p: Projeto) => {
    setEditing(p); setNome(p.nome); setDescricao(p.descricao ?? "");
    setCliente(p.cliente_id ?? "none"); setStatus(p.status);
    setDataInicio(p.data_inicio ?? ""); setDataPrev(p.data_prevista ?? "");
    setOrcamento(String(p.orcamento ?? 0)); setCor(p.cor ?? "#3b82f6");
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      const payload: any = {
        empresa_id: empresa.id, nome: nome.trim(), descricao: descricao || null,
        cliente_id: cliente === "none" ? null : cliente, status,
        data_inicio: dataInicio || null, data_prevista: dataPrev || null,
        orcamento: Number(orcamento) || 0, cor,
      };
      const tbl = supabase.from("projetos" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Projeto atualizado" : "Projeto criado");
      qc.invalidateQueries({ queryKey: ["projetos"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projetos" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto excluído");
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos"
        description="Organize entregas, prazos e orçamentos por projeto."
        icon={Briefcase}
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo projeto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
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
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início</Label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></div>
                  <div><Label>Previsão</Label><Input type="date" value={dataPrev} onChange={(e) => setDataPrev(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div><Label>Orçamento</Label><MoneyInput value={orcamento} onValueChange={setOrcamento} /></div>
                  <div><Label>Cor</Label><Input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-10 w-14 p-1" /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6"><Skeleton className="h-32 w-full" /></div>
        ) : !projetos || projetos.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nenhum projeto ainda" description="Crie seu primeiro projeto para começar." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead className="text-right">Orçamento</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projetos.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => openEdit(p)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: p.cor ?? "#3b82f6" }} />
                      <span className="font-medium">{p.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell>{p.contatos?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${STATUS_COLOR[p.status] ?? ""}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </TableCell>
                  <TableCell>{p.data_prevista ? dateBR(p.data_prevista) : "—"}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(p.orcamento ?? 0)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
                          <AlertDialogDescription>As ordens de serviço vinculadas permanecerão, sem projeto.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(p.id)}>Excluir</AlertDialogAction>
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
