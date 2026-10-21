import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { PrimaryButton } from "@/components/erp/primary-button";
import { Pagination } from "@/components/erp/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/erp/combobox";
import { NovoContatoDialog } from "@/components/erp/novo-contato-dialog";
import { TransferenciaDialog } from "@/components/erp/transferencia-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2,
  Plus,
  TrendingUp,
  Trash2,
  Check,
  RotateCcw,
  Ban,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Pencil,
  ArrowLeftRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listarContatosFinanceiros, nomesContatosFinanceiros } from "@/lib/financeiro-contatos";
import { ALTURA_PAGINA } from "@/lib/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
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
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LancamentosToolbar } from "@/components/erp/lancamentos-toolbar";
import { SearchField } from "@/components/erp/search-field";
import { StatusBadge } from "@/components/erp/status-badge";
import { AuditDialog } from "@/components/erp/audit-dialog";
import { DateInput } from "@/components/erp/date-input";
import { PeriodoFilter, periodoProx7, type Periodo } from "@/components/erp/periodo-filter";
import { RouteErrorState } from "@/components/erp/route-error-state";
import { usePerfisMap } from "@/hooks/use-perfis";

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <LancamentosPage tipo="receber" />,
  errorComponent: RouteErrorState
});

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  status: string;
  data_vencimento: string;
  created_at: string;
  created_by: string | null;
  contato: { nome: string } | null;
  categoria_id: string | null;
};

// Rótulo da conta sem duplicar quando nome e banco são iguais ("Bradesco — Bradesco").
const rotuloConta = (c: { nome?: string | null; banco?: string | null }) => {
  const nome = (c.nome ?? "").trim();
  const banco = (c.banco ?? "").trim();
  if (!banco || banco.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR")) return nome;
  return `${nome} — ${banco}`;
};

const FORMAS_PAGAMENTO = [
  "Boleto",
  "Cartão de crédito",
  "Cartão de débito",
  "Cheque",
  "Dinheiro",
  "Duplicata",
  "Pix",
  "Transferência",
  "Outros",
] as const;

const emptyForm = () => ({
  descricao: "",
  valor: "",
  data_emissao: format(new Date(), "yyyy-MM-dd"),
  data_vencimento: format(new Date(), "yyyy-MM-dd"),
  contato_id: "",
  categoria_id: "",
  conta_bancaria_id: "",
  documento: "",
  observacoes: "",
  forma_pagamento: "",
  created_by: null as string | null,
  created_at: "",
});

export function LancamentosPage({ tipo }: { tipo: "receber" | "pagar" }) {
  const { data: empresa } = useEmpresaAtual();
  const perfis = usePerfisMap(!!empresa);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lancamentoBloqueado, setLancamentoBloqueado] = useState<{
    id: string;
    descricao: string;
  } | null>(null);
  const [confLote, setConfLote] = useState(false);
  const [novoContatoOpen, setNovoContatoOpen] = useState(false);
  const [novoContatoAlvo, setNovoContatoAlvo] = useState<"form" | "edit">("form");
  const abrirNovoContato = (alvo: "form" | "edit") => {
    setNovoContatoAlvo(alvo);
    setNovoContatoOpen(true);
  };
  const [confExclusao, setConfExclusao] = useState<string | null>(null);

  const listKey = ["lancamentos", empresa?.id, tipo] as const;

  const { data: lancamentos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: listKey,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<Lancamento[]> => {
      // Pernas de transferência (transferencia_id) vivem na página de
      // Transferências + conciliação — fora desta lista.
      // Busca em páginas de 1000 para nunca cortar a lista (o período filtra depois)
      const todas: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("lancamentos_financeiros")
          .select(
            "id,descricao,valor,status,data_vencimento,created_at,created_by,contato_id,categoria_id",
          )
          .eq("empresa_id", empresa!.id)
          .eq("tipo", tipo)
          .is("transferencia_id", null)
          .order("data_vencimento", { ascending: true })
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todas.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      // O contato do lançamento é cliente OU fornecedor (tabelas separadas por módulo).
      const nomes = await nomesContatosFinanceiros(
        todas.map((l) => String((l as any)?.contato_id || "")),
      );
      return todas.map((l) => ({
        ...(l as any),
        contato: { nome: nomes[String((l as any)?.contato_id || "")] || null },
      })) as unknown as Lancamento[];
    },
  });

  const { data: contatosOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-opt", empresa?.id, tipo] as const,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      // O contador do financeiro pode ser cliente, fornecedor ou transportadora
      // (cada modulo tem sua tabela).
      return listarContatosFinanceiros(empresa!.id, 1000);
    },
  });

  const { data: contasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-opt", empresa?.id] as const,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id,nome,banco,padrao")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const contaPadraoId = ((contasOpt ?? []) as any[]).find((c) => c.padrao)?.id as string | undefined;

  const { data: categoriasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-opt", empresa?.id, tipo] as const,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias_financeiras")
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", tipo)
        .order("nome")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["fluxo"] });
    qc.invalidateQueries({ queryKey: ["folha"] });
  };

  // Auditoria (tabela auditoria_eventos): quem criou/editou/excluiu
  const [trilhaOpen, setTrilhaOpen] = useState(false);
  const [transfOpen, setTransfOpen] = useState(false);
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
        entidade: "lancamento_financeiro",
        detalhes: { ...detalhes, descricao, user_nome: nome, user_email: u.email || "", tipo },
      } as any);
    } catch { /* trilha indisponível: não bloqueia o fluxo */ }
  };
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-lancamentos", empresa?.id, tipo],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "financeiro")
        .eq("entidade", "lancamento_financeiro")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // useMutation dá: guard de in-flight (impede double-submit / double-click),
  // rollback em erro e centralização do invalidateQueries.
  const criar = useMutation({
    mutationFn: async (input: typeof form) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const valor = Number(input.valor);
      if (!(valor > 0)) throw new Error("Valor deve ser maior que zero");
      if (!input.descricao.trim()) throw new Error("Informe a descrição");
      if (!input.data_emissao) throw new Error("Informe a competência");
      if (!input.contato_id) throw new Error(tipo === "receber" ? "Selecione o cliente" : "Selecione o fornecedor");
      if (!input.categoria_id) throw new Error("Selecione a categoria");
      const { error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresa.id,
        tipo,
        descricao: input.descricao,
        valor,
        data_emissao: input.data_emissao,
        data_vencimento: input.data_vencimento || input.data_emissao,
        contato_id: input.contato_id || null,
        categoria_id: input.categoria_id || null,
        conta_bancaria_id: input.conta_bancaria_id || null,
        documento: input.documento || null,
        observacoes: input.observacoes || null,
        forma_pagamento: input.forma_pagamento || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      toast.success("Lançamento criado");
      void registrarAuditoria("criar", `Lançamento "${input.descricao}" criado`, { descricao: input.descricao, valor: input.valor });
      setOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guard `status = 'aberto'` na UPDATE evita marcar duas vezes o mesmo título
  // se dois usuários clicarem simultaneamente (defensa além da RLS).
  const marcarPago = useMutation({
    mutationFn: async (l: Pick<Lancamento, "id" | "valor">) => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          status: "pago",
          valor_pago: l.valor,
          data_pagamento: format(new Date(), "yyyy-MM-dd"),
        })
        .eq("id", l.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Já foi baixado por outro usuário");
    },
    onSuccess: (_d, l) => {
      void registrarAuditoria("alterar", `Lançamento marcado como pago`, { lancamento_id: l.id });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // allIds calculado depois dos filtros (mais abaixo, via `filtrados`)
  const clearSel = () => setSelected(new Set());

  // Tecla Delete abre a mesma confirmação do botão Excluir em lote.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setConfLote(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  // Lotes de 100 ids: URL longa demais dá Bad Request no PostgREST
  const emLotes = async (ids: string[], fn: (lote: string[]) => PromiseLike<unknown>) => {
    for (let i = 0; i < ids.length; i += 100) {
      await fn(ids.slice(i, i + 100));
    }
  };

  const excluirLote = useMutation({
    mutationFn: async (ids: string[]) => {
      // Desvincula parcelas de notas importadas antes de excluir
      await emLotes(ids, (lote) => supabase
        .from("notas_importadas_parcelas" as never)
        .update({ lancamento_id: null } as never)
        .in("lancamento_id", lote)
        .then((r) => { if (r.error) throw r.error; }));
      // Desvincula folhas vinculadas (fallback se trigger não disparar via client)
      await emLotes(ids, (lote) => supabase
        .from("folha_pagamento" as never)
        .update({ status: "aberta", lancamento_id: null, data_pagamento: null } as never)
        .in("lancamento_id", lote)
        .then((r) => { if (r.error) throw r.error; }));
      // Desvincula das transações OFX antes de excluir — a transação bancária
      // volta para "aberto" (podendo ser reconciliada novamente), mas não é apagada.
      await emLotes(ids, async (lote) => {
        const { error: eOfx } = await supabase
          .from("ofx_transacoes")
          .update({ status: "aberto", lancamento_id: null })
          .in("lancamento_id", lote);
        if (eOfx) throw eOfx;
      });
      await emLotes(ids, async (lote) => {
        const { error } = await supabase.from("lancamentos_financeiros").delete().in("id", lote);
        if (error) throw error;
      });
    },
    onSuccess: (_d, ids) => {
      toast.success("Lançamentos excluídos");
      void registrarAuditoria("excluir", `${ids.length} lançamento(s) excluído(s)`, { qtd: ids.length });
      clearSel();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarStatusLote = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: "aberto" | "pago" | "cancelado" | "vencido" | "parcial";
    }) => {
      const patch =
        status === "pago"
          ? { status, data_pagamento: format(new Date(), "yyyy-MM-dd") }
          : { status };
      await emLotes(ids, async (lote) => {
        const { error } = await supabase.from("lancamentos_financeiros").update(patch).in("id", lote);
        if (error) throw error;
      });
      // Reabrir/cancelar desfaz a conciliação: o extrato volta a "aberto"
      // (senão o movimento segue "Conciliada" nas Movimentações).
      if (status !== "pago") {
        await emLotes(ids, async (lote) => {
          const { error: eOfx } = await supabase
            .from("ofx_transacoes")
            .update({ status: "aberto", lancamento_id: null })
            .in("lancamento_id", lote);
          if (eOfx) throw eOfx;
        });
      }
    },
    onSuccess: (_d, vars) => {
      toast.success("Status alterado");
      void registrarAuditoria("alterar", `Status alterado para ${vars.status} (${vars.ids.length})`, { status: vars.status, qtd: vars.ids.length });
      clearSel();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Edição
  const [editing, setEditing] = useState<null | ({ id: string } & ReturnType<typeof emptyForm>)>(
    null,
  );
  const abrirEdicao = async (id: string) => {
    const { data, error } = await supabase
      .from("lancamentos_financeiros")
      .select(
        "id,descricao,valor,data_emissao,data_vencimento,contato_id,categoria_id,conta_bancaria_id,documento,observacoes,forma_pagamento,created_by,created_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Não encontrado");
      return;
    }
    setEditing({
      id: data.id,
      descricao: data.descricao ?? "",
      valor: String(data.valor ?? ""),
      data_emissao: data.data_emissao ?? format(new Date(), "yyyy-MM-dd"),
      data_vencimento: data.data_vencimento ?? format(new Date(), "yyyy-MM-dd"),
      contato_id: data.contato_id ?? "",
      categoria_id: data.categoria_id ?? "",
      conta_bancaria_id: data.conta_bancaria_id ?? "",
      documento: data.documento ?? "",
      observacoes: data.observacoes ?? "",
      forma_pagamento: (data as { forma_pagamento?: string | null }).forma_pagamento ?? "",
      created_by: (data as { created_by?: string | null }).created_by ?? null,
      created_at: (data as { created_at?: string | null }).created_at ?? "",
    });
  };
  const salvarEdicao = useMutation({
    mutationFn: async (input: NonNullable<typeof editing>) => {
      const valor = Number(input.valor);
      if (!(valor > 0)) throw new Error("Valor deve ser maior que zero");
      if (!input.descricao.trim()) throw new Error("Informe a descrição");
      if (!input.data_emissao) throw new Error("Informe a competência");
      if (!input.contato_id) throw new Error(tipo === "receber" ? "Selecione o cliente" : "Selecione o fornecedor");
      if (!input.categoria_id) throw new Error("Selecione a categoria");
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          descricao: input.descricao,
          valor,
          data_emissao: input.data_emissao,
          data_vencimento: input.data_vencimento || input.data_emissao,
          contato_id: input.contato_id || null,
          categoria_id: input.categoria_id || null,
          conta_bancaria_id: input.conta_bancaria_id || null,
          documento: input.documento || null,
          observacoes: input.observacoes || null,
          forma_pagamento: input.forma_pagamento || null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      toast.success("Lançamento atualizado");
      void registrarAuditoria("alterar", `Lançamento "${input.descricao}" alterado`, { lancamento_id: input.id });
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Ordenação
  type SortKey = "descricao" | "contato" | "data_vencimento" | "valor" | "status";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "data_vencimento",
    dir: "asc",
  });
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const sorted = [...(lancamentos ?? [])].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const va =
      sort.key === "contato"
        ? (a.contato?.nome ?? "")
        : (a as unknown as Record<string, unknown>)[sort.key];
    const vb =
      sort.key === "contato"
        ? (b.contato?.nome ?? "")
        : (b as unknown as Record<string, unknown>)[sort.key];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
  });
  const SortHead = ({
    k,
    children,
    className,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {children}
        {sort.key !== k ? (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        ) : sort.dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )}
      </button>
    </TableHead>
  );

  // Filtro de período (aplicado sobre data_vencimento)
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoProx7());
  const dentroPeriodo = (dataStr: string) => {
    if (!periodo.from || !periodo.to) return true;
    const d = new Date(dataStr + "T12:00:00");
    return d >= periodo.from && d <= periodo.to;
  };
  const noPeriodo = sorted.filter((l) => dentroPeriodo(l.data_vencimento));

  // Aba: Vencidos (aberto/parcial e vencimento < hoje) | A vencer (aberto/parcial e vencimento >= hoje) | Quitados (pago, vencimento < hoje)
  type Aba = "todos" | "vencidos" | "avencer" | "quitados" | "cancelados";
  const [aba, setAba] = useState<Aba>("todos");
  const hojeStr = format(new Date(), "yyyy-MM-dd");
  const emAberto = (s: string) => s === "aberto" || s === "parcial" || s === "vencido";
  const filtroAba = (l: Lancamento) => {
    if (aba === "todos") return l.status !== "cancelado";
    if (aba === "vencidos") return emAberto(l.status) && l.data_vencimento < hojeStr;
    if (aba === "avencer") return emAberto(l.status) && l.data_vencimento >= hojeStr;
    if (aba === "cancelados") return l.status === "cancelado";
    return l.status === "pago";
  };
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const buscaNorm = busca.trim().toLowerCase();
  const buscaDig = buscaNorm.replace(/\D/g, "");
  const aplicaBusca = (l: Lancamento) => {
    if (!buscaNorm) return true;
    if (l.descricao.toLowerCase().includes(buscaNorm)) return true;
    if ((l.contato?.nome ?? "").toLowerCase().includes(buscaNorm)) return true;
    // Pesquisa por valor: "25,00" acha 25.00 (só a partir de 2 dígitos p/ "0" não casar tudo)
    if (buscaDig.length >= 2) {
      const valorDig = Number(l.valor || 0)
        .toFixed(2)
        .replace(/\D/g, "");
      if (valorDig.includes(buscaDig)) return true;
    }
    return false;
  };
  // Pernas de transferência aparecem SOMENTE na busca (lista continua limpa)
  const { data: pernasBusca } = useQuery({
    enabled: !!empresa && buscaNorm.length > 0,
    queryKey: ["lancamentos-pernas", empresa?.id, tipo] as const,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<Lancamento[]> => {
      const todas: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("lancamentos_financeiros")
          .select(
            "id,descricao,valor,status,data_vencimento,created_at,created_by,contato_id,categoria_id",
          )
          .eq("empresa_id", empresa!.id)
          .eq("tipo", tipo)
          .not("transferencia_id", "is", null)
          .order("data_vencimento", { ascending: true })
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todas.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const nomes = await nomesContatosFinanceiros(
        todas.map((l) => String((l as any)?.contato_id || "")),
      );
      return todas.map((l) => ({
        ...(l as any),
        contato: { nome: nomes[String((l as any)?.contato_id || "")] || null },
      })) as unknown as Lancamento[];
    },
  });
  const pernasNoPeriodo = buscaNorm
    ? (pernasBusca ?? []).filter((l) => dentroPeriodo(l.data_vencimento))
    : [];
  const base = [...noPeriodo, ...pernasNoPeriodo];
  const filtrados = base.filter(filtroAba).filter(aplicaBusca);
  const [pageSize, setPageSize] = useState(10);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const lancamentosVisiveis = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const cont = {
    todos: base.filter((l) => l.status !== "cancelado").filter(aplicaBusca).length,
    vencidos: base
      .filter((l) => emAberto(l.status) && l.data_vencimento < hojeStr)
      .filter(aplicaBusca).length,
    avencer: base
      .filter((l) => emAberto(l.status) && l.data_vencimento >= hojeStr)
      .filter(aplicaBusca).length,
    quitados: base.filter((l) => l.status === "pago").filter(aplicaBusca).length,
    cancelados: base.filter((l) => l.status === "cancelado").filter(aplicaBusca).length,
  };
  const abaLabelQuitado = tipo === "receber" ? "Recebidos" : "Pagos";

  const allIds = lancamentosVisiveis.map((l) => l.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleAll = () => {
    if (allChecked) {
      setSelected((s) => {
        const n = new Set(s);
        allIds.forEach((id) => n.delete(id));
        return n;
      });
    } else {
      setSelected((s) => new Set([...s, ...allIds]));
    }
  };

  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const desc =
    tipo === "receber"
      ? "Recebimentos futuros e realizados."
      : "Compromissos financeiros a vencer e pagos.";

  return (
    <div className={ALTURA_PAGINA}>
      <PageHeader
        eyebrow="Financeiro"
        title={titulo}
        description={desc}
      />

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2.5 sm:mb-6 lg:flex-nowrap">
        <div className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-0.5 whitespace-nowrap rounded-xl border bg-muted/30 p-1.5 text-[13px] shadow-sm">
          {(
            [
              { k: "todos", nome: "Todos", n: cont.todos },
              { k: "vencidos", nome: "Vencidos", n: cont.vencidos },
              { k: "avencer", nome: "A vencer", n: cont.avencer },
              { k: "quitados", nome: abaLabelQuitado, n: cont.quitados },
              { k: "cancelados", nome: "Cancelados", n: cont.cancelados },
            ] as { k: Aba; nome: string; n: number }[]
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => {
                setAba(t.k);
                setPagina(1);
                clearSel();
              }}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-all ${aba === t.k ? "bg-background shadow-md font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.nome} <span className="inline-block w-[46px] text-left tabular-nums">({t.n})</span>
            </button>
          ))}
        </div>
        <div className="shrink-0">
          <PeriodoFilter
            value={periodo}
            onChange={(p) => {
              setPeriodo(p);
              clearSel();
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
          <Button variant="ghost" size="sm" onClick={() => setTrilhaOpen(true)} className="h-9 rounded-xl px-4 active:scale-95">
            Auditoria
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="h-9 rounded-xl px-4 shadow-sm active:scale-95">
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />Transferir
          </Button>
          <TransferenciaDialog open={transfOpen} onOpenChange={setTransfOpen} />
          <Dialog
            open={open}
            onOpenChange={(v) => {
              if (criar.isPending) return;
              if (v && !form.conta_bancaria_id && contaPadraoId) {
                setForm((f) => (f.conta_bancaria_id ? f : { ...f, conta_bancaria_id: contaPadraoId }));
              }
              setOpen(v);
            }}
          >
            <DialogTrigger asChild>
              <PrimaryButton size="xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo lançamento
              </PrimaryButton>
            </DialogTrigger>
            <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
              <DialogHeader className="gap-1.5 pb-1">
                <DialogTitle className="tracking-tight">Novo lançamento — {titulo}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  criar.mutate(form);
                }}
                className="space-y-4"
              >
                <div className="grid gap-1.5">
                  <Label>Descrição *</Label>
                  <Input
                    required
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Valor (R$) *</Label>
                    <MoneyInput
                      required
                      value={form.valor}
                      onChange={(v) => setForm({ ...form, valor: v })}
                      prefix=""
                      className="h-10"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Competência *</Label>
                    <DateInput
                      required
                      value={form.data_emissao}
                      onChange={(v) => setForm({ ...form, data_emissao: v })}
                      className="h-10"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Vencimento</Label>
                    <DateInput
                      value={form.data_vencimento}
                      onChange={(v) => setForm({ ...form, data_vencimento: v })}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>{tipo === "receber" ? "Cliente *" : "Fornecedor *"}</Label>
                  <Combobox
                    value={form.contato_id}
                    onChange={(v) => setForm({ ...form, contato_id: v })}
                    options={(contatosOpt ?? []).map((c) => ({ value: c.id, label: c.nome ?? "", busca: (c as { documento?: string | null }).documento ?? "", detalhe: (c as { documento?: string | null }).documento ?? "" }))}
                   
                   
                    emptyText="Nenhum item encontrado."
                    className="h-10"
                    footer={{ label: "Novo contato", onClick: () => abrirNovoContato("form") }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Conta bancária</Label>
                    <Combobox
                      value={form.conta_bancaria_id}
                      onChange={(v) => setForm({ ...form, conta_bancaria_id: v })}
                      options={(contasOpt ?? []).map((c) => ({ value: c.id, label: rotuloConta(c) }))}
                     
                     
                      emptyText="Nenhum item encontrado."
                      className="h-10"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Categoria *</Label>
                    <Combobox
                      value={form.categoria_id}
                      onChange={(v) => setForm({ ...form, categoria_id: v })}
                      options={(categoriasOpt ?? []).map((c) => ({ value: c.id, label: c.nome ?? "" }))}
                     
                     
                      emptyText="Nenhum item encontrado."
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Nº documento / NF</Label>
                    <Input
                      value={form.documento}
                      onChange={(e) => setForm({ ...form, documento: e.target.value })}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Forma de pagamento</Label>
                    <Select
                      value={form.forma_pagamento || "__none"}
                      onValueChange={(v) =>
                        setForm({ ...form, forma_pagamento: v === "__none" ? "" : v })
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Não informar</SelectItem>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <DialogFooter className="gap-2">
                  <Button type="submit" disabled={criar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <LancamentosToolbar
        tipo={tipo}
        empresaId={empresa?.id}
        lancamentos={filtrados}
        contatos={contatosOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        categorias={categoriasOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        contas={contasOpt?.map((c) => ({ id: c.id, nome: c.nome ?? "" }))}
        onImported={invalidate}
        busca={
          <SearchField value={busca} onChange={(v) => { setBusca(v); setPagina(1); clearSel(); }} />
        }
      />

      {isLoading ? (
        <div className="space-y-2.5" aria-label="Carregando">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : !filtrados.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState
            icon={TrendingUp}
            title="Nenhum lançamento nesta aba"
            description="Ajuste a aba acima ou crie um novo lançamento."
          />
        </div>
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-panel">
          {/* Rolagem só dentro da lista: a página não cria barra externa. */}
          <div className="min-h-0 flex-1 overflow-y-auto [&_.erp-table-wrap]:max-h-none">
          <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:px-3">
            {/* Cabeçalho estático e opaco: o sticky global translúcido deixava
                as linhas passarem por baixo aparecendo através */}
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <SortHead k="contato">{tipo === "pagar" ? "Fornecedor" : "Cliente"}</SortHead>
                <SortHead k="descricao">Descrição</SortHead>
                <SortHead k="data_vencimento">Vencimento</SortHead>
                <SortHead k="valor" className="text-right">
                  Valor
                </SortHead>
                <SortHead k="status">Status</SortHead>
                <TableHead className="text-right">
                  {selected.size > 0 && (
                    <div className="flex items-center justify-end gap-1.5 py-0.5">
                      <span className="mr-1 whitespace-nowrap text-xs font-medium normal-case tracking-normal text-foreground">
                        {selected.size} selecionado(s)
                      </span>
                      <Select
                        onValueChange={(v) =>
                          alterarStatusLote.mutate({ ids: [...selected], status: v as "aberto" })
                        }
                      >
                        <SelectTrigger className="h-8 w-[170px] rounded-lg text-xs shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberto">Aberto</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                          <SelectItem value="parcial">Parcial</SelectItem>
                          <SelectItem value="vencido">Vencido</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={excluirLote.isPending}
                        onClick={() => setConfLote(true)}
                        className="h-8 rounded-lg px-3 text-xs"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Excluir
                      </Button>
                      <Button size="sm" variant="ghost" onClick={clearSel} className="h-8 rounded-lg px-3 text-xs">
                        Limpar
                      </Button>
                    </div>
                  )}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentosVisiveis.map((l) => {
                const emAndamento = marcarPago.isPending && marcarPago.variables?.id === l.id;
                return (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined} className="transition-colors hover:bg-accent/30">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={() => toggle(l.id)}
                        aria-label="Selecionar"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground font-medium">
                      {l.contato?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{l.descricao}</div>
                      {l.categoria_id &&
                        (() => {
                          const cat = categoriasOpt?.find((c) => c.id === l.categoria_id);
                          return cat ? (
                            <Badge
                              variant="outline"
                              className="mt-1 rounded-md px-2 py-0.5 text-[10px] font-normal shadow-sm border-muted-foreground/30 text-muted-foreground"
                            >
                              {cat.nome}
                            </Badge>
                          ) : null;
                        })()}
                    </TableCell>
                    <TableCell className="text-tabular">
                      {format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right text-tabular font-medium">
                      {brl(l.valor)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg active:scale-95"
                                onClick={() => abrirEdicao(l.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {l.status !== "pago" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg active:scale-95"
                                  disabled={emAndamento}
                                  onClick={() => marcarPago.mutate({ id: l.id, valor: l.valor })}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Marcar como pago</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {l.status !== "aberto" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg active:scale-95"
                                  onClick={() =>
                                    alterarStatusLote.mutate({ ids: [l.id], status: "aberto" })
                                  }
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reabrir</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {l.status !== "cancelado" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg active:scale-95"
                                  onClick={() =>
                                    alterarStatusLote.mutate({ ids: [l.id], status: "cancelado" })
                                  }
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancelar (mantém histórico)</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-destructive hover:text-destructive active:scale-95"
                                onClick={async () => {
                                  const { data: vinculada } = await supabase
                                    .from("notas_importadas_parcelas" as never)
                                    .select("id")
                                    .eq("lancamento_id", l.id)
                                    .maybeSingle();
                                  if (vinculada) {
                                    setLancamentoBloqueado({ id: l.id, descricao: l.descricao });
                                    return;
                                  }
                                  setConfExclusao(l.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir (apaga)</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="shrink-0">
            <Pagination
              pagina={paginaAtual}
              totalPaginas={totalPaginas}
              total={filtrados.length}
              pageSize={pageSize}
              onPagina={setPagina}
              pageSizes={[10, 25, 50, 100]}
              onPageSize={(n) => { setPageSize(n); setPagina(1); }}
            />
          </div>
        </Card>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !salvarEdicao.isPending) setEditing(null);
        }}
      >
        <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
          <DialogHeader className="gap-1.5 pb-1">
            <DialogTitle className="tracking-tight">Editar lançamento</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                salvarEdicao.mutate(editing);
              }}
              className="space-y-4"
            >
              {(editing.created_by ||
                (editing.observacoes ?? "").includes("adiantamento recorrente")) && (
                <p className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                  <span>
                    {editing.created_by ? (
                      <>
                        Lançado por{" "}
                        <span className="font-medium text-foreground">{perfis[editing.created_by] ?? "—"}</span> ·{" "}
                        {format(new Date(editing.created_at), "dd/MM/yyyy HH:mm")}
                      </>
                    ) : (
                      "Lançado pelo sistema"
                    )}
                  </span>
                  {(editing.observacoes ?? "").includes("adiantamento recorrente") && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm">
                      recorrência
                    </span>
                  )}
                </p>
              )}
              <div className="grid gap-1.5">
                <Label>Descrição *</Label>
                <Input
                  required
                  value={editing.descricao}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>Valor (R$) *</Label>
                  <MoneyInput
                    required
                    value={editing.valor}
                    onChange={(v) => setEditing({ ...editing, valor: v })}
                    prefix=""
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Competência *</Label>
                  <DateInput
                    required
                    value={editing.data_emissao}
                    onChange={(v) => setEditing({ ...editing, data_emissao: v })}
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Vencimento</Label>
                  <DateInput
                    value={editing.data_vencimento}
                    onChange={(v) => setEditing({ ...editing, data_vencimento: v })}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>{tipo === "receber" ? "Cliente *" : "Fornecedor *"}</Label>
                <Combobox
                  value={editing.contato_id}
                  onChange={(v) => setEditing({ ...editing, contato_id: v })}
                  options={(contatosOpt ?? []).map((c) => ({ value: c.id, label: c.nome ?? "", busca: (c as { documento?: string | null }).documento ?? "", detalhe: (c as { documento?: string | null }).documento ?? "" }))}
                 
                 
                  emptyText="Nenhum item encontrado."
                  className="h-10"
                  footer={{ label: "Novo contato", onClick: () => abrirNovoContato("edit") }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Conta bancária</Label>
                  <Combobox
                    value={editing.conta_bancaria_id}
                    onChange={(v) => setEditing({ ...editing, conta_bancaria_id: v })}
                    options={(contasOpt ?? []).map((c) => ({ value: c.id, label: rotuloConta(c) }))}
                   
                   
                    emptyText="Nenhum item encontrado."
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Categoria *</Label>
                  <Combobox
                    value={editing.categoria_id}
                    onChange={(v) => setEditing({ ...editing, categoria_id: v })}
                    options={(categoriasOpt ?? []).map((c) => ({ value: c.id, label: c.nome ?? "" }))}
                   
                   
                    emptyText="Nenhum item encontrado."
                    className="h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Nº documento / NF</Label>
                  <Input
                    value={editing.documento}
                    onChange={(e) => setEditing({ ...editing, documento: e.target.value })}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={editing.forma_pagamento || "__none"}
                    onValueChange={(v) =>
                      setEditing({ ...editing, forma_pagamento: v === "__none" ? "" : v })
                    }
                  >
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Não informar</SelectItem>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  value={editing.observacoes}
                  onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="submit" disabled={salvarEdicao.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                  {salvarEdicao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar alterações
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!lancamentoBloqueado}
        onOpenChange={(v) => {
          if (!v) setLancamentoBloqueado(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Lançamento vinculado a nota fiscal</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Não é possível excluir este lançamento diretamente por aqui, pois ele foi gerado
              automaticamente a partir de uma nota fiscal importada. As alterações devem ser feitas
              em <strong>Fiscal → Notas de Compra</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl px-5 shadow-sm"
              onClick={() => {
                setLancamentoBloqueado(null);
                navigate({ to: "/fiscal/recebidas" });
              }}
            >
              Ir para Notas de Compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confLote} onOpenChange={setConfLote}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir lançamentos</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line leading-relaxed">
              {`Excluir ${selected.size} lançamento(s)?\n\nSe algum estiver conciliado, a transação do extrato voltará para "em aberto" (não será apagada).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluirLote.mutate([...selected])}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confExclusao} onOpenChange={(v) => { if (!v) setConfExclusao(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir lançamento</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line leading-relaxed">
              {'Excluir lançamento?\n\nSe estiver conciliado, a transação do extrato voltará para "em aberto" (não será apagada).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confExclusao) excluirLote.mutate([confExclusao]); setConfExclusao(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuditDialog
        open={trilhaOpen}
        onOpenChange={setTrilhaOpen}
        title={`Auditoria — ${titulo}`}
        emptyText="Nenhum evento registrado ainda. Criar, editar, excluir ou alterar status gera registros aqui."
        isLoading={trilhaQuery.isLoading}
        isError={trilhaQuery.isError}
        events={(trilhaQuery.data ?? [])}
        showDate
      />
      <NovoContatoDialog
        empresaId={empresa?.id}
        tipoFixo={tipo === "receber" ? "cliente" : "fornecedor"}
        open={novoContatoOpen}
        onOpenChange={setNovoContatoOpen}
        onCriado={(c) => {
          if (novoContatoAlvo === "edit" && editing) setEditing({ ...editing, contato_id: c.id });
          else setForm((f) => ({ ...f, contato_id: c.id }));
        }}
      />
    </div>
  );
}
