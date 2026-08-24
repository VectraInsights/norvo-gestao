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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sun, CalendarClock, AlertTriangle, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { dateBR, brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rh/ferias")({
  component: FeriasPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type ColabRow = {
  id: string; nome: string; cargo: string | null;
  data_admissao: string | null; status: string; salario_base: number;
};

type Concessao = {
  id: string; empresa_id: string; colaborador_id: string;
  periodo_inicio: string; data_inicio_gozo: string; data_fim_gozo: string;
  dias: number; abono_dias: number; adiantar_decimo: boolean; status: string;
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

/* ─── Tabelas INSS 2026 ─── */
const INSS_FAIXAS = [
  { limite: 1621.00, aliquota: 0.075 },
  { limite: 2902.84, aliquota: 0.09 },
  { limite: 4354.27, aliquota: 0.12 },
  { limite: 8475.55, aliquota: 0.14 },
];
function calcINSS(base: number): number {
  let inss = 0, anterior = 0;
  for (const fx of INSS_FAIXAS) {
    const parcela = Math.min(base, fx.limite) - anterior;
    if (parcela <= 0) break;
    inss += parcela * fx.aliquota;
    anterior = fx.limite;
  }
  return Math.min(Math.round(inss * 100) / 100, 988.09);
}

/* ─── Tabelas IRRF 2026 (Lei 15.270/2025) ─── */
const IRRF_FAIXAS = [
  { limite: 2428.80,  aliquota: 0,      deducao: 0 },
  { limite: 2826.65,  aliquota: 0.075,  deducao: 182.16 },
  { limite: 3751.05,  aliquota: 0.15,   deducao: 394.16 },
  { limite: 4664.68,  aliquota: 0.225,  deducao: 675.49 },
  { limite: Infinity,  aliquota: 0.275,  deducao: 908.73 },
];
function calcIRRF(baseCalculo: number, salarioBruto: number): number {
  let imposto = 0;
  for (const fx of IRRF_FAIXAS) {
    if (baseCalculo <= fx.limite) {
      imposto = Math.max(0, baseCalculo * fx.aliquota - fx.deducao);
      break;
    }
  }
  if (imposto <= 0) return 0;
  if (salarioBruto <= 5000) return 0;
  if (salarioBruto <= 7350) {
    const reducao = 978.62 - (0.133145 * salarioBruto);
    return Math.round(Math.max(0, imposto - reducao) * 100) / 100;
  }
  return Math.round(imposto * 100) / 100;
}

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
const SIT_LABEL: Record<SitKey, string> = {
  sem_admissao: "Sem data de admissão", vencida: "Férias vencidas",
  vencendo: "Vence em até 60 dias", em_dia: "Em dia",
};
const SIT_BADGE: Record<SitKey, string> = {
  sem_admissao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  vencida: "bg-destructive/15 text-destructive",
  vencendo: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  em_dia: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};
const CONC_STATUS: Record<string, string> = {
  agendada: "Agendada", em_gozo: "Em gozo", concluida: "Concluída", cancelada: "Cancelada",
};
const CONC_BADGE: Record<string, string> = {
  agendada: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  em_gozo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  concluida: "bg-muted text-muted-foreground",
  cancelada: "bg-destructive/10 text-destructive",
};

function FeriasPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cicloSel, setCicloSel] = useState<string | null>(null);
  const [formInicio, setFormInicio] = useState("");
  const [formFim, setFormFim] = useState("");
  const [formAbono, setFormAbono] = useState("");
  const [formDecimo, setFormDecimo] = useState(false);

  const { data: colabs, isLoading: loadingColabs } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaboradores" as never)
        .select("id, nome, cargo, data_admissao, status, salario_base")
        .eq("empresa_id", empresa!.id).neq("status", "demitido").order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as ColabRow[];
    },
  });

  const { data: concessoes, isLoading: loadingConc } = useQuery({
    enabled: !!empresa,
    queryKey: ["ferias_concessoes", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ferias_concessoes" as never)
        .select("*").eq("empresa_id", empresa!.id).order("data_inicio_gozo");
      if (error) throw error;
      return (data ?? []) as unknown as Concessao[];
    },
  });

  const hoje = HOJE();
  const limite60 = addDias(hoje, 60);

  const linhas = useMemo(() => {
    return (colabs ?? []).map((colab) => {
      const minhas = (concessoes ?? []).filter(
        (c) => c.colaborador_id === colab.id && c.status !== "cancelada",
      );
      const todos = colab.data_admissao ? ciclosAteHoje(colab.data_admissao) : [];
      const todosComSaldo = todos.map((ciclo) => ({
        ...ciclo,
        usado: minhas
          .filter((c) => c.periodo_inicio === ciclo.inicio)
          .reduce((s, c) => s + (c.dias ?? 0) + (c.abono_dias ?? 0), 0),
      }));
      const abertos = todosComSaldo
        .filter((c) => c.usado < DIAS_DIREITO)
        .sort((a, b) => a.limite.localeCompare(b.limite));
      const saldoTotal = abertos.reduce((s, c) => s + DIAS_DIREITO - c.usado, 0);
      const proximoLimite = abertos[0]?.limite ?? null;
      let sit: SitKey = "em_dia";
      if (!colab.data_admissao) sit = "sem_admissao";
      else if (abertos.some((c) => hoje > c.limite)) sit = "vencida";
      else if (proximoLimite && proximoLimite <= limite60) sit = "vencendo";
      return { colab, todosComSaldo, abertos, saldoTotal, proximoLimite, sit, minhas };
    });
  }, [colabs, concessoes]);

  const alertas = useMemo(() => ({
    vencidos: linhas.filter((l) => l.sit === "vencida"),
    vencendo: linhas.filter((l) => l.sit === "vencendo"),
  }), [linhas]);

  const toggleExpandido = (id: string) => {
    setExpandido((prev) => prev === id ? null : id);
    setCicloSel(null);
    setFormInicio(""); setFormFim(""); setFormAbono(""); setFormDecimo(false);
  };

  const linhaExpandida = linhas.find((l) => l.colab.id === expandido);

  const calculoFerias = useMemo(() => {
    if (!linhaExpandida || !formInicio || !formFim) return null;
    const salario = Number(linhaExpandida.colab.salario_base) || 0;
    if (salario <= 0) return null;
    const diasGozo = Math.round(
      (new Date(formFim + "T00:00:00").getTime() - new Date(formInicio + "T00:00:00").getTime()) / 86400000
    ) + 1;
    if (diasGozo < 1) return null;
    const abono = Number(formAbono) || 0;

    // Férias + 1/3 (base para INSS/IRRF)
    const proporcional = (salario / 30) * diasGozo;
    const terco = proporcional / 3;
    const brutoFerias = proporcional + terco;
    const inssFerias = calcINSS(brutoFerias);
    const irrfFerias = calcIRRF(brutoFerias - inssFerias, brutoFerias);
    const liquidoFerias = brutoFerias - inssFerias - irrfFerias;

    // Abono pecuniário — ISENTO de INSS e IRRF
    const valorAbono = abono > 0 ? (salario / 30) * abono : 0;

    // 13º adiantado — INSS e IRRF incidem
    const decimoBruto = formDecimo ? (salario / 30) * diasGozo : 0;
    const inssDecimo = formDecimo ? calcINSS(decimoBruto) : 0;
    const irrfDecimo = formDecimo ? calcIRRF(decimoBruto - inssDecimo, decimoBruto) : 0;
    const liquidoDecimo = decimoBruto - inssDecimo - irrfDecimo;

    const totalDescontos = inssFerias + irrfFerias + inssDecimo + irrfDecimo;
    const totalReceber = liquidoFerias + valorAbono + liquidoDecimo;

    return {
      salario, diasGozo, abono,
      proporcional, terco, brutoFerias, inssFerias, irrfFerias, liquidoFerias,
      valorAbono,
      decimoBruto, inssDecimo, irrfDecimo, liquidoDecimo,
      totalDescontos, totalReceber,
    };
  }, [linhaExpandida, formInicio, formFim, formAbono, formDecimo]);

  const saveConcessao = useMutation({
    mutationFn: async () => {
      if (!linhaExpandida || !empresa) throw new Error("Selecione um colaborador");
      if (!cicloSel) throw new Error("Selecione o período aquisitivo");
      const ciclo = linhaExpandida.todosComSaldo.find((c) => c.inicio === cicloSel);
      if (!ciclo) throw new Error("Período aquisitivo inválido");
      if (!formInicio || !formFim) throw new Error("Informe as datas de gozo");
      if (formInicio <= ciclo.fim)
        throw new Error("O gozo não pode começar antes do fim do período aquisitivo");
      const dias = Math.round(
        (new Date(formFim + "T00:00:00").getTime() - new Date(formInicio + "T00:00:00").getTime()) / 86400000
      ) + 1;
      if (dias < 5) throw new Error("Mínimo de 5 dias corridos (CLT art. 134 §1º)");
      const abono = Number(formAbono) || 0;
      if (dias + abono + ciclo.usado > DIAS_DIREITO)
        throw new Error(`Saldo insuficiente: disponível ${DIAS_DIREITO - ciclo.usado} dia(s)`);
      const { error } = await (supabase.from("ferias_concessoes" as never) as any).insert({
        empresa_id: empresa.id, colaborador_id: linhaExpandida.colab.id,
        periodo_inicio: ciclo.inicio, data_inicio_gozo: formInicio,
        data_fim_gozo: formFim, abono_dias: abono, adiantar_decimo: formDecimo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Férias agendadas");
      qc.invalidateQueries({ queryKey: ["ferias_concessoes"] });
      setCicloSel(null); setFormInicio(""); setFormFim(""); setFormAbono("0"); setFormDecimo(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatusConc = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from("ferias_concessoes" as never) as any)
        .update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      qc.invalidateQueries({ queryKey: ["ferias_concessoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirConc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ferias_concessoes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Concessão excluída");
      qc.invalidateQueries({ queryKey: ["ferias_concessoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
              {alertas.vencendo.map((l) => `${l.colab.nome} (${dateBR(l.proximoLimite!)})`).join(", ")}.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {loadingColabs || loadingConc ? (
          <div className="p-6"><Skeleton className="h-32 w-full" /></div>
        ) : !linhas || linhas.length === 0 ? (
          <EmptyState icon={Sun} title="Nenhum colaborador ativo"
            description="Cadastre colaboradores com data de admissão para acompanhar as férias automaticamente." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead className="text-center">Períodos</TableHead>
                <TableHead className="text-center">Saldo</TableHead>
                <TableHead>Conceder até</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const isOpen = expandido === l.colab.id;
                const minhasConcessoes = (concessoes ?? []).filter(
                  (c) => c.colaborador_id === l.colab.id,
                );
                return (
                  <>
                    <TableRow key={l.colab.id} className={isOpen ? "bg-muted/30" : ""}>
                      <TableCell className="px-2">
                        <button
                          type="button"
                          className="cursor-pointer rounded p-0.5 hover:bg-muted"
                          onClick={() => toggleExpandido(l.colab.id)}
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {l.colab.nome}
                        {l.colab.cargo && (
                          <span className="block text-xs text-muted-foreground">{l.colab.cargo}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-tabular">
                        {l.colab.data_admissao ? dateBR(l.colab.data_admissao) : "—"}
                      </TableCell>
                      <TableCell className="text-center text-tabular">{l.abertos.length}</TableCell>
                      <TableCell className="text-center text-tabular font-medium">{l.saldoTotal}</TableCell>
                      <TableCell className={`text-tabular whitespace-nowrap ${l.sit === "vencida" ? "text-destructive font-medium" : ""}`}>
                        {l.proximoLimite ? dateBR(l.proximoLimite) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={SIT_BADGE[l.sit]}>
                          {SIT_LABEL[l.sit]}
                        </Badge>
                      </TableCell>
                    </TableRow>

                    {/* Linha expandida — períodos aquisitivos */}
                    {isOpen && (
                      <TableRow key={`${l.colab.id}-exp`}>
                        <TableCell colSpan={7} className="bg-muted/10 p-4">
                          <div className="space-y-4">
                            {/* Todos os períodos aquisitivos */}
                            <div>
                              <p className="mb-2 text-sm font-medium">Períodos aquisitivos</p>
                              {l.todosComSaldo.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Sem períodos (data de admissão ausente).</p>
                              ) : (
                                <div className="space-y-2">
                                  {l.todosComSaldo.map((ciclo) => {
                                    const saldo = DIAS_DIREITO - ciclo.usado;
                                    const vencido = hoje > ciclo.limite;
                                    const venceBreve = !vencido && ciclo.limite <= limite60;
                                    return (
                                      <div key={ciclo.inicio}>
                                        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                          <div className="flex items-center gap-3">
                                            <span className="text-tabular whitespace-nowrap">
                                              {dateBR(ciclo.inicio)} → {dateBR(ciclo.fim)}
                                            </span>
                                            <span className="text-muted-foreground">
                                              limite {dateBR(ciclo.limite)}
                                            </span>
                                            {vencido && <Badge variant="secondary" className="bg-destructive/10 text-destructive">vencido</Badge>}
                                            {venceBreve && <Badge variant="secondary" className="bg-sky-500/15 text-sky-600">vence em breve</Badge>}
                                          </div>
                                          <div>
                                            {saldo > 0 && (
                                              <Button
                                                variant="outline" size="sm"
                                                onClick={() => {
                                                setCicloSel(ciclo.inicio);
                                                setFormInicio(""); setFormFim(""); setFormAbono(""); setFormDecimo(false);
                                                }}
                                              >
                                                Conceder
                                              </Button>
                                            )}
                                          </div>
                                        </div>

                                        {/* Formulário de concessão inline — abaixo do período selecionado */}
                                        {cicloSel === ciclo.inicio && (
                                          <div className="mt-2 rounded-md border border-primary/30 bg-background p-4">
                                            <p className="mb-3 text-sm font-medium">
                                              Conceder férias — período {dateBR(cicloSel)}
                                            </p>
                                            <div className="grid gap-3">
                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <Label>Início do gozo *</Label>
                                                  <DateInput
                                                    value={formInicio}
                                                    onChange={(v) => {
                                                      setFormInicio(v);
                                                      if (v) {
                                                        const abono = Number(formAbono) || 0;
                                                        const diasFerias = 30 - abono;
                                                        const d = new Date(v + "T00:00:00");
                                                        d.setDate(d.getDate() + diasFerias - 1);
                                                        setFormFim(d.toISOString().slice(0, 10));
                                                      } else {
                                                        setFormFim("");
                                                      }
                                                    }}
                                                  />
                                                </div>
                                                <div>
                                                  <Label>Fim do gozo *</Label>
                                                  <DateInput value={formFim} onChange={setFormFim} />
                                                </div>
                                                <div>
                                                  <Label>Venda (abono pecuniário)</Label>
                                                  <Input type="number" min={0} max={10} value={formAbono}
                                                    placeholder="0"
                                                    className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    onChange={(e) => {
                                                      const v = e.target.value;
                                                      setFormAbono(v);
                                                      if (formInicio) {
                                                        const abono = Number(v) || 0;
                                                        const diasFerias = 30 - abono;
                                                        const d = new Date(formInicio + "T00:00:00");
                                                        d.setDate(d.getDate() + diasFerias - 1);
                                                        setFormFim(d.toISOString().slice(0, 10));
                                                      }
                                                    }} />
                                                  <p className="mt-1 text-xs text-muted-foreground">Máx. 10 dias (CLT art. 143).</p>
                                                </div>
                                                <label className="flex items-end gap-2 pb-1 text-sm">
                                                  <input type="checkbox" checked={formDecimo}
                                                    onChange={(e) => setFormDecimo(e.target.checked)} />
                                                  Adiantar 1ª parcela do 13º
                                                </label>
                                              </div>
                                              {calculoFerias && (
                                                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                                                  <p className="font-medium text-muted-foreground mb-2">Prévia do cálculo</p>
                                                  <div className="flex justify-between"><span>Férias ({calculoFerias.diasGozo}d × 1/30)</span><span className="text-tabular">{brl(calculoFerias.proporcional)}</span></div>
                                                  <div className="flex justify-between"><span>Adicional constitucional (⅓)</span><span className="text-tabular">{brl(calculoFerias.terco)}</span></div>
                                                  <div className="flex justify-between text-muted-foreground"><span>− INSS</span><span className="text-tabular">−{brl(calculoFerias.inssFerias)}</span></div>
                                                  <div className="flex justify-between text-muted-foreground"><span>− IRRF</span><span className="text-tabular">−{brl(calculoFerias.irrfFerias)}</span></div>
                                                  <div className="flex justify-between font-medium"><span>Líquido férias</span><span className="text-tabular">{brl(calculoFerias.liquidoFerias)}</span></div>
                                                  {calculoFerias.abono > 0 && <>
                                                    <div className="border-t pt-1 mt-1" />
                                                    <div className="flex justify-between"><span>Abono pecuniário ({calculoFerias.abono}d)</span><span className="text-tabular">{brl(calculoFerias.valorAbono)}</span></div>
                                                    <p className="text-xs text-muted-foreground">Isento de INSS e IRRF</p>
                                                  </>}
                                                  {calculoFerias.decimoBruto > 0 && <>
                                                    <div className="border-t pt-1 mt-1" />
                                                    <div className="flex justify-between"><span>13º adiantado (bruto)</span><span className="text-tabular">{brl(calculoFerias.decimoBruto)}</span></div>
                                                    <div className="flex justify-between text-muted-foreground"><span>− INSS 13º</span><span className="text-tabular">−{brl(calculoFerias.inssDecimo)}</span></div>
                                                    <div className="flex justify-between text-muted-foreground"><span>− IRRF 13º</span><span className="text-tabular">−{brl(calculoFerias.irrfDecimo)}</span></div>
                                                    <div className="flex justify-between font-medium"><span>Líquido 13º</span><span className="text-tabular">{brl(calculoFerias.liquidoDecimo)}</span></div>
                                                  </>}
                                                  <div className="border-t pt-1 mt-1 flex justify-between text-muted-foreground"><span>Total descontos</span><span className="text-tabular">−{brl(calculoFerias.totalDescontos)}</span></div>
                                                  <div className="flex justify-between font-semibold text-base"><span>Total a receber</span><span className="text-tabular">{brl(calculoFerias.totalReceber)}</span></div>
                                                </div>
                                              )}
                                              <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setCicloSel(null)}>Cancelar</Button>
                                                <Button size="sm" onClick={() => saveConcessao.mutate()} disabled={saveConcessao.isPending}>
                                                  {saveConcessao.isPending ? "Agendando..." : "Agendar férias"}
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Concessões já feitas */}
                            {minhasConcessoes.length > 0 && (
                              <div>
                                <p className="mb-2 text-sm font-medium">Concessões</p>
                                <div className="space-y-2">
                                  {minhasConcessoes.map((c) => (
                                    <div key={c.id} className={`rounded-md border px-3 py-2 text-sm ${c.status === "cancelada" ? "opacity-50" : ""}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-tabular whitespace-nowrap">
                                          {dateBR(c.data_inicio_gozo)} → {dateBR(c.data_fim_gozo)}
                                          <span className="ml-1 text-xs text-muted-foreground">
                                            ciclo {dateBR(c.periodo_inicio)}
                                          </span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                          {c.abono_dias > 0 && <Badge variant="secondary">vendeu {c.abono_dias}d</Badge>}
                                          {c.adiantar_decimo && <Badge variant="secondary">13º adiantado</Badge>}
                                        </span>
                                      </div>
                                      <div className="mt-2 flex items-center justify-end gap-2">
                                        {c.status !== "cancelada" && (
                                          <Select value={c.status}
                                            onValueChange={(v) => setStatusConc.mutate({ id: c.id, status: v })}>
                                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              {Object.entries(CONC_STATUS).map(([k, v]) => (
                                                <SelectItem key={k} value={k}>{v}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}
                                        <Badge variant="secondary" className={CONC_BADGE[c.status]}>
                                          {CONC_STATUS[c.status] ?? c.status}
                                        </Badge>
                                        {c.status === "agendada" && (
                                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir"
                                            onClick={() => {
                                              if (confirm("Excluir esta concessão?"))
                                                excluirConc.mutate(c.id);
                                            }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
