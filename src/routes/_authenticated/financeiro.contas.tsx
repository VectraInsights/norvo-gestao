import { MoneyInput } from "@/components/erp/money-input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Banknote, Plus, Upload, Loader2, Link2, Check, Landmark, Wallet, CreditCard, TrendingUp, PiggyBank, DollarSign, Database, Coins, Trash2, Search, X, ChevronLeft, ChevronRight, ChevronDown, Pencil, Sparkles, ArrowLeftRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/erp/date-input";
import { Combobox } from "@/components/erp/combobox";
import { PeriodoFilter, type Periodo } from "@/components/erp/periodo-filter";
import { NovoContatoDialog } from "@/components/erp/novo-contato-dialog";
import { TransferenciaDialog } from "@/components/erp/transferencia-dialog";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { parseOfxFull } from "@/lib/ofx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useFiltrosSalvos } from "@/hooks/use-filtros-salvos";
import { detectBancoByNome, detectBancoByCodigo, formatContaComDigito, normalizaContaNumero } from "@/lib/bancos";

export const Route = createFileRoute("/_authenticated/financeiro/contas")({
  validateSearch: (search: Record<string, unknown>): { conciliar?: string; conta?: string; tab?: string } => ({
    conciliar: typeof search.conciliar === "string" ? search.conciliar : undefined,
    conta: typeof search.conta === "string" ? search.conta : undefined,
    tab: search.tab === "movs" || search.tab === "pendentes" ? search.tab : undefined,
  }),
  component: ContasFinanceiras,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});


const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type TipoConta = "corrente" | "caixa" | "cartao_credito" | "investimento" | "poupanca" | "aplicacao_automatica" | "outras";

type ContaBancaria = {
  id: string; nome: string | null; banco: string | null;
  agencia: string | null; conta: string | null; saldo_atual: number;
  tipo: TipoConta; padrao?: boolean | null;
};

type OfxRow = {
  id: string; data_transacao: string; valor: number; tipo: string;
  memo: string | null; status: string; lancamento_id: string | null;
};

const TIPO_PRINCIPAL: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }[] = [
  { value: "corrente", label: "Conta corrente", desc: "Conecte sua conta bancária para manter o fluxo de caixa sempre conciliado.", icon: Landmark },
  { value: "caixa", label: "Conta caixa", desc: "Registre entradas e saídas em dinheiro, como caixa físico ou fundo fixo.", icon: Wallet },
  { value: "cartao_credito", label: "Cartão de crédito", desc: "Centralize faturas e despesas do cartão empresarial em uma tela exclusiva.", icon: CreditCard },
];
const TIPO_OUTROS: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }[] = [
  { value: "investimento", label: "Investimento", desc: "Acompanhe aplicações e rendimentos.", icon: TrendingUp },
  { value: "poupanca", label: "Conta poupança", desc: "Controle depósitos e resgates separados da conta corrente.", icon: PiggyBank },
  { value: "aplicacao_automatica", label: "Aplicação automática", desc: "Registre aplicações automáticas entre contas da empresa.", icon: Database },
  { value: "outras", label: "Outras contas", desc: "Registre movimentos específicos, como empréstimos de sócios.", icon: Coins },
];
const TIPO_LABEL: Record<TipoConta, string> = {
  corrente: "Conta corrente", caixa: "Conta caixa", cartao_credito: "Cartão de crédito",
  investimento: "Investimento", poupanca: "Conta poupança", aplicacao_automatica: "Aplicação automática", outras: "Outras contas",
};

type FormState = {
  tipo: TipoConta;
  nome: string; banco: string; agencia: string; conta: string;
  modalidade: string; padrao: boolean; saldo_inicial: string;
  conta_vinculada_id: string;
  cartao_ultimos4: string; cartao_bandeira: string; cartao_emissor: string;
  cartao_conta_pagamento_id: string; cartao_dia_fechamento: string; cartao_dia_vencimento: string;
  data_inicio_lancamentos: string; saldo_dia_anterior: string;
};

const initialForm = (tipo: TipoConta): FormState => ({
  tipo, nome: "", banco: "", agencia: "", conta: "", modalidade: "", padrao: false, saldo_inicial: "0",
  conta_vinculada_id: "", cartao_ultimos4: "", cartao_bandeira: "", cartao_emissor: "",
  cartao_conta_pagamento_id: "", cartao_dia_fechamento: "", cartao_dia_vencimento: "",
  data_inicio_lancamentos: "", saldo_dia_anterior: "",
});


/** Concilia automaticamente (mesmo valor e mesma data) tudo o que der match.
 *  Retorna a quantidade de conciliações efetuadas. */
async function autoConciliarConta(contaId: string, empresaId: string): Promise<number> {
  // Busca paginada: sem range o Supabase corta em 1000 e o match perde lançamentos.
  const [txs, abertos] = await Promise.all([
    (async () => {
      const todas: { id: string; data_transacao: string; valor: number }[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("ofx_transacoes")
          .select("id,data_transacao,valor")
          .eq("conta_bancaria_id", contaId).neq("status", "conciliada")
          .order("data_transacao").range(ini, ini + 999);
        if (error) throw error;
        todas.push(...((data as unknown as typeof todas) ?? []));
        if (!data || data.length < 1000) break;
      }
      return todas;
    })(),
    (async () => {
      const todos: { id: string; valor: number; data_vencimento: string }[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("lancamentos_financeiros")
          .select("id,valor,data_vencimento")
          .eq("empresa_id", empresaId).in("status", ["aberto", "vencido", "parcial"])
          .order("data_vencimento").range(ini, ini + 999);
        if (error) throw error;
        todos.push(...((data as unknown as typeof todos) ?? []));
        if (!data || data.length < 1000) break;
      }
      return todos;
    })(),
  ]);
  if (!txs?.length || !abertos?.length) return 0;

  // Índice valor+data (O(1) por transação em vez de find O(N*M)).
  const porChave = new Map<string, { id: string; valor: number; data_vencimento: string }[]>();
  for (const l of abertos) {
    const k = `${Math.round(Number(l.valor) * 100)}|${l.data_vencimento}`;
    const fila = porChave.get(k);
    if (fila) fila.push(l); else porChave.set(k, [l]);
  }
  const pares: { ofxId: string; lancamentoId: string; valor: number }[] = [];
  for (const tx of txs) {
    const k = `${Math.round(Math.abs(Number(tx.valor)) * 100)}|${tx.data_transacao}`;
    const fila = porChave.get(k);
    const match = fila?.shift();
    if (match) pares.push({ ofxId: tx.id, lancamentoId: match.id, valor: Number(tx.valor) });
  }
  if (!pares.length) return 0;

  // Grava em paralelo (lotes de 25) em vez de 2 awaits sequenciais por par.
  const hoje = format(new Date(), "yyyy-MM-dd");
  let ok = 0;
  for (let i = 0; i < pares.length; i += 25) {
    const lote = pares.slice(i, i + 25);
    const res = await Promise.all(lote.map(async (p) => {
      const { error: e1 } = await supabase.from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: Math.abs(p.valor), data_pagamento: hoje, conta_bancaria_id: contaId })
        .eq("id", p.lancamentoId);
      if (e1) return false;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: p.lancamentoId }).eq("id", p.ofxId);
      return !e2;
    }));
    ok += res.filter(Boolean).length;
  }
  return ok;
}

function ContaDetalhe({ contaId, contas, empresaId, tabInicial, onVoltar, onSelecionar, onNovaConta, onEditar, onImportar, onExcluir }: {
  contaId: string;
  contas: ContaBancaria[];
  empresaId: string | null;
  tabInicial: "pendentes" | "movs";
  onVoltar: () => void;
  onSelecionar: (id: string) => void;
  onNovaConta: () => void;
  onEditar: (c: ContaBancaria) => void;
  onImportar: (id: string) => void;
  onExcluir: (c: ContaBancaria) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pendentes" | "movs">(tabInicial);
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [expand, setExpand] = useState<Set<string>>(new Set());

  const conta = (contas ?? []).find((c) => c.id === contaId) ?? null;

  const { data: ofxPend } = useQuery({
    enabled: !!contaId,
    queryKey: ["ofx-pend", contaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("id,data_transacao,valor,tipo,memo,status")
        .eq("conta_bancaria_id", contaId).neq("status", "conciliada")
        .order("data_transacao", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as { id: string; data_transacao: string; valor: number; tipo: string; memo: string | null; status: string }[];
    },
  });

  const mesIni = `${mes}-01`;
  const mesFim = (() => {
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  })();
  const { data: lancs, isLoading: loadingMovs } = useQuery({
    enabled: !!contaId,
    queryKey: ["lancs-conta", contaId, mes] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos_financeiros")
        .select("id,descricao,valor,tipo,status,data_vencimento,data_pagamento,categoria_id,categoria:categorias_financeiras(nome)")
        .eq("conta_bancaria_id", contaId)
        .gte("data_vencimento", mesIni).lte("data_vencimento", mesFim)
        .order("data_vencimento", { ascending: true }).limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; descricao: string; valor: number; tipo: string; status: string; data_vencimento: string; data_pagamento: string | null; categoria_id: string | null; categoria: { nome: string } | null }[];
    },
  });

  // Extrato do mês (sistema × banco lado a lado, como na referência): inclui as
  // conciliadas com o vínculo do lançamento.
  const { data: ofxMes } = useQuery({
    enabled: !!contaId,
    queryKey: ["ofx-mes", contaId, mes] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("id,data_transacao,valor,memo,status,lancamento_id")
        .eq("conta_bancaria_id", contaId)
        .gte("data_transacao", mesIni).lte("data_transacao", mesFim)
        .order("data_transacao").limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; data_transacao: string; valor: number; memo: string | null; status: string; lancamento_id: string | null }[];
    },
  });

  const shiftMes = (dir: number) => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const mesLabel = (() => {
    const s = new Date(`${mes}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const valorPendente = (ofxPend ?? []).reduce((a, t) => a + Math.abs(Number(t.valor) || 0), 0);

  const gruposDia = useMemo(() => {
    type Linha = { lanc: NonNullable<typeof lancs>[number] | null; ofx: NonNullable<typeof ofxMes>[number] | null };
    const ofxPorLanc = new Map<string, NonNullable<typeof ofxMes>[number]>();
    for (const o of ofxMes ?? []) if (o.lancamento_id) ofxPorLanc.set(o.lancamento_id, o);
    const m = new Map<string, Linha[]>();
    const push = (dia: string, linha: Linha) => {
      if (!dia) return;
      const arr = m.get(dia);
      if (arr) arr.push(linha); else m.set(dia, [linha]);
    };
    for (const l of lancs ?? []) push((l.data_vencimento || "").slice(0, 10), { lanc: l, ofx: ofxPorLanc.get(l.id) ?? null });
    // Só-banco (sem vínculo): entra com o lado do sistema vazio.
    for (const o of ofxMes ?? []) if (!o.lancamento_id) push((o.data_transacao || "").slice(0, 10), { lanc: null, ofx: o });
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dia, linhas]) => {
      // Movimentações = lançamentos do sistema; o banco entra só no selo de conciliação.
      const visiveis = linhas.filter((r) => r.lanc);
      const totSistema = visiveis.reduce((a, r) => a + (r.lanc!.tipo === "receber" ? Number(r.lanc!.valor) : -Number(r.lanc!.valor)), 0);
      const pend = visiveis.some((r) => r.lanc && ["aberto", "vencido", "parcial"].includes(r.lanc.status));
      const dt = new Date(`${dia}T00:00:00`);
      const semana = dt.toLocaleDateString("pt-BR", { weekday: "long" });
      return {
        dia, rows: visiveis, totSistema, pend,
        rotulo: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
        semana: semana.charAt(0).toUpperCase() + semana.slice(1),
      };
    }).filter((g) => g.rows.length > 0);
  }, [lancs, ofxMes]);
  const diasComPend = gruposDia.filter((g) => g.pend).length;

  const toggleDia = (dia: string) => {
    setExpand((prev) => {
      const n = new Set(prev);
      if (n.has(dia)) n.delete(dia);
      else n.add(dia);
      return n;
    });
  };

  // Esc volta para a lista (sem roubar o Esc de diálogos abertos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      onVoltar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onVoltar]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-[200px] flex-1 sm:max-w-[260px]">
          <Combobox
            value={contaId}
            onChange={(v) => { if (v && v !== contaId) onSelecionar(v); }}
            options={(contas ?? []).map((c) => ({ value: c.id, label: c.nome ?? c.banco ?? "—", icone: detectBancoByNome(c.banco)?.logo }))}
           
           
            emptyText="Nenhuma conta encontrada."
            footer={{ label: "Adicionar nova conta", onClick: onNovaConta }}
            className="h-10"
          />
        </div>
        {conta && (
          <Button variant="outline" size="sm" onClick={() => onImportar(contaId)} className="h-10 rounded-xl px-4 shadow-sm">
            <Upload className="mr-1.5 h-3.5 w-3.5" />Importar OFX
          </Button>
        )}
        {conta && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl px-4 shadow-sm">
                Ações da conta <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onEditar(conta)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Editar conta
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onExcluir(conta)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir conta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-xl border bg-card px-1.5 py-1 shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => shiftMes(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-semibold">{mesLabel}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => shiftMes(1)} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="rounded-2xl border bg-card px-4 py-2 text-right shadow-sm">
            <div>
              <span className="text-[11px] text-muted-foreground">Saldo atual </span>
              <span className="text-tabular text-sm font-bold">{brl(Number(conta?.saldo_atual) || 0)}</span>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Pendente de conciliação </span>
              <span className={`text-tabular text-sm font-bold ${valorPendente > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{brl(valorPendente)}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pendentes" | "movs")}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="pendentes">Conciliações pendentes</TabsTrigger>
          <TabsTrigger value="movs">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-4 space-y-4">
          <ReconcileDialog
            contaId={contaId}
            conta={conta}
            empresaId={empresaId}
            autoConciliar={false}
            importing={false}
            onImport={() => onImportar(contaId)}
            onClose={() => {}}
            inline
          />
        </TabsContent>

        <TabsContent value="movs" className="mt-4 space-y-4">
          <Card className="overflow-hidden rounded-2xl bg-primary/[0.04] shadow-panel">
            <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
              <div className="px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tudo</div>
                <div className="mt-1 text-xl font-bold text-tabular">{gruposDia.length}</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dias sem pendências</div>
                <div className="mt-1 text-xl font-bold text-success text-tabular">{gruposDia.length - diasComPend}</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dias com pendências</div>
                <div className="mt-1 text-xl font-bold text-warning-foreground text-tabular">{diasComPend}</div>
              </div>
            </div>
            {loadingMovs ? (
              <div className="space-y-2.5 p-4 sm:p-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}</div>
            ) : gruposDia.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState icon={Banknote} title="Sem movimentações" description={`Nenhum lançamento nesta conta em ${mesLabel}.`} />
              </div>
            ) : (
              <div className="space-y-3 p-4 sm:p-5">
                {gruposDia.map((g) => {
                  const aberto = expand.has(g.dia);
                  return (
                  <div key={g.dia} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <button className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/40" onClick={() => toggleDia(g.dia)}>
                      <span className="text-sm font-bold">{g.rotulo}</span>
                      <span className="text-xs text-muted-foreground">{g.semana}</span>
                      <span className="ml-auto text-right">
                        <span className="block text-[11px] font-medium text-muted-foreground">{conta?.nome ?? conta?.banco ?? ""}</span>
                        <span className={`text-tabular text-sm font-bold ${g.totSistema < 0 ? "text-destructive" : "text-foreground"}`}>
                          {brl(g.totSistema)}
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
                    </button>
                    {aberto && (
                      <div className="border-t border-border/60">
                        <div className="overflow-x-auto">
                          <div className="min-w-[840px]">
                            <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_96px] gap-2 border-b border-border/60 bg-muted/20 px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
                              <span>Descrição</span>
                              <span className="text-right">Valor (R$)</span>
                              <span className="text-center">Conciliação</span>
                              <span />
                            </div>
                            <div className="divide-y divide-border/40">
                              {g.rows.map((r) => {
                                const conc = !!r.ofx && r.ofx.status === "conciliada";
                                const l = r.lanc!;
                                return (
                                <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_110px_120px_96px] items-center gap-2 px-4 py-2 text-[13px] transition-colors hover:bg-primary/[0.05]">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium" title={l.descricao ?? ""}>{l.descricao || "—"}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">{l.categoria?.nome ?? l.status}</div>
                                  </div>
                                  <span className={`text-tabular text-right font-semibold ${l.tipo === "receber" ? "text-success" : "text-destructive"}`}>
                                    {`${l.tipo === "receber" ? "+" : "-"}${brl(Math.abs(Number(l.valor))).replace("R$", "").replace("- ", "-").trim()}`}
                                  </span>
                                  <span className="text-center">
                                    {conc ? (
                                      <span className="inline-block rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Conciliada</span>
                                    ) : (
                                      <span className="inline-block rounded-md bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning-foreground">Pendente</span>
                                    )}
                                  </span>
                                  <span className="text-right">
                                    {!conc && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs">Ações <ChevronDown className="ml-1 h-3 w-3" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => setTab("pendentes")}>
                                            <Link2 className="mr-2 h-3.5 w-3.5" />Conciliar
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </span>
                                </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-4 py-2.5">
                              <span className="text-sm font-bold">Totais do dia</span>
                              <span className="ml-auto text-tabular text-[13px] font-bold">{brl(g.totSistema).replace("R$", "").replace("- ", "-").trim()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContasFinanceiras() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<TipoConta>("corrente");
  const [form, setForm] = useState<FormState>(initialForm("corrente"));
  const autoConciliar = true;
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [transfOpen, setTransfOpen] = useState(false);
  // Detalhe da conta selecionada (persiste na URL: F5 mantém a conciliação)
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const [detalheId, setDetalheId] = useState<string | null>(searchParams.conta ?? null);
  const [detalheTab, setDetalheTab] = useState<"pendentes" | "movs">(
    searchParams.tab === "movs" ? "movs" : "pendentes",
  );
  useEffect(() => {
    navigate({
      search: {
        ...(searchParams.conciliar ? { conciliar: searchParams.conciliar } : {}),
        ...(detalheId ? { conta: detalheId, tab: detalheTab } : {}),
      } as any,
      replace: true,
    });
  }, [detalheId, detalheTab]);

  // Pendências de conciliação por conta (para os badges da lista)
  const { data: ofxPendentes } = useQuery({
    enabled: !!empresa,
    queryKey: ["ofx-pendentes", empresa?.id] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<{ conta_bancaria_id: string; valor: number }[]> => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("conta_bancaria_id,valor")
        .eq("empresa_id", empresa!.id).neq("status", "conciliada").limit(2000);
      if (error) throw error;
      return (data ?? []) as { conta_bancaria_id: string; valor: number }[];
    },
  });
  const pendPorConta = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ofxPendentes ?? []) {
      if (!t.conta_bancaria_id) continue;
      m.set(t.conta_bancaria_id, (m.get(t.conta_bancaria_id) ?? 0) + 1);
    }
    return m;
  }, [ofxPendentes]);

  const abrirConciliacao = async (id: string) => {
    if (!autoConciliar || !empresa?.id) { setReconcilingId(id); return; }
    setPreparando(id);
    try {
      const ok = await autoConciliarConta(id, empresa.id);
      if (ok > 0) {
        toast.success(`${ok} lançamento(s) conciliado(s) automaticamente`);
        qc.invalidateQueries({ queryKey: ["ofx", id] });
        qc.invalidateQueries({ queryKey: ["lanc-abertos", empresa.id] });
        qc.invalidateQueries({ queryKey: ["lancamentos"] });
      }
    } catch {
      /* segue abrindo a tela mesmo se a automação falhar */
    } finally {
      setPreparando(null);
      setReconcilingId(id);
    }
  };

  // abre automaticamente a conciliação quando vindo de /financeiro/conciliacao
  const { conciliar: conciliarParam } = Route.useSearch();
  const conciliarAberto = useRef(false);
  useEffect(() => {
    if (!conciliarParam || conciliarAberto.current || !empresa?.id) return;
    conciliarAberto.current = true;
    void abrirConciliacao(conciliarParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conciliarParam, empresa?.id]);

  // Automático também ao abrir o detalhe inline (lista de contas -> Conciliar):
  // antes só rodava pelo link ?conciliar=, então no fluxo normal nunca conciliava sozinho.
  const autoDetalheRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detalheId || !empresa?.id) return;
    if (autoDetalheRef.current === detalheId) return;
    autoDetalheRef.current = detalheId;
    (async () => {
      try {
        const ok = await autoConciliarConta(detalheId, empresa.id);
        if (ok > 0) {
          toast.success(`${ok} lançamento(s) conciliado(s) automaticamente`);
          qc.invalidateQueries({ queryKey: ["ofx", detalheId] });
          qc.invalidateQueries({ queryKey: ["ofx-mes", detalheId] });
          qc.invalidateQueries({ queryKey: ["lancs-conta", detalheId] });
          qc.invalidateQueries({ queryKey: ["lanc-abertos", empresa.id] });
          qc.invalidateQueries({ queryKey: ["lancamentos"] });
        }
      } catch {
        /* segue na tela mesmo se a automação falhar */
      }
    })();
  }, [detalheId, empresa?.id, qc]);



  const [importing, setImporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadContaId, setUploadContaId] = useState<string | null>(null);
  const [confConta, setConfConta] = useState<ContaBancaria | null>(null);
  const [confImport, setConfImport] = useState<{ problemas: string[]; contaId: string; rows: { empresa_id: string; conta_bancaria_id: string; fitid: string; data_transacao: string; valor: number; tipo: string; memo: string | null }[] } | null>(null);

  const { data: contas } = useQuery({
    enabled: !!empresa,
  queryKey: ["contas-bancarias", empresa?.id] as const,
  staleTime: 2 * 60_000,
  gcTime: 15 * 60_000,
  queryFn: async ({ signal }): Promise<ContaBancaria[]> => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco,agencia,conta,saldo_atual,tipo,padrao")
        .eq("empresa_id", empresa!.id).order("banco").abortSignal(signal);
      if (error) throw error; return (data ?? []) as ContaBancaria[];
    },
  });

  const contasCorrentes = (contas ?? []).filter((c) => c.tipo === "corrente");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (contas ?? []).filter((c) => {
      if (!q) return true;
      return (c.nome || "").toLowerCase().includes(q)
        || (c.banco || "").toLowerCase().includes(q)
        || (c.agencia || "").toLowerCase().includes(q)
        || (c.conta || "").toLowerCase().includes(q)
        || (TIPO_LABEL[c.tipo] || "").toLowerCase().includes(q);
    });
  }, [contas, busca]);

  // Auditoria (tabela auditoria_eventos): quem criou/editou/excluiu/definiu padrão
  const [trilhaOpen, setTrilhaOpen] = useState(false);
  const registrarAuditoria = async (acao: string, descricao: string, detalhes: Record<string, any> = {}) => {
    try {
      if (!empresa) return;
      const { data: sess } = await supabase.auth.getUser();
      const u = sess?.user;
      if (!u) return;
      const nome = ((u.user_metadata as any)?.nome as string) || u.email || "";
      await supabase.from("auditoria_eventos" as never).insert({
        empresa_id: empresa.id,
        user_id: u.id,
        modulo: "financeiro",
        acao,
        entidade: "conta_financeira",
        detalhes: { ...detalhes, descricao, user_nome: nome, user_email: u.email || "" },
      } as any);
    } catch { /* trilha indisponível: não bloqueia o fluxo */ }
  };
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-contas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "financeiro")
        .eq("entidade", "conta_financeira")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const resetWizard = () => { setStep(1); setTipo("corrente"); setForm(initialForm("corrente")); setEditandoId(null); };
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Padrão exclusivo: só uma conta por empresa
  const definirPadrao = async (id: string | null) => {
    if (!empresa) return;
    await supabase.from("contas_bancarias").update({ padrao: false }).eq("empresa_id", empresa.id);
    if (id) {
      const { error } = await supabase.from("contas_bancarias").update({ padrao: true }).eq("id", id);
      if (error) { toast.error(error.message); return; }
      const nome = (contas ?? []).find((c) => c.id === id)?.nome ?? "";
      void registrarAuditoria("padrao", `Conta "${nome}" definida como padrão`, { conta_id: id });
    }
    qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    qc.invalidateQueries({ queryKey: ["contas-opt"] });
    qc.invalidateQueries({ queryKey: ["contas"] });
  };

  const abrirEdicao = async (c: ContaBancaria) => {
    const { data, error } = await supabase.from("contas_bancarias").select("*").eq("id", c.id).maybeSingle();
    if (error || !data) { toast.error("Não foi possível carregar a conta."); return; }
    const d = data as any;
    setTipo(d.tipo as TipoConta);
    setForm({
      ...initialForm(d.tipo as TipoConta),
      nome: d.nome ?? "", banco: d.banco ?? "", agencia: d.agencia ?? "", conta: d.conta ?? "",
      modalidade: d.modalidade ?? "", padrao: !!d.padrao,
      conta_vinculada_id: d.conta_vinculada_id ?? "",
      cartao_ultimos4: d.cartao_ultimos4 ?? "", cartao_bandeira: d.cartao_bandeira ?? "",
      cartao_emissor: d.cartao_emissor ?? "", cartao_conta_pagamento_id: d.cartao_conta_pagamento_id ?? "",
      cartao_dia_fechamento: d.cartao_dia_fechamento != null ? String(d.cartao_dia_fechamento) : "",
      cartao_dia_vencimento: d.cartao_dia_vencimento != null ? String(d.cartao_dia_vencimento) : "",
    });
    setEditandoId(c.id);
    setStep(2);
    setOpen(true);
  };

  const payloadEdicao = (input: FormState): Record<string, unknown> => {
    const p: Record<string, unknown> = {
      nome: input.nome || input.banco || TIPO_LABEL[input.tipo],
      padrao: input.padrao,
    };
    if (input.tipo === "corrente") {
      Object.assign(p, {
        banco: input.banco, agencia: input.agencia, conta: input.conta,
        modalidade: input.modalidade || null,
      });
    } else if (input.tipo === "caixa" || input.tipo === "outras") {
      // só nome + padrão
    } else if (input.tipo === "cartao_credito") {
      Object.assign(p, {
        cartao_ultimos4: input.cartao_ultimos4, cartao_bandeira: input.cartao_bandeira,
        cartao_emissor: input.cartao_emissor,
        cartao_conta_pagamento_id: input.cartao_conta_pagamento_id || null,
        cartao_dia_fechamento: input.cartao_dia_fechamento ? Number(input.cartao_dia_fechamento) : null,
        cartao_dia_vencimento: input.cartao_dia_vencimento ? Number(input.cartao_dia_vencimento) : null,
      });
    } else if (input.tipo === "investimento" || input.tipo === "aplicacao_automatica") {
      Object.assign(p, { banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null });
    } else if (input.tipo === "poupanca") {
      Object.assign(p, { banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null, modalidade: input.modalidade || null });
    }
    return p;
  };

  const salvarEdicao = useMutation({
    mutationFn: async (input: FormState) => {
      if (!editandoId) throw new Error("Conta não selecionada");
      if (input.padrao) await definirPadraoRaw(editandoId);
      const { error } = await supabase.from("contas_bancarias").update(payloadEdicao(input) as never).eq("id", editandoId);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, input: FormState) => {
      toast.success("Conta atualizada"); setOpen(false); resetWizard();
      void registrarAuditoria("alterar", `Conta "${input.nome || input.banco || ""}" alterada`, { conta_id: editandoId, nome: input.nome });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      qc.invalidateQueries({ queryKey: ["contas-opt"] });
      qc.invalidateQueries({ queryKey: ["contas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // zera as demais antes de marcar (sem toasts/invalidações próprias)
  const definirPadraoRaw = async (id: string | null) => {
    if (!empresa) return;
    await supabase.from("contas_bancarias").update({ padrao: false }).eq("empresa_id", empresa.id);
    if (id) await supabase.from("contas_bancarias").update({ padrao: true }).eq("id", id);
  };

  const criar = useMutation({
    mutationFn: async (input: FormState) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (input.padrao) await definirPadraoRaw(null);
      const saldo = Number(input.saldo_dia_anterior || input.saldo_inicial || 0);
      const payload: Record<string, unknown> = {
        empresa_id: empresa.id,
        tipo: input.tipo,
        nome: input.nome || input.banco || TIPO_LABEL[input.tipo],
        padrao: input.padrao,
        data_inicio_lancamentos: input.data_inicio_lancamentos || null,
        saldo_inicial: saldo, saldo_atual: saldo,
      };
      if (input.tipo === "corrente") {
        Object.assign(payload, {
          banco: input.banco, agencia: input.agencia, conta: input.conta,
          modalidade: input.modalidade || null, saldo_inicial: saldo, saldo_atual: saldo,
        });
      } else if (input.tipo === "caixa" || input.tipo === "outras") {
        Object.assign(payload, { saldo_inicial: saldo, saldo_atual: saldo });
      } else if (input.tipo === "cartao_credito") {
        Object.assign(payload, {
          cartao_ultimos4: input.cartao_ultimos4, cartao_bandeira: input.cartao_bandeira,
          cartao_emissor: input.cartao_emissor,
          cartao_conta_pagamento_id: input.cartao_conta_pagamento_id || null,
          cartao_dia_fechamento: input.cartao_dia_fechamento ? Number(input.cartao_dia_fechamento) : null,
          cartao_dia_vencimento: input.cartao_dia_vencimento ? Number(input.cartao_dia_vencimento) : null,
        });
      } else if (input.tipo === "investimento" || input.tipo === "aplicacao_automatica") {
        Object.assign(payload, {
          banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null,
        });
      } else if (input.tipo === "poupanca") {
        Object.assign(payload, {
          banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null,
          modalidade: input.modalidade || null,
        });
      }
      const { error } = await supabase.from("contas_bancarias").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, input: FormState) => {
      toast.success("Conta criada"); setOpen(false); resetWizard();
      void registrarAuditoria("criar", `Conta "${input.nome || input.banco || ""}" criada`, { nome: input.nome, tipo: input.tipo });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // limpa vínculos que impediriam o delete
      await supabase.from("ofx_transacoes").delete().eq("conta_bancaria_id", id);
      await supabase.from("lancamentos_financeiros").update({ conta_bancaria_id: null }).eq("conta_bancaria_id", id);
      const { error } = await supabase.from("contas_bancarias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, id: string) => {
      toast.success("Conta excluída");
      const nome = (contas ?? []).find((c) => c.id === id)?.nome ?? "";
      void registrarAuditoria("excluir", `Conta "${nome}" excluída`, { conta_id: id });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerUpload = (contaId: string) => { setUploadContaId(contaId); fileRef.current?.click(); };

  const executarImport = async (rows: { empresa_id: string; conta_bancaria_id: string; fitid: string; data_transacao: string; valor: number; tipo: string; memo: string | null }[], contaId: string) => {
    const { error, count } = await supabase.from("ofx_transacoes")
      .upsert(rows, { onConflict: "conta_bancaria_id,fitid", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;
    const novas = count ?? 0;
    const duplicadas = rows.length - novas;
    // Automática ainda dentro da importação (com o spinner ativo): quando a tela
    // de conciliação abre, os matches exatos já estão conciliados — resta 1 toast.
    let autoOk = 0;
    try {
      if (empresa) autoOk = await autoConciliarConta(contaId, empresa.id);
    } catch { /* segue sem automática: o fallback do diálogo tenta de novo */ }
    toast.success(
      `${novas} nova(s) transação(ões) importada(s)${duplicadas > 0 ? ` · ${duplicadas} já existiam` : ""}` +
      (autoOk > 0 ? ` · ${autoOk} conciliada(s) automaticamente` : ""),
    );
    qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-pend", contaId] });
    qc.invalidateQueries({ queryKey: ["lanc-abertos", empresa?.id] });
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["lancs-conta", contaId] });
    setReconcilingId(contaId);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadContaId || !empresa) return;
    const conta = (contas ?? []).find((c) => c.id === uploadContaId);
    setImporting(uploadContaId);
    try {
      const text = await file.text();
      const { account, transactions: txs } = parseOfxFull(text);
      if (!txs.length) { toast.error("Nenhuma transação encontrada no OFX"); return; }

      // Verifica se o OFX bate com a conta cadastrada
      if (conta) {
        const problemas: string[] = [];
        const bancoOfx = detectBancoByCodigo(account.bankId);
        const bancoConta = detectBancoByNome(conta.banco);
        if (bancoOfx && bancoConta && bancoOfx.slug !== bancoConta.slug) {
          problemas.push(`Banco: OFX é ${bancoOfx.nome}, conta cadastrada é ${bancoConta.nome}`);
        } else if (bancoOfx && conta.banco && !bancoConta) {
          problemas.push(`Banco do OFX (${bancoOfx.nome}) não bate com "${conta.banco}"`);
        }
        if (account.branchId && conta.agencia) {
          const a1 = account.branchId.replace(/\D/g, "").replace(/^0+/, "");
          const a2 = conta.agencia.replace(/\D/g, "").replace(/^0+/, "");
          if (a1 && a2 && a1 !== a2) problemas.push(`Agência: OFX ${account.branchId} × conta ${conta.agencia}`);
        }
        if (account.acctId && conta.conta) {
          const c1 = normalizaContaNumero(account.acctId);
          const c2 = normalizaContaNumero(conta.conta);
          if (c1 && c2 && c1 !== c2) problemas.push(`Conta: OFX ${account.acctId} × conta ${conta.conta}`);
        }
        if (problemas.length) {
          const rows = txs.map((t) => ({
            empresa_id: empresa.id, conta_bancaria_id: uploadContaId, fitid: t.fitid,
            data_transacao: t.data, valor: t.valor, tipo: t.tipo, memo: t.memo,
          }));
          setImporting(null); setUploadContaId(null);
          setConfImport({ problemas, contaId: uploadContaId, rows });
          return;
        }
      }

      const rows = txs.map((t) => ({
        empresa_id: empresa.id, conta_bancaria_id: uploadContaId, fitid: t.fitid,
        data_transacao: t.data, valor: t.valor, tipo: t.tipo, memo: t.memo,
      }));
      await executarImport(rows, uploadContaId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar OFX");
    } finally { setImporting(null); setUploadContaId(null); }
  };

  const podeContinuarStep2 = () => {
    if (form.tipo === "corrente") return !!form.banco && !!form.agencia && !!form.conta && !!form.nome && !!form.modalidade;
    if (form.tipo === "caixa" || form.tipo === "outras") return !!form.nome;
    if (form.tipo === "cartao_credito")
      return !!form.nome && !!form.cartao_ultimos4 && !!form.cartao_bandeira && !!form.cartao_emissor
        && !!form.cartao_conta_pagamento_id && !!form.cartao_dia_fechamento && !!form.cartao_dia_vencimento;
    if (form.tipo === "investimento" || form.tipo === "aplicacao_automatica")
      return !!form.nome && !!form.banco && !!form.conta_vinculada_id;
    if (form.tipo === "poupanca")
      return !!form.nome && !!form.banco && !!form.conta_vinculada_id && !!form.modalidade;
    return false;
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".ofx,.OFX,text/plain" className="hidden" onChange={handleFile} />
      <PageHeader eyebrow="Financeiro" title="Contas financeiras" description="Cadastro e gestão das contas financeiras da empresa." />
      {detalheId ? (
        <ContaDetalhe
          contaId={detalheId}
          contas={contas ?? []}
          empresaId={empresa?.id ?? null}
          tabInicial={detalheTab}
          onVoltar={() => setDetalheId(null)}
          onSelecionar={(id) => setDetalheId(id)}
          onNovaConta={() => { resetWizard(); setOpen(true); }}
          onEditar={(c) => void abrirEdicao(c)}
          onImportar={(id) => triggerUpload(id)}
          onExcluir={(c) => setConfConta(c)}
        />
      ) : (
      <>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 rounded-xl pl-10 shadow-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => setTrilhaOpen(true)} className="h-9 rounded-xl px-4 active:scale-95">
              Auditoria
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="h-9 rounded-xl px-4 text-sm shadow-sm transition-all hover:shadow-md active:scale-95">
              <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />Transferir
            </Button>
            <TransferenciaDialog open={transfOpen} onOpenChange={setTransfOpen} />

            <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) { setOpen(v); if (!v) resetWizard(); } }}>
              <DialogTrigger asChild><Button size="sm" className="h-9 rounded-xl px-4 text-sm shadow-sm transition-all hover:shadow-md active:scale-95"><Plus className="mr-1 h-3.5 w-3.5" />Nova conta</Button></DialogTrigger>
              <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
                <DialogHeader><DialogTitle>{editandoId ? "Editar conta financeira" : "Cadastrar conta financeira"}</DialogTitle></DialogHeader>

                {/* Step 1 - tipo (só no cadastro; tipo não muda na edição) */}
                {!editandoId && (
                <Card className={cn("p-4 space-y-3", step !== 1 && "opacity-70")}>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      step === 1 ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground")}>
                      {step === 1 ? "1" : <Check className="h-3 w-3" />}
                    </div>
                    <h3 className="font-semibold text-sm">Escolha o tipo de conta *</h3>
                    {step === 2 && <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setStep(1)}>Editar</Button>}
                  </div>
                  {step === 1 && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {TIPO_PRINCIPAL.map((t) => (
                          <TipoCard key={t.value} t={t} selected={tipo === t.value} onSelect={() => setTipo(t.value)} />
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground pt-2">Outras opções:</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {TIPO_OUTROS.map((t) => (
                          <TipoCard key={t.value} t={t} selected={tipo === t.value} onSelect={() => setTipo(t.value)} />
                        ))}
                      </div>
                      <div className="pt-3">
                        <Button onClick={() => { setForm(initialForm(tipo)); setStep(2); }}>Continuar</Button>
                      </div>
                    </>
                  )}
                </Card>
                )}

                {/* Step 2 - dados */}
                {step === 2 && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">2</div>
                      <h3 className="font-semibold text-sm">Preencha os dados *</h3>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); if (!podeContinuarStep2()) return; if (editandoId) salvarEdicao.mutate(form); else setStep(3); }} className="space-y-3">
                      {form.tipo === "corrente" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                            <div><Label>Agência (sem dígito) *</Label><Input required value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                            <div><Label>Conta (com dígito) *</Label><Input required value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} onBlur={(e) => setForm({ ...form, conta: formatContaComDigito(e.target.value) })} /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label>Nome da conta *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                            </div>
                            <div>
                              <Label>Modalidade da conta *</Label>
                              <RadioGroup value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v })} className="flex gap-4 pt-2">
                                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pj" /> Conta empresarial (PJ)</label>
                                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pf" /> Conta pessoal (PF)</label>
                              </RadioGroup>
                            </div>
                          </div>
                          {/* saldo movido para o passo 3 */}
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={form.padrao} onCheckedChange={(v) => setForm({ ...form, padrao: !!v })} />
                            Use esta conta como padrão ao criar receitas e despesas.
                          </label>
                        </>
                      )}

                      {(form.tipo === "caixa" || form.tipo === "outras") && (
                        <>
                          <div>
                            <Label>Nome da conta *</Label>
                            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                            <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                          </div>
                          {/* saldo movido para o passo 3 */}
                        </>
                      )}

                      {form.tipo === "cartao_credito" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <Label>Nome do cartão *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar este cartão depois</p>
                            </div>
                            <div><Label>Últimos 4 números *</Label><Input required maxLength={4} value={form.cartao_ultimos4} onChange={(e) => setForm({ ...form, cartao_ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
                            <div>
                              <Label>Bandeira do cartão *</Label>
                              <Select value={form.cartao_bandeira} onValueChange={(v) => setForm({ ...form, cartao_bandeira: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"].map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Emissor do cartão *</Label>
                              <Input required value={form.cartao_emissor} onChange={(e) => setForm({ ...form, cartao_emissor: e.target.value })} />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label>Conta padrão para pagamento *</Label>
                              <Combobox value={form.cartao_conta_pagamento_id} onChange={(v) => setForm({ ...form, cartao_conta_pagamento_id: v })} options={contasCorrentes.map((c) => ({ value: c.id, label: c.nome ?? c.banco ?? "" }))} emptyText="Nenhum item encontrado." />
                            </div>
                            <div><Label>Dia do fechamento *</Label><MoneyInput required prefix="" decimals={0} value={form.cartao_dia_fechamento} onChange={(v) => setForm({ ...form, cartao_dia_fechamento: v })} /></div>
                            <div><Label>Dia do vencimento *</Label><MoneyInput required prefix="" decimals={0} value={form.cartao_dia_vencimento} onChange={(v) => setForm({ ...form, cartao_dia_vencimento: v })} /></div>
                          </div>
                        </>
                      )}

                      {(form.tipo === "investimento" || form.tipo === "aplicacao_automatica") && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label>Nome da conta {form.tipo === "investimento" ? "investimento" : "aplicação"} *</Label>
                            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                            <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                          </div>
                          <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                          <div>
                            <Label>Conta corrente vinculada *</Label>
                            <Combobox value={form.conta_vinculada_id} onChange={(v) => setForm({ ...form, conta_vinculada_id: v })} options={contasCorrentes.map((c) => ({ value: c.id, label: c.nome ?? c.banco ?? "" }))} emptyText="Nenhum item encontrado." />
                          </div>
                        </div>
                      )}

                      {form.tipo === "poupanca" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label>Nome da conta poupança *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                            </div>
                            <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                            <div>
                              <Label>Conta corrente vinculada *</Label>
                              <Combobox value={form.conta_vinculada_id} onChange={(v) => setForm({ ...form, conta_vinculada_id: v })} options={contasCorrentes.map((c) => ({ value: c.id, label: c.nome ?? c.banco ?? "" }))} emptyText="Nenhum item encontrado." />
                            </div>
                          </div>
                          <div>
                            <Label>Modalidade da conta *</Label>
                            <RadioGroup value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v })} className="flex gap-4 pt-2">
                              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pj" /> Conta empresarial (PJ)</label>
                              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pf" /> Conta pessoal (PF)</label>
                            </RadioGroup>
                          </div>
                        </>
                      )}

                      <div>
                        <Button type="submit" disabled={!podeContinuarStep2() || salvarEdicao.isPending}>
                          {salvarEdicao.isPending ? "Salvando..." : editandoId ? "Salvar alterações" : "Continuar"}
                        </Button>
                      </div>
                    </form>
                  </Card>
                )}

                {/* Step 3 - saldo */}
                {step === 3 && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">3</div>
                      <h3 className="font-semibold text-sm">Informe o saldo *</h3>
                      <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setStep(2)}>Editar dados</Button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); if (form.data_inicio_lancamentos && form.saldo_dia_anterior !== "") criar.mutate(form); }} className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Início dos lançamentos *</Label>
                          <DateInput required maxToday value={form.data_inicio_lancamentos} onChange={(v) => setForm({ ...form, data_inicio_lancamentos: v })} />
                          <p className="text-xs text-muted-foreground mt-1">Informe uma data até hoje</p>
                        </div>
                        <div>
                          <Label>Saldo final da conta no dia anterior *</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                            <Input
                              required
                              type="text"
                              inputMode="numeric"
                              className="pl-9"
                              value={(() => {
                                const raw = form.saldo_dia_anterior;
                                if (raw === "" || raw === "-") return raw;
                                const n = Number(raw);
                                if (isNaN(n)) return "";
                                return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              })()}
                              onKeyDown={(e) => {
                                if (e.key === "-") {
                                  e.preventDefault();
                                  const v = form.saldo_dia_anterior;
                                  if (v === "" || v === "0") setForm({ ...form, saldo_dia_anterior: "-" });
                                  else if (v === "-") setForm({ ...form, saldo_dia_anterior: "" });
                                  else setForm({ ...form, saldo_dia_anterior: v.startsWith("-") ? v.slice(1) : `-${v}` });
                                }
                              }}
                              onChange={(e) => {
                                const negative = form.saldo_dia_anterior.startsWith("-");
                                const digits = e.target.value.replace(/\D/g, "");
                                if (!digits) { setForm({ ...form, saldo_dia_anterior: negative ? "-" : "" }); return; }
                                const val = (Number(digits) / 100).toFixed(2);
                                setForm({ ...form, saldo_dia_anterior: negative ? `-${val}` : val });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => { setOpen(false); resetWizard(); }}>Cancelar</Button>
                        <Button type="submit" disabled={criar.isPending || !form.data_inicio_lancamentos || form.saldo_dia_anterior === ""}>
                          {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                        </Button>
                      </DialogFooter>
                    </form>
                  </Card>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
      {!filtrados?.length ? (
        <EmptyState icon={Banknote} title="Sem contas financeiras" description={busca ? "Nada encontrado para a busca." : "Cadastre suas contas para acompanhar saldos e realizar conciliação."} />
      ) : (
        <Card className="overflow-hidden rounded-2xl bg-primary/[0.04] shadow-panel">
          <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
            <TableHeader><TableRow>
              <TableHead className="text-[13px]">Banco</TableHead><TableHead className="text-[13px]">Nome da conta</TableHead><TableHead className="text-[13px]">Tipo de conta</TableHead>
              <TableHead className="text-[13px]">Conciliações</TableHead><TableHead className="text-[13px]">Extrato bancário</TableHead>
              <TableHead className="w-16 text-center text-[13px]">Padrão</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {filtrados.map((c) => {
                const pend = pendPorConta.get(c.id) ?? 0;
                return (
                <TableRow key={c.id} className="cursor-pointer text-[15px] transition-colors hover:bg-accent/30" onClick={() => { setDetalheTab("pendentes"); setDetalheId(c.id); }}>
                  <TableCell>
                    {(() => {
                      const b = detectBancoByNome(c.banco);
                      return b ? (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-border">
                          <img src={b.logo} alt={b.nome} className="h-7 w-7 object-contain" />
                        </div>
                      ) : (
                        <div className="h-11 w-11 rounded-xl bg-muted grid place-items-center shrink-0 shadow-sm"><Banknote className="h-5 w-5 text-muted-foreground" /></div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold tracking-tight text-foreground">{c.nome ?? c.banco ?? "—"}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{TIPO_LABEL[c.tipo]}</Badge></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shadow-sm transition-all hover:-translate-y-px hover:shadow-md ${pend > 0 ? "bg-warning/15 text-warning-foreground" : "bg-success/10 text-success"}`}
                      onClick={() => { setDetalheTab("pendentes"); setDetalheId(c.id); }}
                    >
                      {pend > 0 ? `${pend} pendente(s)` : "Sem pendências"}
                    </button>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => triggerUpload(c.id)} className="h-8 rounded-lg px-3">
                      <Upload className="mr-1.5 h-3 w-3" />Importar
                    </Button>
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!c.padrao}
                      onCheckedChange={() => void definirPadrao(c.padrao ? null : c.id)}
                      aria-label="Conta padrão"
                    />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => void abrirEdicao(c)} className="h-8 rounded-lg px-3">
                      <Pencil className="mr-1.5 h-3 w-3" />Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg px-3 text-destructive hover:text-destructive"
                      disabled={excluir.isPending}
                      onClick={() => setConfConta(c)}>
                      <Trash2 className="mr-1.5 h-3 w-3" />Excluir
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      </>)}

      <ReconcileDialog
        contaId={reconcilingId}
        conta={contas?.find((c) => c.id === reconcilingId) ?? null}
        empresaId={empresa?.id ?? null}
        autoConciliar={autoConciliar}
        importing={reconcilingId ? importing === reconcilingId : false}
        onImport={() => reconcilingId && triggerUpload(reconcilingId)}
        onClose={() => setReconcilingId(null)}
      />

      <AlertDialog open={!!confConta} onOpenChange={(v) => { if (!v) setConfConta(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir conta</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confConta ? `Excluir a conta "${confConta.nome ?? confConta.banco}"? Extratos importados serão apagados e lançamentos vinculados ficarão sem conta.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confConta) { excluir.mutate(confConta.id); if (confConta.id === detalheId) setDetalheId(null); } setConfConta(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trilhaOpen} onOpenChange={setTrilhaOpen}>
        <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Auditoria — Contas financeiras</DialogTitle>
          </DialogHeader>
          {trilhaQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : trilhaQuery.isError ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Trilha indisponível no momento.</p>
          ) : (trilhaQuery.data ?? []).length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground py-6 text-center">Nenhum evento registrado ainda. Criar, editar, excluir ou definir padrão gera registros aqui.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {(trilhaQuery.data ?? []).map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium shadow-sm ${
                    ev.acao === "excluir" ? "bg-destructive/10 text-destructive"
                    : ev.acao === "alterar" ? "bg-primary/10 text-primary"
                    : ev.acao === "padrao" ? "bg-warning/15 text-warning-foreground"
                    : "bg-success/10 text-success"
                  }`}>
                    {ev.acao === "excluir" ? "Excluiu" : ev.acao === "alterar" ? "Alterou" : ev.acao === "padrao" ? "Padrão" : "Criou"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{ev.detalhes?.descricao || "—"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ev.detalhes?.user_nome || ev.detalhes?.user_email || "—"}
                      {" · "}
                      {ev.created_at ? new Date(ev.created_at).toLocaleString("pt-BR") : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confImport} onOpenChange={(v) => { if (!v) setConfImport(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Confirmar importação</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line leading-relaxed">
              {confImport ? `Este OFX parece ser de outra conta:\n\n• ${confImport.problemas.join("\n• ")}\n\nDeseja importar mesmo assim?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => toast.warning("Importação cancelada")} className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
              onClick={async () => {
                if (!confImport) return;
                const { rows, contaId } = confImport;
                setConfImport(null);
                setImporting(contaId);
                try {
                  await executarImport(rows, contaId);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Falha ao importar OFX");
                } finally {
                  setImporting(null);
                }
              }}
            >
              Importar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TipoCard({ t, selected, onSelect }: { t: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }; selected: boolean; onSelect: () => void }) {
  const Icon = t.icon;
  return (
    <button type="button" onClick={onSelect}
      className={cn("text-left rounded-lg border p-3 transition hover:border-primary/60",
        selected ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center",
            selected ? "border-primary" : "border-muted-foreground")}>
            {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <span className="font-medium text-sm">{t.label}</span>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground mt-2 leading-snug">{t.desc}</p>
    </button>
  );
}

type RowState = {
  descricao: string;
  categoria_id: string;
  contato_id: string;
  centro_custo_id: string;
  lancamento_id: string;
  modo: "lancamento" | "transferencia";
  conta_destino_id: string;
};

const PAGE_SIZE = 15;

const emptyRow = (memo: string | null): RowState => ({
  descricao: memo ?? "", categoria_id: "", contato_id: "", centro_custo_id: "", lancamento_id: "",
  modo: "lancamento", conta_destino_id: "",
});

// Sugestão de conciliação: mesmo valor (tolera 1 centavo de arredondamento) e
// vencimento igual; na falta, o mais próximo em até 3 dias para mais ou menos
// (ex.: banco 08/09 x sistema 06/09). A automática continua exigindo centavo e data exatos.
function sugerirLancamento(tx: OfxRow, lista: LancOpt[]): LancOpt | undefined {
  const txCent = Math.round(Math.abs(Number(tx.valor)) * 100);
  const cands = (lista ?? []).filter((l) => Math.abs(Math.round(Number(l.valor) * 100) - txCent) <= 1);
  const exata = cands.find((l) => l.data_vencimento === tx.data_transacao);
  if (exata) return exata;
  const base = new Date(`${tx.data_transacao}T00:00:00`).getTime();
  if (Number.isNaN(base)) return undefined;
  let melhor: LancOpt | undefined;
  let melhorDist = 4;
  for (const l of cands) {
    const dv = new Date(`${l.data_vencimento}T00:00:00`).getTime();
    if (Number.isNaN(dv)) continue;
    const dist = Math.abs(Math.round((dv - base) / 86400000));
    if (dist <= 3 && dist < melhorDist) { melhor = l; melhorDist = dist; }
  }
  return melhor;
}

function ReconcileDialog({ contaId, conta, empresaId, autoConciliar, importing, onImport, onClose, inline }: { contaId: string | null; conta: ContaBancaria | null; empresaId: string | null; autoConciliar: boolean; importing: boolean; onImport: () => void; onClose: () => void; inline?: boolean }) {  const autoRunRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const open = !!contaId;

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "recebimentos" | "pagamentos">("todos");
  const [ordem, setOrdem] = useState<"recentes" | "antigos" | "maior" | "menor">("antigos");
  const [visiveisQtd, setVisiveisQtd] = useState(PAGE_SIZE);
  const { data: authUser } = useQuery({
    queryKey: ["auth-user-for-saved-filters"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60 * 1000,
  });
  const filtrosSalvos = useFiltrosSalvos(empresaId, authUser?.id, "financeiro-conciliacao");

  useEffect(() => {
    const id = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(id);
  }, [busca]);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [conciliandoIds, setConciliandoIds] = useState<Set<string>>(new Set());
  const [novaCatTxId, setNovaCatTxId] = useState<string | null>(null);
  const [novaCatNome, setNovaCatNome] = useState("");
  const [buscarModo, setBuscarModo] = useState<Record<string, boolean>>({});
  const [confExtrato, setConfExtrato] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusca("");
      setFiltro("todos");
      setOrdem("antigos");
      setVisiveisQtd(PAGE_SIZE);
      setSel(new Set());
      setRows({});
      setBuscarModo({});
      return;
    }
    // Dados frescos a cada abertura: lançamento criado no pagar/receber com o
    // diálogo aberto (ou antes dele) senão só apareceria após F5.
    if (empresaId && contaId) {
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
    }
  }, [open, empresaId, contaId, qc]);

  useEffect(() => {
    if (!open || inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, inline]);

  const { data: txs, isLoading } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["ofx", contaId] as const,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OfxRow[]> => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("id,data_transacao,valor,tipo,memo,status,lancamento_id")
        .eq("conta_bancaria_id", contaId!).order("data_transacao", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lancamentosAbertos } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["lanc-abertos", empresaId] as const,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Busca em páginas: sem range, o Supabase corta em 1000; o limit(200) antigo
      // escondia lançamentos (ex.: parcela 05/09 fora dos 200 mais antigos).
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("lancamentos_financeiros")
          .select("id,descricao,valor,tipo,status,data_vencimento,conta_bancaria_id,categoria_id,contato_id,centro_custo_id")
          .eq("empresa_id", empresaId!).in("status", ["aberto", "vencido", "parcial"])
          .order("data_vencimento").range(ini, ini + 999);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as unknown as LancOpt[];
    },
  });

  const { data: categorias } = useQuery({
    enabled: open && !!empresaId,
  queryKey: ["categorias-conc", empresaId] as const,
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome,tipo").eq("empresa_id", empresaId!).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contatos } = useQuery({
    enabled: open && !!empresaId,
  queryKey: ["contatos-conc", empresaId] as const,
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  queryFn: async () => {
      const { data, error } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresaId!).eq("ativo", true).order("nome").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: centros } = useQuery({
    enabled: open && !!empresaId,
  queryKey: ["centros-conc", empresaId] as const,
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  queryFn: async () => {
      const { data, error } = await supabase.from("centros_custo")
        .select("id,nome").eq("empresa_id", empresaId!).eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Memória de conciliações: memo do banco -> categoria/contato/centro usados.
  // Ao conciliar 1 TED da FARMAX, os próximos iguais já vêm preenchidos.
  const { data: memoriaConc } = useQuery({
    enabled: open && !!empresaId && !!contaId,
    queryKey: ["conc-memoria", contaId] as const,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<{ memo: string; categoria_id: string | null; contato_id: string | null; centro_custo_id: string | null }[]> => {
      const { data: hist, error } = await supabase.from("ofx_transacoes")
        .select("memo,lancamento_id")
        .eq("conta_bancaria_id", contaId!)
        .eq("status", "conciliada")
        .not("lancamento_id", "is", null)
        .order("data_transacao", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const ids = Array.from(new Set(((hist ?? []) as { lancamento_id: string }[]).map((h) => h.lancamento_id).filter(Boolean)));
      if (!ids.length) return [];
      const { data: lancs, error: e2 } = await supabase.from("lancamentos_financeiros")
        .select("id,categoria_id,contato_id,centro_custo_id").in("id", ids);
      if (e2) throw e2;
      const porId = new Map(((lancs ?? []) as { id: string; categoria_id: string | null; contato_id: string | null; centro_custo_id: string | null }[]).map((l) => [l.id, l]));
      return ((hist ?? []) as { memo: string | null; lancamento_id: string }[])
        .map((h) => ({ memo: h.memo ?? "", ...(porId.get(h.lancamento_id) ?? { categoria_id: null, contato_id: null, centro_custo_id: null }) }))
        .filter((h) => h.memo.trim() && (h.categoria_id || h.contato_id || h.centro_custo_id));
    },
  });

  const normMemo = useCallback((s: string | null | undefined) =>
    String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim(), []);

  // Assinatura do memo sem partes variáveis (datas 09/09, dias, sequenciais):
  // "PIX RECEBIDO REM: FARMAX S.A. 09/09" e "... 16/09" viram a mesma chave.
  const assinaturaMemo = useCallback((s: string | null | undefined) =>
    normMemo(s)
      .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ").trim(), [normMemo]);

  // Mapa memo exato -> combinação mais frequente (desempate: mais recente).
  const memoriaMap = useMemo(() => {
    const grupos = new Map<string, { categoria_id: string | null; contato_id: string | null; centro_custo_id: string | null; n: number; ordem: number }>();
    (memoriaConc ?? []).forEach((h, i) => {
      const k = normMemo(h.memo);
      if (!k) return;
      const g = grupos.get(k);
      if (!g) {
        grupos.set(k, { categoria_id: h.categoria_id, contato_id: h.contato_id, centro_custo_id: h.centro_custo_id, n: 1, ordem: i });
      } else if (g.categoria_id === h.categoria_id && g.contato_id === h.contato_id && g.centro_custo_id === h.centro_custo_id) {
        g.n += 1;
      } else {
        // combinação diferente: mantém a mais frequente; em empate fica a mais recente (ordem menor)
        g.n += 0;
        if (i < g.ordem) { /* nunca: i cresce; mantém primeira vista (mais recente pela query desc) */ }
      }
    });
    return grupos;
  }, [memoriaConc, normMemo]);

  // Mapa assinatura (sem datas/números) -> combinação mais recente: cobre memos
  // que só mudam o dia/sequencial ("... FARMAX S.A. 09/09" x "... 16/09").
  const memoriaAssinatura = useMemo(() => {
    const grupos = new Map<string, { categoria_id: string | null; contato_id: string | null; centro_custo_id: string | null }>();
    (memoriaConc ?? []).forEach((h) => {
      const k = assinaturaMemo(h.memo);
      if (k.length < 8 || grupos.has(k)) return;
      grupos.set(k, { categoria_id: h.categoria_id, contato_id: h.contato_id, centro_custo_id: h.centro_custo_id });
    });
    return grupos;
  }, [memoriaConc, assinaturaMemo]);

  const lembrarConciliacao = useCallback((memo: string | null | undefined) => {
    const n = normMemo(memo);
    if (!n) return null;
    const exato = memoriaMap.get(n);
    if (exato) return exato;
    // assinatura sem datas/números: memos iguais que só mudam o dia (09/09 x 16/09)
    const ass = assinaturaMemo(memo);
    if (ass.length >= 8) {
      const porAss = memoriaAssinatura.get(ass);
      if (porAss) return porAss;
    }
    // fallback: histórico cujo memo (12+ chars) está contido no atual ou vice-versa; pega o mais longo
    let melhor: { categoria_id: string | null; contato_id: string | null; centro_custo_id: string | null } | null = null;
    let melhorTam = 0;
    memoriaMap.forEach((v, k) => {
      if (k.length < 12) return;
      if ((n.includes(k) || k.includes(n)) && k.length > melhorTam) { melhor = v; melhorTam = k.length; }
    });
    return melhor;
  }, [memoriaMap, memoriaAssinatura, normMemo, assinaturaMemo]);

  // Fallback: contato cujo nome aparece no memo (ex.: FARMAX DISTRIBUIDORA no TED).
  const contatoPorNomeNoMemo = useCallback((memo: string | null | undefined, lista: { id: string; nome: string }[] | undefined) => {
    const m = ` ${normMemo(memo)} `;
    if (m.trim().length < 4 || !lista?.length) return null;
    let melhor: { id: string } | null = null;
    let melhorScore = 0;
    for (const c of lista) {
      const palavras = normMemo(c.nome).split(" ").filter((w) => w.length > 3);
      if (!palavras.length) continue;
      const hits = palavras.filter((w) => m.includes(` ${w} `) || m.includes(w));
      const precisa = Math.min(2, palavras.length);
      if (hits.length >= precisa) {
        const score = hits.join("").length;
        if (score > melhorScore) { melhorScore = score; melhor = c; }
      }
    }
    return melhor;
  }, [normMemo]);

  // Contas para a aba Transferência (destino/origem diferente da atual).
  const { data: contasTransf } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["contas-conc-transf", empresaId] as const,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco").eq("empresa_id", empresaId!).eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string | null; banco: string | null }[];
    },
  });

  const conciliar = useMutation({
    mutationFn: async ({ ofxId, lancamentoId, valor }: { ofxId: string; lancamentoId: string; valor: number }) => {
      const { error: e1 } = await supabase.from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: Math.abs(valor), data_pagamento: format(new Date(), "yyyy-MM-dd"), conta_bancaria_id: contaId })
        .eq("id", lancamentoId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lancamentoId }).eq("id", ofxId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Transação conciliada");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoRunningRef = useRef(false);
  useEffect(() => {
    if (!autoConciliar || !txs || !lancamentosAbertos || autoRunningRef.current) return;
    const pares: { ofxId: string; lancamentoId: string; valor: number }[] = [];
    const usados = new Set<string>();
    for (const tx of txs) {
      if (tx.status === "conciliada" || autoRunRef.current.has(tx.id)) continue;
      const match = lancamentosAbertos.find((l) =>
        !usados.has(l.id) &&
        Math.abs(Number(l.valor) - Math.abs(tx.valor)) < 0.01 &&
        l.data_vencimento === tx.data_transacao
      );
      if (match) {
        usados.add(match.id);
        autoRunRef.current.add(tx.id);
        pares.push({ ofxId: tx.id, lancamentoId: match.id, valor: tx.valor });
      }
    }
    if (!pares.length) return;
    autoRunningRef.current = true;
    (async () => {
      const hoje = format(new Date(), "yyyy-MM-dd");
      let ok = 0;
      for (let i = 0; i < pares.length; i += 25) {
        const lote = pares.slice(i, i + 25);
        const res = await Promise.all(lote.map(async (p) => {
          const { error: e1 } = await supabase.from("lancamentos_financeiros")
            .update({ status: "pago", valor_pago: Math.abs(p.valor), data_pagamento: hoje, conta_bancaria_id: contaId })
            .eq("id", p.lancamentoId);
          if (e1) return false;
          const { error: e2 } = await supabase.from("ofx_transacoes")
            .update({ status: "conciliada", lancamento_id: p.lancamentoId }).eq("id", p.ofxId);
          return !e2;
        }));
        ok += res.filter(Boolean).length;
      }
      if (ok > 0) toast.success(`${ok} lançamento(s) conciliado(s) automaticamente`);
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      autoRunningRef.current = false;
    })();
  }, [autoConciliar, txs, lancamentosAbertos, contaId, empresaId, qc]);

  const criarEConciliar = useMutation({
    mutationFn: async ({ tx, r }: { tx: OfxRow; r: RowState; silent?: boolean }) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      if (r.lancamento_id) {
        const { error: e1 } = await supabase.from("lancamentos_financeiros")
          .update({ status: "pago", valor_pago: Math.abs(tx.valor), data_pagamento: tx.data_transacao, conta_bancaria_id: contaId })
          .eq("id", r.lancamento_id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("ofx_transacoes")
          .update({ status: "conciliada", lancamento_id: r.lancamento_id }).eq("id", tx.id);
        if (e2) throw e2;
        return;
      }
      if (!r.descricao.trim()) throw new Error("Informe a descrição");
      if (!r.categoria_id) throw new Error("Selecione a categoria");
      const tipo = tx.valor >= 0 ? "receber" : "pagar";
      const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresaId, tipo, descricao: r.descricao.trim(),
        valor: Math.abs(tx.valor), valor_pago: Math.abs(tx.valor),
        data_emissao: tx.data_transacao, data_vencimento: tx.data_transacao,
        data_pagamento: tx.data_transacao, status: "pago", conta_bancaria_id: contaId,
        categoria_id: r.categoria_id || null,
        contato_id: r.contato_id || null,
        centro_custo_id: r.centro_custo_id || null,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lanc.id }).eq("id", tx.id);
      if (e2) throw e2;
    },
    onSuccess: (_d, vars) => {
      if (!vars?.silent) toast.success("Lançamento conciliado");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["conc-memoria"] });
    },
    onError: (e: Error, vars) => { if (!vars?.silent) toast.error(e.message); },
  });

  const excluirTx = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("ofx_transacoes")
        .delete().in("id", ids).neq("status", "conciliada");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento(s) excluído(s) do extrato");
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const excluirExtrato = useMutation({
    mutationFn: async () => {
      if (!contaId) throw new Error("Conta não selecionada");
      const { data: vinculos, error: eSel } = await supabase.from("ofx_transacoes")
        .select("lancamento_id").eq("conta_bancaria_id", contaId).not("lancamento_id", "is", null);
      if (eSel) throw eSel;
      const lancIds = Array.from(new Set((vinculos ?? []).map((v) => v.lancamento_id).filter(Boolean) as string[]));
      const { error: eDel } = await supabase.from("ofx_transacoes").delete().eq("conta_bancaria_id", contaId);
      if (eDel) throw eDel;
      if (lancIds.length) {
        const { error: eLanc } = await supabase.from("lancamentos_financeiros").delete().in("id", lancIds);
        if (eLanc) throw eLanc;
      }
      return { txs: (vinculos?.length ?? 0), lancs: lancIds.length };
    },
    onSuccess: (r) => {
      toast.success(`Extrato removido — ${r.lancs} lançamento(s) excluído(s)`);
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = useMemo(
    () => (txs ?? []).filter((t) => t.status !== "conciliada" && t.status !== "arquivada"),
    [txs],
  );

  const porMes = pendentes;

  const normBusca = useCallback((s: string | null | undefined) =>
    String(s ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, ""), []);

  const catNomeBusca = useMemo(() => new Map(((categorias ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome])), [categorias]);
  const contatoNomeBusca = useMemo(() => new Map((contatos ?? []).map((c) => [c.id, c.nome])), [contatos]);
  const centroNomeBusca = useMemo(() => new Map((centros ?? []).map((c) => [c.id, c.nome])), [centros]);

  const q = buscaDebounced.trim().toLowerCase();
  // Base da pesquisa (sem o filtro de tipo): alimenta os cabeçalhos Todos/Recebimentos/Pagamentos.
  const porBusca = useMemo(() => {
    const nq = normBusca(q);
    if (!nq) return porMes;
    return porMes.filter((t) => {
      const r = rows[t.id];
      const campos = [
        t.memo ?? "",
        r?.descricao ?? "",
        catNomeBusca.get(r?.categoria_id ?? "") ?? "",
        contatoNomeBusca.get(r?.contato_id ?? "") ?? "",
        centroNomeBusca.get(r?.centro_custo_id ?? "") ?? "",
      ];
      if (campos.some((c) => normBusca(c).includes(nq))) return true;
      // valor: "8.890,27", "8890", "8890.27"
      const vNum = String(Math.abs(Number(t.valor)));
      const qNum = nq.replace(",", ".");
      if (/\d/.test(nq) && (vNum.includes(qNum) || vNum.replace(/\D/g, "").includes(qNum.replace(/\D/g, "")))) return true;
      // data: 02/09/2026, 02/09 ou 2026-09-02
      const [y, m, d] = String(t.data_transacao).split("-");
      if (y && m && d && (`${d}/${m}/${y}`.includes(nq) || `${d}/${m}`.includes(nq) || t.data_transacao.includes(nq))) return true;
      return false;
    });
  }, [porMes, q, rows, normBusca, catNomeBusca, contatoNomeBusca, centroNomeBusca]);
  const recebimentosBusca = useMemo(() => porBusca.filter((t) => t.valor >= 0).length, [porBusca]);
  const pagamentosBusca = porBusca.length - recebimentosBusca;
  const visiveis = useMemo(() => {
    return porBusca
      .filter((t) => filtro === "todos" || (filtro === "recebimentos" ? t.valor >= 0 : t.valor < 0))
      .sort((a, b) => {
        if (ordem === "recentes") return b.data_transacao.localeCompare(a.data_transacao);
        if (ordem === "antigos") return a.data_transacao.localeCompare(b.data_transacao);
        if (ordem === "maior") return Math.abs(b.valor) - Math.abs(a.valor);
        return Math.abs(a.valor) - Math.abs(b.valor);
      });
  }, [porBusca, filtro, ordem]);

  // Carregar mais: renderizar centenas de cards de uma vez trava a tela.
  useEffect(() => { setVisiveisQtd(PAGE_SIZE); }, [q, filtro, ordem, contaId]);
  const daPagina = useMemo(
    () => visiveis.slice(0, visiveisQtd),
    [visiveis, visiveisQtd],
  );

  const catsReceber = useMemo(() => (categorias ?? []).filter((c) => c.tipo === "receber"), [categorias]);
  const catsPagar = useMemo(() => (categorias ?? []).filter((c) => c.tipo === "pagar"), [categorias]);

  const getRow = useCallback(
    (tx: OfxRow) => rows[tx.id] ?? emptyRow(tx.memo),
    [rows],
  );
  const setRow = useCallback((id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow(null)), ...patch } })), []);

  // Pré-preenche a descrição com o memo do banco no estado (não só na exibição):
  // sem isso, escolher a categoria antes de tocar na descrição criava a linha
  // a partir de emptyRow(null) e apagava o texto pré-informado.
  // Aproveita e já puxa categoria/contato/centro da memória de conciliações.
  useEffect(() => {
    if (!txs) return;
    setRows((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const tx of txs) {
        if (!next[tx.id]) {
          const mem = lembrarConciliacao(tx.memo);
          const porNome = !mem?.contato_id ? contatoPorNomeNoMemo(tx.memo, contatos as { id: string; nome: string }[] | undefined) : null;
          next[tx.id] = {
            ...emptyRow(tx.memo),
            categoria_id: mem?.categoria_id ?? "",
            contato_id: mem?.contato_id ?? (porNome?.id ?? ""),
            centro_custo_id: mem?.centro_custo_id ?? "",
          };
          if (next[tx.id].categoria_id || next[tx.id].contato_id || next[tx.id].centro_custo_id) changed = true;
          else if (next[tx.id].descricao !== (prev[tx.id] as RowState | undefined)?.descricao) changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [txs, lembrarConciliacao, contatoPorNomeNoMemo, contatos]);

  // Memória chegou depois das linhas: preenche só campos ainda vazios (nunca sobrescreve escolha do usuário).
  useEffect(() => {
    if (!txs || (memoriaMap.size === 0 && !(contatos as { id: string; nome: string }[] | undefined)?.length)) return;
    setRows((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const tx of txs) {
        const cur = next[tx.id];
        if (!cur || cur.lancamento_id) continue;
        if (cur.categoria_id && cur.contato_id && cur.centro_custo_id) continue;
        const mem = lembrarConciliacao(tx.memo);
        const porNome = (!cur.contato_id && !mem?.contato_id) ? contatoPorNomeNoMemo(tx.memo, contatos as { id: string; nome: string }[] | undefined) : null;
        const patch: Partial<RowState> = {};
        if (!cur.categoria_id && mem?.categoria_id) patch.categoria_id = mem.categoria_id;
        if (!cur.contato_id && (mem?.contato_id ?? porNome?.id)) patch.contato_id = (mem?.contato_id ?? porNome?.id) as string;
        if (!cur.centro_custo_id && mem?.centro_custo_id) patch.centro_custo_id = mem.centro_custo_id;
        if (Object.keys(patch).length) { next[tx.id] = { ...cur, ...patch }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [txs, memoriaMap, lembrarConciliacao, contatoPorNomeNoMemo, contatos]);

  const toggleSel = useCallback((id: string) =>
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);

  const setModoBusca = useCallback((id: string, v: boolean) => {
    setBuscarModo((p) => ({ ...p, [id]: v }));
    if (!v) setRow(id, { lancamento_id: "" });
  }, [setRow]);

  const conciliarUm = useCallback((t: OfxRow, r: RowState) => {
    setConciliandoIds((prev) => new Set(prev).add(t.id));
    criarEConciliar.mutate({ tx: t, r }, {
      onSettled: () => setConciliandoIds((prev) => {
        const n = new Set(prev);
        n.delete(t.id);
        return n;
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, contaId]);

  // Criação rápida de categoria dentro da conciliação (rodapé do combo, igual ao Novo contato).
  const criarCategoriaConc = useMutation({
    mutationFn: async ({ txId, nome }: { txId: string; nome: string }) => {
      if (!empresaId) throw new Error("Empresa não selecionada");
      const tx = (txs ?? []).find((t) => t.id === txId);
      if (!tx) throw new Error("Lançamento não encontrado");
      const n = nome.trim();
      if (!n) throw new Error("Informe o nome da categoria");
      const tipo = tx.valor >= 0 ? "receber" : "pagar";
      const { data, error } = await supabase.from("categorias_financeiras")
        .insert({ empresa_id: empresaId, nome: n, tipo } as any)
        .select("id,nome,tipo").single();
      if (error) {
        if ((error as any).code === "23505") {
          const { data: ex } = await supabase.from("categorias_financeiras")
            .select("id,nome,tipo").eq("empresa_id", empresaId).eq("tipo", tipo);
          const norm = (s: string) =>
            s.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
          const achou = ((ex ?? []) as { id: string; nome: string; tipo: string }[]).find((c) => norm(c.nome) === norm(n));
          if (achou) return achou;
          throw new Error("Já existe uma categoria com esse nome para este tipo");
        }
        throw error;
      }
      return data as { id: string; nome: string; tipo: string };
    },
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ["categorias-conc", empresaId] });
      qc.invalidateQueries({ queryKey: ["cadastros-categorias", empresaId] });
      qc.invalidateQueries({ queryKey: ["categorias-opt"] });
      if (novaCatTxId) setRow(novaCatTxId, { categoria_id: cat.id });
      toast.success(`Categoria "${cat.nome}" criada`);
      setNovaCatTxId(null);
      setNovaCatNome("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Conciliar 1 lançamento do banco com VÁRIOS lançamentos do sistema (soma bate o valor).
  const conciliarVarios = useMutation({
    mutationFn: async ({ tx, ids }: { tx: OfxRow; ids: string[] }) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      if (!ids.length) throw new Error("Selecione ao menos um lançamento");
      const mapa = new Map((lancamentosAbertos ?? []).map((l) => [l.id, l]));
      for (const id of ids) {
        const alvo = mapa.get(id);
        const vp = Math.abs(Number(alvo?.valor) || Math.abs(tx.valor));
        const { error: e1 } = await supabase.from("lancamentos_financeiros")
          .update({ status: "pago", valor_pago: vp, data_pagamento: tx.data_transacao, conta_bancaria_id: contaId })
          .eq("id", id);
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: ids[0] }).eq("id", tx.id);
      if (e2) throw e2;
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.ids.length} lançamentos conciliados`);
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["conc-memoria"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conciliarVariosUm = useCallback((t: OfxRow, ids: string[]) => {
    setConciliandoIds((prev) => new Set(prev).add(t.id));
    conciliarVarios.mutate({ tx: t, ids }, {
      onSettled: () => setConciliandoIds((prev) => {
        const n = new Set(prev);
        n.delete(t.id);
        return n;
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, contaId]);

  // Aba Transferência: cria a transferência entre contas, quita a perna desta
  // conta e amarra o extrato nela (a outra perna segue em aberto e aparece na
  // conciliação da outra conta / sugestão automática por valor+data).
  const conciliarTransferencia = useMutation({
    mutationFn: async ({ tx, r, silent }: { tx: OfxRow; r: RowState; silent?: boolean }) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      const outra = r.conta_destino_id;
      if (!outra) throw new Error(tx.valor < 0 ? "Selecione a conta de destino" : "Selecione a conta de origem");
      if (outra === contaId) throw new Error("Escolha uma conta diferente desta");
      const v = Math.abs(Number(tx.valor));
      if (!v) throw new Error("Valor inválido");
      const desc = (r.descricao || "").trim() || "Transferência entre contas";
      const saiu = tx.valor < 0;
      const contaOrigem = saiu ? contaId : outra;
      const contaDestino = saiu ? outra : contaId;
      const nomeConta = (id: string) =>
        (contasTransf ?? []).find((c) => c.id === id)?.nome
        || (contasTransf ?? []).find((c) => c.id === id)?.banco
        || "Conta";
      const { data: tr, error } = await supabase.from("transferencias_contas")
        .insert({
          empresa_id: empresaId, data: tx.data_transacao,
          conta_origem_id: contaOrigem, conta_destino_id: contaDestino,
          valor: v, descricao: desc,
        } as never)
        .select("id").single();
      if (error) throw error;
      const trId = (tr as { id: string }).id;
      const base = {
        empresa_id: empresaId, data_emissao: tx.data_transacao, data_vencimento: tx.data_transacao,
        valor: v, transferencia_id: trId,
      };
      const pernaMinhaPaga = {
        ...base, conta_bancaria_id: contaId,
        descricao: saiu ? `${desc} → ${nomeConta(contaDestino)}` : `${desc} ← ${nomeConta(contaOrigem)}`,
        tipo: saiu ? "pagar" : "receber", status: "pago", valor_pago: v, data_pagamento: tx.data_transacao,
      };
      const pernaOutraAberta = {
        ...base, conta_bancaria_id: outra,
        descricao: saiu ? `${desc} ← ${nomeConta(contaOrigem)}` : `${desc} → ${nomeConta(contaDestino)}`,
        tipo: saiu ? "receber" : "pagar", status: "aberto", valor_pago: 0,
      };
      const { data: pernas, error: e2 } = await supabase.from("lancamentos_financeiros")
        .insert([pernaMinhaPaga, pernaOutraAberta] as never)
        .select("id,conta_bancaria_id");
      if (e2) throw e2;
      const minha = ((pernas ?? []) as { id: string; conta_bancaria_id: string }[]).find((p) => p.conta_bancaria_id === contaId);
      if (!minha) throw new Error("Falha ao criar as pernas da transferência");
      const { error: e3 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: minha.id }).eq("id", tx.id);
      if (e3) throw e3;
    },
    onSuccess: (_d, vars) => {
      if (!vars?.silent) toast.success("Transferência conciliada");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    qc.invalidateQueries({ queryKey: ["ofx-mes", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["conc-memoria"] });
      qc.invalidateQueries({ queryKey: ["transferencias"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error, vars) => { if (!vars?.silent) toast.error(e.message); },
  });

  const conciliarTransfUm = useCallback((t: OfxRow, r: RowState) => {
    setConciliandoIds((prev) => new Set(prev).add(t.id));
    conciliarTransferencia.mutate({ tx: t, r }, {
      onSettled: () => setConciliandoIds((prev) => {
        const n = new Set(prev);
        n.delete(t.id);
        return n;
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, contaId]);

  // Seleção vale para a listagem visível (respeita busca/filtro); contadores seguem o mesmo recorte.
  const selVisiveis = useMemo(() => visiveis.filter((t) => sel.has(t.id)), [visiveis, sel]);

  const alternarSelecaoVisiveis = useCallback(() => {
    setSel((prev) => {
      const todosMarcados = visiveis.length > 0 && visiveis.every((t) => prev.has(t.id));
      const n = new Set(prev);
      if (todosMarcados) visiveis.forEach((t) => n.delete(t.id));
      else visiveis.forEach((t) => n.add(t.id));
      return n;
    });
  }, [visiveis]);

  // Limpa da seleção ids que sumiram da lista (conciliados/excluídos em outra ação).
  useEffect(() => {
    setSel((prev) => {
      if (!prev.size) return prev;
      const validos = new Set((txs ?? []).filter((t) => t.status !== "conciliada").map((t) => t.id));
      if ([...prev].every((id) => validos.has(id))) return prev;
      return new Set([...prev].filter((id) => validos.has(id)));
    });
  }, [txs]);

  const conciliarSelecionados = async () => {
    const alvos = selVisiveis;
    if (!alvos.length) { toast.error("Selecione ao menos um lançamento"); return; }
    let ok = 0, falhas = 0;
    for (const tx of alvos) {
      const row = getRow(tx);
      try {
        if (row.modo === "transferencia") await conciliarTransferencia.mutateAsync({ tx, r: row, silent: true });
        else await criarEConciliar.mutateAsync({ tx, r: row, silent: true });
        ok++;
      }
      catch { falhas++; }
    }
    setSel((prev) => { const n = new Set(prev); alvos.forEach((t) => n.delete(t.id)); return n; });
    if (ok > 0) toast.success(`${ok} lançamento(s) conciliado(s)`);
    if (falhas > 0) toast.error(`${falhas} lançamento(s) com erro (verifique descrição, categoria ou conta)`);
  };

  // Sugestão visível: pré-seleciona o lançamento de mesmo valor e data
  useEffect(() => {
    if (!txs || !lancamentosAbertos) return;
    setRows((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const tx of txs) {
        if (tx.status === "conciliada") continue;
        const cur = next[tx.id] ?? emptyRow(tx.memo);
        if (cur.lancamento_id) continue;
        const match = sugerirLancamento(tx, lancamentosAbertos);
        if (match) { next[tx.id] = { ...cur, lancamento_id: match.id }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [txs, lancamentosAbertos]);


  const titulo = conta ? `Contas financeiras — ${conta.nome ?? conta.banco ?? ""}` : "Conciliação bancária";

  const filtroAtual = { busca, filtro, ordem };
  const aplicarFiltroSalvo = (id: string) => {
    const salvo = filtrosSalvos.filtros.find((item) => item.id === id);
    if (!salvo) return;
    const valores = salvo.filtros as Partial<typeof filtroAtual>;
    setBusca(typeof valores.busca === "string" ? valores.busca : "");
    setFiltro(valores.filtro === "recebimentos" || valores.filtro === "pagamentos" ? valores.filtro : "todos");
    setOrdem(valores.ordem === "antigos" || valores.ordem === "maior" || valores.ordem === "menor" ? valores.ordem : "antigos");
    setVisiveisQtd(PAGE_SIZE);
  };

  if (!open) return null;

  const corpoConciliacao = (
    <>
      <div className={inline ? "" : "flex-1 overflow-y-auto px-4 py-4"}>


        <div className="w-full">
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8 h-8 text-[13px]" placeholder="Buscar por descrição, categoria, cliente, valor ou data…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                {filtrosSalvos.filtros.length > 0 && (
                  <Select onValueChange={aplicarFiltroSalvo}>
                    <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {filtrosSalvos.filtros.map((salvo) => <SelectItem key={salvo.id} value={salvo.id}>{salvo.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setBusca(""); setFiltro("todos"); setOrdem("antigos"); setVisiveisQtd(PAGE_SIZE); }}>
                  <Trash2 className="mr-1 h-3 w-3" />Limpar filtros
                </Button>
              </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border">
              {([
                { k: "todos", label: "Todos", n: porBusca.length, cls: "text-blue-600 dark:text-blue-400" },
                { k: "recebimentos", label: "Recebimentos", n: recebimentosBusca, cls: "text-success" },
                { k: "pagamentos", label: "Pagamentos", n: pagamentosBusca, cls: "text-destructive" },
              ] as const).map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => setFiltro(c.k)}
                  className={cn(
                    "border-r px-3 py-1.5 text-center last:border-r-0 transition-colors hover:bg-muted/50",
                    filtro === c.k && "border-t-2 border-t-primary bg-muted/40"
                  )}
                >
                  <div className="text-[11px] text-muted-foreground">{c.label}</div>
                  <div className={cn("text-base font-semibold", c.cls)}>{c.n}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div>
                <Select value={ordem} onValueChange={(v) => setOrdem(v as typeof ordem)}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recentes">Mais recentes</SelectItem>
                    <SelectItem value="antigos">Mais antigos</SelectItem>
                    <SelectItem value="maior">Maior valor</SelectItem>
                    <SelectItem value="menor">Menor valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={alternarSelecaoVisiveis}>
                {selVisiveis.length === visiveis.length && visiveis.length > 0 ? `Limpar seleção (${selVisiveis.length})` : selVisiveis.length > 0 ? `Selecionar lançamentos (${selVisiveis.length} marcados)` : "Selecionar lançamentos"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!selVisiveis.length || criarEConciliar.isPending} onClick={conciliarSelecionados}>
                {criarEConciliar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Conciliar{selVisiveis.length > 0 ? ` (${selVisiveis.length})` : ""}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!selVisiveis.length || excluirTx.isPending}
                onClick={() => excluirTx.mutate(selVisiveis.map((t) => t.id))}>
                <Trash2 className="mr-1 h-3 w-3" />Excluir{selVisiveis.length > 0 ? ` (${selVisiveis.length})` : ""}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs font-medium md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-2"><span className="rounded bg-destructive px-1.5 text-[11px] text-destructive-foreground">B</span>Lançamentos do banco</div>
              <div />
              <div className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-primary" />Lançamentos do sistema</div>
            </div>

            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : !txs?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma transação importada. Use "Importar OFX" para começar.
              </div>
            ) : !visiveis.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Tudo conciliado. 🎉</div>
            ) : (
              <div className="space-y-2">
                {daPagina.map((tx) => (
                  <ReconcileRow
                    key={tx.id}
                    tx={tx}
                    r={getRow(tx)}
                    modoBusca={!!buscarModo[tx.id]}
                    selected={sel.has(tx.id)}
                    categorias={tx.valor >= 0 ? catsReceber : catsPagar}
                    contatos={contatos ?? EMPTY}
                    centros={centros ?? EMPTY}
                    lancamentosAbertos={lancamentosAbertos ?? EMPTY_LANC}
                    conciliando={conciliandoIds.has(tx.id)}
                    excluindo={excluirTx.isPending}
                    onToggleSel={toggleSel}
                    onSetRow={setRow}
                    onSetModoBusca={setModoBusca}
                    onConciliar={conciliarUm}
                    onConciliarTransf={conciliarTransfUm}
                    contasTransf={contasTransf ?? []}
                    contaAtualId={contaId ?? ""}
                    onConciliarVarios={conciliarVariosUm}
                    onNovaCategoria={(txId) => { setNovaCatNome(""); setNovaCatTxId(txId); }}
                    onExcluir={(id) => excluirTx.mutate([id])}
                    empresaId={empresaId}
                    logoBanco={conta?.banco ? detectBancoByNome(conta.banco)?.logo ?? null : null}
                  />
                ))}

                {visiveis.length > daPagina.length && (
                  <div className="flex items-center justify-center gap-3 py-4 text-sm">
                    <span className="text-muted-foreground">
                      Mostrando {daPagina.length} de {visiveis.length} lançamentos
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setVisiveisQtd((q) => q + 15)}>
                      Carregar mais lançamentos
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confExtrato} onOpenChange={setConfExtrato}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir extrato</AlertDialogTitle>
            <AlertDialogDescription>
              {"Excluir todo o extrato OFX importado desta conta?\n\nSerão apagados TODOS os lançamentos criados/conciliados a partir dele, mesmo os já conciliados. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluirExtrato.mutate()}
            >
              Excluir extrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!novaCatTxId} onOpenChange={(o) => { if (!o) { setNovaCatTxId(null); setNovaCatNome(""); } }}>
        <DialogContent className="inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] h-auto max-h-[90vh] p-4 gap-3 rounded-2xl sm:p-6">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">
              Nova categoria ({((txs ?? []).find((t) => t.id === novaCatTxId)?.valor ?? 0) >= 0 ? "Receita" : "Despesa"})
            </DialogTitle>
            <DialogDescription>Criada no plano da empresa e aplicada ao lançamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              autoFocus
              value={novaCatNome}
              onChange={(e) => setNovaCatNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (novaCatTxId && novaCatNome.trim()) criarCategoriaConc.mutate({ txId: novaCatTxId, nome: novaCatNome }); } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNovaCatTxId(null); setNovaCatNome(""); }}>Cancelar</Button>
            <Button
              disabled={criarCategoriaConc.isPending || !novaCatNome.trim()}
              onClick={() => novaCatTxId && criarCategoriaConc.mutate({ txId: novaCatTxId, nome: novaCatNome })}
              className="h-10 rounded-xl px-6 shadow-sm"
            >
              {criarCategoriaConc.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Criar categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
    );

  if (inline) return corpoConciliacao;

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        <div className="flex items-center gap-2">
          {conta?.tipo === "corrente" && (
            <Button variant="default" size="sm" disabled={importing} onClick={onImport}>
              {importing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
              Importar OFX
            </Button>
          )}
          {txs && txs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={excluirExtrato.isPending}
              onClick={() => setConfExtrato(true)}
            >
              {excluirExtrato.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
              Excluir extrato importado
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {corpoConciliacao}
    </div>
    </>
  );
}

const EMPTY: { id: string; nome: string }[] = [];
const EMPTY_LANC: LancOpt[] = [];

type Opcao = { id: string; nome: string };

function BuscarLancamentoDialog({ open, onClose, tx, lancamentos, value, onConfirm, empresaId, contatos, centros, logoBanco }: {
  open: boolean;
  onClose: () => void;
  tx: OfxRow;
  lancamentos: LancOpt[];
  value: string;
  onConfirm: (ids: string[]) => void;
  empresaId: string | null;
  contatos: { id: string; nome: string }[];
  centros: { id: string; nome: string }[];
  logoBanco?: string | null;
}) {
  const [q, setQ] = useState("");
  // Período igual ao do Contas a pagar/receber (PeriodoFilter); padrão: janela de 3 dias até o vencimento do banco.
  const janelaPadrao = (dataTx: string): Periodo => {
    const b = new Date(`${dataTx}T00:00:00`);
    if (Number.isNaN(b.getTime())) return { from: null, to: null, label: "Todo o período" };
    const from = new Date(b.getTime() - 3 * 86400000);
    return { from, to: b, label: `${format(from, "dd/MM/yyyy")} — ${format(b, "dd/MM/yyyy")}` };
  };
  const [periodo, setPeriodo] = useState<Periodo>(() => janelaPadrao(tx.data_transacao));
  const [contaF, setContaF] = useState("todas");
  const [catF, setCatF] = useState("todas");
  const [contatoF, setContatoF] = useState("todas");
  const [centroF, setCentroF] = useState("todas");
  const [sitF, setSitF] = useState("todas");
  const [extras, setExtras] = useState<string[]>([]);
  const [tipoF, setTipoF] = useState<"receber" | "pagar" | "todos">(() => (Number(tx.valor) >= 0 ? "receber" : "pagar"));
  const [selIds, setSelIds] = useState<string[]>(value ? [value] : []);
  const alternarId = (id: string) => setSelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  useEffect(() => {
    if (open) {
      setSelIds(value ? [value] : []); setQ("");
      setTipoF(Number(tx.valor) >= 0 ? "receber" : "pagar");
      setPeriodo(janelaPadrao(tx.data_transacao));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, tx.valor, tx.data_transacao]);

  const { data: contasBusca = [] } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["contas-busca", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome").eq("empresa_id", empresaId!).order("nome").limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const { data: catsBusca = [] } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["cats-busca", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome,tipo").eq("empresa_id", empresaId!).order("nome").limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; tipo: string }[];
    },
  });
  const nomeConta = (id?: string | null) => (contasBusca ?? []).find((c) => c.id === id)?.nome ?? "—";

  const dentroPeriodo = (dataStr: string) => {
    if (!periodo.from || !periodo.to) return true;
    const f = format(periodo.from, "yyyy-MM-dd");
    const t = format(periodo.to, "yyyy-MM-dd");
    return dataStr >= f && dataStr <= t;
  };
  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return (lancamentos ?? []).filter((l) => {
      if (tipoF !== "todos" && l.tipo !== tipoF) return false;
      if (contaF !== "todas" && (l.conta_bancaria_id ?? "") !== contaF) return false;
      if (catF !== "todas" && (l.categoria_id ?? "") !== catF) return false;
      if (contatoF !== "todas" && (l.contato_id ?? "") !== contatoF) return false;
      if (centroF !== "todas" && (l.centro_custo_id ?? "") !== centroF) return false;
      if (sitF !== "todas" && l.status !== sitF) return false;
      if (!dentroPeriodo(l.data_vencimento)) return false;
      if (!termo) return true;
      if ((l.descricao ?? "").toLowerCase().includes(termo)) return true;
      // Pesquisa por valor: só números e vírgula ("33.748,45" vira "33748,45";
      // a partir de 2 dígitos p/ "0" não casar tudo)
      const qValor = termo.replace(/[^\d,]/g, "");
      if (qValor.replace(/\D/g, "").length >= 2) {
        const valorVirg = Number(l.valor || 0).toFixed(2).replace(".", ",");
        if (valorVirg.includes(qValor)) return true;
      }
      if ((l.data_vencimento || "").includes(termo)) return true;
      return false;
    })
      // Com busca, o exato primeiro: valor igual e descrição começando pelo termo sobem.
      .sort((a, b) => {
        if (!termo) return 0;
        const qV = termo.replace(/[^\d,]/g, "");
        const score = (l: { descricao: string | null; valor: number }) => {
          let s = 0;
          if (qV.replace(/\D/g, "").length >= 2) {
            const vv = Number(l.valor || 0).toFixed(2).replace(".", ",");
            if (vv === qV) s += 3;
            else if (vv.includes(qV)) s += 2;
          }
          const d = (l.descricao ?? "").toLowerCase();
          if (d.startsWith(termo)) s += 2;
          else if (d.includes(termo)) s += 1;
          return s;
        };
        return score(b) - score(a);
      })
      .slice(0, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, q, periodo, contaF, catF, contatoF, centroF, sitF, tipoF]);
  const padrao = janelaPadrao(tx.data_transacao);
  const periodoMudou = periodo.from?.getTime() !== padrao.from?.getTime() || periodo.to?.getTime() !== padrao.to?.getTime();
  const temFiltro = q.trim() !== "" || periodoMudou || contaF !== "todas" || catF !== "todas" || contatoF !== "todas" || centroF !== "todas" || sitF !== "todas" || extras.length > 0;
  const limparFiltros = () => { setQ(""); setPeriodo(janelaPadrao(tx.data_transacao)); setContaF("todas"); setCatF("todas"); setContatoF("todas"); setCentroF("todas"); setSitF("todas"); setExtras([]); };
  const alternarExtra = (k: string) => setExtras((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const escolhidos = (lancamentos ?? []).filter((l) => selIds.includes(l.id));
  const todosVisiveisMarcados = filtrados.length > 0 && filtrados.every((l) => selIds.includes(l.id));
  const alternarTodosVisiveis = () => setSelIds((prev) => (todosVisiveisMarcados ? prev.filter((id) => !filtrados.some((l) => l.id === id)) : [...prev, ...filtrados.map((l) => l.id).filter((id) => !prev.includes(id))]));
  const vBanco = Math.abs(Number(tx.valor) || 0);
  const vSel = escolhidos.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const dif = Math.round((vBanco - vSel) * 100) / 100;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
        <DialogHeader className="shrink-0">
          <DialogTitle>Escolha os lançamentos para conciliar com o valor do banco</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-primary/[0.04] p-3">
            {logoBanco ? (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-border">
                <img src={logoBanco} alt="" className="h-7 w-7 object-contain" />
              </div>
            ) : (
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary text-lg font-bold text-primary-foreground">B</div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {Number(tx.valor) >= 0 ? "Recebimento" : "Pagamento"} importado de {brl(vBanco)}
              </div>
              <div className="text-xs text-muted-foreground">
                Data do lançamento no extrato: <strong className="text-foreground">{tx.data_transacao ? new Date(`${tx.data_transacao}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</strong>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                Descrição: <strong className="text-foreground">{tx.memo || "—"}</strong>
              </div>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-6">
            <div className="md:col-span-2 min-w-0">
              <span className="text-xs text-muted-foreground">Período de vencimento</span>
              <PeriodoFilter value={periodo} onChange={setPeriodo} className="flex w-full min-w-0" triggerClassName="min-w-0 flex-1 px-2" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Pesquisar</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8 h-8 text-[13px]" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Conta</span>
              <Select value={contaF} onValueChange={setContaF}>
                <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {(contasBusca ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Tipo</span>
              {tipoF === "todos" ? (
                <Select value={tipoF} onValueChange={(v) => setTipoF(v as "receber" | "pagar" | "todos")}>
                  <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receber">Recebimentos, Transferência de entrada</SelectItem>
                    <SelectItem value="pagar">Pagamentos, Transferência de saída</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <button
                  onClick={() => setTipoF("todos")}
                  title="Mostrar todos os tipos"
                  className="flex h-8 w-full items-center justify-between gap-1 rounded-md border bg-muted/40 px-2 text-left text-xs"
                >
                  <span className="truncate">
                    Tipo de lançamento: {tipoF === "receber" ? "Recebimentos, Transferência de entrada" : "Pagamentos, Transferência de saída"}
                  </span>
                  <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Mais filtros</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs w-full">
                    Mais filtros <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {[
                    { k: "categoria", label: "Categoria" },
                    { k: "contato", label: "Cliente/Fornecedor" },
                    { k: "centro", label: "Centro de custo" },
                    { k: "situacao", label: "Situação" },
                  ].map((o) => (
                    <DropdownMenuItem key={o.k} onClick={() => alternarExtra(o.k)}>
                      <Check className={cn("mr-2 h-3.5 w-3.5", extras.includes(o.k) ? "opacity-100" : "opacity-0")} />
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {extras.length > 0 && (
            <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
              {extras.includes("categoria") && (
                <div>
                  <span className="text-xs text-muted-foreground">Categoria</span>
                  <Select value={catF} onValueChange={setCatF}>
                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas categorias</SelectItem>
                      {(catsBusca ?? []).filter((c) => tipoF === "todos" || c.tipo === tipoF).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {extras.includes("contato") && (
                <div>
                  <span className="text-xs text-muted-foreground">Cliente/Fornecedor</span>
                  <Select value={contatoF} onValueChange={setContatoF}>
                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todos</SelectItem>
                      {(contatos ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {extras.includes("centro") && (
                <div>
                  <span className="text-xs text-muted-foreground">Centro de custo</span>
                  <Select value={centroF} onValueChange={setCentroF}>
                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todos</SelectItem>
                      {(centros ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {extras.includes("situacao") && (
                <div>
                  <span className="text-xs text-muted-foreground">Situação</span>
                  <Select value={sitF} onValueChange={setSitF}>
                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="aberto">Em aberto</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="parcial">Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {temFiltro && (
            <div className="shrink-0">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={limparFiltros}>
                <Trash2 className="mr-1 h-3 w-3" />Limpar filtros
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {filtrados.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={Search} title="Nenhum resultado encontrado" description="Selecione outros filtros para refazer sua busca." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={todosVisiveisMarcados} onCheckedChange={alternarTodosVisiveis} aria-label="Selecionar todos visíveis" />
                    </TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Valor (R$)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => alternarId(l.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selIds.includes(l.id)} onCheckedChange={() => alternarId(l.id)} aria-label="Selecionar lançamento" />
                      </TableCell>
                      <TableCell className="text-tabular whitespace-nowrap">
                        {l.data_vencimento ? new Date(`${l.data_vencimento}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">{l.descricao || "—"}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground">{nomeConta(l.conta_bancaria_id)}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{l.status}</span>
                      </TableCell>
                      <TableCell className="text-right text-tabular font-medium">{brl(Number(l.valor))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-t pt-2 text-sm">
            <div className="text-left">
              <span className="text-[11px] text-muted-foreground">Selecionados </span>
              <span className="text-tabular font-bold">{selIds.length}</span>
            </div>
            <div className="ml-auto text-right">
              <span className="text-[11px] text-muted-foreground">Valor do banco </span>
              <span className="text-tabular font-bold">{brl(vBanco)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground">Selecionado </span>
              <span className="text-tabular font-bold text-primary">{brl(vSel)}</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground">Diferença </span>
              <span className={`text-tabular font-bold ${dif === 0 && selIds.length ? "text-success" : "text-amber-600 dark:text-amber-400"}`}>{brl(dif)}</span>
            </div>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={!selIds.length} onClick={() => onConfirm(selIds)}>
              <Check className="mr-1 h-4 w-4" />Conciliar{selIds.length > 1 ? ` (${selIds.length})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ReconcileRow = memo(function ReconcileRow({
  tx, r, modoBusca, selected, categorias, contatos, centros, lancamentosAbertos,
  conciliando, excluindo, onToggleSel, onSetRow, onSetModoBusca, onConciliar, onConciliarTransf, contasTransf, contaAtualId, onConciliarVarios, onNovaCategoria, onExcluir, empresaId, logoBanco,
}: {
  tx: OfxRow;
  r: RowState;
  modoBusca: boolean;
  selected: boolean;
  categorias: Opcao[];
  contatos: Opcao[];
  centros: Opcao[];
  lancamentosAbertos: LancOpt[];
  conciliando: boolean;
  excluindo: boolean;
  onToggleSel: (id: string) => void;
  onSetRow: (id: string, patch: Partial<RowState>) => void;
  onSetModoBusca: (id: string, v: boolean) => void;
  onConciliar: (tx: OfxRow, r: RowState) => void;
  onConciliarTransf: (tx: OfxRow, r: RowState) => void;
  contasTransf: { id: string; nome: string | null; banco: string | null }[];
  contaAtualId: string;
  onConciliarVarios: (tx: OfxRow, ids: string[]) => void;
  onNovaCategoria: (txId: string) => void;
  onExcluir: (id: string) => void;
  empresaId: string | null;
  logoBanco?: string | null;
}) {
  const data = new Date(tx.data_transacao + "T00:00:00");
  const nomeContato = r.contato_id ? (contatos.find((c) => c.id === r.contato_id)?.nome ?? "—") : "Informação não recebida";
  const [buscaOpen, setBuscaOpen] = useState(false);
  const [novoContatoOpen, setNovoContatoOpen] = useState(false);
  const [contatoBusca, setContatoBusca] = useState("");
  const lancSel = lancamentosAbertos.find((l) => l.id === r.lancamento_id);
  // Sugestão do sistema (mesmo valor e data; na falta, o mais próximo em ±3 dias)
  const sugestao = useMemo(() => sugerirLancamento(tx, lancamentosAbertos ?? []), [lancamentosAbertos, tx.valor, tx.data_transacao]);
  const [ignorado, setIgnorado] = useState(false);
  const mostraSugestao = !!sugestao && !r.lancamento_id && !ignorado;
  // Enter em qualquer campo do cartão aciona o Conciliar da linha (form + submit).
  const enviandoRef = useRef(false);
  useEffect(() => { if (!conciliando) enviandoRef.current = false; }, [conciliando]);
  const submeter = () => {
    if (conciliando || enviandoRef.current) return;
    enviandoRef.current = true;
    if (mostraSugestao && sugestao) { onConciliar(tx, { ...r, lancamento_id: sugestao.id }); return; }
    if (r.modo === "transferencia" && !r.lancamento_id) { onConciliarTransf(tx, r); return; }
    onConciliar(tx, r);
  };
  const sugestaoContato = sugestao?.contato_id ? (contatos.find((c) => c.id === sugestao.contato_id)?.nome ?? "—") : "Informação não recebida";
  const sugestaoCategoria = sugestao?.categoria_id ? (categorias.find((c) => c.id === sugestao.categoria_id)?.nome ?? "—") : "—";
  const sugestaoData = sugestao ? new Date(`${sugestao.data_vencimento}T00:00:00`) : null;

  return (
    <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
      {/* banco */}
      <Card className={cn("overflow-hidden", mostraSugestao && "border-t-[3px] border-t-success")}>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <Checkbox checked={selected} onCheckedChange={() => onToggleSel(tx.id)} />
            <span className="text-[13px] font-semibold">{format(data, "dd/MM/yyyy")}</span>
            <span className="text-[11px] text-muted-foreground capitalize">{format(data, "EEEE", { locale: ptBR })}</span>
          </div>
          <span className={cn("text-tabular text-sm font-semibold", tx.valor < 0 ? "text-destructive" : "text-success")}>
            {brl(tx.valor)}
          </span>
        </div>
        <div className="space-y-0.5 px-3 py-2 text-[13px]">
          <div className="font-medium">{tx.memo ?? "—"}</div>
          <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Cliente:</span> {nomeContato}</div>
          <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">CPF/CNPJ:</span> Informação não recebida</div>
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5">
          <Badge variant="secondary" className="text-[11px]">Integração manual</Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onExcluir(tx.id)} disabled={excluindo}>
            <Trash2 className="mr-1 h-3 w-3" />Excluir
          </Button>
        </div>
      </Card>

      <form onSubmit={(e) => { e.preventDefault(); submeter(); }} className="contents">
      <div className="flex flex-col items-center justify-center gap-2 py-1">
        {mostraSugestao && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success shadow-sm">
            Encontramos <Sparkles className="h-3 w-3" />
          </span>
        )}
        <Button
          size="sm" type="submit" disabled={conciliando || (r.modo === "transferencia" && !mostraSugestao && !r.lancamento_id && !r.conta_destino_id)}
        >
          {conciliando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
          Conciliar
        </Button>
      </div>

      {/* sistema */}
      <Card className={cn("overflow-hidden", (mostraSugestao || (r.lancamento_id && lancSel)) && "border-t-[3px] border-t-success")}>
        <BuscarLancamentoDialog
          open={buscaOpen}
          onClose={() => setBuscaOpen(false)}
          tx={tx}
          lancamentos={lancamentosAbertos}
          value={r.lancamento_id}
          onConfirm={(ids) => {
            if (ids.length === 1) onSetRow(tx.id, { lancamento_id: ids[0] });
            else if (ids.length > 1) onConciliarVarios(tx, ids);
            setBuscaOpen(false);
          }}
          empresaId={empresaId}
          logoBanco={logoBanco}
          contatos={contatos}
          centros={centros}
        />
        {mostraSugestao && sugestao && sugestaoData ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className={cn("text-tabular text-sm font-semibold", tx.valor < 0 ? "text-destructive" : "text-success")}>
                {brl(Number(sugestao.valor))}
              </span>
              <span className="text-xs">
                <span className="font-semibold">{format(sugestaoData, "dd/MM/yyyy")}</span>{" "}
                <span className="text-muted-foreground capitalize">{format(sugestaoData, "EEEE", { locale: ptBR })}</span>
              </span>
            </div>
            <div className="space-y-0.5 px-3 py-2 text-[13px]">
              <div className="font-medium">{sugestao.descricao}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{tx.valor >= 0 ? "Cliente" : "Fornecedor"}:</span> {sugestaoContato}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Categoria:</span> {sugestaoCategoria}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-1.5">
              <Badge variant="secondary" className="text-[11px]">Sugestão do sistema</Badge>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" type="button" className="h-7 text-xs" onClick={() => setBuscaOpen(true)}>
                  Editar
                </Button>
                <Button size="sm" variant="outline" type="button" className="h-7 text-xs" onClick={() => setIgnorado(true)}>
                  Desvincular
                </Button>
              </div>
            </div>
          </>
        ) : r.lancamento_id && lancSel ? (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className={cn("text-tabular text-sm font-semibold", tx.valor < 0 ? "text-destructive" : "text-success")}>
              {brl(Number(lancSel.valor))}
            </span>
            <span className="text-xs">
              <span className="font-semibold">{format(new Date(`${lancSel.data_vencimento}T00:00:00`), "dd/MM/yyyy")}</span>{" "}
              <span className="text-muted-foreground capitalize">{format(new Date(`${lancSel.data_vencimento}T00:00:00`), "EEEE", { locale: ptBR })}</span>
            </span>
          </div>
          <div className="space-y-0.5 px-3 py-2 text-[13px]">
            <div className="font-medium">{lancSel.descricao}</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{tx.valor >= 0 ? "Cliente" : "Fornecedor"}:</span>{" "}
              {lancSel.contato_id ? (contatos.find((c) => c.id === lancSel.contato_id)?.nome ?? "—") : "Não informado"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Categoria:</span>{" "}
              {lancSel.categoria_id ? (categorias.find((c) => c.id === lancSel.categoria_id)?.nome ?? "—") : "—"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-1.5">
            <Badge variant="secondary" className="text-[11px]">Vinculado</Badge>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" type="button" className="h-7 text-xs" onClick={() => setBuscaOpen(true)}>
                Editar
              </Button>
              <Button size="sm" variant="outline" type="button" className="h-7 text-xs" onClick={() => onSetRow(tx.id, { lancamento_id: "" })}>
                Desvincular
              </Button>
            </div>
          </div>
        </>
        ) : (
        <>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(["lancamento", "transferencia"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSetRow(tx.id, { modo: m })}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs transition-colors",
                  r.modo === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "lancamento" ? "Novo lançamento" : "Transferência"}
              </button>
            ))}
          </div>
          {r.modo === "lancamento" && (
            <Button size="sm" variant="outline" type="button" onClick={() => setBuscaOpen(true)}>
              <Search className="mr-1 h-3 w-3" />Buscar lançamento
            </Button>
          )}
        </div>
        {r.modo === "transferencia" ? (
          <div className="px-3 py-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Descrição <span className="text-destructive">*</span></Label>
                <Input value={r.descricao} onChange={(e) => onSetRow(tx.id, { descricao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tx.valor < 0 ? "Conta de destino *" : "Conta de origem *"}</Label>
                <Combobox
                  value={r.conta_destino_id}
                  onChange={(v) => onSetRow(tx.id, { conta_destino_id: v })}
                  options={(contasTransf ?? []).filter((c) => c.id !== contaAtualId).map((c) => ({ value: c.id, label: c.nome || c.banco || "Conta" }))}
                  emptyText="Nenhuma outra conta."
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Cria a transferência entre as contas e quita a perna desta conta; a outra perna segue em aberto.
            </p>
          </div>
        ) : (
          <div className="px-3 py-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Descrição <span className="text-destructive">*</span></Label>
                <Input value={r.descricao} onChange={(e) => onSetRow(tx.id, { descricao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria <span className="text-destructive">*</span></Label>
                <Combobox value={r.categoria_id} onChange={(v) => onSetRow(tx.id, { categoria_id: v })} options={categorias.map((c) => ({ value: c.id, label: c.nome }))} emptyText="Nenhum item encontrado." allowClear footer={{ label: "Nova categoria", onClick: () => onNovaCategoria(tx.id) }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tx.valor >= 0 ? "Cliente" : "Fornecedor"}</Label>
                <Combobox value={r.contato_id} onChange={(v) => onSetRow(tx.id, { contato_id: v })} options={contatos.map((c) => ({ value: c.id, label: c.nome }))} emptyText="Nenhum item encontrado." allowClear onSearchChange={setContatoBusca} footer={{ label: "Novo contato", onClick: () => setNovoContatoOpen(true) }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Centro de custo</Label>
                <Combobox value={r.centro_custo_id} onChange={(v) => onSetRow(tx.id, { centro_custo_id: v })} options={centros.map((c) => ({ value: c.id, label: c.nome }))} emptyText="Nenhum item encontrado." allowClear />
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </Card>
      </form>
      <NovoContatoDialog
        empresaId={empresaId ?? undefined}
        tipoFixo={tx.valor >= 0 ? "cliente" : "fornecedor"}
        open={novoContatoOpen}
        onOpenChange={setNovoContatoOpen}
        nomeInicial={contatoBusca}
        onCriado={(c) => onSetRow(tx.id, { contato_id: c.id })}
      />
    </div>
  );
});



type LancOpt = { id: string; descricao: string; valor: number; tipo: string; status: string; data_vencimento: string; conta_bancaria_id?: string | null; categoria_id?: string | null; contato_id?: string | null; centro_custo_id?: string | null };
