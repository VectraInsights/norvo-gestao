/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas ainda não estão em types.ts; padrão do projeto é cast as never/as any */
import { createFileRoute } from "@tanstack/react-router";
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
import { Sun, Plus, Trash2, CalendarClock, AlertTriangle, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rh/ferias")({
  component: FeriasPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Erro: {error.message}
    </div>
  ),
});

type Concessao = {
  id: string;
  periodo_id: string;
  data_inicio_gozo: string;
  data_fim_gozo: string;
  dias: number;
  abono_dias: number;
  adiantar_decimo: boolean;
  status: string;
};

type PeriodoRow = {
  id: string;
  empresa_id: string;
  colaborador_id: string;
  data_inicio: string;
  data_fim: string;
  limite_concessao: string;
  dias_direito: number;
  observacoes: string | null;
  colaboradores?: { nome?: string } | null;
  ferias_concessoes?: Concessao[] | null;
};

type Colab = { id: string; nome: string };

const HOJE = () => new Date().toISOString().slice(0, 10);
const addDias = (iso: string, dias: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const CONC_STATUS: Record<string, string> = {
  agendada: "Agendada",
  em_gozo: "Em gozo",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

type Situacao = { key: "em_aquisicao" | "disponivel" | "vencido"; label: string };

function situacaoDe(p: PeriodoRow, saldo: number): Situacao {
  const hoje = HOJE();
  if (hoje > p.limite_concessao && saldo > 0)
    return { key: "vencido", label: "Vencido — pagamento em dobro" };
  if (hoje >= p.data_fim) return { key: "disponivel", label: "Disponível" };
  return { key: "em_aquisicao", label: "Em aquisição" };
}

function FeriasPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();

  // ---- Períodos aquisitivos (+ concessões embutidas) ----
  const { data: periodos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["ferias_periodos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ferias_periodos" as never)
        .select("*, colaboradores(nome), ferias_concessoes(*)")
        .eq("empresa_id", empresa!.id)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PeriodoRow[];
    },
  });

  // ---- Colaboradores ativos (para o formulário) ----
  const { data: colabs } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id, nome")
        .eq("empresa_id", empresa!.id)
        .neq("status", "demitido")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Colab[];
    },
  });

  const enriquecidos = useMemo(() => {
    return (periodos ?? []).map((p) => {
      const conc = (p.ferias_concessoes ?? []).filter((c) => c.status !== "cancelada");
      const gozados = conc.reduce((s, c) => s + (c.dias ?? 0), 0);
      const abono = conc.reduce((s, c) => s + (c.abono_dias ?? 0), 0);
      return {
        ...p,
        nome: p.colaboradores?.nome ?? "—",
        gozados,
        abono,
        saldo: Math.max(0, p.dias_direito - gozados - abono),
      };
    });
  }, [periodos]);

  const alertas = useMemo(() => {
    const hoje = HOJE();
    const limite60 = addDias(hoje, 60);
    return {
      vencidos: enriquecidos.filter((p) => HOJE() > p.limite_concessao && p.saldo > 0),
      vencendo: enriquecidos.filter(
        (p) => p.limite_concessao >= hoje && p.limite_concessao <= limite60 && p.saldo > 0,
      ),
    };
  }, [enriquecidos]);

  // ---- Novo / editar período ----
  const [openPeriodo, setOpenPeriodo] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formP, setFormP] = useState({ colaborador_id: "", data_inicio: "", dias_direito: "30" });

  const abrirNovoPeriodo = () => {
    setEditId(null);
    setFormP({ colaborador_id: "", data_inicio: "", dias_direito: "30" });
    setOpenPeriodo(true);
  };

  const abrirEdicaoPeriodo = (p: PeriodoRow) => {
    setEditId(p.id);
    setFormP({
      colaborador_id: p.colaborador_id,
      data_inicio: p.data_inicio,
      dias_direito: String(p.dias_direito),
    });
    setOpenPeriodo(true);
  };

  const savePeriodo = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!formP.colaborador_id) throw new Error("Escolha o colaborador");
      if (!formP.data_inicio) throw new Error("Informe o início do período aquisitivo");
      const ini = formP.data_inicio;
      const d = new Date(ini + "T00:00:00");
      d.setFullYear(d.getFullYear() + 1);
      const fim = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
      d.setMonth(d.getMonth() + 6);
      const limite = d.toISOString().slice(0, 10);
      const direito = Number(formP.dias_direito) || 30;

      if (editId) {
        const atual = (periodos ?? []).find((p) => p.id === editId);
        if (atual) {
          const usado = (atual.ferias_concessoes ?? [])
            .filter((c) => c.status !== "cancelada")
            .reduce((s, c) => s + (c.dias ?? 0) + (c.abono_dias ?? 0), 0);
          if (direito < usado)
            throw new Error(
              `Dias de direito não pode ser menor que os ${usado} dia(s) já utilizados`,
            );
        }
        const { error } = await (supabase.from("ferias_periodos" as never) as any)
          .update({
            data_inicio: ini,
            data_fim: fim,
            limite_concessao: limite,
            dias_direito: direito,
          })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("ferias_periodos" as never) as any).insert({
          empresa_id: empresa.id,
          colaborador_id: formP.colaborador_id,
          data_inicio: ini,
          data_fim: fim,
          limite_concessao: limite,
          dias_direito: direito,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Período atualizado" : "Período aquisitivo criado");
      qc.invalidateQueries({ queryKey: ["ferias_periodos"] });
      setOpenPeriodo(false);
      setEditId(null);
      setFormP({ colaborador_id: "", data_inicio: "", dias_direito: "30" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Nova concessão ----
  const [concPeriodo, setConcPeriodo] = useState<PeriodoRow | null>(null);
  const [openConc, setOpenConc] = useState(false);
  const [formC, setFormC] = useState({
    data_inicio_gozo: "",
    data_fim_gozo: "",
    abono_dias: "0",
    adiantar_decimo: false,
  });

  const abrirConcessao = (p: PeriodoRow) => {
    setConcPeriodo(p);
    setFormC({ data_inicio_gozo: "", data_fim_gozo: "", abono_dias: "0", adiantar_decimo: false });
    setOpenConc(true);
  };

  const saveConcessao = useMutation({
    mutationFn: async () => {
      if (!concPeriodo) throw new Error("Período não selecionado");
      const ini = formC.data_inicio_gozo;
      const fim = formC.data_fim_gozo;
      if (!ini || !fim) throw new Error("Informe as datas de gozo");
      if (ini < concPeriodo.data_fim)
        throw new Error("As férias não podem começar antes do fim do período aquisitivo");
      const dias =
        Math.round(
          (new Date(fim + "T00:00:00").getTime() - new Date(ini + "T00:00:00").getTime()) /
            86400000,
        ) + 1;
      if (dias < 5)
        throw new Error(
          "Cada período de gozo precisa de no mínimo 5 dias corridos (CLT art. 134 §1º)",
        );
      const abono = Number(formC.abono_dias) || 0;
      const concAtivas = (concPeriodo.ferias_concessoes ?? []).filter(
        (c) => c.status !== "cancelada",
      );
      const jaUsado = concAtivas.reduce((s, c) => s + (c.dias ?? 0) + (c.abono_dias ?? 0), 0);
      if (dias + abono + jaUsado > concPeriodo.dias_direito)
        throw new Error(
          `Saldo insuficiente: disponível ${concPeriodo.dias_direito - jaUsado} dia(s)`,
        );
      const { error } = await (supabase.from("ferias_concessoes" as never) as any).insert({
        empresa_id: concPeriodo.empresa_id ?? undefined,
        colaborador_id: concPeriodo.colaborador_id,
        periodo_id: concPeriodo.id,
        data_inicio_gozo: ini,
        data_fim_gozo: fim,
        abono_dias: abono,
        adiantar_decimo: formC.adiantar_decimo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias agendadas");
      qc.invalidateQueries({ queryKey: ["ferias_periodos"] });
      setOpenConc(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Cancelar concessão / excluir período ----
  const cancelarConcessao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("ferias_concessoes" as never) as any)
        .update({ status: "cancelada" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Concessão cancelada");
      qc.invalidateQueries({ queryKey: ["ferias_periodos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPeriodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ferias_periodos" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Período excluído");
      qc.invalidateQueries({ queryKey: ["ferias_periodos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const BADGE: Record<Situacao["key"], string> = {
    em_aquisicao: "bg-muted text-muted-foreground",
    disponivel: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    vencido: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Férias"
        description="Períodos aquisitivos, concessões e controle do prazo legal de concessão."
        actions={
          <Dialog
            open={openPeriodo}
            onOpenChange={(o) => {
              setOpenPeriodo(o);
              if (!o) {
                setEditId(null);
                setFormP({ colaborador_id: "", data_inicio: "", dias_direito: "30" });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={abrirNovoPeriodo}>
                <Plus className="h-4 w-4 mr-1" />
                Novo período
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editId ? "Editar período aquisitivo" : "Novo período aquisitivo"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador *</Label>
                  <Select
                    value={formP.colaborador_id}
                    disabled={!!editId}
                    onValueChange={(v) => setFormP((f) => ({ ...f, colaborador_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(colabs ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Início do período aquisitivo *</Label>
                    <Input
                      type="date"
                      value={formP.data_inicio}
                      onChange={(e) => setFormP((f) => ({ ...f, data_inicio: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Normalmente a data de admissão (ou seu aniversário).
                    </p>
                  </div>
                  <div>
                    <Label>Dias de direito</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={formP.dias_direito}
                      onChange={(e) => setFormP((f) => ({ ...f, dias_direito: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      30 para integral; proporcional na rescisão.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O prazo de concessão é calculado automaticamente: 12 meses de aquisição + 6 meses
                  para conceder (CLT art. 134).
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenPeriodo(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => savePeriodo.mutate()} disabled={savePeriodo.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Alertas de prazo */}
      {alertas.vencidos.length > 0 && (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {alertas.vencidos.length} período(s) com concessão VENCIDA
            </p>
            <p className="text-muted-foreground">
              Férias não concedidas no prazo geram direito a pagamento em dobro (CLT art. 137):{" "}
              {alertas.vencidos.map((p) => p.nome).join(", ")}.
            </p>
          </div>
        </Card>
      )}
      {alertas.vencendo.length > 0 && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <CalendarClock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              {alertas.vencendo.length} período(s) vencendo em até 60 dias
            </p>
            <p className="text-muted-foreground">
              Agende o gozo antes do prazo:{" "}
              {alertas.vencendo.map((p) => `${p.nome} (${dateBR(p.limite_concessao)})`).join(", ")}.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !enriquecidos || enriquecidos.length === 0 ? (
          <EmptyState
            icon={Sun}
            title="Nenhum período de férias ainda"
            description="Crie o primeiro período aquisitivo de um colaborador."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Aquisitivo</TableHead>
                <TableHead>Direito</TableHead>
                <TableHead>Gozados</TableHead>
                <TableHead>Abono</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Conceder até</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriquecidos.map((p) => {
                const sit = situacaoDe(p, p.saldo);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="whitespace-nowrap text-tabular">
                      {dateBR(p.data_inicio)} → {dateBR(p.data_fim)}
                    </TableCell>
                    <TableCell className="text-tabular">{p.dias_direito}</TableCell>
                    <TableCell className="text-tabular">{p.gozados}</TableCell>
                    <TableCell className="text-tabular">{p.abono}</TableCell>
                    <TableCell className="text-tabular font-medium">{p.saldo}</TableCell>
                    <TableCell
                      className={`text-tabular ${sit.key === "vencido" ? "text-destructive font-medium" : ""}`}
                    >
                      {dateBR(p.limite_concessao)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={BADGE[sit.key]}>
                        {sit.label}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={sit.key === "em_aquisicao"}
                          onClick={() => abrirConcessao(p)}
                        >
                          Conceder
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrirEdicaoPeriodo(p)}
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
                              <AlertDialogTitle>Excluir período?</AlertDialogTitle>
                              <AlertDialogDescription>
                                As concessões vinculadas também serão removidas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => delPeriodo.mutate(p.id)}>
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
        )}
      </Card>

      {/* Concessões do período */}
      <Dialog open={openConc} onOpenChange={setOpenConc}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Férias de {concPeriodo?.colaboradores?.nome ?? ""}</DialogTitle>
          </DialogHeader>

          {concPeriodo &&
            (() => {
              const conc = (concPeriodo.ferias_concessoes ?? []).filter(
                (c) => c.status !== "cancelada",
              );
              const usado = conc.reduce((s, c) => s + (c.dias ?? 0) + (c.abono_dias ?? 0), 0);
              const saldo = concPeriodo.dias_direito - usado;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Direito</p>
                      <p className="font-medium text-tabular">{concPeriodo.dias_direito} dias</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Já utilizado</p>
                      <p className="font-medium text-tabular">{usado} dias</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className="font-medium text-tabular">{Math.max(0, saldo)} dias</p>
                    </div>
                  </div>

                  {conc.length > 0 && (
                    <div className="space-y-2">
                      {conc.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="text-tabular whitespace-nowrap">
                            {dateBR(c.data_inicio_gozo)} → {dateBR(c.data_fim_gozo)} ({c.dias}d)
                          </span>
                          <span className="flex items-center gap-2">
                            {c.abono_dias > 0 && (
                              <Badge variant="secondary">vendeu {c.abono_dias}d</Badge>
                            )}
                            <Select
                              value={c.status}
                              onValueChange={(v) =>
                                cancelarConcessao.isPending
                                  ? null
                                  : (supabase.from("ferias_concessoes" as never) as any)
                                      .update({ status: v })
                                      .eq("id", c.id)
                                      .then(() =>
                                        qc.invalidateQueries({ queryKey: ["ferias_periodos"] }),
                                      )
                              }
                            >
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(CONC_STATUS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-medium">Agendar novo gozo</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Início do gozo *</Label>
                        <Input
                          type="date"
                          value={formC.data_inicio_gozo}
                          onChange={(e) =>
                            setFormC((f) => ({ ...f, data_inicio_gozo: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Fim do gozo *</Label>
                        <Input
                          type="date"
                          value={formC.data_fim_gozo}
                          onChange={(e) =>
                            setFormC((f) => ({ ...f, data_fim_gozo: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Venda (abono pecuniário)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={formC.abono_dias}
                          onChange={(e) => setFormC((f) => ({ ...f, abono_dias: e.target.value }))}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Máximo de 10 dias (CLT art. 143).
                        </p>
                      </div>
                      <label className="flex items-end gap-2 pb-1 text-sm">
                        <input
                          type="checkbox"
                          checked={formC.adiantar_decimo}
                          onChange={(e) =>
                            setFormC((f) => ({ ...f, adiantar_decimo: e.target.checked }))
                          }
                        />
                        Adiantar 1ª parcela do 13º
                      </label>
                    </div>
                  </div>
                </div>
              );
            })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConc(false)}>
              Fechar
            </Button>
            <Button onClick={() => saveConcessao.mutate()} disabled={saveConcessao.isPending}>
              Agendar férias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
