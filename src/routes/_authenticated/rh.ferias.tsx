/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas ainda não estão em types.ts; padrão do projeto é cast as never/as any */
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sun, CalendarClock, AlertTriangle } from "lucide-react";
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

type ColabRow = {
  id: string;
  nome: string;
  cargo: string | null;
  data_admissao: string | null;
  status: string;
};

type Concessao = {
  id: string;
  empresa_id: string;
  colaborador_id: string;
  periodo_inicio: string;
  data_inicio_gozo: string;
  data_fim_gozo: string;
  dias: number;
  abono_dias: number;
  adiantar_decimo: boolean;
  status: string;
};

type Ciclo = { inicio: string; fim: string; limite: string };

const DIAS_DIREITO = 30;

const HOJE = () => new Date().toISOString().slice(0, 10);
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDias = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const addAnos = (d: Date, n: number) => {
  const x = new Date(d.getTime());
  x.setFullYear(x.getFullYear() + n);
  return x;
};
const addMesesClamp = (d: Date, n: number) => {
  const x = new Date(d.getTime());
  const dia = x.getDate();
  x.setMonth(x.getMonth() + n);
  if (x.getDate() !== dia) x.setDate(0);
  return x;
};

/** Ciclos aquisitivos já iniciados: aniversário da admissão +12m para adquirir.
 *  Prazo para conceder: o período concessivo completo (12m seguintes ao aquisitivo,
 *  CLT art. 134) com folga de 30 dias antes do fim — ou seja, limite = fim + 12m − 30d.
 *  Ex.: admissão 19/02/2024 → aquisitivo 19/02/2024–18/02/2025 → conceder até 19/01/2026. */
function ciclosAteHoje(admissao: string): Ciclo[] {
  const adm = new Date(admissao + "T00:00:00");
  const hojeD = new Date(HOJE() + "T00:00:00");
  const out: Ciclo[] = [];
  for (let y = 0; ; y++) {
    const ini = addAnos(adm, y);
    if (ini > hojeD) break;
    const fim = addDias(toISO(addAnos(adm, y + 1)), -1);
    const limite = addDias(toISO(addMesesClamp(new Date(fim + "T00:00:00"), 12)), -30);
    out.push({ inicio: toISO(ini), fim, limite });
  }
  return out;
}

type SitKey = "sem_admissao" | "vencida" | "vencendo" | "em_dia";

type Linha = {
  colab: ColabRow;
  abertos: Array<Ciclo & { usado: number }>;
  saldoTotal: number;
  proximoLimite: string | null;
  sit: SitKey;
};

function construirLinhas(colabs: ColabRow[], concessoes: Concessao[]): Linha[] {
  const hoje = HOJE();
  const limite60 = addDias(hoje, 60);
  return colabs.map((colab) => {
    const minhas = concessoes.filter(
      (c) => c.colaborador_id === colab.id && c.status !== "cancelada",
    );
    const todos = colab.data_admissao ? ciclosAteHoje(colab.data_admissao) : [];
    const abertos = todos
      .map((ciclo) => ({
        ...ciclo,
        usado: minhas
          .filter((c) => c.periodo_inicio === ciclo.inicio)
          .reduce((s, c) => s + (c.dias ?? 0) + (c.abono_dias ?? 0), 0),
      }))
      .filter((c) => c.usado < DIAS_DIREITO)
      .sort((a, b) => a.limite.localeCompare(b.limite));
    const saldoTotal = abertos.reduce((s, c) => s + DIAS_DIREITO - c.usado, 0);
    const proximoLimite = abertos[0]?.limite ?? null;
    let sit: SitKey = "em_dia";
    if (!colab.data_admissao) sit = "sem_admissao";
    else if (abertos.some((c) => hoje > c.limite)) sit = "vencida";
    else if (proximoLimite && proximoLimite <= limite60) sit = "vencendo";
    return { colab, abertos, saldoTotal, proximoLimite, sit };
  });
}

const SIT_LABEL: Record<SitKey, string> = {
  sem_admissao: "Sem data de admissão",
  vencida: "Férias vencidas",
  vencendo: "Vence em até 60 dias",
  em_dia: "Em dia",
};

const SIT_BADGE: Record<SitKey, string> = {
  sem_admissao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  vencida: "bg-destructive/15 text-destructive",
  vencendo: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  em_dia: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const CONC_STATUS: Record<string, string> = {
  agendada: "Agendada",
  em_gozo: "Em gozo",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

function FeriasPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();

  const { data: colabs, isLoading: loadingColabs } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id, nome, cargo, data_admissao, status")
        .eq("empresa_id", empresa!.id)
        .neq("status", "demitido")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as ColabRow[];
    },
  });

  const { data: concessoes, isLoading: loadingConc } = useQuery({
    enabled: !!empresa,
    queryKey: ["ferias_concessoes", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ferias_concessoes" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .order("data_inicio_gozo");
      if (error) throw error;
      return (data ?? []) as unknown as Concessao[];
    },
  });

  const linhas = useMemo(
    () => construirLinhas(colabs ?? [], concessoes ?? []),
    [colabs, concessoes],
  );
  const alertas = useMemo(
    () => ({
      vencidos: linhas.filter((l) => l.sit === "vencida"),
      vencendo: linhas.filter((l) => l.sit === "vencendo"),
    }),
    [linhas],
  );

  // ---- Agendar concessão ----
  const [concId, setConcId] = useState<string | null>(null);
  const [formC, setFormC] = useState({
    ciclo_inicio: "",
    data_inicio_gozo: "",
    data_fim_gozo: "",
    abono_dias: "0",
    adiantar_decimo: false,
  });

  const abrirConcessao = (l: Linha) => {
    setConcId(l.colab.id);
    setFormC({
      ciclo_inicio: l.abertos[0]?.inicio ?? "",
      data_inicio_gozo: "",
      data_fim_gozo: "",
      abono_dias: "0",
      adiantar_decimo: false,
    });
  };

  const linhaSelecionada = linhas.find((l) => l.colab.id === concId) ?? null;
  const minhasConcessoes = (concessoes ?? []).filter((c) => c.colaborador_id === concId);

  const saveConcessao = useMutation({
    mutationFn: async () => {
      if (!linhaSelecionada || !empresa) throw new Error("Selecione um colaborador");
      const ciclo = linhaSelecionada.abertos.find((c) => c.inicio === formC.ciclo_inicio);
      if (!ciclo) throw new Error("Escolha o período aquisitivo");
      const ini = formC.data_inicio_gozo;
      const fim = formC.data_fim_gozo;
      if (!ini || !fim) throw new Error("Informe as datas de gozo");
      if (ini <= ciclo.fim)
        throw new Error("O gozo não pode começar antes do fim do período aquisitivo");
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
      if (dias + abono + ciclo.usado > DIAS_DIREITO)
        throw new Error(`Saldo insuficiente: disponível ${DIAS_DIREITO - ciclo.usado} dia(s)`);
      const { error } = await (supabase.from("ferias_concessoes" as never) as any).insert({
        empresa_id: empresa.id,
        colaborador_id: linhaSelecionada.colab.id,
        periodo_inicio: ciclo.inicio,
        data_inicio_gozo: ini,
        data_fim_gozo: fim,
        abono_dias: abono,
        adiantar_decimo: formC.adiantar_decimo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias agendadas");
      qc.invalidateQueries({ queryKey: ["ferias_concessoes"] });
      setFormC((f) => ({ ...f, data_inicio_gozo: "", data_fim_gozo: "", abono_dias: "0" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatusConc = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from("ferias_concessoes" as never) as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      qc.invalidateQueries({ queryKey: ["ferias_concessoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const BADGE: Record<string, string> = {
    agendada: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    em_gozo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    concluida: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Férias"
        description="Controle automático a partir da data de admissão: períodos aquisitivos, prazos de concessão e saldos."
      />

      {alertas.vencidos.length > 0 && (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {alertas.vencidos.length} colaborador(es) com férias VENCIDAS
            </p>
            <p className="text-muted-foreground">
              Férias não concedidas no prazo geram direito a pagamento em dobro (CLT art. 137):{" "}
              {alertas.vencidos.map((l) => l.colab.nome).join(", ")}.
            </p>
          </div>
        </Card>
      )}
      {alertas.vencendo.length > 0 && (
        <Card className="flex items-start gap-3 border-sky-500/40 bg-sky-500/5 p-4">
          <CalendarClock className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="text-sm">
            <p className="font-medium text-sky-600 dark:text-sky-400">
              {alertas.vencendo.length} colaborador(es) com prazo vencendo em até 60 dias
            </p>
            <p className="text-muted-foreground">
              Agende o gozo antes do prazo:{" "}
              {alertas.vencendo
                .map((l) => `${l.colab.nome} (${dateBR(l.proximoLimite!)})`)
                .join(", ")}
              .
            </p>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {loadingColabs || loadingConc ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !linhas || linhas.length === 0 ? (
          <EmptyState
            icon={Sun}
            title="Nenhum colaborador ativo"
            description="Cadastre colaboradores com data de admissão para acompanhar as férias automaticamente."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead>Períodos em aberto</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Conceder até</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.colab.id}>
                  <TableCell className="font-medium">
                    {l.colab.nome}
                    {l.colab.cargo && (
                      <span className="block text-xs text-muted-foreground">{l.colab.cargo}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-tabular">
                    {l.colab.data_admissao ? dateBR(l.colab.data_admissao) : "—"}
                  </TableCell>
                  <TableCell className="text-tabular">{l.abertos.length}</TableCell>
                  <TableCell className="text-tabular font-medium">{l.saldoTotal}</TableCell>
                  <TableCell
                    className={`text-tabular whitespace-nowrap ${l.sit === "vencida" ? "text-destructive font-medium" : ""}`}
                  >
                    {l.proximoLimite ? dateBR(l.proximoLimite) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={SIT_BADGE[l.sit]}>
                      {SIT_LABEL[l.sit]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={l.sit === "sem_admissao" || l.abertos.length === 0}
                        onClick={() => abrirConcessao(l)}
                      >
                        Conceder
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Concessões do colaborador */}
      <Dialog open={!!concId} onOpenChange={(o) => !o && setConcId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Férias de {linhaSelecionada?.colab.nome ?? ""}</DialogTitle>
          </DialogHeader>

          {linhaSelecionada && (
            <div className="space-y-4">
              {/* Concessões existentes */}
              {minhasConcessoes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Concessões</p>
                  {minhasConcessoes.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-md border px-3 py-2 text-sm ${c.status === "cancelada" ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-tabular whitespace-nowrap">
                          {dateBR(c.data_inicio_gozo)} → {dateBR(c.data_fim_gozo)} ({c.dias}d)
                          <span className="ml-1 text-xs text-muted-foreground">
                            ciclo {dateBR(c.periodo_inicio)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {c.abono_dias > 0 && (
                            <Badge variant="secondary">vendeu {c.abono_dias}d</Badge>
                          )}
                          {c.adiantar_decimo && <Badge variant="secondary">13º adiantado</Badge>}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        {c.status !== "cancelada" && (
                          <Select
                            value={c.status}
                            onValueChange={(v) => setStatusConc.mutate({ id: c.id, status: v })}
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
                        )}
                        <Badge variant="secondary" className={BADGE[c.status]}>
                          {CONC_STATUS[c.status] ?? c.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Agendar novo gozo */}
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Agendar novo gozo</p>
                <div className="grid gap-3">
                  <div>
                    <Label>Período aquisitivo *</Label>
                    <Select
                      value={formC.ciclo_inicio}
                      onValueChange={(v) => setFormC((f) => ({ ...f, ciclo_inicio: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha..." />
                      </SelectTrigger>
                      <SelectContent>
                        {linhaSelecionada.abertos.map((ciclo) => (
                          <SelectItem key={ciclo.inicio} value={ciclo.inicio}>
                            Período aquisitivo: {dateBR(ciclo.inicio)} → {dateBR(ciclo.fim)} · Data limite: {dateBR(ciclo.limite)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Início do gozo *</Label>
                      <DateInput
                        value={formC.data_inicio_gozo}
                        onChange={(v) => {
                          setFormC((f) => {
                            const fim = v ? (() => {
                              const d = new Date(v + "T00:00:00");
                              d.setDate(d.getDate() + 29);
                              return d.toISOString().slice(0, 10);
                            })() : "";
                            return { ...f, data_inicio_gozo: v, data_fim_gozo: fim };
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Fim do gozo *</Label>
                      <DateInput
                        value={formC.data_fim_gozo}
                        onChange={(v) => setFormC((f) => ({ ...f, data_fim_gozo: v }))}
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
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConcId(null)}>
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
