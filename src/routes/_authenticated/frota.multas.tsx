/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";
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
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { sincronizarMultasSENATRANFn } from "@/lib/multas-server";

export const Route = createFileRoute("/_authenticated/frota/multas")({
  component: Multas,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar as multas: {error.message}
    </div>
  ),
});

type Multa = {
  id: string;
  veiculo_id: string | null;
  placa: string;
  renavam: string | null;
  orgao_autuador: string | null;
  auto_infracao: string | null;
  data_infracao: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string | null;
  pontos: number | null;
  status: string;
  origem: string;
};

type VeiculoOpcao = { id: string; placa: string; renavam: string | null };
type ConfigSENATRAN = {
  empresa_id: string;
  endpoint: string | null;
  usuario: string | null;
  senha: string | null;
  ativo: boolean;
  ultima_sync: string | null;
};

const STATUS_COR: Record<string, string> = {
  aberta: "bg-warning/20 text-warning-foreground",
  paga: "bg-success/15 text-success",
  contestada: "bg-primary/15 text-primary",
};
const STATUS_LABEL: Record<string, string> = {
  aberta: "aberta",
  paga: "paga",
  contestada: "contestada",
};

function formVazio() {
  return {
    veiculo_id: "",
    placa: "",
    renavam: "",
    auto_infracao: "",
    orgao_autuador: "",
    data_infracao: "",
    descricao: "",
    valor: "0",
    data_vencimento: "",
    pontos: "",
  };
}

function Multas() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Multa | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [form, setForm] = useState(formVazio);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    endpoint: "",
    usuario: "",
    senha: "",
    ativo: false,
  });
  const setConfig = <K extends keyof typeof configForm>(k: K, v: (typeof configForm)[K]) =>
    setConfigForm((f) => ({ ...f, [k]: v }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const token = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session!.access_token;
  };

  const { data: multas, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["multas", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("multas" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .order("data_infracao", { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Multa[];
    },
  });

  const { data: veiculos } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("veiculos" as never)
        .select("id,placa,renavam")
        .eq("empresa_id", empresa!.id)
        .order("placa")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as VeiculoOpcao[];
    },
  });

  const { data: configSENATRAN } = useQuery({
    enabled: !!empresa,
    queryKey: ["multas-config", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("multas_config" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ConfigSENATRAN | null;
    },
  });

  const openConfig = () => {
    setConfigForm({
      endpoint: configSENATRAN?.endpoint ?? "",
      usuario: configSENATRAN?.usuario ?? "",
      senha: configSENATRAN?.senha ?? "",
      ativo: configSENATRAN?.ativo ?? false,
    });
    setConfigOpen(true);
  };

  const salvarConfig = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const payload: any = {
        empresa_id: empresa.id,
        endpoint: configForm.endpoint.trim() || null,
        usuario: configForm.usuario.trim() || null,
        senha: configForm.senha.trim() || null,
        ativo: configForm.ativo,
      };
      const tbl = supabase.from("multas_config" as never) as any;
      if (configSENATRAN) {
        const { error } = await tbl.update(payload).eq("empresa_id", empresa.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração SENATRAN salva");
      setConfigOpen(false);
      qc.invalidateQueries({ queryKey: ["multas-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalEmAberto = useMemo(() => {
    const abertas = (multas ?? []).filter((m) => m.status !== "paga");
    const valor = abertas.reduce((s, m) => s + Number(m.valor || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const vencidas = abertas.filter(
      (m) => m.data_vencimento && m.data_vencimento < hoje,
    );
    const valorVencidas = vencidas.reduce((s, m) => s + Number(m.valor || 0), 0);
    return { qtd: abertas.length, valor, qtdVencidas: vencidas.length, valorVencidas };
  }, [multas]);

  const reset = () => {
    setEditing(null);
    setForm(formVazio());
  };

  const escolherVeiculo = (id: string) => {
    const v = veiculos?.find((x) => x.id === id);
    set("veiculo_id", id);
    if (v) {
      set("placa", v.placa);
      set("renavam", v.renavam ?? "");
    }
  };

  const openEdit = (m: Multa) => {
    setEditing(m);
    setForm({
      veiculo_id: m.veiculo_id ?? "",
      placa: m.placa ?? "",
      renavam: m.renavam ?? "",
      auto_infracao: m.auto_infracao ?? "",
      orgao_autuador: m.orgao_autuador ?? "",
      data_infracao: m.data_infracao ?? "",
      descricao: m.descricao ?? "",
      valor: String(m.valor ?? 0),
      data_vencimento: m.data_vencimento ?? "",
      pontos: m.pontos ? String(m.pontos) : "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!form.placa.trim()) throw new Error("Placa é obrigatória");
      if (!form.data_infracao) throw new Error("Data da infração é obrigatória");
      const payload: any = {
        empresa_id: empresa.id,
        veiculo_id: form.veiculo_id || null,
        placa: form.placa.trim().toUpperCase(),
        renavam: form.renavam.trim() || null,
        auto_infracao: form.auto_infracao.trim() || null,
        orgao_autuador: form.orgao_autuador.trim() || null,
        data_infracao: form.data_infracao,
        descricao: form.descricao.trim() || null,
        valor: Number(form.valor) || 0,
        data_vencimento: form.data_vencimento || null,
        pontos: form.pontos ? Number(form.pontos) : null,
      };
      const tbl = supabase.from("multas" as never) as any;
      if (editing) {
        const { error } = await tbl
          .update({ ...payload, origem: editing.origem })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) {
          if (String(error.message).toLowerCase().includes("duplicate"))
            throw new Error("Já existe multa com este auto de infração");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Multa atualizada" : "Multa cadastrada");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["multas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trocarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const tbl = supabase.from("multas" as never) as any;
      const { error } = await tbl.update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["multas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("multas" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Multa excluída");
      qc.invalidateQueries({ queryKey: ["multas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      return sincronizarMultasSENATRANFn({
        data: { token: await token(), empresa_id: empresa.id },
      });
    },
    onSuccess: (r) => {
      if (!r.configurada) {
        toast.info(r.message ?? "Integração não configurada.");
        return;
      }
      toast.success(`Sincronização concluída: ${r.atualizadas ?? 0} multa(s) processada(s)`);
      qc.invalidateQueries({ queryKey: ["multas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = (multas ?? []).filter((m) => {
    if (filtroStatus !== "todas" && m.status !== filtroStatus) return false;
    if (!busca.trim()) return true;
    const s = busca.toLowerCase();
    return [m.placa, m.auto_infracao, m.orgao_autuador, m.renavam, m.descricao].some(
      (x) => (x ?? "").toLowerCase().includes(s),
    );
  });

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="Frota"
        title="Multas"
        description="Autos de infração dos veículos — cadastro manual ou sincronização SENATRAN."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openConfig}>
              <Settings2 className="mr-1 h-4 w-4" />
              Configuração SENATRAN
            </Button>
            <Button
              variant="outline"
              onClick={() => sincronizar.mutate()}
              disabled={sincronizar.isPending || !configSENATRAN?.ativo}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${sincronizar.isPending ? "animate-spin" : ""}`}
              />
              {sincronizar.isPending ? "Sincronizando…" : "Sincronizar SENATRAN"}
            </Button>
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
                  Nova multa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editing ? `Editar auto ${editing.auto_infracao ?? editing.id}` : "Nova multa"}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Veículo</Label>
                      <Select value={form.veiculo_id} onValueChange={escolherVeiculo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar veículo…" />
                        </SelectTrigger>
                        <SelectContent>
                          {veiculos?.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.placa}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Placa *</Label>
                      <Input
                        className="uppercase"
                        value={form.placa}
                        onChange={(e) => set("placa", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>RENAVAM</Label>
                      <Input
                        value={form.renavam}
                        onChange={(e) => set("renavam", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>PONTOS</Label>
                      <MoneyInput prefix="" decimals={0} value={form.pontos} onChange={(v) => set("pontos", v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Auto de infração</Label>
                      <Input
                        value={form.auto_infracao}
                        onChange={(e) => set("auto_infracao", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Órgão autuador</Label>
                      <Input
                        value={form.orgao_autuador}
                        onChange={(e) => set("orgao_autuador", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Data da infração *</Label>
                      <DateInput value={form.data_infracao} onChange={(v) => set("data_infracao", v)} />
                    </div>
                    <div>
                      <Label>Vencimento</Label>
                      <DateInput
                        value={form.data_vencimento}
                        onChange={(v) => set("data_vencimento", v)}
                      />
                    </div>
                    <div>
                      <Label>Valor</Label>
                      <MoneyInput value={form.valor} onChange={(v) => set("valor", v)} />
                    </div>
                  </div>
                  <div>
                    <Label>Descrição / enquadramento</Label>
                    <Textarea
                      rows={2}
                      value={form.descricao}
                      onChange={(e) => set("descricao", e.target.value)}
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
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Em aberto</p>
          <p className="mt-1 text-xl font-semibold">
            {brl(totalEmAberto.valor)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {totalEmAberto.qtd} multa(s)
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Vencidas</p>
          <p className="mt-1 text-xl font-semibold text-destructive">
            {brl(totalEmAberto.valorVencidas)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {totalEmAberto.qtdVencidas} multa(s)
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pontos ativos</p>
          <p className="mt-1 text-xl font-semibold">
            {(multas ?? [])
              .filter((m) => m.status !== "paga")
              .reduce((s, m) => s + (m.pontos ?? 0), 0)}
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por placa, auto de infração, órgão…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            <SelectItem value="aberta">Abertas</SelectItem>
            <SelectItem value="paga">Pagas</SelectItem>
            <SelectItem value="contestada">Contestadas</SelectItem>
          </SelectContent>
        </Select>
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
          icon={Car}
          title="Nenhuma multa"
          description="Cadastre os autos de infração dos veículos ou configure a sincronização SENATRAN."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Auto de infração</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Órgão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((m) => {
                const vencida =
                  m.status !== "paga" && m.data_vencimento && m.data_vencimento < hoje;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono font-medium">
                      {m.auto_infracao ?? "—"}
                      {m.origem === "senatran" && (
                        <Badge variant="outline" className="ml-2">
                          SENATRAN
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{m.placa}</TableCell>
                    <TableCell className="text-tabular">{dateBR(m.data_infracao)}</TableCell>
                    <TableCell>{m.orgao_autuador ?? "—"}</TableCell>
                    <TableCell
                      className={`text-tabular ${vencida ? "font-medium text-destructive" : ""}`}
                    >
                      {dateBR(m.data_vencimento)}
                      {vencida && <span className="ml-1 text-xs">(vencida)</span>}
                    </TableCell>
                    <TableCell className="text-right text-tabular">{brl(m.valor)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COR[m.status] ?? ""}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {m.status === "aberta" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Marcar como paga"
                            onClick={() =>
                              trocarStatus.mutate({ id: m.id, status: "paga" })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        {m.status === "paga" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Reabrir multa"
                            onClick={() =>
                              trocarStatus.mutate({ id: m.id, status: "aberta" })
                            }
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(m)}
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
                              <AlertDialogTitle>
                                Excluir auto {m.auto_infracao ?? ""}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                A multa será removida do histórico da frota.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir.mutate(m.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configuração SENATRAN</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={configForm.ativo}
                onCheckedChange={(v) => setConfig("ativo", v)}
              />
              <Label>Integração ativa</Label>
            </div>
            <div>
              <Label>Endpoint da API</Label>
              <Input
                placeholder="https://exemplo.com/api/multas"
                value={configForm.endpoint}
                onChange={(e) => setConfig("endpoint", e.target.value)}
              />
            </div>
            <div>
              <Label>Usuário</Label>
              <Input
                value={configForm.usuario}
                onChange={(e) => setConfig("usuario", e.target.value)}
              />
            </div>
            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={configForm.senha}
                onChange={(e) => setConfig("senha", e.target.value)}
              />
            </div>
            {configSENATRAN?.ultima_sync && (
              <p className="text-xs text-muted-foreground">
                Última sincronização: {dateBR(configSENATRAN.ultima_sync)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => salvarConfig.mutate()} disabled={salvarConfig.isPending}>
              {salvarConfig.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}