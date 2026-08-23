/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Truck, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/frota/veiculos")({
  component: Veiculos,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar os veículos: {error.message}
    </div>
  ),
});

type Veiculo = {
  id: string;
  placa: string;
  marca_modelo: string | null;
  tipo: string | null;
  ano: number | null;
  rntrc: string | null;
  km_atual: number | null;
  status: string;
  observacoes: string | null;
};

const STATUS_COR: Record<string, string> = {
  ativo: "bg-success/15 text-success",
  manutencao: "bg-warning/20 text-warning-foreground",
  inativo: "bg-muted text-muted-foreground",
};

function formVazio() {
  return {
    placa: "",
    marca_modelo: "",
    tipo: "",
    ano: "",
    rntrc: "",
    km_atual: "0",
    status: "ativo",
    observacoes: "",
  };
}

const TIPOS = ["Caminhão 3/4", "Toco", "Truck", "Carreta", "Bitrem", "Van/Furgão"];

function Veiculos() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Veiculo | null>(null);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(formVazio);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: veiculos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("veiculos" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .order("placa")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Veiculo[];
    },
  });

  const reset = () => {
    setEditing(null);
    setForm(formVazio());
  };

  const openEdit = (v: Veiculo) => {
    setEditing(v);
    setForm({
      placa: v.placa ?? "",
      marca_modelo: v.marca_modelo ?? "",
      tipo: v.tipo ?? "",
      ano: v.ano ? String(v.ano) : "",
      rntrc: v.rntrc ?? "",
      km_atual: String(v.km_atual ?? 0),
      status: v.status,
      observacoes: v.observacoes ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const placa = form.placa.trim().toUpperCase();
      if (!placa) throw new Error("Placa é obrigatória");
      const payload: any = {
        empresa_id: empresa.id,
        placa,
        marca_modelo: form.marca_modelo.trim() || null,
        tipo: form.tipo || null,
        ano: form.ano ? Number(form.ano) : null,
        rntrc: form.rntrc.trim() || null,
        km_atual: Number(form.km_atual) || 0,
        status: form.status,
        observacoes: form.observacoes.trim() || null,
      };
      const tbl = supabase.from("veiculos" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) {
          if (String(error.message).toLowerCase().includes("duplicate"))
            throw new Error("Já existe um veículo com esta placa");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Veículo atualizado" : "Veículo cadastrado");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["veiculos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("veiculos" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo excluído");
      qc.invalidateQueries({ queryKey: ["veiculos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = (veiculos ?? []).filter((v) => {
    if (!busca.trim()) return true;
    const s = busca.toLowerCase();
    return [v.placa, v.marca_modelo, v.tipo, v.rntrc].some((x) =>
      (x ?? "").toLowerCase().includes(s),
    );
  });

  return (
    <>
      <PageHeader
        eyebrow="Frota"
        title="Veículos"
        description="Caminhões e implementos da transportadora."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                Novo veículo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? `Editar ${editing.placa}` : "Novo veículo"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Placa *</Label>
                    <Input
                      className="uppercase"
                      value={form.placa}
                      onChange={(e) => set("placa", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Ano</Label>
                    <Input
                      type="number"
                      value={form.ano}
                      onChange={(e) => set("ano", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="manutencao">Em manutenção</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Marca / modelo</Label>
                  <Input
                    value={form.marca_modelo}
                    onChange={(e) => set("marca_modelo", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Input
                      list="tipos-veiculo"
                      value={form.tipo}
                      onChange={(e) => set("tipo", e.target.value)}
                    />
                    <datalist id="tipos-veiculo">
                      {TIPOS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label>RNTRC</Label>
                    <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>KM atual</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.km_atual}
                    onChange={(e) => set("km_atual", e.target.value)}
                  />
                </div>
                <div>
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
                  {save.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por placa, modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !lista.length ? (
        <EmptyState
          icon={Truck}
          title="Nenhum veículo"
          description="Cadastre os caminhões para vincular viagens, motoristas e despesas."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>RNTRC</TableHead>
                <TableHead className="text-right">KM</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-medium">{v.placa}</TableCell>
                  <TableCell>{v.marca_modelo ?? "—"}</TableCell>
                  <TableCell>{v.tipo ?? "—"}</TableCell>
                  <TableCell>{v.ano ?? "—"}</TableCell>
                  <TableCell className="text-tabular">{v.rntrc ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular">{num(v.km_atual ?? 0)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COR[v.status] ?? ""}>
                      {v.status === "manutencao" ? "manutenção" : v.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(v)}
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
                            <AlertDialogTitle>Excluir veículo {v.placa}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Viagens existentes permanecem no histórico (sem vínculo ao veículo).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluir.mutate(v.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
