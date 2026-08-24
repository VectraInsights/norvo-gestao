/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeftRight,
  Plus,
  Pencil,
  Fuel,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/frota/viagens")({
  component: Viagens,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar as viagens: {error.message}
    </div>
  ),
});

type Viagem = {
  id: string;
  cliente_id: string | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  data_saida: string | null;
  data_chegada: string | null;
  valor_frete: number;
  km_rodado: number | null;
  status: string;
  observacoes: string | null;
  cliente?: { nome: string | null } | null;
  motorista?: { nome: string | null } | null;
  veiculo?: { placa: string | null } | null;
};

type Despesa = {
  id: string;
  viagem_id: string;
  tipo: string;
  descricao: string | null;
  valor: number;
  data: string;
};

type Opcao = { id: string; nome: string };

const STATUS_COR: Record<string, string> = {
  planejada: "bg-primary/15 text-primary",
  em_transito: "bg-warning/20 text-warning-foreground",
  concluida: "bg-success/15 text-success",
  cancelada: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  planejada: "planejada",
  em_transito: "em trânsito",
  concluida: "concluída",
  cancelada: "cancelada",
};

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

function formVazio() {
  return {
    cliente_id: "",
    motorista_id: "",
    veiculo_id: "",
    origem_cidade: "",
    origem_uf: "",
    destino_cidade: "",
    destino_uf: "",
    data_saida: "",
    data_chegada: "",
    valor_frete: "0",
    km_rodado: "",
    observacoes: "",
  };
}

function Viagens() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Viagem | null>(null);
  const [form, setForm] = useState(formVazio);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const [despViagem, setDespViagem] = useState<Viagem | null>(null);
  const [despForm, setDespForm] = useState({
    tipo: "diesel",
    descricao: "",
    valor: "0",
    data: new Date().toISOString().slice(0, 10),
  });

  const { data: viagens, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["viagens", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("viagens" as never)
        .select("*, cliente:contatos(nome), motorista:colaboradores(nome), veiculo:veiculos(placa)")
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Viagem[];
    },
  });
  const { data: despesas } = useQuery({
    enabled: !!empresa,
    queryKey: ["viagem-despesas", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("viagem_despesas" as never)
        .select("id,viagem_id,tipo,descricao,valor,data")
        .eq("empresa_id", empresa!.id)
        .order("data")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Despesa[];
    },
  });

  const despPorViagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of despesas ?? []) m.set(d.viagem_id, (m.get(d.viagem_id) ?? 0) + Number(d.valor));
    return m;
  }, [despesas]);

  const kpis = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    let freteMes = 0,
      despMes = 0;
    for (const v of viagens ?? []) {
      const ref = v.data_saida ?? "";
      if (!ref.startsWith(mes)) continue;
      freteMes += Number(v.valor_frete ?? 0);
      despMes += despPorViagem.get(v.id) ?? 0;
    }
    return {
      emTransito: (viagens ?? []).filter((v) => v.status === "em_transito").length,
      freteMes,
      despMes,
    };
  }, [viagens, despPorViagem]);

  const { data: clientes = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cliente-viagem", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .in("tipo", ["cliente", "ambos"])
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Opcao[];
    },
  });

  const { data: motoristas = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["motoristas-viagem", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .eq("status", "ativo")
        .ilike("cargo", "%motorist%")
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Opcao[];
    },
  });

  const { data: veiculosDisp = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos-disp", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("veiculos" as never)
        .select("id,placa,marca_modelo")
        .eq("empresa_id", empresa!.id)
        .neq("status", "inativo")
        .order("placa")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        placa: string;
        marca_modelo: string | null;
      }[];
    },
  });

  const reset = () => {
    setEditing(null);
    setForm(formVazio());
  };

  const openEdit = (v: Viagem) => {
    setEditing(v);
    setForm({
      cliente_id: v.cliente_id ?? "",
      motorista_id: v.motorista_id ?? "",
      veiculo_id: v.veiculo_id ?? "",
      origem_cidade: v.origem_cidade ?? "",
      origem_uf: v.origem_uf ?? "",
      destino_cidade: v.destino_cidade ?? "",
      destino_uf: v.destino_uf ?? "",
      data_saida: v.data_saida ?? "",
      data_chegada: v.data_chegada ?? "",
      valor_frete: String(v.valor_frete ?? 0),
      km_rodado: v.km_rodado ? String(v.km_rodado) : "",
      observacoes: v.observacoes ?? "",
    });
    setOpen(true);
  };

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["viagens"] });
    qc.invalidateQueries({ queryKey: ["viagem-despesas"] });
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!form.origem_cidade.trim() || !form.destino_cidade.trim())
        throw new Error("Informe origem e destino");
      const payload: any = {
        empresa_id: empresa.id,
        cliente_id: form.cliente_id || null,
        motorista_id: form.motorista_id || null,
        veiculo_id: form.veiculo_id || null,
        origem_cidade: form.origem_cidade.trim(),
        origem_uf: form.origem_uf || null,
        destino_cidade: form.destino_cidade.trim(),
        destino_uf: form.destino_uf || null,
        data_saida: form.data_saida || null,
        data_chegada: form.data_chegada || null,
        valor_frete: Number(form.valor_frete) || 0,
        km_rodado: form.km_rodado ? Number(form.km_rodado) : null,
        observacoes: form.observacoes.trim() || null,
      };
      const tbl = supabase.from("viagens" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Viagem atualizada" : "Viagem registrada");
      setOpen(false);
      reset();
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const tbl = supabase.from("viagens" as never) as any;
      const { error } = await tbl.update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === "concluida"
          ? "Viagem concluída — frete lançado no contas a receber"
          : "Status atualizado",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addDespesa = useMutation({
    mutationFn: async () => {
      if (!empresa || !despViagem) throw new Error("Abra uma viagem primeiro");
      const valor = Number(String(despForm.valor).replace(/\./g, "").replace(",", "."));
      if (!(valor > 0)) throw new Error("Valor deve ser positivo");
      const tbl = supabase.from("viagem_despesas" as never) as any;
      const { error } = await tbl.insert({
        empresa_id: empresa.id,
        viagem_id: despViagem.id,
        tipo: despForm.tipo,
        descricao: despForm.descricao.trim() || null,
        valor,
        data: despForm.data || new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa lançada — conta a pagar gerada");
      setDespForm((f) => ({ ...f, descricao: "", valor: "0" }));
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const despDaViagem = (despesas ?? []).filter((d) => d.viagem_id === despViagem?.id);

  const rota = (v: Viagem) =>
    `${v.origem_cidade ?? "?"}${v.origem_uf ? "/" + v.origem_uf : ""} → ${v.destino_cidade ?? "?"}${v.destino_uf ? "/" + v.destino_uf : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Frota"
        title="Viagens"
        description="Fretes com motorista, veículo e resultado por viagem."
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
                Nova viagem
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar viagem" : "Nova viagem"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Cliente (pagador)</Label>
                    <Select value={form.cliente_id} onValueChange={(v) => set("cliente_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Motorista</Label>
                    <Select value={form.motorista_id} onValueChange={(v) => set("motorista_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {motoristas.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Veículo</Label>
                    <Select value={form.veiculo_id} onValueChange={(v) => set("veiculo_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {veiculosDisp.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.placa}
                            {v.marca_modelo ? ` · ${v.marca_modelo}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Origem</Label>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder="Cidade"
                        value={form.origem_cidade}
                        onChange={(e) => set("origem_cidade", e.target.value)}
                      />
                      <Input
                        className="w-20 uppercase"
                        maxLength={2}
                        placeholder="UF"
                        value={form.origem_uf}
                        onChange={(e) => set("origem_uf", e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Destino</Label>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder="Cidade"
                        value={form.destino_cidade}
                        onChange={(e) => set("destino_cidade", e.target.value)}
                      />
                      <Input
                        className="w-20 uppercase"
                        maxLength={2}
                        placeholder="UF"
                        value={form.destino_uf}
                        onChange={(e) => set("destino_uf", e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data de saída</Label>
                    <DateInput
                      value={form.data_saida}
                      onChange={(v) => set("data_saida", v)}
                    />
                  </div>
                  <div>
                    <Label>Previsão de chegada</Label>
                    <DateInput
                      value={form.data_chegada}
                      onChange={(v) => set("data_chegada", v)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor do frete</Label>
                    <MoneyInput value={form.valor_frete} onChange={(v) => set("valor_frete", v)} />
                  </div>
                  <div>
                    <Label>KM rodado</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.km_rodado}
                      onChange={(e) => set("km_rodado", e.target.value)}
                    />
                  </div>
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
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4 shadow-panel">
          <p className="text-xs font-medium text-muted-foreground">Em trânsito</p>
          <p className="mt-1 text-2xl font-semibold text-tabular">{kpis.emTransito}</p>
        </Card>
        <Card className="p-4 shadow-panel">
          <p className="text-xs font-medium text-muted-foreground">Fretes no mês</p>
          <p className="mt-1 text-2xl font-semibold text-tabular">{brl(kpis.freteMes)}</p>
        </Card>
        <Card className="p-4 shadow-panel">
          <p className="text-xs font-medium text-muted-foreground">
            Resultado do mês (frete − despesas)
          </p>
          <p
            className={`mt-1 text-2xl font-semibold text-tabular ${kpis.freteMes - kpis.despMes < 0 ? "text-destructive" : ""}`}
          >
            {brl(kpis.freteMes - kpis.despMes)}
          </p>
        </Card>
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !viagens?.length ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Nenhuma viagem registrada"
          description="Cadastre a viagem, lance diesel e pedágios, e conclua para gerar a receita automaticamente."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rota</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motorista / Veículo</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead className="text-right">Frete</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viagens.map((v) => {
                const desp = despPorViagem.get(v.id) ?? 0;
                const resultado = Number(v.valor_frete ?? 0) - desp;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{rota(v)}</TableCell>
                    <TableCell>{v.cliente?.nome ?? "—"}</TableCell>
                    <TableCell>
                      {v.motorista?.nome ?? "—"}
                      {v.veiculo ? ` · ${v.veiculo.placa}` : ""}
                    </TableCell>
                    <TableCell>{v.data_saida ? dateBR(v.data_saida) : "—"}</TableCell>
                    <TableCell className="text-right text-tabular">{brl(v.valor_frete)}</TableCell>
                    <TableCell className="text-right text-tabular">
                      <button
                        type="button"
                        className="underline decoration-dotted underline-offset-4 hover:text-primary"
                        onClick={() => setDespViagem(v)}
                      >
                        {brl(desp)}
                      </button>
                    </TableCell>
                    <TableCell
                      className={`text-right text-tabular ${resultado < 0 ? "font-medium text-destructive" : ""}`}
                    >
                      {brl(resultado)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COR[v.status] ?? ""}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {v.status === "planejada" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Iniciar viagem"
                              onClick={() =>
                                mudarStatus.mutate({ id: v.id, status: "em_transito" })
                              }
                            >
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Cancelar"
                              onClick={() => mudarStatus.mutate({ id: v.id, status: "cancelada" })}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {v.status === "em_transito" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Concluir viagem"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Concluir viagem {rota(v)}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O frete de {brl(v.valor_frete)} será lançado no contas a receber.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    mudarStatus.mutate({ id: v.id, status: "concluida" })
                                  }
                                >
                                  Concluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {v.status !== "concluida" && v.status !== "cancelada" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(v)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!despViagem} onOpenChange={(v) => !v && setDespViagem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Despesas da viagem {despViagem ? rota(despViagem) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={despForm.tipo}
                  onValueChange={(v) => setDespForm((f) => ({ ...f, tipo: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="pedagio">Pedágio</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <DateInput
                  value={despForm.data}
                  onChange={(v) => setDespForm((f) => ({ ...f, data: v }))}
                />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                placeholder="Ex.: Posto Ipiranga — BR-116"
                value={despForm.descricao}
                onChange={(e) => setDespForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Valor</Label>
                <MoneyInput
                  value={despForm.valor}
                  onChange={(v) => setDespForm((f) => ({ ...f, valor: v }))}
                />
              </div>
              <Button
                onClick={() => addDespesa.mutate()}
                disabled={addDespesa.isPending || !despViagem}
              >
                <Fuel className="mr-1 h-4 w-4" />
                Lançar
              </Button>
            </div>
          </div>
          <div className="rounded-md border">
            {!despDaViagem.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                Nenhuma despesa lançada nesta viagem.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {despDaViagem.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      <span className="capitalize">{d.tipo}</span>
                      {d.descricao ? ` — ${d.descricao}` : ""}
                      <span className="ml-2 text-xs text-muted-foreground">{dateBR(d.data)}</span>
                    </span>
                    <span className="text-tabular">{brl(d.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Cada despesa gera automaticamente uma conta a pagar no Financeiro.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
