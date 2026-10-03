import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@/components/erp/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Truck,
  Plus,
  FileText,
  Search,
  Ban,
  UploadCloud,
  FileCode,
  FilePlus2,
  MapPin,
  Package,
  Building2,
  Trash2,
  Filter,
  Calendar,
  CheckCircle2,
  ChevronsUpDown,
  Check,
  ReceiptText,
  Pencil,
  Download,
  Eye,
  Settings2,
  X,
  Loader2,
  ClipboardList,
  Printer,
  Repeat,
  Copy,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num, maskDoc } from "@/lib/format";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { limparIE } from "@/lib/ie";
import {
  emitirCteFn,
  consultarCteFn,
  cancelarCteFn,
  previewCteXmlFn,
  excluirRejeitadosCteFn,
} from "@/lib/sefaz-cte-server";
import { SEFAZ_AMBIENTE } from "@/lib/sefaz-ambiente";
import { pisoMinimoAntt } from "@/lib/piso-antt";
import { emitirCiotFn, consultarFrotaAnttFn, consultarCiotGeradoAnttFn } from "@/lib/antt-ciot-server";
import { CFOPS_CTE, MOD_FRETE_OPTIONS, RESPONSAVEL_CTE_OPTIONS } from "@/lib/cfops-transporte";
import { gerarDactePdf, DACTE_REV } from "@/lib/dacte-pdf";
import { completarLogradouro, temTipoLogradouro } from "@/lib/endereco";
import { JUVENAL_LOGO } from "@/lib/juvenal-logo";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";
import { useFiltrosSalvos } from "@/hooks/use-filtros-salvos";

function formatarCnpjPercurso(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "Não informado");
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

// Eixos da combinação (ANTT conta cavalo + carretas): tração + reboques pela placa
function eixosCombinacao(f: any, veics: any[]) {
  const byPlaca = (p: string) =>
    (veics || []).find((v: any) => String(v.placa || "").toUpperCase() === String(p || "").toUpperCase());
  const trac = String(f?.placaVeiculo || "").toUpperCase();
  let n = Number((byPlaca(trac) as any)?.quantidade_eixos) || 0;
  for (const k of ["placaReboque", "semiReboque1", "semiReboque2"]) {
    const p = String(f?.[k] || "").trim().toUpperCase();
    if (!p || p === trac) continue;
    n += Number((byPlaca(p) as any)?.quantidade_eixos) || 0;
  }
  return n;
}

/* Visor próprio de DACTE: tela cheia do sistema (sem a barra do navegador),
 * com Baixar, Imprimir, zoom e Fechar (Esc). */
function DacteViewer({
  titulo,
  subtitulo,
  url,
  nomeArquivo,
  onClose,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  url: string;
  nomeArquivo: string;
  onClose: () => void;
  acoes?: any;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(() =>
    typeof window === "undefined"
      ? 100
      : Math.min(200, Math.max(100, Math.round(window.innerWidth / 12))),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const baixar = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
  };
  const imprimir = () => {
    const w = frameRef.current?.contentWindow;
    if (w) {
      w.focus();
      w.print();
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{titulo}</span>
        {subtitulo && (
          <span className="max-w-full truncate text-xs text-muted-foreground">{subtitulo}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Reduzir zoom"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
          >
            −
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{zoom}%</span>
          <span className="text-[10px] text-muted-foreground/50">rev-20260918d</span>
          <span className="text-[10px] text-muted-foreground/50">pdf-{DACTE_REV}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Ampliar zoom"
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
          >
            +
          </Button>
          <Button size="sm" variant="outline" onClick={baixar}>
            <Download className="mr-1 h-3.5 w-3.5" /> Baixar
          </Button>
          <Button size="sm" variant="outline" onClick={imprimir}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
          </Button>
          {acoes}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Fechar (Esc)"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/40">
        <iframe
          ref={frameRef}
          src={`${url}#toolbar=0&navpanes=0&zoom=${zoom}`}
          title={titulo}
          className="h-full min-h-[70vh] w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/fiscal/cte")({
  component: CtePage,
  head: () => ({ meta: [{ title: "CT-e — Norvo" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    fromNFe: (search.fromNFe as string) || undefined,
  }),
});

type CteDoc = {
  id: string;
  numero: string | null;
  serie: string | null;
  status: string;
  valor_servico: number | null;
  chave_acesso: string | null;
  created_at: string;
  motivo_rejeicao: string | null;
  protocolo_sefaz: string | null;
  xml_assinado: string | null;
  ambiente: string | null;
  data_autorizacao: string | null;
  responsavel_emissao: string | null;
};

// form gravado dentro do xml_assinado do CT-e (rascunho/autorizado).
function formDeDocCiot(d: { xml_assinado: string | null }): Record<string, any> {
  try {
    const j = JSON.parse(d.xml_assinado || "{}");
    if (j && typeof j === "object" && j.form && typeof j.form === "object") return j.form;
  } catch {}
  return {};
}

// CNPJ do destinatário do CT-e: 1º da NF-e vinculada (JSON), senão do
// <dest> do XML assinado, senão "" (o chamador tenta o banco por chNFe).
function destDoDocCiot(d: { xml_assinado: string | null }): string {
  try {
    const j = JSON.parse(d.xml_assinado || "{}");
    const nfs = ((j as any).nfs || []) as any[];
    const nd = String(nfs[0]?.destCnpj || "").replace(/\D/g, "");
    if (nd) return nd;
    let raw = typeof (j as any).xml === "string" ? (j as any).xml : "";
    if (!raw && String(d.xml_assinado || "").trim().startsWith("<")) raw = d.xml_assinado || "";
    // Só dentro de <dest> — o 1º CNPJ solto do XML seria o do emitente.
    const m = raw.match(/<dest>[\s\S]{0,3000}?<(CNPJ|CPF)>(\d{11,14})<\/(CNPJ|CPF)>/);
    if (m) return (m[2] || "").replace(/\D/g, "");
  } catch {}
  return "";
}

// Chaves das NF-es vinculadas ao CT-e: Simplificado usa <chNFe>, Normal usa
// <infNFe><chave>. Escopo restrito (não confundir com <chCTe> de docAnt).
// Aceita o XML puro ou o JSON gravado ({xml, form} de autorizado, {nfs} de rascunho).
function chavesNFeDoXml(xmlAssinado: string | null): string[] {
  const out = new Set<string>();
  const x = String(xmlAssinado || "");
  try {
    const p = JSON.parse(x);
    if (p && typeof p === "object") {
      if (typeof p.xml === "string" && p.xml.includes("<")) {
        for (const c of chavesNFeDoXml(p.xml)) out.add(c);
      }
      if (Array.isArray(p.nfs)) {
        for (const nf of p.nfs) {
          const d = String(nf?.chave || "").replace(/\D/g, "");
          if (d.length === 44) out.add(d);
        }
      }
      if (out.size > 0) return [...out];
    }
  } catch {}
  for (const m of x.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)) out.add(m[1]);
  for (const m of x.matchAll(/<infNFe>\s*<chave>(\d{44})<\/chave>/g)) out.add(m[1]);
  return [...out];
}

// Placa(s), motorista e data de emissão direto do XML/form do CT-e p/ a tabela.
function infoCteLinha(xmlAssinado: string | null): {
  placas: string[];
  motorista: string;
  dataEmi: string;
} {
  let raw = String(xmlAssinado || ""),
    form: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.xml || parsed.form)) {
      raw = String(parsed.xml || "");
      form = (parsed.form && typeof parsed.form === "object" ? parsed.form : {}) as Record<
        string,
        unknown
      >;
    }
  } catch {
    /* XML puro */
  }
  const xmlDoc = raw.trim().startsWith("<")
    ? new DOMParser().parseFromString(raw, "application/xml")
    : null;
  const elements = (name: string, root: ParentNode | null = xmlDoc) =>
    root ? Array.from(root.querySelectorAll("*")).filter((node) => node.localName === name) : [];
  const firstText = (name: string, root: ParentNode | null = xmlDoc) =>
    elements(name, root)[0]?.textContent?.trim() || "";
  const placas: string[] = [];
  for (const node of [...elements("veic"), ...elements("reboque"), ...elements("placa")]) {
    const value = node.localName === "placa" ? node.textContent?.trim() : firstText("placa", node);
    const placa = String(value || "").toUpperCase();
    if (placa && !placas.includes(placa)) placas.push(placa);
  }
  for (const key of ["placaVeiculo", "placaReboque", "semiReboque1", "semiReboque2"]) {
    const placa = String(form[key] || "")
      .trim()
      .toUpperCase();
    if (placa && !placas.includes(placa)) placas.push(placa);
  }
  let motorista = firstText("xNome", elements("moto")[0] || null);
  if (!motorista)
    motorista = [form.motoristaNome, form.motorista2Nome]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ");
  const dataRaw = firstText("dhEmi") || String(form.dataEmissao || "");
  const dataEmi = /^\d{4}-\d{2}-\d{2}/.test(dataRaw)
    ? dataRaw.slice(0, 10).split("-").reverse().join("/")
    : dataRaw.slice(0, 10);
  return { placas, motorista, dataEmi };
}

// Linha resumida de um documento p/ exibição e ordenação das tabelas
function linhaDocs(d: CteDoc): {
  placas: string;
  motorista: string;
  numero: number;
  serie: string;
  nfs: string;
  valor: number;
  responsavel: string;
  dataEmi: string;
} {
  const info = infoCteLinha(d.xml_assinado);
  let nfsArr: string[] = [];
  try {
    const j = JSON.parse(d.xml_assinado || "{}");
    const nn = j.nfs?.map((n: any) => n.nNF).filter(Boolean) || [];
    if (nn.length) nfsArr = nn;
  } catch {}
  if (nfsArr.length === 0) {
    try {
      const chaves = [...(d.xml_assinado || "").matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(
        (m) => m[1],
      );
      nfsArr = chaves.map((ch) => ch.slice(25, 34).replace(/^0+/, "") || "0");
    } catch {
      nfsArr = [];
    }
  }
  return {
    placas: info.placas.join(" / "),
    motorista: info.motorista,
    numero: Number(d.numero ?? 0),
    serie: String(d.serie ?? ""),
    nfs: nfsArr.join(", "),
    valor: Number(d.valor_servico ?? 0),
    responsavel: String((d as any).responsavel_emissao || ""),
    dataEmi: info.dataEmi,
  };
}

function CtePage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [isParsing, setIsParsing] = useState(false);
  const [importProgress, setImportProgress] = useState<{ feito: number; total: number } | null>(null);
  const [manualNfeOpen, setManualNfeOpen] = useState(false);
  const [manualNfe, setManualNfe] = useState({
    modelo: "55",
    chave: "",
    nNF: "",
    serie: "1",
    emit: "",
    emitCnpj: "",
    dest: "",
    destCnpj: "",
    data: new Date().toISOString().slice(0, 10),
    qtde: "1",
    peso: "0",
    valor: "0",
  });
  const [mercadorias, setMercadorias] = useState<
    Array<{
      chave: string;
      nNF: string;
      serie: string;
      emit: string;
      emitCnpj: string;
      emitUF: string;
      emitCMun: string;
      emitXMun: string;
      emitIE?: string;
      emitLogradouro?: string;
      emitNro?: string;
      emitBairro?: string;
      emitCEP?: string;
      emitFone?: string;
      dest: string;
      destCnpj: string;
      destUF: string;
      destCMun: string;
      destXMun: string;
      destIE?: string;
      destLogradouro?: string;
      destNro?: string;
      destBairro?: string;
      destCEP?: string;
      destFone?: string;
      valor: number;
      peso: number;
      data: string;
      tomador: string;
      tomadorCnpj: string;
      tomadorUF: string;
      tomadorCMun: string;
      tomadorXMun: string;
      tomadorIE?: string;
      tomadorLogradouro?: string;
      tomadorBairro?: string;
      tomadorCEP?: string;
      modFrete: string;
      qVol?: number;
    }>
  >([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confRemetente, setConfRemetente] = useState<{ nome: string; chaves: string[] } | null>(
    null,
  );
  const [filtroEmpresa] = useState("ROSE TRANSPORTES");
  const [filtroRemetente, setFiltroRemetente] = useState("TODOS REMETENTES");
  const [filtroDestinatario, setFiltroDestinatario] = useState("TODOS OS DESTINATÁRIOS");
  const [periodoIni, setPeriodoIni] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().slice(0, 10);
  });
  const [periodoFim, setPeriodoFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "nNF",
    dir: "asc",
  });
  const [editingRascunhoId, setEditingRascunhoId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState("embarque");
  const [mdfVincTab, setMdfVincTab] = useState("sem");
  const [respNome, setRespNome] = useState("");
  const [filtrosSalvosOpen, setFiltrosSalvosOpen] = useState(false);
  const { data: authUser } = useQuery({
    queryKey: ["auth-user-cte"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60_000,
  });
  const filtrosSalvos = useFiltrosSalvos(empresa?.id, authUser?.id, "fiscal-cte");
  const aplicarFiltroSalvo = (id: string) => {
    const salvo = filtrosSalvos.filtros.find((item) => item.id === id);
    const valores = salvo?.filtros ?? {};
    if (typeof valores.filtroRemetente === "string") setFiltroRemetente(valores.filtroRemetente);
    if (typeof valores.filtroDestinatario === "string") setFiltroDestinatario(valores.filtroDestinatario);
    if (typeof valores.periodoIni === "string") setPeriodoIni(valores.periodoIni);
    if (typeof valores.periodoFim === "string") setPeriodoFim(valores.periodoFim);
  };
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const usr = (data as any)?.user;
        if (!usr) return;
        let nm = (usr?.user_metadata as any)?.nome || "";
        if (!nm && empresa) {
          const { data: eu } = await supabase
            .from("empresa_users" as any)
            .select("nome")
            .eq("empresa_id", (empresa as any).id)
            .eq("user_id", usr.id)
            .maybeSingle();
          nm = (eu as any)?.nome || "";
        }
        setRespNome(nm || "");
      } catch {}
    })();
  }, [(empresa as any)?.id]);

  // Período de Entrada sempre aplicado (padrão hoje-15 dias); sem botão Consulta
  const dentroPeriodo = (data: string) => {
    const d = (data || "").slice(0, 10);
    if (!d) return true;
    if (periodoIni && d < periodoIni) return false;
    if (periodoFim && d > periodoFim) return false;
    return true;
  };
  const mercadoriasSorted = useMemo(() => {
    const arr = mercadorias.filter((m) => dentroPeriodo(m.data));
    arr.sort((a, b) => {
      const va = (a as any)[sortConfig.key] ?? "";
      const vb = (b as any)[sortConfig.key] ?? "";
      if (typeof va === "number" && typeof vb === "number")
        return sortConfig.dir === "asc" ? va - vb : vb - va;
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return sortConfig.dir === "asc" ? -1 : 1;
      if (sa > sb) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [mercadorias, sortConfig, periodoIni, periodoFim]);

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-documentos", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase
        .from("cte_documentos" as any)
        .select(
          "id,numero,serie,status,valor_servico,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz,xml_assinado,ambiente,data_autorizacao,responsavel_emissao",
        )
        .eq("empresa_id", empresa!.id)
        .eq("ambiente", SEFAZ_AMBIENTE)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const docsByStatus = useMemo(() => {
    if (!docs) return { autorizados: [], rejeitados: [], cancelados: [], rascunhos: [] };
    const byNum = (a: { numero: string | null }, b: { numero: string | null }) =>
      (Number(a.numero) || 0) - (Number(b.numero) || 0);
    return {
      autorizados: docs.filter((d) => d.status === "autorizado").sort(byNum),
      rejeitados: docs.filter((d) => d.status === "rejeitado").sort(byNum),
      cancelados: docs.filter((d) => d.status === "cancelado").sort(byNum),
      rascunhos: docs.filter((d) => d.status === "rascunho").sort(byNum),
    };
  }, [docs]);

  // CT-es já vinculados a MDF-e ativo (autorizado/encerrado): extrai chCTe
  // dos XMLs dos manifestos para as sub-abas Sem/Com MDF-e.
  // Chave própria (NÃO "mdf-chaves-cte": o MDF guarda Set nessa chave e o
  // cache é global — misturar quebrava o `.has` ao navegar entre as telas).
  const { data: mdfVinculos } = useQuery({
    enabled: !!empresa,
    queryKey: ["mdf-vinculos-cte", (empresa as any)?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("mdf_documentos" as any)
        .select("status,xml_assinado")
        .eq("empresa_id", (empresa as any).id)
        .in("status", ["autorizado", "encerrado", "rascunho"])
        .limit(200)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ status: string; xml_assinado: string | null }>;
    },
  });
  const mdfChaves = useMemo(() => {
    const set = new Set<string>();
    const addCh = (v: unknown) => {
      const d = String(v || "").replace(/\D/g, "");
      if (d.length === 44) set.add(d);
    };
    for (const r of mdfVinculos ?? []) {
      const x = String((r as any)?.xml_assinado || "");
      for (const m of x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g)) set.add(m[1]);
      // Rascunho não tem XML: as chaves estão no JSON (chaves: [chCTe...]).
      try {
        const p = JSON.parse(x);
        if (p && typeof p === "object" && p.rascunho === true && Array.isArray(p.chaves)) {
          for (const ch of p.chaves) addCh(ch);
        }
      } catch {}
    }
    return set;
  }, [mdfVinculos]);
  // Status do manifesto (aberto x encerrado x rascunho) por CT-e, p/ mensagens de bloqueio.
  const mdfStatusPorCte = useMemo(() => {
    const map = new Map<string, string>();
    const addCh = (m: Map<string, string>, v: unknown, st: string) => {
      const d = String(v || "").replace(/\D/g, "");
      if (d.length === 44 && !m.has(d)) m.set(d, st);
    };
    for (const r of mdfVinculos ?? []) {
      const x = String((r as any)?.xml_assinado || "");
      const st = String((r as any)?.status || "");
      for (const m of x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g)) {
        if (!map.has(m[1])) map.set(m[1], st);
      }
      try {
        const p = JSON.parse(x);
        if (p && typeof p === "object" && p.rascunho === true && Array.isArray(p.chaves)) {
          for (const ch of p.chaves) addCh(map, ch, st);
        }
      } catch {}
    }
    return map;
  }, [mdfVinculos]);
  const autSemMdf = useMemo(
    () =>
      docsByStatus.autorizados.filter((d) => !d.chave_acesso || !mdfChaves?.has(d.chave_acesso)),
    [docsByStatus, mdfChaves],
  );
  const autComMdf = useMemo(
    () =>
      docsByStatus.autorizados.filter((d) => !!d.chave_acesso && !!mdfChaves?.has(d.chave_acesso)),
    [docsByStatus, mdfChaves],
  );

  // Chaves reservadas em rascunhos (inclui rascunhos antigos, cujas NF-es foram deletadas do banco)
  const chavesEmRascunho = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs ?? []) {
      if ((d as any).status !== "rascunho") continue;
      try {
        const p = JSON.parse((d as any).xml_assinado || "{}");
        for (const c of p.chavesNFe || []) if (c) s.add(String(c).replace(/\D/g, ""));
        for (const nf of p.nfs || []) if (nf?.chave) s.add(String(nf.chave).replace(/\D/g, ""));
      } catch {}
    }
    return s;
  }, [docs]);

  const downloadXml = (doc: CteDoc) => {
    if (!doc.xml_assinado) throw new Error("XML sem dados para gerar PDF");
    let xmlContent = doc.xml_assinado;
    try {
      const parsed = JSON.parse(doc.xml_assinado);
      if (parsed.xml) xmlContent = parsed.xml;
    } catch {}
    if (!xmlContent || !xmlContent.includes("<")) {
      toast.error("XML não encontrado no registro");
      return;
    }
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(doc.chave_acesso || "").replace(/\D/g, "") || doc.numero || "0"}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("XML baixado");
  };

  const gerarDacteBlob = async (doc: CteDoc): Promise<Blob> => {
    if (!doc.xml_assinado) {
      toast.error("XML não disponível para gerar PDF");
      return;
    }
    try {
      const parser = new DOMParser();
      let xmlStr = doc.xml_assinado;
      try {
        const p = JSON.parse(doc.xml_assinado);
        if (p.xml) xmlStr = p.xml;
      } catch {}
      if (!xmlStr.includes("<")) {
        toast.error("XML inválido");
        return;
      }
      const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
      const tag = (sel: string) => xmlDoc.querySelector(sel)?.textContent || "";
      const nFes = Array.from(xmlDoc.querySelectorAll("det")).map((det) => ({
        nNF: det.querySelector("infNFe > ide > nNF")?.textContent || "",
        serie: det.querySelector("infNFe > ide > serie")?.textContent || "1",
        valor: parseFloat(det.querySelector("infNFe > total > ICMSTot > vNF")?.textContent || "0"),
        chave: det.querySelector("chNFe")?.textContent || "",
      }));
      const gIcms = ["ICMS00", "ICMS20", "ICMS45", "ICMS60", "ICMS90", "ICMSOutraUF"].find((g) =>
        tag("infCte > imp > ICMS > " + g + " > CST"),
      );
      const tagI = (f: string) => (gIcms ? tag("infCte > imp > ICMS > " + gIcms + " > " + f) : "");
      const xmlObs = Array.from(xmlDoc.querySelectorAll("ObsCont > xTexto, ObsFisco > xTexto"))
        .map((e) => (e.textContent || "").trim())
        .filter(Boolean)
        .join(" ");
      let pjForm: any = {};
      try {
        const pj = JSON.parse(doc.xml_assinado);
        if (pj && pj.form) pjForm = pj.form;
      } catch {}
      const obsPercurso = pjForm.obsGerais || "";
      const dg = (st: any) => String(st || "").replace(/\D/g, "");
      let percObs = "",
        percColX = "",
        percColU = "",
        percEntX = "",
        percEntU = "";
      let percDstDoc = "",
        percDstNome = "",
        percDstX = "",
        percDstU = "",
        percDstLog = "",
        percDstNro = "",
        percDstBairro = "",
        percDstCep = "",
        percDstIE = "",
        percDstFone = "";
      let remD = "",
        dstD = "",
        tomaD = "";
      let nfRef: any = null;
      let percRemNome = "",
        percRemX = "",
        percRemU = "",
        percRemLog = "",
        percRemNro = "",
        percRemBairro = "",
        percRemCep = "",
        percRemIE = "",
        percRemFone = "";
      let hit: any = null;
      try {
        try {
          const chs0 = nFes
            .map((nn: any) => dg(nn.chave))
            .filter((cc: string) => cc.length === 44)
            .slice(0, 5);
          if (empresa && chs0.length > 0) {
            const { data: nfs0 } = await supabase
              .from("cte_nfes_pendentes" as any)
              .select(
                "chave,emit_cnpj,emit_nome,emit_uf,emit_cmun,emit_xmun,dest_cnpj,dest_nome,dest_uf,dest_cmun,dest_xmun",
              )
              .eq("empresa_id", (empresa as any).id)
              .in("chave", chs0);
            const rows0 = (nfs0 as any[]) || [];
            if (rows0.length > 0) nfRef = rows0[0];
          }
        } catch {}
        remD =
          dg(tag("infCte > rem > CNPJ") || tag("infCte > rem > CPF")) ||
          dg(nfRef?.emit_cnpj) ||
          dg(tag("infCte > emit > CNPJ") || tag("infCte > emit > CPF"));
        dstD = dg(tag("infCte > dest > CNPJ") || tag("infCte > dest > CPF"));
        tomaD = dg(
          xmlDoc.querySelector("toma4 > CNPJ")?.textContent ||
            xmlDoc.querySelector("toma4 > CPF")?.textContent ||
            xmlDoc.querySelector("infCte > toma > CNPJ")?.textContent ||
            "",
        );
        if (!tomaD) {
          const t3 = (
            xmlDoc.querySelector("toma3 > toma")?.textContent ||
            xmlDoc.querySelector("infCte > toma > toma")?.textContent ||
            ""
          ).trim();
          tomaD = t3 === "0" ? remD : t3 === "3" ? dstD : "";
        }
        if (!dstD && nfRef) {
          const dd = dg(nfRef.dest_cnpj);
          if (dd) dstD = dd;
        }
        if (empresa && remD && dstD) {
          const { data: prcs } = await supabase
            .from("cte_percursos" as any)
            .select(
              "obs_gerais,coleta_xmun,coleta_uf,entrega_xmun,entrega_uf,rem_cnpj,dest_cnpj,toma_cnpj,rem_nome,rem_xmun,rem_uf,rem_logradouro,rem_nro,rem_bairro,rem_cep,rem_ie,rem_fone,dest_nome,dest_xmun,dest_uf,dest_logradouro,dest_nro,dest_bairro,dest_cep,dest_ie,dest_fone",
            )
            .eq("empresa_id", (empresa as any).id);
          const list = (prcs as any[]) || [];
          hit =
            list.find(
              (pp) =>
                dg(pp.rem_cnpj) === remD &&
                dg(pp.dest_cnpj) === dstD &&
                (!tomaD || dg(pp.toma_cnpj) === tomaD),
            ) ||
            list.find((pp) => dg(pp.rem_cnpj) === remD && dg(pp.dest_cnpj) === dstD) ||
            null;
          if (hit) {
            percObs = hit.obs_gerais || "";
            percColX = hit.coleta_xmun || "";
            percColU = hit.coleta_uf || "";
            percEntX = hit.entrega_xmun || "";
            percEntU = hit.entrega_uf || "";
            percDstDoc = hit.dest_cnpj || "";
            percDstNome = hit.dest_nome || "";
            percDstX = hit.dest_xmun || "";
            percDstU = hit.dest_uf || "";
            percDstLog = hit.dest_logradouro || "";
            percDstNro = hit.dest_nro || "";
            percDstBairro = hit.dest_bairro || "";
            percDstCep = hit.dest_cep || "";
            percDstIE = hit.dest_ie || "";
            percDstFone = hit.dest_fone || "";
            percRemNome = hit.rem_nome || "";
            percRemX = hit.rem_xmun || "";
            percRemU = hit.rem_uf || "";
            percRemLog = hit.rem_logradouro || "";
            percRemNro = hit.rem_nro || "";
            percRemBairro = hit.rem_bairro || "";
            percRemCep = hit.rem_cep || "";
            percRemIE = hit.rem_ie || "";
            percRemFone = hit.rem_fone || "";
          }
        }
      } catch {}
      let ctDstNome = "",
        ctDstX = "",
        ctDstU = "";
      try {
        if (empresa && (remD || dstD || tomaD)) {
          const { data: cts } = await supabase
            .from("fiscal_cadastros" as any)
            .select("documento,nome,cidade,uf")
            .eq("empresa_id", (empresa as any).id);
          const cl = (cts as any[]) || [];
          const fnd = (dd: string) =>
            cl.find((cc) => String(cc.documento || "").replace(/\D/g, "") === dd);
          const cD = dstD ? fnd(dstD) : null;
          if (cD) {
            ctDstNome = cD.nome || "";
            ctDstX = cD.cidade || "";
            ctDstU = cD.uf || "";
          }
        }
      } catch {}
      let cRemFull: any = null,
        cDstFull: any = null,
        cTomFull: any = null,
        emitFoneE = "";
      try {
        if (empresa && (remD || dstD || tomaD)) {
          const { data: cts2 } = await supabase
            .from("fiscal_cadastros" as any)
            .select("documento,nome,logradouro,numero,bairro,cidade,uf,cep,ie,telefone")
            .eq("empresa_id", (empresa as any).id);
          const cl2 = (cts2 as any[]) || [];
          const f2 = (dd: string) =>
            cl2.find((cc) => String(cc.documento || "").replace(/\D/g, "") === dd);
          if (remD) cRemFull = f2(remD);
          if (dstD) cDstFull = f2(dstD);
          if (tomaD) cTomFull = f2(tomaD);
          const emitD = dg(tag("infCte > emit > CNPJ") || tag("infCte > emit > CPF"));
          if (emitD) {
            const cEmi = f2(emitD);
            if (cEmi) emitFoneE = ((cEmi as any).telefone || "").replace(/\D/g, "");
          }
        }
      } catch {}
      let emitFoneC = "",
        remFoneC = "",
        motoCPFC = "",
        moto2CPFC = "",
        segCNPJC = "";
      try {
        if (empresa && (remD || tomaD)) {
          const { data: cts2 } = await supabase
            .from("fiscal_cadastros" as any)
            .select("documento,telefone")
            .eq("empresa_id", (empresa as any).id);
          const cl2 = (cts2 as any[]) || [];
          const f2 = (dd: string) =>
            cl2.find((cc) => String(cc.documento || "").replace(/\D/g, "") === dd);
          const cE = remD ? f2(remD) : null;
          if (cE) {
            emitFoneC = ((cE as any).telefone || "").replace(/\D/g, "");
            remFoneC = emitFoneC;
          }
        }
        const segId = (pjForm as any).seguradoraId || "";
        if (empresa && segId) {
          const { data: sg } = await supabase
            .from("seguradoras" as any)
            .select("cnpj")
            .eq("empresa_id", (empresa as any).id)
            .eq("id", segId)
            .maybeSingle();
          if (sg) segCNPJC = (sg as any).cnpj || "";
        }
        const motId = (pjForm as any).motoristaId || "";
        if (empresa && motId) {
          const { data: cb } = await supabase
            .from("colaboradores" as any)
            .select("cpf")
            .eq("empresa_id", (empresa as any).id)
            .eq("id", motId)
            .maybeSingle();
          if (cb) motoCPFC = String((cb as any).cpf || "").replace(/\D/g, "");
        }
        const mot2Id = (pjForm as any).motorista2Id || "";
        if (empresa && mot2Id) {
          const { data: cb2 } = await supabase
            .from("colaboradores" as any)
            .select("cpf")
            .eq("empresa_id", (empresa as any).id)
            .eq("id", mot2Id)
            .maybeSingle();
          if (cb2) moto2CPFC = String((cb2 as any).cpf || "").replace(/\D/g, "");
        }
      } catch {}
      let destNomeFix = tag("infCte > dest > xNome") || nfRef?.dest_nome || "" || "";
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO"))
        destNomeFix = percDstNome;
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO"))
        destNomeFix = ctDstNome;
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO"))
        destNomeFix = tag("infCte > toma > xNome") || "";
      if (destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) destNomeFix = "";
      let healed = false;
      if (!hit && empresa && remD.length === 14 && dstD.length === 14) {
        try {
          const { data: mx } = await supabase
            .from("cte_percursos" as any)
            .select("codigo")
            .eq("empresa_id", (empresa as any).id)
            .order("codigo", { ascending: false })
            .limit(1);
          const last = parseInt((((mx as any[]) || [])[0] as any)?.codigo || "0", 10) || 0;
          const detX1 = tag("det > xMunIni") || "";
          const detX2 = tag("det > xMunFim") || "";
          const nmA = tag("infCte > emit > xNome") || remD;
          let nmB = tag("infCte > toma > xNome") || "";
          if (!nmB || nmB.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) nmB = dstD;
          const { error: insErr } = await supabase
            .from("cte_percursos" as any)
            .insert({
              empresa_id: (empresa as any).id,
              codigo: String(last + 1).padStart(4, "0"),
              nome: (nmA + " > " + nmB).slice(0, 120),
              rem_cnpj: remD,
              dest_cnpj: dstD,
              toma_cnpj: tomaD,
              coleta_xmun: detX1,
              coleta_uf: tag("infCte > ide > UFIni") || "",
              entrega_xmun: detX2,
              entrega_uf: tag("infCte > ide > UFFim") || "",
              cfop: tag("infCte > ide > CFOP") || "5353",
              obs_gerais: "",
            });
          if (!insErr) healed = true;
          else {
            const k2 = "perc-err:" + (doc.chave_acesso || "");
            try {
              const g = localStorage.getItem(k2);
              if (!g) {
                localStorage.setItem(k2, "1");
                toast.warning(
                  "Percurso auto: " + String((insErr as any)?.message || insErr).slice(0, 140),
                );
              }
            } catch {}
          }
        } catch {}
      }
      const percWarnKey = "perc-warn:" + (doc.chave_acesso || "");
      const percWarned = (() => {
        try {
          return !!localStorage.getItem(percWarnKey);
        } catch {
          return false;
        }
      })();
      if (!healed && !percObs && !percColX && !percWarned) {
        try {
          localStorage.setItem(percWarnKey, "1");
        } catch {}
        toast.warning("Percurso nao localizado: obs e cidades ficam em branco");
      }
      if (healed)
        toast.info("Percurso criado automaticamente - complete a observacao em Percursos");
      const xmlComps = Array.from(xmlDoc.querySelectorAll("vPrest > Comp"))
        .map((cc) => ({
          nome: (cc.querySelector("xNome")?.textContent || "").trim(),
          valor: parseFloat(cc.querySelector("vComp")?.textContent || "0") || 0,
        }))
        .filter((cc) => cc.nome)
        .slice(0, 8);
      const dhEmi = tag("infCte > ide > dhEmi") || "";
      const versaoCte = xmlDoc.querySelector("infCte")?.getAttribute("versao") || "4.00";
      const toma3 = (xmlDoc.querySelector("toma3 > toma")?.textContent || "").trim();
      const toma4x = !!xmlDoc.querySelector("toma4, infCte > toma4");
      const proPred = tag("infCte > infCarga > proPred") || "";
      const xOutCat = tag("infCte > infCarga > xOutCat") || "";
      const infQ = Array.from(xmlDoc.querySelectorAll("infCte > infCarga > infQ"))
        .map((q) => ({
          q: q.querySelector("qCarga")?.textContent || "",
          um: q.querySelector("tpMed")?.textContent || q.querySelector("cUnid")?.textContent || "",
        }))
        .slice(0, 3);
      const ibsBase =
        tag("infCte > imp > IBSCBS > vBC") || tag("infCte > imp > IBSCBS > vBCIBS") || "";
      const ibsCST = tag("infCte > imp > IBSCBS > CST") || "";
      const ibsClass = tag("infCte > imp > IBSCBS > cClassTrib") || "";
      const gCBS = xmlDoc.querySelector("infCte > imp > IBSCBS > gCBS");
      const gMun = xmlDoc.querySelector("infCte > imp > IBSCBS > gIBSMun");
      const gUF = xmlDoc.querySelector("infCte > imp > IBSCBS > gIBSUF");
      const gtxt = (el: any, s: string) => el?.querySelector(s)?.textContent || "";
      const vTotTrib = tag("infCte > imp > vTotTrib") || "";
      const complXEmi = tag("infCte > compl > xEmi") || "";
      const tomaIEXml = tag("infCte > toma > IE") || "";
      const rodoEl = xmlDoc.querySelector("infModal > rodo, infCte > infCteNorm > infModal > rodo");
      const rq = (s: string) => rodoEl?.querySelector(s)?.textContent || "";
      const veicsXml = Array.from(rodoEl?.querySelectorAll("veic, reboque") || []).map((v) => ({
        tipo: /^t/i.test(v.querySelector("tpProp")?.textContent || "") ? "Terceiro" : "Própria",
        placa: v.querySelector("placa")?.textContent || "",
        renavam: v.querySelector("RENAVAM")?.textContent || "",
        uf: v.querySelector("UF")?.textContent || "",
        rntrc: v.querySelector("RNTRC")?.textContent || rq("RNTRC") || "",
      }));
      const motoEl = rodoEl?.querySelector("moto");
      const propEl = rodoEl?.querySelector("prop");
      const valeEl = rodoEl?.querySelector("valePed");
      const lacresXml = Array.from(rodoEl?.querySelectorAll("lacRodo > nLacre") || [])
        .map((e) => (e.textContent || "").trim())
        .filter(Boolean)
        .join(", ");
      const rodoRNTRC = rq("RNTRC") || "";
      const emitUfXml = tag("infCte > emit > enderEmit > UF") || "";
      const placasForm = [
        (pjForm as any).placaVeiculo,
        (pjForm as any).placaReboque,
        (pjForm as any).semiReboque1,
        (pjForm as any).semiReboque2,
      ]
        .map((p) => String(p || "").toUpperCase())
        .filter(Boolean);
      let veicsFrota: Array<any> = [];
      try {
        if (empresa && placasForm.length) {
          const { data: fv } = await supabase
            .from("veiculos" as never)
            .select("placa,renavam,rntrc")
            .eq("empresa_id", (empresa as any).id)
            .in("placa", placasForm);
          veicsFrota = (fv as any[]) || [];
        }
      } catch {}
      const temPlacaXml = new Set(veicsXml.map((v) => String(v.placa || "").toUpperCase()));
      const veicsFin = [
        ...veicsXml,
        ...placasForm
          .filter((p) => !temPlacaXml.has(p))
          .map((p) => {
            const fv = veicsFrota.find((x: any) => String(x.placa || "").toUpperCase() === p);
            return {
              tipo: "Própria",
              placa: p,
              renavam: fv?.renavam || "",
              uf: emitUfXml,
              rntrc: fv?.rntrc || rodoRNTRC,
            };
          }),
      ].slice(0, 4);
      const remLogRaw =
        tag("infCte > rem > enderRem > xLgr") ||
        percRemLog ||
        (cRemFull as any)?.logradouro ||
        tag("infCte > emit > enderEmit > xLgr") ||
        "";
      const remNroRaw =
        tag("infCte > rem > enderRem > nro") ||
        percRemNro ||
        (cRemFull as any)?.numero ||
        tag("infCte > emit > enderEmit > nro") ||
        "";
      const remCepRaw =
        tag("infCte > rem > enderRem > CEP") ||
        percRemCep ||
        (cRemFull as any)?.cep ||
        tag("infCte > emit > enderEmit > CEP") ||
        "";
      const dstLogRaw =
        tag("infCte > dest > enderDest > xLgr") ||
        percDstLog ||
        (cDstFull as any)?.logradouro ||
        "";
      const dstNroRaw =
        tag("infCte > dest > enderDest > nro") || percDstNro || (cDstFull as any)?.numero || "";
      const dstCepRaw =
        tag("infCte > dest > enderDest > CEP") || percDstCep || (cDstFull as any)?.cep || "";
      const tomLogRaw =
        tag("infCte > toma > enderToma > xLgr") || (cTomFull as any)?.logradouro || "";
      const tomNroRaw = tag("infCte > toma > enderToma > nro") || (cTomFull as any)?.numero || "";
      const tomCepRaw = tag("infCte > toma > enderToma > CEP") || (cTomFull as any)?.cep || "";
      const tomBairroRaw =
        tag("infCte > toma > enderToma > xBairro") || (cTomFull as any)?.bairro || "";
      const emitLogRaw = tag("infCte > emit > enderEmit > xLgr") || "";
      const emitNroRaw = tag("infCte > emit > enderEmit > nro") || "";
      const emitCepRaw = tag("infCte > emit > enderEmit > CEP") || "";
      const [emitLogEnr, remLogEnr, dstLogEnr, tomLogEnr] = await Promise.all([
        completarLogradouro(emitLogRaw, emitCepRaw),
        completarLogradouro(remLogRaw, remCepRaw),
        completarLogradouro(dstLogRaw, dstCepRaw),
        completarLogradouro(tomLogRaw, tomCepRaw),
      ]);
      try {
        const pendUpd: Array<any> = [];
        const fixCad = (docDigits: string, atual: string, novo: string) => {
          if (!empresa || !docDigits || !novo || novo === atual) return;
          if (atual && temTipoLogradouro(atual)) return;
          pendUpd.push(
            supabase
              .from("fiscal_cadastros" as any)
              .update({ logradouro: novo })
              .eq("empresa_id", (empresa as any).id)
              .eq("documento", docDigits),
          );
        };
        fixCad(remD, (cRemFull as any)?.logradouro || "", remLogEnr);
        fixCad(dstD, (cDstFull as any)?.logradouro || "", dstLogEnr);
        if (pendUpd.length) await Promise.all(pendUpd);
      } catch {}
      let totQVol = 0;
      try {
        const chavesNfeXml = Array.from(xmlDoc.querySelectorAll("det > infNFe > chNFe"))
          .map((e) => ((e as any).textContent || "").replace(/\D/g, ""))
          .filter((c) => c.length >= 20);
        if (empresa && chavesNfeXml.length) {
          const { data: qrows } = await supabase
            .from("cte_nfes_pendentes" as any)
            .select("qvol")
            .eq("empresa_id", (empresa as any).id)
            .in("chave", chavesNfeXml);
          totQVol = ((qrows as any[]) || []).reduce(
            (a: number, r: any) => a + (Number(r?.qvol) || 0),
            0,
          );
        }
      } catch {}
      const pdfBlob = gerarDactePdf({
        chave: doc.chave_acesso || "",
        numero: doc.numero || "",
        serie: doc.serie || "1",
        ambiente: "homologacao",
        dataEmissao: doc.created_at,
        emitCnpj: tag("infCte > emit > CNPJ") || "",
        emitNome: tag("infCte > emit > xNome") || "",
        emitEndereco: `${emitLogEnr} ${emitNroRaw}`.trim(),
        emitCidade: tag("infCte > emit > enderEmit > xMun") || "",
        emitUF: tag("infCte > emit > enderEmit > UF") || "",
        emitIE: tag("infCte > emit > IE") || "",
        emitBairro: tag("infCte > emit > enderEmit > xBairro") || "",
        emitCEP: tag("infCte > emit > enderEmit > CEP") || "",
        emitFone: emitFoneE || "",
        respEmissao: respNome,
        tomadorCnpj: tag("infCte > toma > CNPJ") || "",
        tomadorNome: tag("infCte > toma > xNome") || "",
        tomadorEndereco:
          `${tomLogEnr}${tomNroRaw ? ", " + tomNroRaw : ""}${tomBairroRaw ? " - " + tomBairroRaw : ""}`.trim(),
        tomadorFone: tag("infCte > toma > fone") || (cTomFull as any)?.telefone || "",
        tomadorCidade: tag("infCte > toma > enderToma > xMun") || "",
        tomadorUF: tag("infCte > toma > enderToma > UF") || "",
        remCnpj:
          tag("infCte > rem > CNPJ") ||
          tag("infCte > rem > CPF") ||
          dg(nfRef?.emit_cnpj) ||
          tag("infCte > emit > CNPJ") ||
          "",
        remNome:
          tag("infCte > rem > xNome") ||
          nfRef?.emit_nome ||
          "" ||
          percRemNome ||
          tag("infCte > emit > xNome") ||
          "",
        remCidade:
          tag("infCte > rem > enderRem > xMun") ||
          nfRef?.emit_xmun ||
          "" ||
          percRemX ||
          (cRemFull as any)?.cidade ||
          tag("infCte > emit > enderEmit > xMun") ||
          "",
        remUF:
          tag("infCte > rem > enderRem > UF") ||
          nfRef?.emit_uf ||
          "" ||
          percRemU ||
          (cRemFull as any)?.uf ||
          tag("infCte > emit > enderEmit > UF") ||
          "",
        remEndereco: ((remLogEnr || "") + (remNroRaw ? ", " + remNroRaw : "")).trim(),
        remBairro:
          tag("infCte > rem > enderRem > xBairro") ||
          percRemBairro ||
          (cRemFull as any)?.bairro ||
          tag("infCte > emit > enderEmit > xBairro") ||
          "",
        remCEP:
          tag("infCte > rem > enderRem > CEP") ||
          percRemCep ||
          (cRemFull as any)?.cep ||
          tag("infCte > emit > enderEmit > CEP") ||
          "",
        remIE:
          tag("infCte > rem > IE") ||
          percRemIE ||
          (cRemFull as any)?.ie ||
          tag("infCte > emit > IE") ||
          "",
        remFone: remFoneC || percRemFone,
        destCnpj:
          tag("infCte > dest > CNPJ") || percDstDoc || dstD || tag("infCte > toma > CNPJ") || "",
        destNome: destNomeFix,
        destCidade:
          tag("infCte > dest > enderDest > xMun") ||
          nfRef?.dest_xmun ||
          "" ||
          percDstX ||
          ctDstX ||
          (cDstFull as any)?.cidade ||
          tag("infCte > toma > enderToma > xMun") ||
          "",
        destUF:
          tag("infCte > dest > enderDest > UF") ||
          nfRef?.dest_uf ||
          "" ||
          percDstU ||
          ctDstU ||
          (cDstFull as any)?.uf ||
          tag("infCte > toma > enderToma > UF") ||
          "",
        destEndereco: ((dstLogEnr || "") + (dstNroRaw ? ", " + dstNroRaw : "")).trim() || "",
        destBairro:
          tag("infCte > dest > enderDest > xBairro") ||
          percDstBairro ||
          (cDstFull as any)?.bairro ||
          "",
        destCEP:
          tag("infCte > dest > enderDest > CEP") || percDstCep || (cDstFull as any)?.cep || "",
        destIE: tag("infCte > dest > IE") || percDstIE || (cDstFull as any)?.ie || "",
        destFone: percDstFone || (cDstFull as any)?.telefone || "",
        expCnpj: tag("infCte > exped > CNPJ") || "",
        expNome: tag("infCte > exped > xNome") || "",
        expCidade: tag("infCte > exped > enderExped > xMun") || "",
        expUF: tag("infCte > exped > enderExped > UF") || "",
        expEndereco: (
          (tag("infCte > exped > enderExped > xLgr") || "") +
          (tag("infCte > exped > enderExped > nro") || ""
            ? ", " + tag("infCte > exped > enderExped > nro")
            : "")
        ).trim(),
        expIE: tag("infCte > exped > IE") || "",
        recCnpj: tag("infCte > receb > CNPJ") || "",
        recNome: tag("infCte > receb > xNome") || "",
        recCidade: tag("infCte > receb > enderReceb > xMun") || "",
        recUF: tag("infCte > receb > enderReceb > UF") || "",
        recEndereco: (
          (tag("infCte > receb > enderReceb > xLgr") || "") +
          (tag("infCte > receb > enderReceb > nro") || ""
            ? ", " + tag("infCte > receb > enderReceb > nro")
            : "")
        ).trim(),
        recIE: tag("infCte > receb > IE") || "",
        cfop: tag("infCte > ide > CFOP") || "5353",
        cfopDescricao:
          CFOPS_CTE.find((c) => c.codigo === (tag("infCte > ide > CFOP") || "5353"))?.descricao ||
          "",
        naturezaOperacao: tag("infCte > ide > natOp") || "TRANSPORTE",
        origemCidade:
          tag("det > xMunIni") || tag("infCte > ide > xMunIni") || pjForm.xMunIni || percColX || "",
        origemUF: tag("infCte > ide > UFIni") || pjForm.ufIni || percColU || "",
        destinoCidade:
          tag("det > xMunFim") || tag("infCte > ide > xMunFim") || pjForm.xMunFim || percEntX || "",
        destinoUF: tag("infCte > ide > UFFim") || pjForm.ufFim || percEntU || "",
        valorServico:
          parseFloat(tag("infCte > vPrest > vTPrest")) || Number(doc.valor_servico) || 0,
        valorCarga:
          parseFloat(tag("infCte > infCarga > vCarga")) ||
          parseFloat(tag("infCte > infCarga > vMerc")) ||
          0,
        pesoKg: parseFloat(tag("infCte > infCarga > qCarga")) || 0,
        icmsCST: tagI("CST") || "00",
        icmsBase: parseFloat(tagI("vBC")) || 0,
        icmsAliq: parseFloat(tagI("pICMS")) || 0,
        icmsValor: parseFloat(tagI("vICMS")) || 0,
        nFes,
        comps:
          xmlComps.length > 0
            ? xmlComps
            : (
                [
                  ["Frete Valor", (pjForm as any).vPrest],
                  ["Coleta", (pjForm as any).taxaColeta],
                  ["Entrega", (pjForm as any).taxaEntrega],
                  ["Ad Valorem", (pjForm as any).adValorem],
                  ["GRIS", (pjForm as any).gris],
                  ["Outros", (pjForm as any).outrosPed],
                  ["Desconto", (pjForm as any).descontoPed],
                  ["Adicional", (pjForm as any).adicionalPed],
                ] as Array<[string, any]>
              )
                .filter(([, vv]) => Number(vv) !== 0)
                .map(([nn, vv]) => ({ nome: nn, valor: Number(vv) || 0 })),
        placa: tag("infModal > rodo > veic > placa") || (pjForm as any).placaVeiculo || "",
        placaReboque: "",
        rntrc: tag("infModal > rodo > RNTRC") || "",
        seguradoraNome: (pjForm as any).seguradoraNome || "",
        apolice: (pjForm as any).apolice || "",
        averbacao: (pjForm as any).averbacao || "",
        protocolo: doc.protocolo_sefaz || "",
        obs: [...new Set([obsPercurso, percObs, xmlObs].filter(Boolean))].join(" ") || "",
        qrCode: tag("infCTeSupl > qrCodCTe") || tag("qrCodCTe") || "",
        dhEmi,
        versao: versaoCte,
        tomaCod: tag("infCte > toma > toma") || toma3,
        toma4: toma4x || (tag("infCte > toma > toma") || toma3) === "4",
        formaPagto: (pjForm as any).formaPagamento || "",
        finalidade: (pjForm as any).finalidadeEmissao || "Normal",
        tipoServico: (pjForm as any).tipoServico || "Normal",
        previsaoViagem: dhEmi,
        proPred,
        xOutCat,
        infQ,
        cubagem: "",
        qtdVol: totQVol > 0 ? String(totQVol) : "",
        tomadorIE: tomaIEXml,
        segCNPJ: segCNPJC,
        segResp: (pjForm as any).segResponsavel || "4",
        segRespCNPJ: "",
        numeroAverbacao: (pjForm as any).averbacao || "",
        segTotal: (pjForm as any).segTotal || "",
        valePedagio: (pjForm as any).valePedagio || "",
        valePedFornCNPJ:
          valeEl?.querySelector("cnpjForn")?.textContent ||
          valeEl?.querySelector("CNPJForn")?.textContent ||
          (pjForm as any).pedagioCnpj ||
          "",
        valePedComprov:
          valeEl?.querySelector("nCompra")?.textContent ||
          valeEl?.querySelector("nComp")?.textContent ||
          (pjForm as any).pedagioIdentVPO ||
          (pjForm as any).pedagioTag ||
          "",
        valePedRespCNPJ:
          valeEl?.querySelector("cnpjResp")?.textContent ||
          valeEl?.querySelector("CNPJResp")?.textContent ||
          (pjForm as any).pedagioRespCnpj ||
          "",
        ibsBase,
        ibsCST,
        ibsClass,
        cbsAliq: gtxt(gCBS, "pCBS"),
        cbsValor: gtxt(gCBS, "vCBS"),
        ibsMunAliq: gtxt(gMun, "pIBSMun"),
        ibsMunValor: gtxt(gMun, "vIBSMun"),
        ibsUfAliq: gtxt(gUF, "pIBSUF"),
        ibsUfValor: gtxt(gUF, "vIBSUF"),
        vTotTrib,
        infoAdicionais: complXEmi,
        ciot: rq("CIOT") || (pjForm as any).ciot || "",
        dataPrevEntrega: rq("dPrev") || "",
        veiculos: veicsFin,
        motoNome:
          motoEl?.querySelector("xNome")?.textContent || (pjForm as any).motoristaNome || "",
        motoCPF: motoEl?.querySelector("CPF")?.textContent || motoCPFC,
        moto2Nome: (pjForm as any).motorista2Nome || "",
        moto2CPF: moto2CPFC,
        lacres: lacresXml,
        propDoc:
          propEl?.querySelector("CNPJ")?.textContent ||
          propEl?.querySelector("CPF")?.textContent ||
          "",
        propNome: propEl?.querySelector("xNome")?.textContent || "",
        propRNTRC: propEl?.querySelector("RNTRC")?.textContent || "",
        reducaoBase: tagI("pRedBC") || 0,
        icmsST: tagI("vICMSST") || tagI("vST") || 0,
        logoDataUrl: JUVENAL_LOGO || undefined,
      });
      return pdfBlob;
    } catch (e: any) {
      throw e;
    }
  };
  const downloadPdf = async (doc: CteDoc) => {
    try {
      const pdfBlob = await gerarDacteBlob(doc);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(doc.chave_acesso || "").replace(/\D/g, "") || doc.numero || "0"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF baixado");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF", { description: e.message });
    }
  };
  // Baixa XML/PDF dos autorizados marcados (Sem e Com MDF-e) em um único zip
  const importarLote = async () => {
    const docs =
      mdfVincTab === "com"
        ? autComMdf.filter((d) => impSel.has(d.id))
        : autSemMdf.filter((d) => d.chave_acesso && mdfSel.has(d.chave_acesso));
    if (!docs.length || impProc) return;
    setImpProc(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let ok = 0;
      let falhas = 0;
      for (const d of docs) {
        const base = (d.chave_acesso || "").replace(/\D/g, "") || String(d.numero || "0");
        try {
          if (impTipo !== "pdf") {
            if (!d.xml_assinado) throw new Error("sem XML");
            let xmlContent = d.xml_assinado;
            try {
              const parsed = JSON.parse(d.xml_assinado);
              if (parsed.xml) xmlContent = parsed.xml;
            } catch {}
            if (!xmlContent || !xmlContent.includes("<")) throw new Error("sem XML");
            zip.file(`${base}.xml`, xmlContent);
          }
          if (impTipo !== "xml") {
            const pdfBlob = await gerarDacteBlob(d);
            if (!pdfBlob) throw new Error("sem PDF");
            zip.file(`${base}.pdf`, pdfBlob);
          }
          ok++;
        } catch {
          falhas++;
        }
      }
      if (ok) {
        const agora = new Date();
        const stamp = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ctes-${stamp}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${ok} documento(s) no zip`);
      }
      if (falhas) toast.error(`${falhas} falharam`);
    } finally {
      setImpProc(false);
      setImpOpen(false);
      setImpSel(new Set());
    }
  };
  const visualizarPdf = async (doc: CteDoc) => {
    try {
      const pdfBlob = await gerarDacteBlob(doc);
      if (viewUrl) URL.revokeObjectURL(viewUrl);
      const url = URL.createObjectURL(pdfBlob);
      setViewUrl(url);
      setViewNum((doc as any).numero || "");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF", { description: e.message });
    }
  };

  const [open, setOpen] = useState(false);
  const emptyForm = {
    toma: "3",
    ieDestinatario: "",
    cnpjTomador: "",
    xNomeTomador: "",
    ufTomador: "MG",
    cMunTomador: "3106200",
    xMunTomador: "BELO HORIZONTE",
    ieTomador: "",
    logradouroTomador: "",
    nroTomador: "",
    bairroTomador: "",
    cepTomador: "",
    foneTomador: "",
    emailTomador: "",
    cnpjConsignatario: "",
    xNomeConsignatario: "",
    ieConsignatario: "",
    ufConsignatario: "",
    xMunConsignatario: "",
    cepConsignatario: "",
    logradouroConsignatario: "",
    nroConsignatario: "",
    bairroConsignatario: "",
    cnpjRedespacho: "",
    xNomeRedespacho: "",
    ieRedespacho: "",
    ufRedespacho: "",
    xMunRedespacho: "",
    cepRedespacho: "",
    logradouroRedespacho: "",
    nroRedespacho: "",
    bairroRedespacho: "",
    ambiente: SEFAZ_AMBIENTE as "homologacao" | "producao",
    cfop: "5353",
    vPrest: "0.00",
    vCarga: "0.00",
    peso: "0",
    rntrc: "",
    icmsCST: "00",
    icmsBase: "1000.00",
    icmsAliq: "0.00",
    icmsValor: "0.00",
    reducaoBase: "0.00",
    creditoOutorgado: "0.00",
    pisAliq: "0.00",
    cofinsAliq: "0.00",
    irAliq: "0.00",
    inssAliq: "0.00",
    csllAliq: "0.00",
    motoristaNome: "",
    motoristaId: "",
    possuiMoto2: "",
    motorista2Nome: "",
    motorista2Id: "",
    ciot: "",
    ciotProtocolo: "",
    ciotTipoPagto: "6",
    ciotChave: "",
    placaVeiculo: "",
    placaReboque: "",
    semiReboque1: "",
    semiReboque2: "",
    seguradoraNome: "",
    seguradoraId: "",
    apolice: "",
    averbacao: "",
    cMunEnv: "3106200",
    xMunEnv: "BELO HORIZONTE",
    ufEnv: "MG",
    cMunIni: "3106200",
    xMunIni: "BELO HORIZONTE",
    ufIni: "MG",
    cMunFim: "3550308",
    xMunFim: "SAO PAULO",
    ufFim: "SP",
    dataEmissao: new Date().toISOString().slice(0, 10),
    formaPagamento: "Outros",
    finalidadeEmissao: "Normal",
    tipoServico: "Normal",
    formaEmissao: "Normal",
    modoEmbarque: "avulso" as "avulso" | "simplificado",
    cteReferenciado: "",
    chaveCompAnulacao: "",
    dataDeclaracao: "",
    obsGerais: "",
    obsAnulacao: "",
    obsGlobalizado: "",
    adicionalPed: "0.00",
    descontoPed: "0.00",
    outrosPed: "0.00",
    adValorem: "0.00",
    gris: "0.00",
    taxaColeta: "0.00",
    taxaEntrega: "0.00",
    valePedagio: "0.00",
    pedagioPagto: "sem-pagamento",
    pedagioOperadora: "",
    pedagioCnpj: "",
    pedagioTag: "",
    pedagioRespCnpj: "",
    pedagioIdentVPO: "",
    pedagioDataOp: "",
    distanciaKm: "",
    duracaoHoras: "",
    docAntChaves: "",
    docAntTpPrest: "1",
    rctrC: "0.00",
    rcfDc: "0.00",
    segAdicional: "0.00",
    segTotal: "0.00",
    segRepassar: "",
    segResponsavel: "4",
  };
  // Percurso NÃO guarda motorista nem frete: ao abrir um CT-e novo, esses dados de viagem zeram
  const LIMPA_VIAGEM = {
    motoristaNome: "",
    motoristaId: "",
    possuiMoto2: "",
    motorista2Nome: "",
    motorista2Id: "",
    ciot: "",
    ciotProtocolo: "",
    ciotTipoPagto: "6",
    ciotChave: "",
    placaVeiculo: "",
    placaReboque: "",
    semiReboque1: "",
    semiReboque2: "",
    vPrest: "0.00",
    adicionalPed: "0.00",
    descontoPed: "0.00",
    outrosPed: "0.00",
    adValorem: "0.00",
    gris: "0.00",
    taxaColeta: "0.00",
    taxaEntrega: "0.00",
    valePedagio: "0.00",
    pedagioPagto: "sem-pagamento",
    pedagioOperadora: "",
    pedagioCnpj: "",
    pedagioTag: "",
    pedagioRespCnpj: "",
    pedagioIdentVPO: "",
    pedagioDataOp: "",
    distanciaKm: "",
    duracaoHoras: "",
  };
  const PEDAGIO_OPERADORAS = [
    { nome: "CONECTCAR", cnpj: "16577631000299" },
    { nome: "DB TRANS", cnpj: "04467870000126" },
    { nome: "MOVE MAIS", cnpj: "15266912000187" },
    { nome: "PAMCARD", cnpj: "12815827000123" },
    { nome: "REPOM", cnpj: "65997260000103" },
    { nome: "SEM PARAR", cnpj: "04088208000165" },
    { nome: "TARGET", cnpj: "14821124000142" },
    { nome: "VELOE", cnpj: "04740876000125" },
  ];
  const PAGTO_VALIDOS = ["free-flow", "tag-transportador", "tag-tomador", "sem-pagamento"];
  const pagtoSeguro = (v: any) => (PAGTO_VALIDOS.includes(v) ? v : "sem-pagamento");
  const [form, setForm] = useState(emptyForm);
  const adicionarNfeManual = () => {
    const emit = manualNfe.emit.trim();
    const dest = manualNfe.dest.trim();
    if (!emit || !dest) {
      toast.error("Informe remetente e destinatário");
      return;
    }
    const chave = manualNfe.chave.replace(/\D/g, "") || `MANUAL-${Date.now()}`;
    const item = {
      chave,
      modelo: manualNfe.modelo.trim() || "55",
      nNF: manualNfe.nNF.trim() || "AVULSA",
      serie: manualNfe.serie.trim() || "1",
      emit,
      emitCnpj: manualNfe.emitCnpj.replace(/\\D/g, ""),
      emitUF: "",
      emitCMun: "",
      emitXMun: "",
      dest,
      destCnpj: manualNfe.destCnpj.replace(/\\D/g, ""),
      destUF: "",
      destCMun: "",
      destXMun: "",
      valor: Number(manualNfe.valor.replace(",", ".")) || 0,
      peso: Number(manualNfe.peso.replace(",", ".")) || 0,
      quantidade: Number(manualNfe.qtde.replace(",", ".")) || 0,
      qtdePeso: Number(manualNfe.peso.replace(",", ".")) || 0,
      data: manualNfe.data,
      tomador: dest,
      tomadorCnpj: manualNfe.destCnpj.replace(/\\D/g, ""),
      tomadorUF: "",
      tomadorCMun: "",
      tomadorXMun: "",
      modFrete: "9",
    };
    setMercadorias((current) => [...current, item]);
    setSelecionadas((current) => new Set(current).add(chave));
    setForm((current) => ({
      ...current,
      vCarga: (mercadorias.reduce((sum, m) => sum + m.valor, 0) + item.valor).toFixed(2),
      peso: String(mercadorias.reduce((sum, m) => sum + m.peso, 0) + item.peso),
      xMunIni: current.xMunIni,
      xMunFim: current.xMunFim,
    }));
    setManualNfe({
      modelo: "55",
      chave: "",
      nNF: "",
      serie: "1",
      emit: "",
      emitCnpj: "",
      dest: "",
      destCnpj: "",
      data: new Date().toISOString().slice(0, 10),
      qtde: "1",
      peso: "0",
      valor: "0",
    });
    setManualNfeOpen(false);
    toast.success("NF-e manual adicionada ao CT-e");
  };
  const limparFormularioAoSair = () => {
    setOpen(false);
    setForm({ ...emptyForm });
    setMercadorias([]);
    setSelecionadas(new Set());
    setEditingRascunhoId(null);
    setViewDoc(null);
    setAba("geral");
    setPercPickOpen(false);
    setVeiculoOpen(null);
    setMotoristaOpen(false);
    setMotorista2Open(false);
    qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    if (empresa?.id) {
      void qc.refetchQueries({ queryKey: ["cte-nfes-pendentes", empresa.id], type: "active" });
    }
  };
  // Novo CT-e preservando dados fiscais (CFOP, impostos, status) — só limpa dados da NF/tomador/rota
  const novoCtePreservandoFiscal = () => {
    setForm((f) => {
      const keep: any = {};
      for (const k of [
        "ambiente",
        "cfop",
        "icmsCST",
        "icmsAliq",
        "reducaoBase",
        "creditoOutorgado",
        "pisAliq",
        "cofinsAliq",
        "irAliq",
        "inssAliq",
        "csllAliq",
        "formaPagamento",
        "finalidadeEmissao",
        "tipoServico",
        "formaEmissao",
      ])
        keep[k] = (f as any)[k];
      return { ...emptyForm, ...keep, ...LIMPA_VIAGEM };
    });
    setSelecionadas(new Set());
    setEditingRascunhoId(null);
    setViewDoc(null);
    setAba("geral");
    setOpen(true);
  };
  const novoAvulsoDePercurso = (r: Record<string, any>) => {
    setForm({ ...emptyForm });
    setMercadorias([]);
    setSelecionadas(new Set());
    setEditingRascunhoId(null);
    setViewDoc(null);
    setPercPickOpen(false);
    aplicarPercurso(r);
    percursoAplicadoKey.current = "pick|" + (r as any).id;
    if ((r as any).entrega_xmun) travarPendenteRef.current = true;
    setAba("geral");
    setOpen(true);
    toast.success(`Percurso ${r.codigo} aplicado`);
  };
  const [cfopOpen, setCfopOpen] = useState(false);
  const [cfopQuery, setCfopQuery] = useState("");
  useEffect(() => {
    if (!open || !empresa) return;
    const cnpjEmp = String((empresa as any).cnpj || "").replace(/\D/g, "");
    if (cnpjEmp.length !== 14) return;
    setForm((f) => (f.pedagioRespCnpj ? f : { ...f, pedagioRespCnpj: cnpjEmp }));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dEmi = String(form.dataEmissao || "").slice(0, 10);
    if (!dEmi) return;
    setForm((f) => (f.pedagioDataOp === dEmi ? f : { ...f, pedagioDataOp: dEmi }));
  }, [open, form.dataEmissao]);

  // Total da prestação = Valor Serviço + componentes − Desconto (vale-pedágio NÃO integra: Lei 10.209/2001 art. 2º)
  // Valor cobrado de cada imposto = base (total da prestação) × alíquota
  const valorImposto = (aliq: any) =>
    ((totalPrestacao(form) * (parseFloat(aliq || "0") || 0)) / 100).toFixed(2);
  // CIOT direto ANTT (ETC frota própria, sem TAC): usa certificado + mTLS.
  // Exige CNPJ+cert e placas cadastrados na ANTT (pef@antt.gov.br), senão rejeita.
  const [emitindoCiotLote, setEmitindoCiotLote] = useState(false);
  // ---- Aba CIOT: uma operação ANTT cobrindo 1+ CT-es autorizados ----
  const [ciotSel, setCiotSel] = useState<Set<string>>(new Set());
  const { data: ciotOps } = useQuery({
    enabled: !!empresa,
    queryKey: ["ciot-operacoes", empresa?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ciot_operacoes" as any)
        .select("id,ciot,ciot_verificador,protocolo,id_operacao,status,valor_frete,distancia_km,tipo_carga,placa,tomador_nome,created_at,cte_ids")
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, any>>;
    },
  });
  const [ciotConfirma, setCiotConfirma] = useState(false);
  const [ciotFrota, setCiotFrota] = useState<Array<{ rntrc: string; situacao: any; frota: any }> | null>(null);
  const [ciotFrotaLoading, setCiotFrotaLoading] = useState(false);
  const [ciotConsulta, setCiotConsulta] = useState("");
  const [ciotConsultaRes, setCiotConsultaRes] = useState<any>(null);
  const [ciotConsultaLoading, setCiotConsultaLoading] = useState(false);
  const [confRascunho, setConfRascunho] = useState<CteDoc | null>(null);
  const [confLimpar, setConfLimpar] = useState(false);
  const [confExcSel, setConfExcSel] = useState(false);
  // Preenchimento em lote (CIOT + pedágio) nos rascunhos selecionados
  const [loteCiotOpen, setLoteCiotOpen] = useState(false);
  const [loteCiot, setLoteCiot] = useState("");
  const [loteModo, setLoteModo] = useState("manter");
  const [loteOperadora, setLoteOperadora] = useState("");
  const [loteVpo, setLoteVpo] = useState("");
  const [loteVale, setLoteVale] = useState("");
  const [loteSalvando, setLoteSalvando] = useState(false);
  const verificarFrotaCiot = async () => {
    const r = resumoCiot;
    if (!empresa || !r) {
      toast.error("Selecione ao menos um CT-e autorizado");
      return;
    }
    const emitCnpj = String((empresa as any).cnpj || "").replace(/\D/g, "");
    const pad9 = (s: unknown) => {
      const d = String(s || "").replace(/\D/g, "");
      return d.length === 8 ? "0" + d : d;
    };
    const byPlaca = (pl: string) =>
      (veiculos || []).find((v: any) => String(v.placa || "").toUpperCase() === String(pl || "").toUpperCase()) as any;
    const placas = [r.forms[0]?.placaVeiculo, r.forms[0]?.placaReboque, r.forms[0]?.semiReboque1, r.forms[0]?.semiReboque2]
      .map((pl) => String(pl || "").trim().toUpperCase())
      .filter(Boolean)
      .filter((pl, i, a) => a.indexOf(pl) === i);
    // Agrupa por RNTRC do cadastro de cada placa: a TXE pode pertencer a um
    // RNTRC diferente do RNTRC padrão da operação (cada grupo é consultado
    // com o próprio RNTRC).
    const grupos = new Map<string, string[]>();
    for (const pl of placas) {
      const rn = pad9(byPlaca(pl)?.rntrc || rntrcFinal);
      if (!grupos.has(rn)) grupos.set(rn, []);
      grupos.get(rn)!.push(pl);
    }
    setCiotFrotaLoading(true);
    try {
      const res: Array<{ rntrc: string; situacao: any; frota: any }> = [];
      for (const [rn, pls] of grupos) {
        const ret: any = await consultarFrotaAnttFn({
          data: { empresaId: empresa.id, interessadoDoc: emitCnpj, transportadorDoc: emitCnpj, rntrc: rn, placas: pls },
        });
        res.push({ rntrc: rn, situacao: ret?.situacao, frota: ret?.frota });
      }
      setCiotFrota(res);
    } catch (e: any) {
      toast.error("Falha ao consultar ANTT", { description: e?.message });
    } finally {
      setCiotFrotaLoading(false);
    }
  };
  const consultarCiotNaAntt = async () => {
    if (!empresa) return;
    const cod = ciotConsulta.replace(/\D/g, "");
    if (cod.length !== 12) {
      toast.error("Informe o CIOT com 12 dígitos");
      return;
    }
    setCiotConsultaLoading(true);
    try {
      const ret: any = await consultarCiotGeradoAnttFn({
        data: { empresaId: empresa.id, codigo12: cod, ano: new Date().getFullYear() },
      });
      setCiotConsultaRes(ret);
    } catch (e: any) {
      toast.error("Falha ao consultar CIOT", { description: e?.message });
    } finally {
      setCiotConsultaLoading(false);
    }
  };
  const emitirCiotLote = async () => {
    const r = resumoCiot;
    if (!empresa) {
      toast.error("Selecione uma empresa");
      return;
    }
    if (!r) {
      toast.error("Selecione ao menos um CT-e autorizado");
      return;
    }
    if (!r.tomaOk) {
      toast.error("Os CT-es precisam ter o mesmo tomador (contratante)");
      return;
    }
    if (!r.motoOk) {
      toast.error("Os CT-es têm motoristas diferentes — uma operação CIOT exige o mesmo motorista");
      return;
    }
    if (r.abaixo) {
      toast.error("Valor abaixo do piso mínimo ANTT — emissão bloqueada");
      return;
    }
    const emitCnpj = String((empresa as any).cnpj || "").replace(/\D/g, "");
    if (emitCnpj.length !== 14) {
      toast.error("CNPJ da empresa inválido para o CIOT");
      return;
    }
    if (!r.placa || !r.eixos) {
      toast.error("Tração do 1º CT-e sem placa/eixos para o CIOT");
      return;
    }
    if (!r.donoOk) {
      const donoTxt = r.donoDoc
        ? `está em nome de ${r.donoNome || "terceiro"} (${r.donoDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})`
        : "está sem proprietário cadastrado no veículo";
      toast.error(`Tração ${r.placa} ${donoTxt}. CIOT próprio exige cavalo no CNPJ do emissor.`, {
        duration: 8000,
      });
      return;
    }
    if (!r.km) {
      toast.error("Distância (km) do 1º CT-e necessária para o CIOT");
      return;
    }
    if (!(r.valorTotal > 0)) {
      toast.error("Valor do frete precisa ser maior que zero");
      return;
    }
    const sel = r.sel;
    const forms = r.forms;
    const tomaCnpj = r.tomaCnpj;
    const tomaNome = r.tomaNome;
    const valorTotal = r.valorTotal;
    const placa = r.placa;
    const km = r.km;
    const eixos = r.eixos;
    const pesoTotal = r.pesoTotal;
    // Destinatário vem da NF-e vinculada ao CT-e (não existe no form).
    // Fallback final: busca na tabela de NF-es pelas chaves do XML.
    let destCnpj = destDoDocCiot(sel[0]);
    if (!destCnpj) {
      try {
        const chaves = [...(sel[0].xml_assinado || "").matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map((m) => m[1]);
        if (chaves.length > 0 && empresa) {
          const { data } = await supabase
            .from("cte_nfes_pendentes" as any)
            .select("dest_cnpj")
            .eq("empresa_id", empresa.id)
            .in("chave", chaves);
          destCnpj =
            ((data as any[]) || [])
              .map((r) => String(r.dest_cnpj || "").replace(/\D/g, ""))
              .find((d) => d.length >= 11) || "";
        }
      } catch {}
    }
    if (!destCnpj) {
      toast.error("1º CT-e sem destinatário na NF-e vinculada — CIOT exige o destinatário");
      return;
    }
    setEmitindoCiotLote(true);
    const tProg = toast.loading("Gerando IdOperacao na ANTT…");
    try {
      const tipoCodigo = 5; // sempre Carga Geral
      // ANTT apura o tipo (automotor/implemento) no cadastro dela: o item
      // leva só placa + eixos DO PRÓPRIO veículo (tração primeiro, reboques
      // depois). Mandar a soma da combinação num item só rejeita ([205]).
      const byPlacaCiot = (pl: string) =>
        (veiculos || []).find((v: any) => String(v.placa || "").toUpperCase() === String(pl || "").toUpperCase());
      const placasCiot = [forms[0]?.placaVeiculo, forms[0]?.placaReboque, forms[0]?.semiReboque1, forms[0]?.semiReboque2]
        .map((pl) => String(pl || "").trim().toUpperCase())
        .filter(Boolean)
        .filter((pl, i, a) => a.indexOf(pl) === i);
      // O RNTRC da operação é o da TRAÇÃO (dono do cavalo): a TXE pode estar
      // num RNTRC diferente do padrão da empresa.
      const rntrcContratado = String(
        (byPlacaCiot(String(forms[0]?.placaVeiculo || "")) as any)?.rntrc || rntrcFinal || "",
      ).replace(/\D/g, "");
      const veicsCiot = placasCiot
        .map((pl) => {
          const cad = byPlacaCiot(pl) as any;
          return {
            placa: pl,
            eixos: Number(cad?.quantidade_eixos) || 0,
            rntrc: String(cad?.rntrc || rntrcContratado || "").replace(/\D/g, ""),
          };
        })
        .filter((v) => v.eixos > 0);
      if (veicsCiot.length === 0) {
        toast.dismiss(tProg);
        toast.error("Tração sem eixos no cadastro do veículo — confira a placa em Frota → Veículos");
        setEmitindoCiotLote(false);
        return;
      }
      toast.loading("Declarando operação na ANTT…", { id: tProg });
      const hoje = new Date();
      const fmtD = (d: Date) => d.toISOString().slice(0, 10);
      const fim = new Date(hoje.getTime() + Math.max(1, Math.ceil(km / 800)) * 86400000);
      const ret: any = await emitirCiotFn({
        data: {
          empresaId: empresa.id,
          input: {
            tipoOperacao: 1,
            contratado: { doc: emitCnpj, rntrc: rntrcContratado },
            contratante: { doc: tomaCnpj },
            destinatarioDoc: destCnpj || undefined,
            veiculos: veicsCiot,
            pagamento: {
              tipo: 6,
              docCreditado: emitCnpj,
              indPagamento: 0,
              chavePix: emitCnpj,
            },
            origem: { cmun: String(forms[0]?.cMunIni || "").replace(/\D/g, "") || undefined },
            destino: { cmun: String(forms[0]?.cMunFim || "").replace(/\D/g, "") || undefined },
            distanciaKm: km,
            qtdViagens: 1,
            carga: {
              peso: pesoTotal > 0 ? Math.round(pesoTotal) : 1,
              tipoCodigo,
            },
            valorFrete: Math.round(valorTotal * 100) / 100,
            dataInicioViagem: fmtD(hoje),
            dataFimViagem: fmtD(fim),
            indAltoDesempenho: false,
            indRetornoVazio: false,
            composicaoVeicular: true,
          },
        },
      });
      if (ret?.sucesso && ret?.ciotCompleto) {
        const chaves = sel.map((d) => String(d.chave_acesso || "").replace(/\D/g, "")).filter(Boolean);
        await supabase.from("ciot_operacoes" as any).insert({
          empresa_id: empresa.id,
          ciot: ret.ciotCompleto,
          ciot_verificador: ret.ciotVerificador || null,
          protocolo: ret.protocolo || null,
          id_operacao: ret.idOperacao || null,
          ambiente: "homologacao",
          status: "declarado",
          valor_frete: Math.round(valorTotal * 100) / 100,
          distancia_km: km,
          tipo_carga: "Carga Geral",
          eixos,
          placa,
          tomador_cnpj: tomaCnpj,
          tomador_nome: tomaNome || null,
          emit_cnpj: emitCnpj,
          cte_ids: sel.map((d) => d.id),
          cte_chaves: chaves,
          data_inicio: fmtD(hoje),
          data_fim: fmtD(fim),
        } as any);
        // Propaga o CIOT p/ cada CT-e (MDF-e/DACTE leem de lá).
        for (const d of sel) {
          try {
            const raw = JSON.parse(d.xml_assinado || "{}");
            const f0 = raw && typeof raw === "object" && raw.form ? raw.form : {};
            await supabase
              .from("cte_documentos" as any)
              .update({
                xml_assinado: JSON.stringify({
                  ...raw,
                  form: { ...f0, ciot: ret.ciotCompleto, ciotProtocolo: ret.protocolo || "" },
                }),
              })
              .eq("id", d.id);
          } catch {}
        }
        setCiotSel(new Set());
        qc.invalidateQueries({ queryKey: ["ciot-operacoes", empresa.id] });
        qc.invalidateQueries({ queryKey: ["cte-documentos"] });
        toast.success(`CIOT ${ret.ciotCompleto} autorizado (prot. ${ret.protocolo || "—"})`);
      } else {
        toast.error("CIOT rejeitado", { description: `[${ret?.codigo || "?"}] ${ret?.mensagem || "sem resposta da ANTT"} (IdOp ${ret?.idOperacao || "—"})` });
      }
    } catch (e: any) {
      toast.dismiss(tProg);
      toast.error("Falha ao emitir CIOT", { description: e?.message });
    } finally {
      toast.dismiss(tProg);
      setEmitindoCiotLote(false);
    }
  };
  const num2 = (v: any) => parseFloat(v) || 0;
  const totalPrestacao = (f: typeof emptyForm) =>
    Math.max(
      0,
      num2(f.vPrest) +
        num2(f.adicionalPed) +
        num2(f.outrosPed) +
        num2(f.adValorem) +
        num2(f.gris) +
        num2(f.taxaColeta) +
        num2(f.taxaEntrega) -
        num2(f.descontoPed),
    );

  // Pedágio: com cobrança (Free Flow / TAGs) os dados são obrigatórios — alimentam o MDF-e e barram a emissão
  const Traciona = (tipo: any) => {
    const t = String(tipo || "").toLowerCase();
    return t.indexOf("cavalo") >= 0 || (t.indexOf("truck") >= 0 && t.indexOf("bitruck") < 0);
  };
  const validarPedagio = (f: typeof emptyForm) => {
    const modo = pagtoSeguro(f.pedagioPagto) as string;
    if (modo === "sem-pagamento") return;
    const rotulo =
      modo === "free-flow"
        ? "Free Flow"
        : modo === "tag-transportador"
          ? "TAG Transportador"
          : "TAG Tomador";
    const errs: string[] = [];
    if (!(f.pedagioOperadora || "").trim()) errs.push("Operadora");
    if ((f.pedagioCnpj || "").replace(/\D/g, "").length !== 14)
      errs.push("CNPJ da Operadora (14 dígitos)");
    if ((parseFloat(f.valePedagio) || 0) <= 0) errs.push("Vale Pedágio (R$) maior que zero");
    if (((f as any).pedagioRespCnpj || "").replace(/\D/g, "").length !== 14)
      errs.push("CNPJ Responsável Pagamento (14 dígitos)");
    if (!((f as any).pedagioIdentVPO || "").trim() && !(f.pedagioTag || "").trim())
      errs.push("Identificador VPO");
    if ((modo === "tag-transportador" || modo === "tag-tomador") && !(f.pedagioTag || "").trim())
      errs.push("Nº TAG");
    if (errs.length) throw new Error(`Pedágio obrigatório (${rotulo}): informe ${errs.join("; ")}`);
  };

  // Auto-calcula ICMS sobre o TOTAL da prestação: vICMS = base * aliquota / 100
  useEffect(() => {
    const base = totalPrestacao(form);
    const aliq = parseFloat(form.icmsAliq) || 0;
    const calc = ((base * aliq) / 100).toFixed(2);
    if (calc !== form.icmsValor) setForm((f) => ({ ...f, icmsValor: calc }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.vPrest,
    form.adicionalPed,
    form.descontoPed,
    form.outrosPed,
    form.adValorem,
    form.gris,
    form.taxaColeta,
    form.taxaEntrega,
    form.icmsAliq,
  ]);

  // NF-es pendentes persistidas (sobrevivem a F5/troca de tela) — dedup global por chave
  const { data: pendentesDB } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-nfes-pendentes", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cte_nfes_pendentes" as any)
        .select(
          "chave,n_nf,serie,emit_nome,emit_cnpj,emit_uf,emit_cmun,emit_xmun,emit_ie,emit_logradouro,emit_nro,emit_bairro,emit_cep,emit_fone,dest_nome,dest_cnpj,dest_uf,dest_cmun,dest_xmun,dest_ie,dest_logradouro,dest_nro,dest_bairro,dest_cep,dest_fone,valor,peso,data_emissao,tomador_nome,tomador_cnpj,tomador_uf,tomador_cmun,tomador_xmun,tomador_ie,tomador_logradouro,tomador_bairro,tomador_cep,mod_frete",
        )
        .eq("empresa_id", empresa!.id)
        .eq("status", "pendente")
        .order("created_at")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        chave: string;
        n_nf: string | null;
        serie: string | null;
        emit_nome: string | null;
        emit_cnpj: string | null;
        emit_uf: string | null;
        emit_cmun: string | null;
        emit_xmun: string | null;
        dest_nome: string | null;
        dest_cnpj: string | null;
        dest_uf: string | null;
        dest_cmun: string | null;
        dest_xmun: string | null;
        valor: number | null;
        peso: number | null;
        data_emissao: string | null;
        tomador_nome: string | null;
        tomador_cnpj: string | null;
        tomador_uf: string | null;
        tomador_cmun: string | null;
        tomador_xmun: string | null;
        tomador_ie: string | null;
        tomador_logradouro: string | null;
        tomador_bairro: string | null;
        tomador_cep: string | null;
        mod_frete: string | null;
      }>;
    },
  });
  // Todas as NF-es (qualquer status) para cruzar CT-es autorizados com o percurso no complemento
  const { data: nfesTodas } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-nfes-todas", empresa?.id],
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cte_nfes_pendentes" as any)
        .select("chave,emit_cnpj,emit_nome,dest_cnpj,dest_nome")
        .eq("empresa_id", empresa!.id)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        chave: string;
        emit_cnpj: string | null;
        emit_nome: string | null;
        dest_cnpj: string | null;
        dest_nome: string | null;
      }>;
    },
  });
  // Mapeia as NF-es pendentes (banco) p/ a lista de embarque. A aba de embarque
  // e o diálogo COMPARTILHAM o estado `mercadorias`: ao abrir rascunho ele é
  // trocado pelos itens do rascunho, então ao fechar sem salvar é preciso
  // restaurar a lista das pendentes (senão as notas "somem" da tela).
  const mapearPendentes = (rows: Array<Record<string, any>>) =>
    rows.map((r) => ({
      chave: r.chave,
      nNF: r.n_nf || "",
      serie: r.serie || "1",
      emit: r.emit_nome || "",
      emitCnpj: r.emit_cnpj || "",
      emitUF: r.emit_uf || "",
      emitCMun: r.emit_cmun || "",
      emitXMun: r.emit_xmun || "",
      emitIE: (r as any).emit_ie || "",
      emitLogradouro: (r as any).emit_logradouro || "",
      emitNro: (r as any).emit_nro || "",
      emitBairro: (r as any).emit_bairro || "",
      emitCEP: (r as any).emit_cep || "",
      emitFone: (r as any).emit_fone || "",
      dest: r.dest_nome || "",
      destCnpj: r.dest_cnpj || "",
      destUF: r.dest_uf || "",
      destCMun: r.dest_cmun || "",
      destXMun: r.dest_xmun || "",
      destIE: (r as any).dest_ie || "",
      destLogradouro: (r as any).dest_logradouro || "",
      destNro: (r as any).dest_nro || "",
      destBairro: (r as any).dest_bairro || "",
      destCEP: (r as any).dest_cep || "",
      destFone: (r as any).dest_fone || "",
      valor: Number(r.valor ?? 0),
      peso: Number(r.peso ?? 0),
      qVol: Number((r as any).qvol ?? 0),
      data: r.data_emissao ? String(r.data_emissao).slice(0, 10) : "",
      tomador: r.tomador_nome || "",
      tomadorCnpj: r.tomador_cnpj || "",
      tomadorUF: r.tomador_uf || "",
      tomadorCMun: r.tomador_cmun || "",
      tomadorXMun: r.tomador_xmun || "",
      tomadorIE: r.tomador_ie || "",
      tomadorLogradouro: r.tomador_logradouro || "",
      tomadorBairro: r.tomador_bairro || "",
      tomadorCEP: r.tomador_cep || "",
      modFrete: r.mod_frete || "",
    }));
  const sincronizarEmbarque = () => {
    if (!pendentesDB) return;
    setMercadorias(mapearPendentes(pendentesDB as any) as any);
  };
  useEffect(() => {
    if (open) return; // diálogo aberto usa mercadorias próprias (rascunho/CT-e)
    if (pendentesDB) {
      const mapped = mapearPendentes(pendentesDB as any);
      setMercadorias(mapped as any);
      if (mapped.length > 0 && mapped[0].emitCMun) {
        const first = mapped[0];
        setForm((f) => ({
          ...f,
          cMunIni: first.emitCMun || f.cMunIni,
          xMunIni: first.emitXMun || f.xMunIni,
          ufIni: first.emitUF || f.ufIni,
          cMunFim: first.destCMun || f.cMunFim,
          ieDestinatario: (first as any).destIE || (f as any).ieDestinatario || "",
          xMunFim: first.destXMun || f.xMunFim,
          ufFim: first.destUF || f.ufFim,
          cMunEnv: first.emitCMun || f.cMunEnv,
          xMunEnv: first.emitXMun || f.xMunEnv,
          ufEnv: first.emitUF || f.ufEnv,
        }));
      }
    }
  }, [pendentesDB, open]);

  // Fechar o diálogo SEM salvar (ESC/X/Cancelar): restaura a lista de embarque
  const fecharDialogo = () => {
    setOpen(false);
    sincronizarEmbarque();
  };
  // Motoristas (cargo contém Motorista), Veículos e Seguradoras para menus tipo CFOP
  const [motoristaOpen, setMotoristaOpen] = useState(false);
  const [motoristaQuery, setMotoristaQuery] = useState("");
  const [motorista2Open, setMotorista2Open] = useState(false);
  const [motorista2Query, setMotorista2Query] = useState("");
  const [percPickOpen, setPercPickOpen] = useState(false);
  const [percPickQuery, setPercPickQuery] = useState("");
  const [percPickSel, setPercPickSel] = useState("");
  const [viewDoc, setViewDoc] = useState<CteDoc | null>(null);
  const [aba, setAba] = useState("geral");
  const navigate = useNavigate();
  const [mdfSel, setMdfSel] = useState<Set<string>>(new Set());
  // Importação em lote (XML/PDF) dos autorizados — vale p/ Sem e Com MDF-e
  const [impSel, setImpSel] = useState<Set<string>>(new Set());
  const [impOpen, setImpOpen] = useState(false);
  const [impTipo, setImpTipo] = useState<"pdf" | "xml" | "ambos">("ambos");
  const [impProc, setImpProc] = useState(false);
  // Lote de envio (aba Aguardando envio) + ordenação das tabelas de documentos
  const [envSel, setEnvSel] = useState<Set<string>>(new Set());
  const [enviandoLote, setEnviandoLote] = useState(false);
  // Espelho em ref: onSuccess do emitir precisa saber se está no lote
  // (state dentro do closure chega defasado no meio do loop).
  const enviandoLoteRef = useRef(false);
  const [ordDocs, setOrdDocs] = useState<{ chave: string; dir: 1 | -1 } | null>(null);
  const fmtDataHora = (iso: any) => {
    try {
      const d = new Date(String(iso));
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };
  const [veiculoOpen, setVeiculoOpen] = useState<string | null>(null);
  const [veiculoQuery, setVeiculoQuery] = useState("");
  const [seguradoraOpen, setSeguradoraOpen] = useState(false);
  const [seguradoraQuery, setSeguradoraQuery] = useState("");
  const { data: motoristas } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-motoristas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id,nome,cargo,cpf")
        .eq("empresa_id", empresa!.id)
        .eq("status", "ativo")
        .ilike("cargo", "%motorist%")
        .order("nome")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        nome: string;
        cargo: string;
        cpf: string | null;
      }>;
    },
  });
  const { data: rntrcCad } = useQuery({
    enabled: !!empresa,
    queryKey: ["rntrc-cte", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rntrc_lista" as never)
        .select("rntrc,cnpj")
        .eq("empresa_id", empresa!.id)
        .order("rntrc");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ rntrc: string; cnpj: string | null }>;
      const empDigits = String((empresa as any).cnpj || "").replace(/\D/g, "");
      return (
        rows.find((r) => String(r.cnpj || "").replace(/\D/g, "") === empDigits && empDigits)
          ?.rntrc ||
        rows[0]?.rntrc ||
        ""
      );
    },
  });
  const normRntrc8 = (v: string) => {
    const u = String(v || "").toUpperCase();
    if (u === "ISENTO") return u;
    let d = u.replace(/\D/g, "");
    while (d.length > 8 && d.startsWith("0")) d = d.slice(1);
    return d;
  };
  const rntrcFinal = normRntrc8(rntrcCad || form.rntrc || "");
  const { data: veiculos } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos-cte", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("veiculos" as never)
        .select("id,placa,marca_modelo,tipo,renavam,rntrc,tag_pedagio,quantidade_eixos,proprietario,proprietario_doc")
        .eq("empresa_id", empresa!.id)
        .order("placa")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        placa: string;
        marca_modelo: string | null;
        tipo: string | null;
        renavam: string | null;
        rntrc: string | null;
        tag_pedagio: string | null;
        quantidade_eixos: number | null;
        proprietario: string | null;
        proprietario_doc: string | null;
      }>;
    },
  });
  // Resumo da operação CIOT (usado no diálogo e na emissão): frete somado,
  // tração do 1º CT-e e MAIOR distância do lote p/ o piso ANTT. Abaixo do piso = bloqueada.
  // (Aqui embaixo por causa de `veiculos`, declarado acima.)
  const resumoCiot = useMemo(() => {
    const sel = docsByStatus.autorizados.filter((d) => ciotSel.has(d.id));
    if (sel.length === 0) return null;
    const forms = sel.map((d) => formDeDocCiot(d));
    const tomas = [...new Set(forms.map((f) => String(f.cnpjTomador || "").replace(/\D/g, "")).filter(Boolean))];
    const tomaOk = tomas.length === 1 && tomas[0].length === 14;
    // Uma operação CIOT = um motorista (não mistura condutores no lote)
    const motos = [
      ...new Set(
        forms.map((f) => String(f.motoristaId || f.motoristaNome || "").trim().toUpperCase()).filter(Boolean),
      ),
    ];
    const motoOk = motos.length === 1;
    const valorTotal = sel.reduce(
      (a, d, i) => a + (Number(d.valor_servico) || Number(String(forms[i]?.vPrest || "").replace(",", ".")) || 0),
      0,
    );
    const placa = String(forms[0]?.placaVeiculo || "").toUpperCase();
    const eixos = eixosCombinacao(forms[0], veiculos || []);
    // Piso do lote usa a MAIOR distância entre os CT-es selecionados
    const km = Math.round(
      Math.max(0, ...forms.map((f) => Number(String(f?.distanciaKm || "").replace(",", ".")) || 0)),
    );
    const pesoTotal = sel.reduce((a, d, i) => {
      const f = forms[i];
      const fromForm = Number(String(f?.peso || "").replace(",", ".")) || 0;
      if (fromForm > 0) return a + fromForm;
      // fallback: lê qCarga direto do XML assinado
      try {
        const j = JSON.parse(d.xml_assinado || "{}");
        const rawXml: string = typeof j.xml === "string" ? j.xml : "";
        const m = rawXml.match(/<qCarga>([\d.,]+)<\/qCarga>/);
        if (m) return a + (parseFloat(m[1].replace(",", ".")) || 0);
      } catch {}
      return a;
    }, 0);
    const piso = eixos > 0 && km > 0 ? pisoMinimoAntt("Carga Geral", eixos, km) : null;
    // CIOT próprio exige tração no CNPJ do emissor: compara o proprietário do
    // cavalo (cadastro de veículos) com o CNPJ da empresa emissora do CT-e.
    const emitCnpjCiot = String((empresa as any)?.cnpj || "").replace(/\D/g, "");
    const veicTrac = (veiculos || []).find((v: any) => String(v.placa || "").toUpperCase() === placa);
    const donoDoc = String((veicTrac as any)?.proprietario_doc || "").replace(/\D/g, "");
    const donoNome = String((veicTrac as any)?.proprietario || "");
    const donoOk = emitCnpjCiot.length === 14 && donoDoc.length > 0 && donoDoc === emitCnpjCiot;
    return {
      sel,
      forms,
      tomaCnpj: tomas[0] || "",
      tomaNome: String(forms[0]?.xNomeTomador || ""),
      tomaOk,
      motoNome: String(forms[0]?.motoristaNome || ""),
      motoOk,
      valorTotal,
      placa,
      eixos,
      km,
      pesoTotal,
      piso,
      abaixo: piso !== null && valorTotal > 0 && valorTotal < piso,
      donoDoc,
      donoNome,
      donoOk,
    };
  }, [docsByStatus, ciotSel, veiculos, empresa]);
  const { data: seguradoras } = useQuery({
    enabled: !!empresa,
    queryKey: ["seguradoras", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seguradoras" as never)
        .select("id,nome,cnpj,apolice_numero,averbacao")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        nome: string;
        cnpj: string | null;
        apolice_numero: string | null;
        averbacao: string | null;
      }>;
    },
  });

  // PIS/COFINS automático conforme regime da empresa
  const { data: regimeData } = useQuery({
    enabled: !!empresa,
    queryKey: ["empresa-regime", empresa?.id],
    queryFn: async () => {
      const { data: cfg } = await supabase
        .from("nfe_config")
        .select("regime_tributario")
        .eq("empresa_id", empresa!.id)
        .maybeSingle();
      if ((cfg as any)?.regime_tributario) return String((cfg as any).regime_tributario);
      const { data: emp } = await supabase
        .from("empresas")
        .select("regime_tributario")
        .eq("id", empresa!.id)
        .maybeSingle();
      return String((emp as any)?.regime_tributario || "simples");
    },
  });
  useEffect(() => {
    if (!regimeData || !empresa) return;
    const map: Record<string, { pis: string; cofins: string }> = {
      simples: { pis: "0.00", cofins: "0.00" },
      mei: { pis: "0.00", cofins: "0.00" },
      lucro_presumido: { pis: "0.65", cofins: "3.00" },
      lucro_real: { pis: "1.65", cofins: "7.60" },
    };
    const target = map[regimeData] || map["simples"];
    setForm((f) => {
      const isDefaultPis = f.pisAliq === "0.00" || f.pisAliq === "" || f.pisAliq === "0";
      const isDefaultCofins =
        f.cofinsAliq === "0.00" || f.cofinsAliq === "" || f.cofinsAliq === "0";
      // só auto-preenche se ainda estiver no padrão (não sobrescreve edição manual)
      if (!isDefaultPis && !isDefaultCofins) return f;
      return {
        ...f,
        pisAliq: isDefaultPis ? target.pis : f.pisAliq,
        cofinsAliq: isDefaultCofins ? target.cofins : f.cofinsAliq,
      };
    });
  }, [regimeData, empresa?.id]);

  // Lookup CNPJ p/ Consignatário/Redespacho: fiscal_cadastros → BrasilAPI → ReceitaWS
  const [lookingUpConsig, setLookingUpConsig] = useState(false);
  const [lookingUpRedesp, setLookingUpRedesp] = useState(false);
  const lastLookupConsig = useRef("");
  const lastLookupRedesp = useRef("");
  const fmtCnpjInput = (v: string) => {
    const d = (v || "").replace(/\D/g, "").slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };
  const buscarDadosCnpj = async (digits: string) => {
    if (empresa) {
      // select * (fiscal_cadastros ja tem coluna ie nativa)
      const { data } = await supabase
        .from("fiscal_cadastros" as any)
        .select("id,empresa_id,documento,nome,logradouro,numero,bairro,cidade,uf,cep,telefone,ie")
        .eq("empresa_id", empresa.id)
        .eq("documento", digits)
        .maybeSingle();
      if (data) {
        const c = data as any;
        return {
          nome: c.nome || "",
          logradouro: c.logradouro || "",
          numero: c.numero || "",
          bairro: c.bairro || "",
          cidade: c.cidade || "",
          uf: c.uf || "",
          cep: String(c.cep || "").replace(/\D/g, ""),
          fone: c.telefone || "",
          ie: c.ie || "",
          fromContatos: true,
        };
      }
    }
    let d: any = null;
    for (const url of [
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      `https://receitaws.com.br/v1/cnpj/${digits}`,
    ]) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          d = await res.json();
          break;
        }
      } catch {
        /* tenta próxima */
      }
    }
    if (!d || d.status === "ERROR") return null;
    return {
      nome: d.razao_social || d.nome || d.nome_fantasia || "",
      logradouro: d.logradouro || d.street || "",
      numero: String(d.numero || d.number || ""),
      bairro: d.bairro || d.district || "",
      cidade: d.municipio || d.city || "",
      uf: d.uf || d.state || "",
      cep: String(d.cep || d.zip || "").replace(/\D/g, ""),
      fone: d.ddd_telefone_1 || d.telefone || d.phone || "",
      ie: "",
      fromContatos: false,
    };
  };
  // Insert resiliente: tenta com `ie`, se a migration ainda não foi aplicada reinsere sem.
  // Entra no cache na hora (busca instantânea) em vez de esperar refetch.
  const insertContatoResiliente = async (row: Record<string, unknown>) => {
    const { error } = await supabase.from("fiscal_cadastros" as any).insert(row as any);
    if (error && /ie/i.test(error.message || "")) {
      const { ie: _omit, ...semIe } = row;
      const retry = await supabase.from("fiscal_cadastros" as any).insert(semIe as any);
      if (!retry.error && empresa) {
        qc.setQueryData(["contatos-cte", empresa.id], (old: any) => [...(Array.isArray(old) ? old : []), semIe]);
      } else if (empresa) {
        qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
      }
      return;
    }
    if (!error && empresa) {
      qc.setQueryData(["contatos-cte", empresa.id], (old: any) => [...(Array.isArray(old) ? old : []), row]);
    } else if (empresa) {
      qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
    }
  };
  const lookupConsignatario = async (digits: string) => {
    if (digits.length !== 14 || !empresa) return;
    setLookingUpConsig(true);
    try {
      const d = await buscarDadosCnpj(digits);
      if (!d) {
        toast.error("CNPJ não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        cnpjConsignatario: digits,
        xNomeConsignatario: d.nome || f.xNomeConsignatario,
        ieConsignatario: (d as any).ie || f.ieConsignatario,
        ufConsignatario: d.uf || f.ufConsignatario,
        xMunConsignatario: d.cidade || f.xMunConsignatario,
        cepConsignatario: d.cep || f.cepConsignatario,
        logradouroConsignatario: d.logradouro || f.logradouroConsignatario,
        nroConsignatario: d.numero || f.nroConsignatario,
        bairroConsignatario: d.bairro || f.bairroConsignatario,
      }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({
          empresa_id: empresa.id,
          nome: d.nome,
          documento: digits,
          uf: d.uf || null,
          cidade: d.cidade || null,
          logradouro: d.logradouro || null,
          numero: d.numero || null,
          bairro: d.bairro || null,
          cep: d.cep || null,
          telefone: d.fone || null,
        });
      }
      toast.success("Consignatário localizado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar CNPJ");
    } finally {
      setLookingUpConsig(false);
    }
  };
  const lookupRedespacho = async (digits: string) => {
    if (digits.length !== 14 || !empresa) return;
    setLookingUpRedesp(true);
    try {
      const d = await buscarDadosCnpj(digits);
      if (!d) {
        toast.error("CNPJ não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        cnpjRedespacho: digits,
        xNomeRedespacho: d.nome || f.xNomeRedespacho,
        ieRedespacho: (d as any).ie || f.ieRedespacho,
        ufRedespacho: d.uf || f.ufRedespacho,
        xMunRedespacho: d.cidade || f.xMunRedespacho,
        cepRedespacho: d.cep || f.cepRedespacho,
        logradouroRedespacho: d.logradouro || f.logradouroRedespacho,
        nroRedespacho: d.numero || f.nroRedespacho,
        bairroRedespacho: d.bairro || f.bairroRedespacho,
      }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({
          empresa_id: empresa.id,
          nome: d.nome,
          documento: digits,
          uf: d.uf || null,
          cidade: d.cidade || null,
          logradouro: d.logradouro || null,
          numero: d.numero || null,
          bairro: d.bairro || null,
          cep: d.cep || null,
          telefone: d.fone || null,
        });
      }
      toast.success("Redespacho localizado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar CNPJ");
    } finally {
      setLookingUpRedesp(false);
    }
  };

  // Contatos p/ completar Remetente/Destinatário na tela (XML pode não trazer endereço/IE)
  const { data: contatosCte } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cte", empresa?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("fiscal_cadastros" as any)
        .select("documento,nome,ie,logradouro,numero,bairro,cidade,uf,cep,telefone")
        .eq("empresa_id", empresa!.id)
        .limit(5000);
      return (data ?? []) as any[];
    },
  });
  const contatoByDoc = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of contatosCte ?? [])
      if ((c as any).documento) m.set(String((c as any).documento).replace(/\D/g, ""), c);
    return m;
  }, [contatosCte]);
  // Busca instantânea: CNPJs do CT-e (rem/dest/toma/consig/redesp) que não estão
  // no cache são buscados direto por documento (índice exato) e entram no cache
  useEffect(() => {
    if (!open || !empresa) return;
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const a = (sel.length > 0 ? sel[0] : mercadorias[0] || {}) as any;
    const docs = [a.emitCnpj, a.destCnpj, form.cnpjTomador, form.cnpjConsignatario, form.cnpjRedespacho]
      .map((d) => String(d || "").replace(/\D/g, ""))
      .filter((d) => d.length === 11 || d.length === 14)
      .filter((d) => !contatoByDoc.has(d));
    const unicos = [...new Set(docs)];
    if (unicos.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("fiscal_cadastros" as any)
        .select("documento,nome,ie,logradouro,numero,bairro,cidade,uf,cep,telefone")
        .eq("empresa_id", empresa.id)
        .in("documento", unicos);
      if (data && (data as any[]).length > 0) {
        qc.setQueryData(["contatos-cte", empresa.id], (old: any) => {
          const arr = Array.isArray(old) ? old : [];
          const seen = new Set(arr.map((c: any) => String(c.documento || "").replace(/\D/g, "")));
          return [...arr, ...(data as any[]).filter((c: any) => !seen.has(String(c.documento || "").replace(/\D/g, "")))];
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mercadorias, selecionadas, form.cnpjTomador, form.cnpjConsignatario, form.cnpjRedespacho, contatoByDoc]);
  // Tomador: troca de toma recalcula remetente/destinatário; CNPJ manual busca dados
  const [lookingUpTomador, setLookingUpTomador] = useState(false);
  const lastLookupTomador = useRef("");
  const [tomadorOpen, setTomadorOpen] = useState(false);
  const [tomadorQuery, setTomadorQuery] = useState("");
  const lookupTomador = async (digits: string) => {
    if (digits.length !== 14 || !empresa) return;
    setLookingUpTomador(true);
    try {
      const d = await buscarDadosCnpj(digits);
      if (!d) {
        toast.error("CNPJ não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        cnpjTomador: digits,
        xNomeTomador: d.nome || f.xNomeTomador,
        ieTomador: (d as any).ie || f.ieTomador,
        ufTomador: d.uf || f.ufTomador,
        xMunTomador: d.cidade || f.xMunTomador,
        cepTomador: d.cep || f.cepTomador,
        logradouroTomador: d.logradouro || f.logradouroTomador,
        nroTomador: d.numero || f.nroTomador,
        bairroTomador: d.bairro || f.bairroTomador,
        foneTomador: (d as any).fone || f.foneTomador,
      }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({
          empresa_id: empresa.id,
          nome: d.nome,
          documento: digits,
          uf: d.uf || null,
          cidade: d.cidade || null,
          logradouro: d.logradouro || null,
          numero: d.numero || null,
          bairro: d.bairro || null,
          cep: d.cep || null,
          telefone: (d as any).fone || null,
        });
      }
      toast.success("Tomador localizado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar CNPJ");
    } finally {
      setLookingUpTomador(false);
    }
  };
  // Escolheu/digitou CNPJ no dropdown: define toma (0 emit / 1 dest / 2 terceiros) e busca dados
  const onPickContatoTomador = (digits: string) => {
    const d = (digits || "").replace(/\D/g, "");
    if (d.length !== 14) return;
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const a = sel.length > 0 ? sel[0] : mercadorias[0];
    const emitD = a ? (a.emitCnpj || "").replace(/\D/g, "") : "";
    const destD = a ? (a.destCnpj || "").replace(/\D/g, "") : "";
    setForm((f) => ({ ...f, toma: d && d === emitD ? "0" : d && d === destD ? "1" : "2" }));
    lastLookupTomador.current = d;
    lookupTomador(d);
    setTomadorOpen(false);
    setTomadorQuery("");
  };
  const aplicarTomadorPorToma = (v: string) => {
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const first = (sel.length > 0 ? sel[0] : mercadorias[0]) as any;
    if (!first) {
      setForm((f) => ({ ...f, toma: v }));
      return;
    }
    const isEmit = v === "0" || v === "3";
    const isDest = v === "1" || v === "4";
    if (!isEmit && !isDest) {
      lastLookupTomador.current = "";
      setForm((f) => ({
        ...f,
        toma: v,
        cnpjTomador: "",
        xNomeTomador: "",
        ieTomador: "",
        ufTomador: "",
        cMunTomador: "",
        xMunTomador: "",
        cepTomador: "",
        logradouroTomador: "",
        nroTomador: "",
        bairroTomador: "",
        foneTomador: "",
        emailTomador: "",
      }));
      return;
    }
    const src = {
      cnpj: isEmit ? first.emitCnpj : first.destCnpj,
      nome: isEmit ? first.emit : first.dest,
      ie: isEmit ? first.emitIE : first.destIE,
      uf: isEmit ? first.emitUF : first.destUF,
      cMun: isEmit ? first.emitCMun : first.destCMun,
      xMun: isEmit ? first.emitXMun : first.destXMun,
      cep: isEmit ? first.emitCEP : first.destCEP,
      lgr: isEmit ? first.emitLogradouro : first.destLogradouro,
      bai: isEmit ? first.emitBairro : first.destBairro,
      fone: isEmit ? first.emitFone : first.destFone,
    };
    const c = contatoByDoc.get((src.cnpj || "").replace(/\D/g, "")) || {};
    const digits = (src.cnpj || "").replace(/\D/g, "");
    lastLookupTomador.current = digits;
    setForm((f) => ({
      ...f,
      toma: v,
      cnpjTomador: digits,
      xNomeTomador: src.nome || f.xNomeTomador,
      ieTomador: src.ie || c.ie || f.ieTomador,
      ufTomador: src.uf || c.uf || f.ufTomador,
      cMunTomador: src.cMun || f.cMunTomador,
      xMunTomador: src.xMun || c.cidade || f.xMunTomador,
      cepTomador: src.cep || (c.cep || "").replace(/\D/g, "") || f.cepTomador,
      logradouroTomador: src.lgr || c.logradouro || f.logradouroTomador,
      nroTomador: c.numero || f.nroTomador,
      bairroTomador: src.bai || c.bairro || f.bairroTomador,
      foneTomador: src.fone || c.telefone || f.foneTomador,
    }));
  };

  const handleImportNFeXml = async (files: FileList | File[]) => {
    if (!empresa) {
      toast.error("Selecione uma empresa");
      return;
    }
    const list = Array.from(files as any as File[]);
    const xmls = list.filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (xmls.length === 0) {
      toast.error("Selecione XMLs de NF-e");
      return;
    }
    setIsParsing(true);
    setImportProgress({ feito: 0, total: xmls.length });
    // Concorrência limitada p/ gravações paralelas sem sobrecarregar o Supabase.
    const mapPool = async <T, R>(
      items: T[],
      size: number,
      fn: (item: T, idx: number) => Promise<R>,
      onStep?: () => void,
    ): Promise<R[]> => {
      const out: R[] = new Array(items.length);
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(size, Math.max(items.length, 1)) }, async () => {
          while (cursor < items.length) {
            const i = cursor++;
            out[i] = await fn(items[i], i);
            onStep?.();
          }
        }),
      );
      return out;
    };
    // Cede o event loop p/ a barra de progresso pintar entre arquivos.
    const pintar = () => new Promise<void>((r) => setTimeout(r, 0));
    const tique = async () => {
      setImportProgress((v) => (v ? { ...v, feito: Math.min(v.total, v.feito + 1) } : v));
      await pintar();
    };
    try {
      const contatoCache = new Map<string, Promise<any>>();
      const contatoExistente = new Map<string, any>();
      // Lookup com cache compartilhado: CNPJs repetidos (e workers paralelos)
      // usam a mesma promise em voo — 1 query por documento no total.
      const getContato = (cnpj: string): Promise<any> => {
        const doc = (cnpj || "").replace(/\D/g, "");
        if (!doc || doc.length < 11) return Promise.resolve(null);
        const hit = contatoCache.get(doc);
        if (hit) return hit;
        const p: Promise<any> = Promise.resolve(
          supabase
            .from("fiscal_cadastros" as any)
            .select("id,documento,nome,ie,uf,cidade,logradouro,numero,bairro,cep,telefone")
            .eq("empresa_id", empresa!.id)
            .eq("documento", doc)
            .maybeSingle(),
        ).then(({ data }: any) => {
          contatoExistente.set(doc, data || null);
          return data || null;
        });
        contatoCache.set(doc, p);
        return p;
      };
      type ContatoNfe = {
        cnpj: string;
        nome: string;
        ie: string;
        uf: string;
        cidade: string;
        logradouro: string;
        bairro: string;
        cep: string;
        fone: string;
        numero: string;
      };
      // Upserts de contato vão p/ fila e são gravados em lote no fim (era 1-3
      // queries por XML em background). Primeiro a aparecer no lote vence.
      const contatosUpsert = new Map<string, ContatoNfe>();
      const queueContato = (c: ContatoNfe) => {
        const doc = (c.cnpj || "").replace(/\D/g, "");
        if (!doc || doc.length < 11 || !c.nome || contatosUpsert.has(doc)) return;
        contatosUpsert.set(doc, c);
      };
      const inserirContatoComFallback = async (row: Record<string, unknown>) => {
        const { error } = await supabase.from("fiscal_cadastros" as any).insert(row);
        if (error && /ie/i.test(error.message || "")) {
          const { ie: _ie, ...semIe } = row;
          await supabase.from("fiscal_cadastros" as any).insert(semIe);
        }
      };
      const flushContatos = async () => {
        const lista = [...contatosUpsert.values()];
        if (lista.length === 0) return;
        const docDe = (c: ContatoNfe) => (c.cnpj || "").replace(/\D/g, "");
        const novos = lista.filter((c) => !contatoExistente.get(docDe(c)));
        if (novos.length > 0) {
          const rows = novos.map((c) => ({
            empresa_id: empresa!.id,
            nome: c.nome,
            documento: docDe(c),
            ie: c.ie || null,
            uf: c.uf || null,
            cidade: c.cidade || null,
            logradouro: c.logradouro || null,
            numero: c.numero || null,
            bairro: c.bairro || null,
            cep: c.cep || null,
            telefone: c.fone || null,
          }));
          const { error } = await supabase.from("fiscal_cadastros" as any).insert(rows);
          if (error) {
            // Concorrência externa ou IE duplicado: cai p/ linha a linha com fallback.
            await mapPool(rows, 5, (r) => inserirContatoComFallback(r));
          }
        }
        const docsNovos = new Set(novos.map(docDe));
        const patches: { doc: string; upd: Record<string, unknown> }[] = [];
        for (const c of lista) {
          const doc = docDe(c);
          const existente = contatoExistente.get(doc);
          if (!existente || docsNovos.has(doc)) continue;
          const upd: Record<string, unknown> = {};
          if (!(existente as any)?.nome && c.nome) upd.nome = c.nome;
          if (c.ie) upd.ie = c.ie;
          if (c.uf) upd.uf = c.uf;
          if (c.cidade) upd.cidade = c.cidade;
          if (c.logradouro) upd.logradouro = c.logradouro;
          if (c.numero) upd.numero = c.numero;
          if (c.bairro) upd.bairro = c.bairro;
          if (c.cep) upd.cep = c.cep;
          if (c.fone) upd.telefone = c.fone;
          if (Object.keys(upd).length) patches.push({ doc, upd });
        }
        await mapPool(patches, 5, (p) =>
          Promise.resolve(
            supabase.from("fiscal_cadastros" as any).update(p.upd).eq("empresa_id", empresa!.id).eq("documento", p.doc),
          ),
        );
      };
      // (upsert de contatos agora via queueContato + flushContatos em lote no fim)
      let added = 0;
      let duplicadas = 0;
      let reservadas = 0;
      const chavesNoLote = new Set<string>();
      const novasPorIndice: Array<(typeof mercadorias)[number] | null> = new Array(xmls.length).fill(null);
      const extrasPorIndice: Array<{ transpIE: string; destIE: string; emitIE: string }> = new Array(
        xmls.length,
      ).fill(null);
      // Status atual no banco p/ bloquear reimport de NF reservada (rascunho) ou embarcada
      const { data: existentes } = await supabase
        .from("cte_nfes_pendentes" as any)
        .select("chave,status")
        .eq("empresa_id", empresa!.id);
      const statusPorChave = new Map<string, string>(
        ((existentes as any[]) || []).map((r) => [
          String(r.chave).replace(/\D/g, ""),
          String(r.status),
        ]),
      );
      const resultados = await mapPool(xmls, 5, async (file, fileIdx) => {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const emitCnpj = doc.querySelector("emit > CNPJ")?.textContent || "";
        const emitXNome = doc.querySelector("emit > xNome")?.textContent || "";
        const emitIE = doc.querySelector("emit > IE")?.textContent || "";
        const emitUF = doc.querySelector("emit > enderEmit > UF")?.textContent || "";
        const emitCMun = doc.querySelector("emit > enderEmit > cMun")?.textContent || "";
        const emitXMun = doc.querySelector("emit > enderEmit > xMun")?.textContent || "";
        const emitLgr = doc.querySelector("emit > enderEmit > xLgr")?.textContent || "";
        const emitBairro = doc.querySelector("emit > enderEmit > xBairro")?.textContent || "";
        const emitCEP = doc.querySelector("emit > enderEmit > CEP")?.textContent || "";
        const emitFone = doc.querySelector("emit > enderEmit > fone")?.textContent || "";
        const emitNroXml = doc.querySelector("emit > enderEmit > nro")?.textContent || "";
        const destCnpj =
          doc.querySelector("dest > CNPJ")?.textContent ||
          doc.querySelector("dest > CPF")?.textContent ||
          "";
        const destXNome = doc.querySelector("dest > xNome")?.textContent || "";
        const destIE = doc.querySelector("dest > IE")?.textContent || "";
        const destUF = doc.querySelector("dest > enderDest > UF")?.textContent || "";
        const destCMun = doc.querySelector("dest > enderDest > cMun")?.textContent || "";
        const destXMun = doc.querySelector("dest > enderDest > xMun")?.textContent || "";
        const destLgr = doc.querySelector("dest > enderDest > xLgr")?.textContent || "";
        const destBairro = doc.querySelector("dest > enderDest > xBairro")?.textContent || "";
        const destCEP = doc.querySelector("dest > enderDest > CEP")?.textContent || "";
        const destFone = doc.querySelector("dest > enderDest > fone")?.textContent || "";
        const destNroXml = doc.querySelector("dest > enderDest > nro")?.textContent || "";
        const vNF =
          doc.querySelector("total > ICMSTot > vNF")?.textContent ||
          doc.querySelector("vNF")?.textContent ||
          "0";
        const pesoB =
          doc.querySelector("transp > vol > pesoB")?.textContent ||
          doc.querySelector("vol > pesoB")?.textContent ||
          "";
        const nNF = doc.querySelector("ide > nNF")?.textContent || file.name.replace(/\.xml$/i, "");
        const serie = doc.querySelector("ide > serie")?.textContent || "1";
        const dhEmi = doc.querySelector("ide > dhEmi")?.textContent || "";
        const chave =
          doc.querySelector("infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") ||
          doc.querySelector("chNFe")?.textContent ||
          `${Date.now()}${added}`;
        const chaveNorm = chave.replace(/\D/g, "");
        if (!chaveNorm || chaveNorm.length < 20) {
          duplicadas++;
          return;
        }
        if (chavesNoLote.has(chaveNorm)) {
          duplicadas++;
          return;
        }
        chavesNoLote.add(chaveNorm);
        // NF-e já usada (em rascunho ou embarcada) não pode ser reutilizada em outro CT-e.
        const stExistente = statusPorChave.get(chaveNorm);
        if (chavesEmRascunho.has(chaveNorm) || (stExistente && stExistente !== "pendente")) {
          reservadas++;
          return;
        }
        const peso = pesoB ? parseFloat(pesoB) : 1000;
        let qVolNum = Array.from(doc.querySelectorAll("transp > vol > qVol")).reduce(
          (a, e) => a + (parseFloat(e.textContent || "") || 0),
          0,
        );
        if (!qVolNum)
          qVolNum = Array.from(doc.querySelectorAll("det > prod > qCom")).reduce(
            (a, e) => a + (parseFloat(e.textContent || "") || 0),
            0,
          );
        const valor = parseFloat(vNF) || 0;
        const modFrete = doc.querySelector("transp > modFrete")?.textContent || "";
        extrasPorIndice[fileIdx] = {
          transpIE: doc.querySelector("transp > transporta > IE")?.textContent || "",
          destIE,
          emitIE,
        };

        // Lookup endereço no cadastro fiscal (XML de NF-e pode não trazer endereço)
        const [emitContato, destContato] = await Promise.all([
          getContato(emitCnpj),
          getContato(destCnpj),
        ]);
        const emitLog = emitLgr || (emitContato as any)?.logradouro || "";
        const emitNro = emitNroXml || (emitContato as any)?.numero || "";
        const emitBai = emitBairro || (emitContato as any)?.bairro || "";
        const emitCepFin = emitCEP || (emitContato as any)?.cep || "";
        const emitCidFin = emitXMun || (emitContato as any)?.cidade || "";
        const emitUfFin = emitUF || (emitContato as any)?.uf || "";
        const emitFoneFin = emitFone || (emitContato as any)?.telefone || "";
        const destLog = destLgr || (destContato as any)?.logradouro || "";
        const destNro = destNroXml || (destContato as any)?.numero || "";
        const destBai = destBairro || (destContato as any)?.bairro || "";
        const destCepFin = destCEP || (destContato as any)?.cep || "";
        const destCidFin = destXMun || (destContato as any)?.cidade || "";
        const destUfFin = destUF || (destContato as any)?.uf || "";
        const destFoneFin = destFone || (destContato as any)?.telefone || "";

        let tomadorNome = destXNome;
        let tomadorCnpj = destCnpj;
        let tomadorUF = destUF;
        let tomadorCMun = destCMun;
        let tomadorXMun = destXMun;
        let tomadorIE = destIE;
        let tomadorLog = destLgr;
        let tomadorBai = destBairro;
        let tomadorCep = destCEP;
        if (modFrete === "0") {
          tomadorNome = emitXNome;
          tomadorCnpj = emitCnpj;
          tomadorUF = emitUF;
          tomadorCMun = emitCMun;
          tomadorXMun = emitXMun;
          tomadorIE = emitIE;
          tomadorLog = emitLgr;
          tomadorBai = emitBairro;
          tomadorCep = emitCEP;
        } else if (modFrete === "2") {
          const transpCnpj = doc.querySelector("transp > transporta > CNPJ")?.textContent || "";
          const transpXNome = doc.querySelector("transp > transporta > xNome")?.textContent || "";
          const transpIE = doc.querySelector("transp > transporta > IE")?.textContent || "";
          if (transpCnpj || transpXNome) {
            tomadorNome = transpXNome || tomadorNome;
            tomadorCnpj = transpCnpj || tomadorCnpj;
            tomadorIE = transpIE || tomadorIE;
          }
        }
        const payload = {
          empresa_id: empresa!.id,
          chave: chaveNorm,
          n_nf: nNF,
          serie,
          emit_nome: emitXNome,
          emit_cnpj: emitCnpj,
          emit_uf: emitUF || null,
          emit_cmun: emitCMun || null,
          emit_xmun: emitXMun || null,
          emit_ie: emitIE || null,
          emit_logradouro: emitLog || null,
          emit_nro: emitNro || null,
          emit_bairro: emitBai || null,
          emit_cep: emitCepFin || null,
          emit_fone: emitFoneFin || null,
          dest_nome: destXNome,
          dest_cnpj: destCnpj,
          dest_uf: destUF || null,
          dest_cmun: destCMun || null,
          dest_xmun: destXMun || null,
          dest_ie: destIE || null,
          dest_logradouro: destLog || null,
          dest_nro: destNro || null,
          dest_bairro: destBai || null,
          dest_cep: destCepFin || null,
          dest_fone: destFoneFin || null,
          valor,
          peso,
          qvol: qVolNum || null,
          data_emissao: dhEmi ? dhEmi.slice(0, 10) : null,
          tomador_nome: tomadorNome,
          tomador_cnpj: tomadorCnpj,
          tomador_uf: tomadorUF || null,
          tomador_cmun: tomadorCMun || null,
          tomador_xmun: tomadorXMun || null,
          tomador_ie: tomadorIE || null,
          tomador_logradouro: tomadorLog || null,
          tomador_bairro: tomadorBai || null,
          tomador_cep: tomadorCep || null,
          mod_frete: modFrete || null,
          status: "pendente" as const,
        };
        const jaExiste = statusPorChave.has(chaveNorm);
        // Se já existe (qualquer status pendente), ATUALIZA em vez de inserir:
        // sem UNIQUE garantido no banco o insert duplicava a linha (23505 morto).
        const { error } = jaExiste
          ? await supabase
              .from("cte_nfes_pendentes" as any)
              .update(payload)
              .eq("empresa_id", empresa!.id)
              .eq("chave", chaveNorm)
          : await supabase.from("cte_nfes_pendentes" as any).insert(payload);
        if (error) {
          if (
            (error as any).code === "23505" ||
            String(error.message).toLowerCase().includes("duplicate")
          ) {
            duplicadas++;
            return;
          }
          toast.error(`Falha ao salvar NF ${nNF}: ${error.message}`);
          return;
        }
        novasPorIndice[fileIdx] = {
          chave: chaveNorm,
          nNF,
          serie,
          emit: emitXNome,
          emitCnpj,
          emitUF: emitUfFin,
          emitCMun,
          emitXMun: emitCidFin,
          emitIE,
          emitLogradouro: emitLog,
          emitBairro: emitBai,
          emitCEP: emitCepFin,
          emitFone: emitFoneFin,
          dest: destXNome,
          destCnpj,
          destUF: destUfFin,
          destCMun,
          destXMun: destCidFin,
          destIE,
          destLogradouro: destLog,
          destBairro: destBai,
          destCEP: destCepFin,
          destFone: destFoneFin,
          valor,
          peso,
          qVol: qVolNum,
          data: dhEmi.slice(0, 10),
          tomador: tomadorNome,
          tomadorCnpj,
          tomadorUF,
          tomadorCMun,
          tomadorXMun,
          tomadorIE,
          tomadorLogradouro: tomadorLog,
          tomadorBairro: tomadorBai,
          tomadorCEP: tomadorCep,
          modFrete,
        };
        queueContato({
          cnpj: emitCnpj,
          nome: emitXNome,
          ie: emitIE,
          uf: emitUF,
          cidade: emitXMun,
          logradouro: emitLgr,
          bairro: emitBairro,
          cep: emitCEP,
          fone: emitFone,
          numero: emitNro,
        });
        queueContato({
          cnpj: destCnpj,
          nome: destXNome,
          ie: destIE,
          uf: destUF,
          cidade: destXMun,
          logradouro: destLgr,
          bairro: destBairro,
          cep: destCEP,
          fone: destFone,
          numero: destNro,
        });
        await tique();
      });
      // Ordem determinística (workers terminam fora de ordem): filtra nulos.
      const novas = novasPorIndice.filter((n) => n !== null) as typeof mercadorias;
      // Prefill do tomador a partir da 1ª NF-e do lote (antes: 1ª a terminar).
      const primeiraNova = novas[0];
      if (primeiraNova && mercadorias.length === 0) {
        const primeiraIdx = novasPorIndice.findIndex((n) => n !== null);
        const extra0 = extrasPorIndice[primeiraIdx] ?? { transpIE: "", destIE: "", emitIE: "" };
        const tomaByMod: Record<string, string> = {
          "0": "0",
          "1": "3",
          "2": "4",
          "3": "0",
          "4": "3",
          "9": "4",
        };
        const tomaIni = tomaByMod[primeiraNova.modFrete] ?? "3";
        let tomadorIE = extra0.destIE;
        if (primeiraNova.modFrete === "0") tomadorIE = extra0.emitIE;
        else if (primeiraNova.modFrete === "2") tomadorIE = extra0.transpIE || extra0.destIE;
          setForm((f) => ({
            ...f,
            toma: !f.cnpjTomador ? tomaIni : f.toma,
            cnpjTomador: primeiraNova.tomadorCnpj || f.cnpjTomador,
            xNomeTomador: primeiraNova.tomador || f.xNomeTomador,
            ieTomador: tomadorIE || f.ieTomador,
            ufTomador: primeiraNova.tomadorUF || f.ufTomador,
            cMunTomador: primeiraNova.tomadorCMun || f.cMunTomador,
            xMunTomador: primeiraNova.tomadorXMun || f.xMunTomador,
            logradouroTomador: primeiraNova.tomadorLogradouro || f.logradouroTomador,
            bairroTomador: primeiraNova.tomadorBairro || f.bairroTomador,
            cepTomador: primeiraNova.tomadorCEP || f.cepTomador,
            cMunIni: primeiraNova.emitCMun || f.cMunIni,
            xMunIni: primeiraNova.emitXMun || f.xMunIni,
            ufIni: primeiraNova.emitUF || f.ufIni,
            cMunFim: primeiraNova.destCMun || f.cMunFim,
            xMunFim: primeiraNova.destXMun || f.xMunFim,
            ufFim: primeiraNova.destUF || f.ufFim,
            cMunEnv: primeiraNova.emitCMun || f.cMunEnv,
            xMunEnv: primeiraNova.emitXMun || f.xMunEnv,
            ufEnv: primeiraNova.emitUF || f.ufEnv,
          }));
        }
        added = novas.length;
        await flushContatos();
      if (added > 0) {
        // Dedupe por chave: reimportar NF já presente (ex. devolvida) não duplica na lista
        const vistas = new Set(mercadorias.map((m) => m.chave));
        const merged = [...mercadorias, ...novas.filter((n) => !vistas.has(n.chave))];
        setMercadorias(merged);
        const somaV = merged.reduce((a, m) => a + (m.valor || 0), 0);
        const somaP = merged.reduce((a, m) => a + (m.peso || 0), 0);
        setForm((f) => ({
          ...f,
          vCarga: somaV.toFixed(2),
          peso: String(somaP),
          icmsBase: f.vPrest || "0.00",
        }));
        qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa!.id] });
        const extra = reservadas > 0 ? `, ${reservadas} bloqueada(s) (em rascunho/CT-e)` : "";
        if (duplicadas > 0)
          toast.success(
            `${added} importada(s), ${duplicadas} já existiam (chave duplicada bloqueada)${extra}`,
          );
        else toast.success(`${added} XML(s) importado(s) — selecione os que irão no CT-e${extra}`);
      } else if (duplicadas > 0 || reservadas > 0) {
        toast.info(
          `${duplicadas} NF-e(s) já importadas; ${reservadas} bloqueada(s) por estar(em) em rascunho ou CT-e`,
        );
      } else {
        toast.info("Nenhum XML novo");
      }
    } catch (e: any) {
      toast.error("Falha ao ler XML", { description: e.message });
    } finally {
      setIsParsing(false);
      setImportProgress(null);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("prefill_cte_from_nfe");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setForm((f) => ({
          ...f,
          cnpjTomador: p.destCnpj || f.cnpjTomador,
          xNomeTomador: p.destXNome || f.xNomeTomador,
          ufTomador: p.destUF || f.ufTomador,
          cMunTomador: p.destCMun || f.cMunTomador,
          xMunTomador: p.destXMun || f.xMunTomador,
          vCarga: p.vCarga ? String(p.vCarga) : f.vCarga,
          peso: p.peso ? String(p.peso) : f.peso,
        }));
        setOpen(true);
        localStorage.removeItem("prefill_cte_from_nfe");
      } catch {}
    } else if (search.fromNFe) {
      setOpen(true);
    }
  }, [search.fromNFe]);

  const excluirRascunho = async (doc: CteDoc) => {
    if (!empresa) return;
    if (!doc.id) { toast.error("Rascunho sem id — recarregue a página (Ctrl+F5)"); return; }
    try {
      let parsed: any = {};
      try { parsed = JSON.parse(doc.xml_assinado || "{}"); } catch { parsed = {}; }
      const { error: delErr, count } = await supabase
        .from("cte_documentos" as any)
        .delete({ count: "exact" })
        .eq("id", doc.id);
      if (delErr) throw delErr;
      if (!count) throw new Error("o banco não removeu o rascunho (0 linhas afetadas)");
      setConfRascunho(null);
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      toast.success("Rascunho excluído");
      try {
        if (parsed.nfs && parsed.nfs.length > 0) {
          for (const nf of parsed.nfs) {
            const { error: upErr } = await supabase.from("cte_nfes_pendentes" as any).upsert(
              {
                empresa_id: empresa.id,
                chave: nf.chave,
              n_nf: nf.nNF,
              serie: nf.serie,
              emit_nome: nf.emit,
              emit_cnpj: nf.emitCnpj,
              emit_uf: nf.emitUF,
              emit_cmun: nf.emitCMun,
              emit_xmun: nf.emitXMun,
              emit_ie: (nf as any).emitIE || null,
              emit_logradouro: (nf as any).emitLogradouro || null,
              emit_nro: (nf as any).emitNro || null,
              emit_bairro: (nf as any).emitBairro || null,
              emit_cep: (nf as any).emitCEP || null,
              emit_fone: (nf as any).emitFone || null,
              dest_nome: nf.dest,
              dest_cnpj: nf.destCnpj,
              dest_uf: nf.destUF,
              dest_cmun: nf.destCMun,
              dest_xmun: nf.destXMun,
              dest_ie: (nf as any).destIE || null,
              dest_logradouro: (nf as any).destLogradouro || null,
              dest_nro: (nf as any).destNro || null,
              dest_bairro: (nf as any).destBairro || null,
              dest_cep: (nf as any).destCEP || null,
              dest_fone: (nf as any).destFone || null,
              valor: nf.valor,
              peso: nf.peso,
              data_emissao: nf.data || null,
              tomador_nome: nf.tomador,
              tomador_cnpj: nf.tomadorCnpj,
              tomador_uf: nf.tomadorUF,
              tomador_cmun: nf.tomadorCMun,
              tomador_xmun: nf.tomadorXMun,
              mod_frete: nf.modFrete,
              status: "pendente",
            },
            { onConflict: "empresa_id,chave" },
          );
          if (upErr) throw upErr;
          }
        }
        qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
      } catch (e: any) {
        toast.warning("NF-e não voltaram para pendentes", { description: e.message });
      }
    } catch (e: any) {
      toast.error("Erro ao excluir rascunho", { description: e.message });
    }
  };

  // Aplica CIOT + dados do pedágio nos rascunhos marcados (só preenche o que foi informado)
  const aplicarLoteCiotPedagio = async () => {
    if (!empresa || envSel.size === 0 || loteSalvando) return;
    if (!loteCiot.trim() && loteModo === "manter" && !loteOperadora && !loteVpo.trim() && !(parseFloat(loteVale) > 0)) {
      toast.error("Informe ao menos um campo para aplicar no lote");
      return;
    }
    setLoteSalvando(true);
    try {
      const alvos = docsByStatus.rascunhos.filter((d) => envSel.has(d.id));
      let ok = 0;
      const erros: string[] = [];
      for (const doc of alvos) {
        try {
          const parsed = JSON.parse(doc.xml_assinado || "{}");
          const f = { ...(parsed.form || {}) };
          if (loteCiot.trim()) f.ciot = loteCiot.trim();
          if (loteModo !== "manter") f.pedagioPagto = loteModo;
          if (loteOperadora) {
            f.pedagioOperadora = loteOperadora;
            const op = PEDAGIO_OPERADORAS.find((o) => o.nome === loteOperadora);
            if (op) f.pedagioCnpj = op.cnpj;
          }
          if (loteVpo.trim()) f.pedagioIdentVPO = loteVpo.trim();
          if (parseFloat(loteVale) > 0) f.valePedagio = loteVale;
          const { error } = await supabase
            .from("cte_documentos" as any)
            .update({ xml_assinado: JSON.stringify({ ...parsed, form: f }) })
            .eq("id", doc.id);
          if (error) throw error;
          ok++;
        } catch (e: any) {
          erros.push(`${doc.numero ?? "?"}: ${e.message}`);
        }
      }
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      setLoteCiotOpen(false);
      if (ok) toast.success(`${ok} rascunho(s) atualizado(s)`);
      if (erros.length) toast.error(`${erros.length} falharam`, { description: erros.slice(0, 3).join(" | ") });
    } finally {
      setLoteSalvando(false);
    }
  };

  const editarRascunho = async (doc: CteDoc, silencioso = false) => {
    if (!empresa) return;
    try {
      const parsed = JSON.parse(doc.xml_assinado || "{}");
      if (parsed.form) setForm(parsed.form);
      // Rascunho restaurado manda: trava a entrega salva p/ a NF-e não sobrescrever
      if ((parsed.form as any)?.xMunFim) travarPendenteRef.current = true;
      setViewDoc(null);
      setAba("geral");
      if (parsed.nfs && parsed.nfs.length > 0) {
        const mapped = parsed.nfs.map((r: any) => ({
          chave: r.chave,
          nNF: r.nNF || "",
          serie: r.serie || "1",
          emit: r.emit || "",
          emitCnpj: r.emitCnpj || "",
          emitUF: r.emitUF || "",
          emitCMun: r.emitCMun || "",
          emitXMun: r.emitXMun || "",
          emitIE: r.emitIE || "",
          emitLogradouro: r.emitLogradouro || "",
          emitNro: r.emitNro || "",
          emitBairro: r.emitBairro || "",
          emitCEP: r.emitCEP || "",
          emitFone: r.emitFone || "",
          dest: r.dest || "",
          destCnpj: r.destCnpj || "",
          destUF: r.destUF || "",
          destCMun: r.destCMun || "",
          destXMun: r.destXMun || "",
          destIE: r.destIE || "",
          destLogradouro: r.destLogradouro || "",
          destNro: r.destNro || "",
          destBairro: r.destBairro || "",
          destCEP: r.destCEP || "",
          destFone: r.destFone || "",
          valor: Number(r.valor ?? 0),
          peso: Number(r.peso ?? 0),
          data: r.data || "",
          tomador: r.tomador || "",
          tomadorCnpj: r.tomadorCnpj || "",
          tomadorUF: r.tomadorUF || "",
          tomadorCMun: r.tomadorCMun || "",
          tomadorXMun: r.tomadorXMun || "",
          modFrete: r.modFrete || "",
        }));
        setMercadorias(mapped);
        setSelecionadas(new Set(parsed.chavesNFe || []));
      }
      setEditingRascunhoId(doc.id);
      if (!silencioso) {
        pularPercursoRef.current = true;
        setOpen(true);
      }
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
    } catch (e: any) {
      if (silencioso) throw e;
      toast.error("Erro ao carregar rascunho", { description: e.message });
    }
  };
  // Envio em lote da aba Aguardando envio: carrega cada rascunho no formulário
  // e reaproveita a mesma emissão individual (o mutateAsync usa o closure atual).
  const emitirLatest = useRef<() => Promise<any>>(async () => null);
  emitirLatest.current = () => emitir.mutateAsync() as unknown as Promise<any>;
  const enviarSelecionados = async () => {
    // Segue a ordem exibida na tabela (ex.: NF crescente) — não a de criação
    const alvo = ordenarListaDocs(docsByStatus.rascunhos.filter((d) => envSel.has(d.id)));
    if (alvo.length === 0 || enviandoLote) return;
    setEnviandoLote(true);
    enviandoLoteRef.current = true;
    let ok = 0;
    let falhas = 0;
    try {
      for (const d of alvo) {
        try {
          setViewDoc(null);
          await editarRascunho(d, true);
          // Espera o form propagar p/ o closure da emissão (setState é
          // assíncrono; sem isso o lote reenviaria os dados do item anterior).
          await new Promise((r) => setTimeout(r, 150));
          const ret = await emitirLatest.current();
          if ((ret as any)?.ignored) continue;
          // Verde só com autorização real: rejeição/erro conta como falha.
          if ((ret as any)?.sucesso) ok++;
          else falhas++;
        } catch {
          falhas++;
        }
      }
    } finally {
      setEnviandoLote(false);
      enviandoLoteRef.current = false;
      setEnvSel(new Set());
      setEditingRascunhoId(null);
      // NÃO zera mercadorias: o refetch das pendentes repõe a lista (sem as
      // embarcadas); zerar faria as demais "sumirem" até voltar.
      setSelecionadas(new Set());
      setForm({ ...emptyForm });
      // Leitura final aguardada: garante embarque e documentos consistentes
      // (sem depender da ordem das invalidações do meio do lote)
      try {
        await qc.refetchQueries({ queryKey: ["cte-nfes-pendentes", empresa?.id] });
      } catch {}
      try {
        await qc.refetchQueries({ queryKey: ["cte-documentos"] });
      } catch {}
      const frescas = qc.getQueryData(["cte-nfes-pendentes", empresa?.id]) as any[];
      if (Array.isArray(frescas)) setMercadorias(mapearPendentes(frescas) as any);
    }
    if (ok > 0) toast.success(`${ok} CT-e(s) autorizado(s)`);
    if (falhas > 0) toast.error(`${falhas} rascunho(s) falharam — verifique os erros acima`);
  };

  const visualizarDoc = (doc: CteDoc) => {
    try {
      const parsed = JSON.parse(doc.xml_assinado || "{}");
      if (parsed.form) setForm({ ...emptyForm, ...parsed.form });
      else setForm({ ...emptyForm });
    } catch {
      setForm({ ...emptyForm });
    }
    setEditingRascunhoId(null);
    setViewDoc(doc);
    setAba("geral");
    setOpen(true);
  };

  const substituirCte = (doc: CteDoc) => {
    try {
      const parsed = JSON.parse(doc.xml_assinado || "{}");
      const base = parsed.form || {};
      setForm({
        ...emptyForm,
        ...base,
        finalidadeEmissao: "Substituicao",
        cteReferenciado: String(doc.chave_acesso || "").replace(/\D/g, ""),
        dataEmissao: new Date().toISOString().slice(0, 10),
      });
    } catch {
      setForm({
        ...emptyForm,
        finalidadeEmissao: "Substituicao",
        cteReferenciado: String(doc.chave_acesso || "").replace(/\D/g, ""),
      } as any);
    }
    setMercadorias([]);
    setSelecionadas(new Set());
    setEditingRascunhoId(null);
    setViewDoc(null);
    setAba("geral");
    setOpen(true);
    toast.info(`Substituição do CT-e ${doc.numero || ""} — confira os dados e emita`);
  };

  const complementarCte = (doc: CteDoc) => {
    const chave = String(doc.chave_acesso || "").replace(/\D/g, "");
    try {
      const raw = String(doc.xml_assinado || "");
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { xml: raw };
      }
      const base = parsed.form && typeof parsed.form === "object" ? parsed.form : {};
      const xml = String(parsed.xml || (raw.trim().startsWith("<") ? raw : ""));
      const xmlDoc = xml ? new DOMParser().parseFromString(xml, "text/xml") : null;
      const nodes = (root: ParentNode | null, name: string) =>
        root
          ? Array.from(root.querySelectorAll("*")).filter((node) => node.localName === name)
          : [];
      const text = (root: ParentNode | null, name: string) =>
        nodes(root, name)[0]?.textContent?.trim() || "";
      const cte = nodes(xmlDoc, "infCte")[0] || xmlDoc;
      const rem = nodes(cte, "rem")[0] || null;
      const dest = nodes(cte, "dest")[0] || null;
      const tomaNode =
        nodes(cte, "toma3")[0] || nodes(cte, "toma4")[0] || nodes(cte, "toma")[0] || null;
      const toma = text(tomaNode, "toma") || base.toma || "3";
      const tomaDoc =
        text(tomaNode, "CNPJ") ||
        text(tomaNode, "CPF") ||
        (toma === "0" ? text(rem, "CNPJ") : toma === "3" ? text(dest, "CNPJ") : "");
      const remetente = text(rem, "xNome") || base.xNomeRemetente || "";
      const destinatario = text(dest, "xNome") || base.xNomeDestinatario || "";
      const tomador =
        text(tomaNode, "xNome") || (toma === "0" ? remetente : toma === "3" ? destinatario : "");
      const nfs = nodes(xmlDoc, "det")
        .map((det) => {
          const infNfe = nodes(det, "infNFe")[0] || det;
          const ide = nodes(infNfe, "ide")[0] || infNfe;
          const emit = nodes(infNfe, "emit")[0] || infNfe;
          const emitEnd = nodes(emit, "enderEmit")[0] || emit;
          const nfeDest = nodes(infNfe, "dest")[0] || infNfe;
          const destEnd = nodes(nfeDest, "enderDest")[0] || nfeDest;
          const total = nodes(infNfe, "ICMSTot")[0] || infNfe;
          return {
            chave: text(det, "chNFe"),
            nNF: text(ide, "nNF"),
            serie: text(ide, "serie") || "1",
            emit: text(emit, "xNome") || remetente,
            emitCnpj: text(emit, "CNPJ") || text(rem, "CNPJ"),
            emitUF: text(emitEnd, "UF"),
            emitCMun: text(emitEnd, "cMun"),
            emitXMun: text(emitEnd, "xMun"),
            dest: text(nfeDest, "xNome") || destinatario,
            destCnpj: text(nfeDest, "CNPJ") || text(dest, "CNPJ"),
            destUF: text(destEnd, "UF"),
            destCMun: text(destEnd, "cMun"),
            destXMun: text(destEnd, "xMun"),
            valor: Number(text(total, "vNF") || 0),
            peso: 0,
            data: "",
            tomador,
            tomadorCnpj: tomaDoc,
            tomadorUF: "",
            tomadorCMun: "",
            tomadorXMun: "",
            modFrete: "",
          };
        })
        .filter((n) => n.chave);
      const inherited = {
        ...base,
        toma,
        cnpjTomador: tomaDoc || base.cnpjTomador,
        xNomeTomador: tomador || base.xNomeTomador,
        finalidadeEmissao: "Complemento",
        cteReferenciado: chave,
        dataEmissao: new Date().toISOString().slice(0, 10),
        pedagioPagto: base.pedagioPagto || "sem-pagamento",
        valePedagio: base.valePedagio || "0.00",
      };
      setForm({ ...emptyForm, ...inherited } as any);
      setMercadorias(nfs.length ? (nfs as any) : Array.isArray(parsed.nfs) ? parsed.nfs : []);
      setSelecionadas(
        new Set((nfs.length ? nfs : parsed.nfs || []).map((n: any) => n.chave).filter(Boolean)),
      );
    } catch (error) {
      console.log("[v0] Falha ao herdar dados do CT-e complementar:", error);
      setForm({ ...emptyForm, finalidadeEmissao: "Complemento", cteReferenciado: chave } as any);
      setMercadorias([]);
      setSelecionadas(new Set());
    }
    setEditingRascunhoId(null);
    setViewDoc(null);
    setAba("geral");
    setOpen(true);
    toast.info(`CT-e complementar do CT-e ${doc.numero || ""} — dados do original carregados`);
  };

  const salvarRascunho = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves =
        selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map((m) => m.chave);
      const nfsSalvas = mercadorias
        .filter((m) => chaves.includes(m.chave))
        .map((m) => ({
          chave: m.chave,
          nNF: m.nNF,
          serie: m.serie,
          emit: m.emit,
          emitCnpj: m.emitCnpj,
          emitUF: m.emitUF,
          emitCMun: m.emitCMun,
          emitXMun: m.emitXMun,
          emitIE: m.emitIE || "",
          emitLogradouro: m.emitLogradouro || "",
          emitNro: m.emitNro || "",
          emitBairro: m.emitBairro || "",
          emitCEP: m.emitCEP || "",
          emitFone: m.emitFone || "",
          dest: m.dest,
          destCnpj: m.destCnpj,
          destUF: m.destUF,
          destCMun: m.destCMun,
          destXMun: m.destXMun,
          destIE: m.destIE || "",
          destLogradouro: m.destLogradouro || "",
          destNro: m.destNro || "",
          destBairro: m.destBairro || "",
          destCEP: m.destCEP || "",
          destFone: m.destFone || "",
          valor: m.valor,
          peso: m.peso,
          qVol: (m as any).qVol || 0,
          data: m.data,
          tomador: m.tomador,
          tomadorCnpj: m.tomadorCnpj,
          tomadorUF: m.tomadorUF,
          tomadorCMun: m.tomadorCMun,
          tomadorXMun: m.tomadorXMun,
          modFrete: m.modFrete,
        }));
      const proximo = 1;
      const { error } = await supabase.from("cte_documentos" as any).insert({
        empresa_id: empresa.id,
        status: "rascunho",
        numero: proximo,
        serie: "1",
        valor_servico: totalPrestacao(form),
        peso_carga: parseFloat(form.peso) || 0,
        xml_assinado: JSON.stringify({ form, chavesNFe: chaves, nfs: nfsSalvas }),
      } as any);
      if (error) throw error;
      if (editingRascunhoId) {
        await supabase
          .from("cte_documentos" as any)
          .delete()
          .eq("id", editingRascunhoId);
      }
      if (empresa && chaves.length > 0) {
        // Reserva as NF-es no rascunho SEM deletar (status rascunho): voltam sozinhas ao emitir/cancelar/excluir
        await supabase
          .from("cte_nfes_pendentes" as any)
          .update({ status: "rascunho" })
          .in("chave", chaves)
          .eq("empresa_id", empresa.id);
      }
    },
    onSuccess: () => {
      toast.success("Rascunho salvo");
      persistirPercursoSilencioso();
      // NÃO zera mercadorias aqui: as NF-es do rascunho saem da lista sozinhas
      // no refetch (status rascunho); zerar faria as demais "sumirem" até voltar.
      setSelecionadas(new Set());
      setEditingRascunhoId(null);
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa!.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emittingRef = useRef(false);
  const MOTIVOS_COMPLEMENTO = [
    "Adicional de frete",
    "Descarga",
    "Diferença de frete",
    "Estadia",
    "Pedágio",
    "Reentrega",
    "Retorno",
    "Outros",
  ];
  const motoristasXml = () => {
    const a: Array<{ xNome: string; cpf: string }> = [];
    const m1 = (motoristas || []).find((m: any) => m.id === form.motoristaId);
    if (m1)
      a.push({
        xNome: String((m1 as any).nome || "").toUpperCase(),
        cpf: String((m1 as any).cpf || "").replace(/\D/g, ""),
      });
    if (form.possuiMoto2 === "S") {
      const m2 = (motoristas || []).find((m: any) => m.id === (form as any).motorista2Id);
      if (m2 && m2.id !== form.motoristaId)
        a.push({
          xNome: String((m2 as any).nome || "").toUpperCase(),
          cpf: String((m2 as any).cpf || "").replace(/\D/g, ""),
        });
    }
    return a;
  };
  const emitir = useMutation({
    mutationFn: async () => {
      if (viewDoc) throw new Error("Feche a visualização para emitir um novo CT-e");
      // Trava contra duplo clique: duas emissões concorrentes calculariam o mesmo número.
      // Retorna marcador silencioso (sem toast de erro) em vez de throw.
      if (emittingRef.current) return { ignored: true };
      emittingRef.current = true;
      try {
        if (!empresa) throw new Error("Empresa não selecionada");
        if (!form.xNomeTomador || !form.cnpjTomador) throw new Error("Informe tomador");

        const chaves =
          selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map((m) => m.chave);
        if (chaves.length > 0) {
          const sel = mercadorias.filter((m) => chaves.includes(m.chave));
          const dests = new Set(sel.map((m) => m.destCnpj || m.dest));
          const emits = new Set(sel.map((m) => m.emitCnpj || m.emit));
          const tomads = new Set(sel.map((m) => m.tomadorCnpj || m.tomador));
          if ((form as any).modoEmbarque === "simplificado" && emits.size > 1)
            throw new Error(
              "CT-e não pode ter remetentes diferentes. Selecione NF-es do mesmo remetente.",
            );
          if ((form as any).modoEmbarque !== "simplificado" && dests.size > 1)
            throw new Error(
              "CT-e não pode ter destinatários diferentes. Selecione NF-es do mesmo destinatário.",
            );
          if (tomads.size > 1)
            throw new Error(
              "CT-e não pode ter tomadores diferentes. Selecione NF-es do mesmo tomador.",
            );
        }
        const pend: string[] = [];
        const ieOk = (vv: any) => String(vv || "").trim().length > 0;
        if (!ieOk((empresa as any).ie)) pend.push("IE do remetente (empresa)");
        const selDocs = mercadorias.filter((m) => chaves.includes(m.chave));
        const m0 = (selDocs[0] || {}) as any;
        const destCt2 = (contatoByDoc.get(String(m0.destCnpj || "").replace(/\D/g, "")) ||
          {}) as any;
        const destIeOk =
          form.ieDestinatario || m0.destIE || destCt2.ie || (percursoMatch as any)?.dest_ie || "";
        if (selDocs.length > 0 && !ieOk(destIeOk)) pend.push("IE do destinatario");
        const tomCt = (contatoByDoc.get(String(form.cnpjTomador || "").replace(/\D/g, "")) ||
          {}) as any;
        if (!ieOk(form.ieTomador || tomCt.ie)) pend.push("IE do tomador");
        if (
          String(form.cnpjConsignatario || "").replace(/\D/g, "").length === 14 &&
          !ieOk(form.ieConsignatario)
        )
          pend.push("IE do consignatario");
        if (
          String(form.cnpjRedespacho || "").replace(/\D/g, "").length === 14 &&
          !ieOk(form.ieRedespacho)
        )
          pend.push("IE do redespacho");
        if (!String(form.motoristaNome || "").trim()) pend.push("Motorista");
        if (
          !/^\d{11}$/.test(
            String(
              ((motoristas || []).find((m: any) => m.id === form.motoristaId) as any)?.cpf || "",
            ).replace(/\D/g, ""),
          )
        )
          pend.push("CPF do motorista (cadastre em RH)");
        if (form.possuiMoto2 === "S" && !String((form as any).motorista2Nome || "").trim())
          pend.push("Segundo motorista");
        if (
          form.possuiMoto2 === "S" &&
          !/^\d{11}$/.test(
            String(
              ((motoristas || []).find((m: any) => m.id === (form as any).motorista2Id) as any)
                ?.cpf || "",
            ).replace(/\D/g, ""),
          )
        )
          pend.push("CPF do segundo motorista (cadastre em RH)");
        if (
          !rntrcFinal ||
          /^ISENTO$/i.test(rntrcFinal) ||
          rntrcFinal.replace(/\D/g, "").length !== 8
        )
          pend.push("RNTRC da empresa com 8 digitos (cadastre em Configuracoes > RNTRC)");
        if (!String(form.placaVeiculo || "").trim()) pend.push("Placa da tracao (veiculo 1)");
        else {
          const vv = (veiculos || []).find(
            (v) =>
              String(v.placa || "").toUpperCase() === String(form.placaVeiculo || "").toUpperCase(),
          );
          if (vv && Traciona(vv.tipo) && !String(form.semiReboque1 || "").trim())
            pend.push("Placa do reboque (veiculo 1 de tracao)");
        }
        if (!(parseFloat(form.vPrest) > 0)) pend.push("Valor do servico maior que zero");
        if (!String(form.icmsCST || "").trim()) pend.push("CST do ICMS");
        if (!String(form.cfop || "").trim()) pend.push("CFOP");
        if (!String(form.icmsAliq || "").trim()) pend.push("Aliquota do ICMS");
        if ((form as any).finalidadeEmissao !== "Complemento") {
          if (!String(form.seguradoraNome || "").trim()) pend.push("Seguradora");
          if (!String(form.apolice || "").trim()) pend.push("Apolice do seguro");
          if (!String(form.segResponsavel || "").trim()) pend.push("Responsavel do seguro");
        }
        if (pend.length > 0) throw new Error("Para emitir informe: " + pend.join("; "));
        validarPedagio(form);
        const ret: any = await emitirCteFn({
          data: {
            empresaId: empresa.id,
            responsavel: respNome,
            form,
            input: {
              ambiente: SEFAZ_AMBIENTE,
              // Avulso = CT-e Normal (tpCTe 0); Simplificado = CTeSimp
              modelo: (form as any).modoEmbarque === "simplificado" ? "simp" : "normal",
              retira: "1",
              rem: {
                cnpj: m0.emitCnpj, xNome: m0.emit,
                uf: m0.emitUF, cMun: m0.emitCMun, xMun: m0.emitXMun,
                ie: m0.emitIE, cep: m0.emitCEP, logradouro: m0.emitLogradouro,
                nro: m0.emitNro, bairro: m0.emitBairro, fone: m0.emitFone,
              },
              dest: {
                cnpj: m0.destCnpj, xNome: m0.dest,
                uf: m0.destUF, cMun: m0.destCMun, xMun: m0.destXMun,
                ie: form.ieDestinatario || m0.destIE, cep: m0.destCEP, logradouro: m0.destLogradouro,
                nro: m0.destNro, bairro: m0.destBairro, fone: m0.destFone,
              },
              componentes: [
                { xNome: "FRETE", vComp: num2(form.vPrest) },
                ...(num2(form.taxaColeta) > 0 ? [{ xNome: "COLETA", vComp: num2(form.taxaColeta) }] : []),
                ...(num2(form.taxaEntrega) > 0 ? [{ xNome: "ENTREGA", vComp: num2(form.taxaEntrega) }] : []),
                ...(num2(form.adValorem) > 0 ? [{ xNome: "AD VALOREM", vComp: num2(form.adValorem) }] : []),
                ...(num2(form.gris) > 0 ? [{ xNome: "GRIS", vComp: num2(form.gris) }] : []),
                ...(num2(form.outrosPed) > 0 ? [{ xNome: "OUTROS", vComp: num2(form.outrosPed) }] : []),
                ...((form as any).adicionalPed && num2((form as any).adicionalPed) > 0 ? [{ xNome: "ADICIONAL", vComp: num2((form as any).adicionalPed) }] : []),
              ],
              toma: form.toma,
              cnpjTomador: form.cnpjTomador,
              xNomeTomador: form.xNomeTomador,
              ufTomador: form.ufTomador,
              cMunTomador: form.cMunTomador,
              xMunTomador: form.xMunTomador,
              cfop: form.cfop,
              tpServ: "0",
              vPrest: totalPrestacao(form),
              vCarga: parseFloat(form.vCarga) || 0,
              pesoKg: parseFloat(form.peso) || 0,
              rntrc: rntrcFinal,
              modalRod: {
                rntrc: rntrcFinal,
                motoristas: motoristasXml(),
                veiculos: (() => {
                  const tpRodDeTipo = (t: any) => { const s = String(t || "").toLowerCase(); if (s.includes("cavalo")) return "03"; if (s.includes("truck") && !s.includes("bitruck")) return "01"; if (s.includes("toco")) return "02"; if (s.includes("van") || s.includes("furg")) return "04"; if (s.includes("utilit")) return "05"; return "06"; };
                  const itemVeic = (placa: string) => {
                    const vv = (veiculos || []).find((v) => String(v.placa || "").toUpperCase() === String(placa || "").toUpperCase());
                    return {
                      placa: String(placa).toUpperCase(),
                      uf: empresa.uf || "MG",
                      renavam: (vv as any)?.renavam || undefined,
                      tpRod: tpRodDeTipo((vv as any)?.tipo),
                      tpCar: "00",
                    };
                  };
                  const out = form.placaVeiculo ? [itemVeic(form.placaVeiculo)] : [];
                  for (const p of [form.placaReboque, form.semiReboque1, form.semiReboque2]) {
                    if (String(p || "").trim()) out.push(itemVeic(p));
                  }
                  return out;
                })(),
              },
              cMunEnv: form.cMunEnv,
              xMunEnv: form.xMunEnv,
              ufEnv: form.ufEnv,
              cMunIni: form.cMunIni,
              xMunIni: form.xMunIni,
              ufIni: form.ufIni,
              cMunFim: form.cMunFim,
              xMunFim: form.xMunFim,
              ufFim: form.ufFim,
              icms: {
                CST: form.icmsCST,
                vBC: totalPrestacao(form),
                pICMS: parseFloat(form.icmsAliq) || 0,
                vICMS: parseFloat(form.icmsValor) || 0,
              },
              impostos: {
                pisAliq: parseFloat(form.pisAliq) || 0,
                cofinsAliq: parseFloat(form.cofinsAliq) || 0,
                irAliq: parseFloat(form.irAliq) || 0,
                inssAliq: parseFloat(form.inssAliq) || 0,
                csllAliq: parseFloat(form.csllAliq) || 0,
              },
              serie: "1",
              tomador: {
                toma: form.toma as any,
                cnpj: form.cnpjTomador,
                xNome: form.xNomeTomador,
                uf: form.ufTomador,
                cMun: form.cMunTomador,
                xMun: form.xMunTomador,
                ie: form.ieTomador || undefined,
                logradouro: form.logradouroTomador || undefined,
                nro: form.nroTomador || undefined,
                bairro: form.bairroTomador || undefined,
                cep: form.cepTomador || undefined,
                fone: form.foneTomador || undefined,
                email: form.emailTomador || undefined,
              },
              emit: {
                xNome: empresa.razao_social || empresa.nome_fantasia,
                ie: empresa.ie || "ISENTO",
                cMun: form.cMunEnv,
                xMun: form.xMunEnv,
                uf: empresa.uf || "MG",
                cnpj: empresa.cnpj,
                crt: empresa.regime_tributario || "3",
                logradouro: empresa.logradouro,
                nro: empresa.numero,
                bairro: empresa.bairro,
                cep: empresa.cep,
              } as any,
              chavesNFe: chaves,
              valoresNFe: chaves.map((ch) => Number((mercadorias.find((m) => m.chave === ch) as any)?.valor) || 0),
            },
          },
        });
        return ret;
      } finally {
        emittingRef.current = false;
      }
    },
    onSuccess: async (ret: any) => {
      if ((ret as any)?.ignored) return;
      // No lote, o resumo final já cobre: evita 1 toast por CT-e.
      const emLote = enviandoLoteRef.current;
      if (ret?.sucesso) {
        if (!emLote) toast.success("CT-e autorizado");
        setOpen(false);
        // Roda em segundo plano: não segura o envio (principalmente no lote).
        persistirPercursoSilencioso().catch(() => {});
        try {
          const plSync = String(form.placaVeiculo || "").toUpperCase();
          const tgSync = String(form.pedagioTag || "").trim();
          if (empresa && plSync && tgSync) {
            const vvSync = (veiculos || []).find(
              (v) => String(v.placa || "").toUpperCase() === plSync,
            );
            if (vvSync && (vvSync as any).tag_pedagio !== tgSync) {
              await (supabase.from("veiculos" as never) as any)
                .update({ tag_pedagio: tgSync })
                .eq("empresa_id", empresa.id)
                .eq("placa", plSync);
              qc.invalidateQueries({ queryKey: ["veiculos-cte", empresa.id] });
            }
          }
        } catch {}
        let rascunhoNfs: any[] = [];
        if (editingRascunhoId) {
          const { data: rascDoc } = await supabase
            .from("cte_documentos" as any)
            .select("xml_assinado")
            .eq("id", editingRascunhoId)
            .maybeSingle();
          try {
            const p = JSON.parse(rascDoc?.xml_assinado || "{}");
            if (p.nfs) rascunhoNfs = p.nfs;
          } catch {}
          await supabase
            .from("cte_documentos" as any)
            .delete()
            .eq("id", editingRascunhoId);
          setEditingRascunhoId(null);
        }
        const chavesUsadas =
          selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map((m) => m.chave);
        // NF-e embarcada não pode ser reutilizada em outro CT-e: baixa sempre.
        if (empresa && chavesUsadas.length > 0) {
          const { count, error: embErr } = await supabase
            .from("cte_nfes_pendentes" as any)
            .update({ status: "embarcada" })
            .in("chave", chavesUsadas)
            .eq("empresa_id", empresa.id)
            .select("chave", { count: "exact", head: true });
          if (embErr) toast.error(`CT-e autorizado, mas falha ao baixar NF-e: ${embErr.message}`);
          if (!count || count === 0) {
            for (const nf of rascunhoNfs) {
              if (!nf?.chave || !chavesUsadas.includes(nf.chave)) continue;
              await supabase.from("cte_nfes_pendentes" as any).upsert(
                {
                  empresa_id: empresa.id,
                  chave: nf.chave,
                  n_nf: nf.nNF,
                  serie: nf.serie || "1",
                  emit_nome: nf.emit || "",
                  emit_cnpj: nf.emitCnpj || "",
                  emit_uf: nf.emitUF || "",
                  emit_cmun: nf.emitCMun || "",
                  emit_xmun: nf.emitXMun || "",
                  emit_ie: nf.emitIE || "",
                  emit_logradouro: nf.emitLogradouro || "",
                  emit_nro: nf.emitNro || "",
                  emit_bairro: nf.emitBairro || "",
                  emit_cep: nf.emitCEP || "",
                  emit_fone: nf.emitFone || "",
                  dest_nome: nf.dest || "",
                  dest_cnpj: nf.destCnpj || "",
                  dest_uf: nf.destUF || "",
                  dest_cmun: nf.destCMun || "",
                  dest_xmun: nf.destXMun || "",
                  dest_ie: nf.destIE || "",
                  dest_logradouro: nf.destLogradouro || "",
                  dest_nro: nf.destNro || "",
                  dest_bairro: nf.destBairro || "",
                  dest_cep: nf.destCEP || "",
                  dest_fone: nf.destFone || "",
                  valor: nf.valor || 0,
                  peso: nf.peso || 0,
                  data_emissao: nf.data || null,
                  tomador_nome: nf.tomador || "",
                  tomador_cnpj: nf.tomadorCnpj || "",
                  tomador_uf: nf.tomadorUF || "",
                  tomador_cmun: nf.tomadorCMun || "",
                  tomador_xmun: nf.tomadorXMun || "",
                  mod_frete: nf.modFrete || "",
                  status: "embarcada",
                },
                { onConflict: "empresa_id,chave" },
              );
            }
          }
          qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          setSelecionadas(new Set());
        }
      } else {
        console.error("[CTE-EMIT] resposta inesperada da emissao:", ret);
        toast.error(
          ret?.xMotivo ||
            ret?.motivo ||
            "Resposta SEFAZ sem motivo (cStat " +
              (ret?.cStat || "?") +
              "). Retorno: " +
              (JSON.stringify(ret || null) || "").slice(0, 200),
        );
      }
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const consultar = useMutation({
    mutationFn: async ({ chave, ambiente }: { chave: string; ambiente?: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      return consultarCteFn({ data: { empresaId: empresa.id, chave, ambiente } });
    },
    onSuccess: (ret: any) => toast.success(`Consulta: ${ret?.cStat || "?"} ${ret?.xMotivo || ""}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const [cteCancelar, setCteCancelar] = useState<{
    chave: string;
    protocolo?: string;
    ambiente?: string;
  } | null>(null);
  const [cteCancelarLote, setCteCancelarLote] = useState(false);
  const [motivoCanc, setMotivoCanc] = useState("ERRO DE EMISSAO DO CT-E");
  const cancelarSelecionados = async () => {
    const docsSelecionados = docsByStatus.autorizados.filter(
      (d) => d.chave_acesso && mdfSel.has(d.chave_acesso),
    );
    if (!docsSelecionados.length) {
      toast.error("Selecione ao menos um CT-e autorizado");
      return;
    }
    setCteCancelarLote(true);
  };
  const cancelar = useMutation({
    mutationFn: async ({
      chave,
      protocolo,
      ambiente,
      justificativa,
    }: {
      chave: string;
      protocolo?: string;
      ambiente?: string;
      justificativa: string;
    }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const just = String(justificativa || "");
      if (just.length < 15) throw new Error("Justificativa muito curta");
      const ret = await cancelarCteFn({
        data: { empresaId: empresa.id, chave, justificativa: just, protocolo, ambiente },
      });
      return { ...ret, chave };
    },
    onSuccess: async (ret: any) => {
      if ((ret as any)?.sucesso) {
        toast.success("CT-e cancelado");
        if (empresa && ret?.chave) {
          const { data: doc } = await supabase
            .from("cte_documentos" as any)
            .select("xml_assinado")
            .eq("chave_acesso", ret.chave)
            .maybeSingle();
          let rascunhoNfs: any[] = [];
          try {
            const p = JSON.parse(doc?.xml_assinado || "{}");
            if (p.nfs) rascunhoNfs = p.nfs;
          } catch {}
          const chavesNfe = chavesNFeDoXml(doc?.xml_assinado || "");
          console.log(
            "[CTE-CANCEL-REVERT] chave:",
            ret.chave,
            "chavesNfe:",
            chavesNfe,
            "rascunhoNfs:",
            rascunhoNfs.length,
          );
          if (chavesNfe.length > 0) {
            const { count, error: revErr } = await supabase
              .from("cte_nfes_pendentes" as any)
              .update({ status: "pendente" })
              .in("chave", chavesNfe)
              .eq("empresa_id", empresa.id)
              .select("chave", { count: "exact", head: true });
            console.log("[CTE-CANCEL-REVERT] update count:", count);
            if (revErr)
              toast.error(`CT-e cancelado, mas falha ao devolver NF-e: ${revErr.message}`);
            else if (count)
              toast.success(`${count} NF-e(s) devolvida(s) p/ embarque`);
            else if (!rascunhoNfs.length)
              toast.warning(
                "CT-e cancelado, mas as NF-es não foram encontradas para devolução",
              );
            if (!count || count === 0) {
              for (const nf of rascunhoNfs) {
                if (!nf?.chave) continue;
                await supabase.from("cte_nfes_pendentes" as any).upsert(
                  {
                    empresa_id: empresa.id,
                    chave: nf.chave,
                    n_nf: nf.nNF,
                    serie: nf.serie || "1",
                    emit_nome: nf.emit || "",
                    emit_cnpj: nf.emitCnpj || "",
                    emit_uf: nf.emitUF || "",
                    emit_cmun: nf.emitCMun || "",
                    emit_xmun: nf.emitXMun || "",
                    emit_ie: nf.emitIE || "",
                    emit_logradouro: nf.emitLogradouro || "",
                    emit_nro: nf.emitNro || "",
                    emit_bairro: nf.emitBairro || "",
                    emit_cep: nf.emitCEP || "",
                    emit_fone: nf.emitFone || "",
                    dest_nome: nf.dest || "",
                    dest_cnpj: nf.destCnpj || "",
                    dest_uf: nf.destUF || "",
                    dest_cmun: nf.destCMun || "",
                    dest_xmun: nf.destXMun || "",
                    dest_ie: nf.destIE || "",
                    dest_logradouro: nf.destLogradouro || "",
                    dest_nro: nf.destNro || "",
                    dest_bairro: nf.destBairro || "",
                    dest_cep: nf.destCEP || "",
                    dest_fone: nf.destFone || "",
                    valor: nf.valor || 0,
                    peso: nf.peso || 0,
                    data_emissao: nf.data || null,
                    tomador_nome: nf.tomador || "",
                    tomador_cnpj: nf.tomadorCnpj || "",
                    tomador_uf: nf.tomadorUF || "",
                    tomador_cmun: nf.tomadorCMun || "",
                    tomador_xmun: nf.tomadorXMun || "",
                    mod_frete: nf.modFrete || "",
                    status: "pendente",
                  },
                  { onConflict: "empresa_id,chave" },
                );
              }
              console.log(
                "[CTE-CANCEL-REVERT] re-inserted",
                rascunhoNfs.length,
                "NF-e from rascunho JSON",
              );
            }
            qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          }
        }
      } else toast.error((ret as any).xMotivo || "Falha ao cancelar");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reparo: devolve p/ embarque as NF-es presas em CT-es já cancelados
  // (cancelamentos antigos de CT-e Normal não revertiam: o extrator só lia <chNFe>).
  const [devolvendoNfes, setDevolvendoNfes] = useState(false);
  const devolverNfesCancelados = async () => {
    if (!empresa || devolvendoNfes) return;
    const docs = docsByStatus.cancelados;
    if (!docs.length) return;
    setDevolvendoNfes(true);
    try {
      const chaves = new Set<string>();
      for (const d of docs) for (const c of chavesNFeDoXml(d.xml_assinado)) chaves.add(c);
      if (!chaves.size) {
        toast.info("Nenhuma NF-e encontrada nos CT-es cancelados");
        return;
      }
      const { count, error } = await supabase
        .from("cte_nfes_pendentes" as any)
        .update({ status: "pendente" })
        .in("chave", [...chaves])
        .eq("empresa_id", empresa.id)
        .select("chave", { count: "exact", head: true });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
      if (count)
        toast.success(`${count} NF-e(s) devolvidas p/ embarque`);
      else
        toast.warning("NF-es dos cancelados não encontradas para devolução");
    } catch (e: any) {
      toast.error("Falha ao devolver NF-es", { description: e.message });
    } finally {
      setDevolvendoNfes(false);
    }
  };

  const [previewOpen, setPreviewOpen] = useState(false);
  const lastPreviewUrl = useRef<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewNum, setViewNum] = useState("");
  const [previewData, setPreviewData] = useState<{
    xml: string;
    chave: string;
    proximo: string;
    ambiente: string;
    form: any;
  } | null>(null);
  const percursoAplicadoKey = useRef("");
  const pularPercursoRef = useRef(false);
  const { data: percursosDB, error: percursosError } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-percursos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cte_percursos" as any)
        .select(
          "id,empresa_id,nome,codigo,created_at,cfop,tipo_carga_antt,coleta_cmun,coleta_xmun,coleta_uf,entrega_cmun,entrega_xmun,entrega_uf,distancia_km,duracao_horas,obs_gerais,icms_cst,icms_aliq,reducao_base,credito_outorgado,pis_aliq,cofins_aliq,ir_aliq,inss_aliq,csll_aliq,rem_cnpj,rem_nome,rem_ie,rem_uf,rem_cmun,rem_xmun,rem_logradouro,rem_nro,rem_bairro,rem_cep,rem_fone,dest_cnpj,dest_nome,dest_ie,dest_uf,dest_cmun,dest_xmun,dest_logradouro,dest_nro,dest_bairro,dest_cep,dest_fone,toma_tipo,toma_cnpj,toma_nome,toma_ie,toma_uf,toma_cmun,toma_xmun,toma_logradouro,toma_nro,toma_bairro,toma_cep,toma_fone,toma_email,consig_cnpj,consig_nome,consig_ie,consig_uf,consig_xmun,consig_cep,consig_logradouro,consig_nro,consig_bairro,redesp_cnpj,redesp_nome,redesp_ie,redesp_uf,redesp_xmun,redesp_cep,redesp_logradouro,redesp_nro,redesp_bairro,seg_nome,seg_cnpj,seg_apolice,seg_averbacao,seg_rctr_c,seg_rcf_dc,seg_adicional,seg_total,seg_repassar,seg_responsavel",
        )
        .eq("empresa_id", empresa!.id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, any>>;
    },
    retry: false,
  });
  const percursos = useMemo(
    () =>
      [...(percursosDB ?? [])].sort((a, b) => {
        const na = Number.parseInt(String(a.codigo || ""), 10);
        const nb = Number.parseInt(String(b.codigo || ""), 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return String(a.codigo || a.nome || "").localeCompare(
          String(b.codigo || b.nome || ""),
          "pt-BR",
          { numeric: true },
        );
      }),
    [percursosDB],
  );
  const previewXml = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves =
        selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map((m) => m.chave);

      return previewCteXmlFn({
        data: {
          empresaId: empresa.id,
          input: {
            ambiente: SEFAZ_AMBIENTE,
            modelo: (form as any).modoEmbarque === "simplificado" ? "simp" : "normal",
            retira: "1",
            rem: (() => { const a = (mercadorias.find((m) => chaves.includes(m.chave)) || mercadorias[0] || {}) as any; return {
              cnpj: a.emitCnpj, xNome: a.emit, uf: a.emitUF, cMun: a.emitCMun, xMun: a.emitXMun,
              ie: a.emitIE, cep: a.emitCEP, logradouro: a.emitLogradouro, nro: a.emitNro, bairro: a.emitBairro, fone: a.emitFone }; })(),
            dest: (() => { const a = (mercadorias.find((m) => chaves.includes(m.chave)) || mercadorias[0] || {}) as any; return {
              cnpj: a.destCnpj, xNome: a.dest, uf: a.destUF, cMun: a.destCMun, xMun: a.destXMun,
              ie: form.ieDestinatario || a.destIE, cep: a.destCEP, logradouro: a.destLogradouro, nro: a.destNro, bairro: a.destBairro, fone: a.destFone }; })(),
            componentes: [
              { xNome: "FRETE", vComp: num2(form.vPrest) },
              ...(num2(form.taxaColeta) > 0 ? [{ xNome: "COLETA", vComp: num2(form.taxaColeta) }] : []),
              ...(num2(form.taxaEntrega) > 0 ? [{ xNome: "ENTREGA", vComp: num2(form.taxaEntrega) }] : []),
              ...(num2(form.adValorem) > 0 ? [{ xNome: "AD VALOREM", vComp: num2(form.adValorem) }] : []),
              ...(num2(form.gris) > 0 ? [{ xNome: "GRIS", vComp: num2(form.gris) }] : []),
              ...(num2(form.outrosPed) > 0 ? [{ xNome: "OUTROS", vComp: num2(form.outrosPed) }] : []),
            ],
            toma: form.toma,
            cnpjTomador: form.cnpjTomador,
            xNomeTomador: form.xNomeTomador,
            ufTomador: form.ufTomador,
            cMunTomador: form.cMunTomador,
            xMunTomador: form.xMunTomador,
            cfop: form.cfop,
            tpServ: "0",
            vPrest: totalPrestacao(form),
            vCarga: parseFloat(form.vCarga) || 0,
            pesoKg: parseFloat(form.peso) || 0,
            rntrc: rntrcFinal,
            modalRod: {
              rntrc: rntrcFinal,
              motoristas: motoristasXml(),
              veiculos: (() => {
                const vv = (veiculos || []).find(
                  (v) =>
                    String(v.placa || "").toUpperCase() ===
                    String(form.placaVeiculo || "").toUpperCase(),
                );
                return form.placaVeiculo
                  ? [
                      {
                        placa: String(form.placaVeiculo).toUpperCase(),
                        uf: empresa.uf || "MG",
                        renavam: (vv as any)?.renavam || undefined,
                      },
                    ]
                  : [];
              })(),
            },
            obsGerais: (form as any).obsGerais || "",
            obsAnulacao: (form as any).obsAnulacao || "",
            obsGlobalizado: (form as any).obsGlobalizado || "",
            reducaoBase: parseFloat((form as any).reducaoBase) || 0,
            cMunEnv: form.cMunEnv,
            xMunEnv: form.xMunEnv,
            ufEnv: form.ufEnv,
            cMunIni: form.cMunIni,
            xMunIni: form.xMunIni,
            ufIni: form.ufIni,
            cMunFim: form.cMunFim,
            xMunFim: form.xMunFim,
            ufFim: form.ufFim,
            icms: {
              CST: form.icmsCST,
              vBC: totalPrestacao(form),
              pICMS: parseFloat(form.icmsAliq) || 0,
              vICMS: parseFloat(form.icmsValor) || 0,
            },
            impostos: {
              pisAliq: parseFloat(form.pisAliq) || 0,
              cofinsAliq: parseFloat(form.cofinsAliq) || 0,
              irAliq: parseFloat(form.irAliq) || 0,
              inssAliq: parseFloat(form.inssAliq) || 0,
              csllAliq: parseFloat(form.csllAliq) || 0,
            },
            serie: "1",
            tomador: {
              toma: form.toma as any,
              cnpj: form.cnpjTomador,
              xNome: form.xNomeTomador,
              uf: form.ufTomador,
              cMun: form.cMunTomador,
              xMun: form.xMunTomador,
              ie: form.ieTomador || undefined,
              logradouro: form.logradouroTomador || undefined,
              nro: form.nroTomador || undefined,
              bairro: form.bairroTomador || undefined,
              cep: form.cepTomador || undefined,
              fone: form.foneTomador || undefined,
              email: form.emailTomador || undefined,
            },
            emit: {
              xNome: empresa.razao_social || empresa.nome_fantasia,
              ie: empresa.ie || "ISENTO",
              cMun: form.cMunEnv,
              xMun: form.xMunEnv,
              uf: empresa.uf || "MG",
              cnpj: empresa.cnpj,
              crt: empresa.regime_tributario || "3",
              logradouro: empresa.logradouro,
              nro: empresa.numero,
              bairro: empresa.bairro,
              cep: empresa.cep,
            } as any,
            chavesNFe: chaves,
            valoresNFe: chaves.map((ch) => Number((mercadorias.find((m) => m.chave === ch) as any)?.valor) || 0),
          },
        },
      });
    },
    onSuccess: (ret: any) => {
      setPreviewData(ret);
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // === Percursos: remetente+destino+tomador pré-salvos (autopreenchimento) ===
  const onlyDigitsPercurso = (v: any) => String(v || "").replace(/\D/g, "");
  const docsAtuais = () => {
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const a = ((sel.length > 0 ? sel[0] : mercadorias[0]) || {}) as any;
    return {
      remDoc: onlyDigitsPercurso(a.emitCnpj),
      remNome: a.emit || "",
      destDoc: onlyDigitsPercurso(a.destCnpj),
      destNome: a.dest || "",
      tomaDoc: onlyDigitsPercurso(form.cnpjTomador),
    };
  };
  const trioPercursoOk = (r: Record<string, any>, d: { remDoc: string; destDoc: string; tomaDoc: string }) =>
    onlyDigitsPercurso(r.rem_cnpj) === d.remDoc &&
    onlyDigitsPercurso(r.dest_cnpj) === d.destDoc &&
    onlyDigitsPercurso(r.toma_cnpj) === d.tomaDoc;
  // Havendo duplicadas p/ o mesmo trio, prefere a mais completa (com CFOP/seguro)
  // em vez da primeira da lista (que pode ser um rascunho antigo sem fiscal).
  const escolherPercurso = (cands: Array<Record<string, any>>) => {
    const score = (r: Record<string, any>) =>
      (r.cfop ? 4 : 0) +
      (r.seg_nome ? 2 : 0) +
      (r.seg_apolice ? 1 : 0) +
      (r.coleta_xmun && r.entrega_xmun ? 1 : 0);
    return cands.sort((a, b) => score(b) - score(a))[0] || null;
  };
  const matchPercurso = (
    d: { remDoc: string; destDoc: string; tomaDoc: string },
    lista?: Array<Record<string, any>>,
  ) => {
    // Conferência estrita: só aplica com CNPJ de remetente + destinatário + tomador iguais
    const arr = lista ?? percursos;
    if (!arr || arr.length === 0) return null;
    if (!d.remDoc || !d.destDoc || !d.tomaDoc) return null;
    const cands = arr.filter((r) => trioPercursoOk(r, d));
    if (cands.length === 0) return null;
    return escolherPercurso(cands);
  };
  // NF sem percurso cadastrado (rem+dest+toma) — linha vermelha + bloqueio no Gerar
  const nfTemPercurso = (m: any) => {
    if (!percursos || percursos.length === 0) return false;
    const dg = (v: any) => String(v || "").replace(/\D/g, "");
    // Tomador efetivo: com modFrete vale o gravado (importação resolve 0→emit);
    // sem modFrete o padrão é CIF (remetente)
    const tEf = (m as any).modFrete ? dg((m as any).tomadorCnpj) : dg((m as any).emitCnpj);
    return percursos.some(
      (r) =>
        dg(r.rem_cnpj) === dg(m.emitCnpj) &&
        dg(r.dest_cnpj) === dg(m.destCnpj) &&
        dg(r.toma_cnpj) === tEf,
    );
  };
  const aplicarPercurso = (r: Record<string, any>) => {
    const stdAliq = (v: any, fb: any) => (v && Number(v) !== 0 ? String(v) : fb);
    // UF pelo código IBGE do município (2 primeiros dígitos): o percurso pode
    // estar com cidade preenchida e UF vazia — sem isso a UF cai no fallback
    // da NF-e (destinatário) e o CT-e sai com fim errado (ex. MARABA/AP).
    const UF_POR_IBGE: Record<string, string> = {
      "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
      "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL",
      "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
      "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
    };
    const ufPorCMun = (cMun: unknown) => UF_POR_IBGE[String(cMun || "").replace(/\D/g, "").slice(0, 2)] || "";
    // IE do destinatário: NF-e (XML) > contato > percurso > mantém
    const destDocP = String(r.dest_cnpj || "").replace(/\D/g, "");
    const nfeDest =
      (mercadorias || []).find(
        (mm: any) => String(mm.destCnpj || "").replace(/\D/g, "") === destDocP,
      ) ||
      (mercadorias || [])[0] ||
      {};
    const ieDestNfe = (nfeDest as any)?.destIE || "";
    const ieDestContato = ((contatoByDoc.get(destDocP) || {}) as any)?.ie || "";
    setForm((f) => ({
      ...f,
      toma: r.toma_tipo || f.toma,
      cnpjTomador: r.toma_cnpj || f.cnpjTomador,
      xNomeTomador: r.toma_nome || f.xNomeTomador,
      ieTomador: r.toma_ie || f.ieTomador,
      ufTomador: r.toma_uf || f.ufTomador,
      cMunTomador: r.toma_cmun || f.cMunTomador,
      xMunTomador: r.toma_xmun || f.xMunTomador,
      logradouroTomador: r.toma_logradouro || f.logradouroTomador,
      nroTomador: r.toma_nro || f.nroTomador,
      bairroTomador: r.toma_bairro || f.bairroTomador,
      cepTomador: r.toma_cep || f.cepTomador,
      foneTomador: r.toma_fone || f.foneTomador,
      emailTomador: r.toma_email || f.emailTomador,
      cMunIni: r.coleta_cmun || f.cMunIni,
      xMunIni: r.coleta_xmun || f.xMunIni,
      ufIni: r.coleta_uf || ufPorCMun(r.coleta_cmun) || f.ufIni,
      ieDestinatario: ieDestNfe || ieDestContato || r.dest_ie || (f as any).ieDestinatario || "",
      cMunFim: r.entrega_cmun || f.cMunFim,
      xMunFim: r.entrega_xmun || f.xMunFim,
      ufFim: r.entrega_uf || ufPorCMun(r.entrega_cmun) || f.ufFim,
      cfop: r.cfop || f.cfop,
      cnpjConsignatario: r.consig_cnpj || f.cnpjConsignatario,
      xNomeConsignatario: r.consig_nome || f.xNomeConsignatario,
      ieConsignatario: r.consig_ie || f.ieConsignatario,
      ufConsignatario: r.consig_uf || f.ufConsignatario,
      xMunConsignatario: r.consig_xmun || f.xMunConsignatario,
      cepConsignatario: r.consig_cep || f.cepConsignatario,
      logradouroConsignatario: r.consig_logradouro || f.logradouroConsignatario,
      nroConsignatario: r.consig_nro || f.nroConsignatario,
      bairroConsignatario: r.consig_bairro || f.bairroConsignatario,
      cnpjRedespacho: r.redesp_cnpj || f.cnpjRedespacho,
      xNomeRedespacho: r.redesp_nome || f.xNomeRedespacho,
      ieRedespacho: r.redesp_ie || f.ieRedespacho,
      ufRedespacho: r.redesp_uf || f.ufRedespacho,
      xMunRedespacho: r.redesp_xmun || f.xMunRedespacho,
      cepRedespacho: r.redesp_cep || f.cepRedespacho,
      logradouroRedespacho: r.redesp_logradouro || f.logradouroRedespacho,
      nroRedespacho: r.redesp_nro || f.nroRedespacho,
      bairroRedespacho: r.redesp_bairro || f.bairroRedespacho,
      seguradoraNome: r.seg_nome || f.seguradoraNome,
      apolice: r.seg_apolice || f.apolice,
      averbacao: r.seg_averbacao || f.averbacao,
      rctrC: r.seg_rctr_c || f.rctrC,
      rcfDc: r.seg_rcf_dc || f.rcfDc,
      segAdicional: r.seg_adicional || f.segAdicional,
      segTotal: r.seg_total || f.segTotal,
      segRepassar: r.seg_repassar ? "S" : f.segRepassar,
      segResponsavel: r.seg_responsavel || f.segResponsavel,
      distanciaKm: r.distancia_km || f.distanciaKm,
      duracaoHoras: r.duracao_horas || f.duracaoHoras,
      icmsCST: r.icms_cst || f.icmsCST,
      icmsAliq: r.icms_aliq || f.icmsAliq,
      reducaoBase: (r.reducao_base || (f as any).reducaoBase) as string,
      creditoOutorgado: (r.credito_outorgado || (f as any).creditoOutorgado) as string,
      pisAliq: stdAliq(r.pis_aliq, f.pisAliq),
      cofinsAliq: stdAliq(r.cofins_aliq, f.cofinsAliq),
      irAliq: r.ir_aliq || f.irAliq,
      inssAliq: r.inss_aliq || f.inssAliq,
      csllAliq: r.csll_aliq || f.csllAliq,

      ...(r.obs_gerais ? { obsGerais: r.obs_gerais } : {}),
    }));
    if (r.entrega_xmun) travarEntregaRef.current = true;
  };
  // Percurso é 100% automático e silencioso: salva/atualiza a cada emissão ou rascunho
  const persistirPercursoSilencioso = async () => {
    try {
      if (!empresa) return;
      const d = docsAtuais();
      if (!d.remDoc || !d.destDoc || !d.tomaDoc || d.tomaDoc.length !== 14) return;
      const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
      const a = ((sel.length > 0 ? sel[0] : mercadorias[0]) || {}) as any;
      const { data: exPerc } = await supabase
        .from("cte_percursos" as any)
        .select("*")
        .eq("empresa_id", empresa.id)
        .eq("rem_cnpj", d.remDoc)
        .eq("dest_cnpj", d.destDoc)
        .eq("toma_cnpj", d.tomaDoc)
        .maybeSingle();
      const exP = ((exPerc as any) || {}) as Record<string, any>;
      let codigoPercurso = ((exPerc as any)?.codigo || "") as string;
      if (!codigoPercurso) {
        const { data: mx } = await supabase
          .from("cte_percursos" as any)
          .select("codigo")
          .eq("empresa_id", empresa.id)
          .order("codigo", { ascending: false })
          .limit(1);
        const last = parseInt((mx as any[])?.[0]?.codigo || "0", 10) || 0;
        codigoPercurso = String(last + 1).padStart(4, "0");
      }
      const cRemP = (contatoByDoc.get(d.remDoc) || {}) as any;
      const cDesP = (contatoByDoc.get(d.destDoc) || {}) as any;
      const nome = (
        ((exPerc as any)?.nome ||
          (d.remNome || "Origem") + " > " + (d.destNome || "Destino")) as string
      ).slice(0, 80);
      const payload = {
        empresa_id: empresa.id,
        nome,
        rem_cnpj: d.remDoc,
        rem_nome: a.emit || d.remNome || "",
        rem_ie: a.emitIE || cRemP.ie || "",
        rem_uf: a.emitUF || cRemP.uf || "",
        rem_cmun: a.emitCMun || "",
        rem_xmun: a.emitXMun || cRemP.cidade || "",
        rem_logradouro: a.emitLogradouro || cRemP.logradouro || "",
        rem_nro: cRemP.numero || "",
        rem_bairro: a.emitBairro || cRemP.bairro || "",
        rem_cep: (a.emitCEP || cRemP.cep || "").replace(/\D/g, "") || "",
        rem_fone: a.emitFone || cRemP.telefone || "",
        dest_cnpj: d.destDoc,
        dest_nome: a.dest || d.destNome || "",
        dest_ie: form.ieDestinatario || a.destIE || cDesP.ie || "",
        dest_uf: a.destUF || cDesP.uf || "",
        dest_cmun: a.destCMun || "",
        dest_xmun: a.destXMun || cDesP.cidade || "",
        dest_logradouro: a.destLogradouro || cDesP.logradouro || "",
        dest_nro: cDesP.numero || "",
        dest_bairro: a.destBairro || cDesP.bairro || "",
        dest_cep: (a.destCEP || cDesP.cep || "").replace(/\D/g, "") || "",
        dest_fone: a.destFone || cDesP.telefone || "",
        toma_tipo: form.toma,
        toma_cnpj: d.tomaDoc,
        toma_nome: form.xNomeTomador || "",
        toma_ie:
          form.ieTomador ||
          ((contatoByDoc.get(String(form.cnpjTomador || "").replace(/\D/g, "")) || {}) as any).ie ||
          "",
        toma_uf: form.ufTomador || "",
        toma_cmun: form.cMunTomador || "",
        toma_xmun: form.xMunTomador || "",
        toma_logradouro: form.logradouroTomador || "",
        toma_nro: form.nroTomador || "",
        toma_bairro: form.bairroTomador || "",
        toma_cep: form.cepTomador || "",
        toma_fone: form.foneTomador || "",
        toma_email: form.emailTomador || "",
        coleta_cmun: form.cMunIni || "",
        coleta_xmun: form.xMunIni || "",
        coleta_uf: form.ufIni || "",
        entrega_cmun: form.cMunFim || "",
        entrega_xmun: form.xMunFim || "",
        entrega_uf: form.ufFim || "",
        cfop: form.cfop || "",
        codigo: codigoPercurso,
        consig_cnpj: form.cnpjConsignatario || "",
        consig_nome: form.xNomeConsignatario || "",
        consig_ie: form.ieConsignatario || "",
        consig_uf: form.ufConsignatario || "",
        consig_xmun: form.xMunConsignatario || "",
        consig_cep: form.cepConsignatario || "",
        consig_logradouro: form.logradouroConsignatario || "",
        consig_nro: form.nroConsignatario || "",
        consig_bairro: form.bairroConsignatario || "",
        redesp_cnpj: form.cnpjRedespacho || "",
        redesp_nome: form.xNomeRedespacho || "",
        redesp_ie: form.ieRedespacho || "",
        redesp_uf: form.ufRedespacho || "",
        redesp_xmun: form.xMunRedespacho || "",
        redesp_cep: form.cepRedespacho || "",
        redesp_logradouro: form.logradouroRedespacho || "",
        redesp_nro: form.nroRedespacho || "",
        redesp_bairro: form.bairroRedespacho || "",
        seg_nome: form.seguradoraNome || "",
        seg_apolice: form.apolice || "",
        seg_averbacao: form.averbacao || "",
        seg_rctr_c: form.rctrC || "",
        seg_rcf_dc: form.rcfDc || "",
        seg_adicional: form.segAdicional || "",
        seg_total: form.segTotal || "",
        seg_repassar: form.segRepassar ? form.segRepassar === "S" : undefined,
        seg_responsavel: form.segResponsavel || "",
        distancia_km: form.distanciaKm || "",
        duracao_horas: form.duracaoHoras || "",
        icms_cst: form.icmsCST || "",
        icms_aliq: form.icmsAliq || "",
        reducao_base: (form as any).reducaoBase || "",
        credito_outorgado: (form as any).creditoOutorgado || "",
        pis_aliq: form.pisAliq || "",
        cofins_aliq: form.cofinsAliq || "",
        ir_aliq: form.irAliq || "",
        inss_aliq: form.inssAliq || "",
        csll_aliq: form.csllAliq || "",
        obs_gerais: (form as any).obsGerais || "",
      };
      // NUNCA apaga dado cadastrado com valor virgem do formulário: se o campo
      // está vazio ou igual ao padrão inicial (ex.: CFOP 5353, coleta BH) e o
      // percurso já tem valor, preserva o cadastrado. Evita que um rascunho
      // salvo antes da aplicação zere CFOP/seguro/rota do cadastro.
      const VIRGEM: Record<string, string> = {
        cfop: "5353",
        icms_cst: "00",
        icms_aliq: "0.00",
        reducao_base: "0.00",
        credito_outorgado: "0.00",
        pis_aliq: "0.00",
        cofins_aliq: "0.00",
        ir_aliq: "0.00",
        inss_aliq: "0.00",
        csll_aliq: "0.00",
        seg_rctr_c: "0.00",
        seg_rcf_dc: "0.00",
        seg_adicional: "0.00",
        seg_total: "0.00",
        seg_responsavel: "4",
        coleta_cmun: "3106200",
        coleta_xmun: "BELO HORIZONTE",
        coleta_uf: "MG",
      };
      for (const k of Object.keys(payload)) {
        if (k === "empresa_id" || k === "codigo" || k === "nome") continue;
        if (k === "seg_repassar") {
          if ((payload as any)[k] === undefined) (payload as any)[k] = !!exP[k];
          continue;
        }
        const fv = (payload as any)[k];
        const ev = exP[k];
        const dg = VIRGEM[k] !== undefined ? VIRGEM[k] : "";
        const s = fv == null ? "" : String(fv);
        if ((!s || s === dg) && ev != null && ev !== "") (payload as any)[k] = ev;
      }
      for (const k of Object.keys(payload)) {
        if (k === "empresa_id") continue;
        const v = (payload as any)[k];
        const vv = k.endsWith("_ie") ? limparIE(v) : v;
        if (typeof vv === "string") (payload as any)[k] = vv.toUpperCase();
      }
      const { error } = await supabase
        .from("cte_percursos" as any)
        .upsert(payload, { onConflict: "empresa_id,rem_cnpj,dest_cnpj,toma_cnpj" });
      if (error) return;
      qc.invalidateQueries({ queryKey: ["cte-percursos", empresa.id] });
    } catch (e) {
      console.log("[CTE-PERCURSO] save silencioso falhou:", (e as Error)?.message);
    }
  };
  const percursoMatch = matchPercurso(docsAtuais());
  // CT-es autorizados compatíveis com o percurso atual (complemento/substituição)
  const ctesCompativeis = useMemo(() => {
    const dg = (v: any) => String(v || "").replace(/\D/g, "");
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const base = sel.length > 0 ? sel[0] : mercadorias[0];
    const rem = dg((percursoMatch as any)?.rem_cnpj || (base as any)?.emitCnpj);
    const dst = dg((percursoMatch as any)?.dest_cnpj || (base as any)?.destCnpj);
    const tom = dg((percursoMatch as any)?.toma_cnpj || form.cnpjTomador);
    const nfMap = new Map(((nfesTodas || []) as any[]).map((n) => [dg(n.chave), n]));
    const lista = ((docs || []) as CteDoc[]).filter(
      (d) => d.status === "autorizado" && d.chave_acesso,
    );
    if (!rem && !dst && !tom) return lista;
    return lista.filter((d) => {
      let tomaD = "",
        chaves: string[] = [];
      try {
        const p = JSON.parse(d.xml_assinado || "{}");
        if (p.form) tomaD = dg(p.form.cnpjTomador);
        const xml = p.xml || "";
        chaves = [...xml.matchAll(/<(?:chNFe|chave)>(\d{44})<\/(?:chNFe|chave)>/g)].map(
          (m) => m[1],
        );
      } catch {
        /* sem NF vinculada: vale só o tomador */
      }
      if (!chaves.length) return !tom || tomaD === tom;
      if (tom && tomaD && tomaD !== tom) return false;
      return chaves.some((ch) => {
        const n = nfMap.get(ch);
        return !!n && (!rem || dg(n.emit_cnpj) === rem) && (!dst || dg(n.dest_cnpj) === dst);
      });
    });
  }, [docs, nfesTodas, percursoMatch, mercadorias, selecionadas, form.cnpjTomador]);
  useEffect(() => {
    percursoAplicadoKey.current = "";
    // Preserva trava armada antes de abrir (rascunho/percurso manual); senão libera p/ NF-e preencher
    travarEntregaRef.current = travarPendenteRef.current;
    travarPendenteRef.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || percursos.length === 0) return;
    if (pularPercursoRef.current) {
      pularPercursoRef.current = false;
      return;
    }
    const d = docsAtuais();
    if (!d.tomaDoc || d.tomaDoc.length !== 14) return;
    const m = matchPercurso(d);
    if (!m) return;
    const key = m.id + "|" + d.remDoc + "|" + d.destDoc + "|" + d.tomaDoc;
    if (percursoAplicadoKey.current === key || percursoAplicadoKey.current === "pick|" + m.id)
      return;
    percursoAplicadoKey.current = key;
    aplicarPercurso(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.cnpjTomador, mercadorias, selecionadas, percursos]);
  const entregaSrcRef = useRef("");
  // Entrega vinda do percurso não é sobrescrita pela NF-e (ex.: redespacho p/ outra cidade)
  const travarEntregaRef = useRef(false);
  // Armado antes de abrir (rascunho restaurado, percurso manual): o reset do open preserva
  const travarPendenteRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (travarEntregaRef.current) return;
    const hasRed = (form.cnpjRedespacho || "").replace(/\D/g, "").length === 14;
    const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
    const a = (sel[0] || mercadorias[0] || {}) as any;
    const cDstE = contatoByDoc.get(String(a.destCnpj || "").replace(/\D/g, "")) || {};
    const dx = hasRed ? form.xMunRedespacho || "" : a.destXMun || (cDstE as any).cidade || "";
    const du = hasRed ? form.ufRedespacho || "" : a.destUF || (cDstE as any).uf || "";
    const dc = hasRed ? "" : a.destCMun || "";
    if (!dx) return;
    const sig = (hasRed ? "R" : "D") + "|" + dx + "|" + du;
    if (entregaSrcRef.current === sig) return;
    entregaSrcRef.current = sig;
    setForm((f) => ({ ...f, xMunFim: dx, ufFim: du, ...(dc ? { cMunFim: dc } : {}) }));
    if (hasRed && du) {
      const mySig = sig;
      (async () => {
        try {
          const r = await fetch("https://brasilapi.com.br/api/ibge/municipios/v1/" + du);
          if (!r.ok) return;
          const arr = await r.json();
          const norm = (st: string) =>
            (st || "")
              .toUpperCase()
              .normalize("NFD")
              .replace(/[^A-Z ]/g, "")
              .replace(/ +/g, " ")
              .trim();
          const hit = ((arr as any[]) || []).find((mm: any) => norm(mm.nome) === norm(dx));
          if (hit && hit.codigo_ibge && entregaSrcRef.current === mySig)
            setForm((f) => ({ ...f, cMunFim: String(hit.codigo_ibge) }));
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    form.cnpjRedespacho,
    form.xMunRedespacho,
    form.ufRedespacho,
    form.cnpjTomador,
    mercadorias,
    selecionadas,
    percursos,
    contatoByDoc,
  ]);
  // Coleta segue exclusivamente o remetente (NF-e emitente + contato) - campo travado na UI
  const coletaSrcRef = useRef("");
  useEffect(() => {
    if (!open) return;
    const sel2 = mercadorias.filter((m) => selecionadas.has(m.chave));
    const b = (sel2[0] || mercadorias[0] || {}) as any;
    if (!b.emitCnpj && !b.emitXMun) return;
    const cEmi = contatoByDoc.get(String(b.emitCnpj || "").replace(/\D/g, "")) || {};
    const cx = b.emitXMun || (cEmi as any).cidade || "";
    const cu = b.emitUF || (cEmi as any).uf || "";
    const cc = b.emitCMun || "";
    if (!cx) return;
    const sig2 = "C|" + String(b.emitCnpj || "") + "|" + cx + "|" + cu;
    if (coletaSrcRef.current === sig2) return;
    coletaSrcRef.current = sig2;
    setForm((f) => ({
      ...f,
      xMunIni: cx,
      ...(cu ? { ufIni: cu } : {}),
      ...(cc ? { cMunIni: cc } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mercadorias, selecionadas, percursos, contatoByDoc]);
  const autorizadosSelecionados = docsByStatus.autorizados.filter(
    (d) => d.chave_acesso && mdfSel.has(d.chave_acesso) && !mdfChaves?.has(d.chave_acesso),
  );
  // Ordem exibida na tabela de documentos (respeita o clique no cabeçalho);
  // o envio em lote segue essa ordem
  const ordenarListaDocs = (lista: CteDoc[]) =>
    ordDocs
      ? [...lista].sort((a, b) => {
          const la = linhaDocs(a) as any;
          const lb = linhaDocs(b) as any;
          const va = la[ordDocs.chave];
          const vb = lb[ordDocs.chave];
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va || "").localeCompare(String(vb || ""), "pt-BR", { numeric: true });
          return cmp * ordDocs.dir;
        })
      : lista;
  const renderTabelaDocs = (lista: CteDoc[], rotulo: string, semSelecao = false) => {
    const ehEnvio = rotulo === "aguardando envio";
    // Ordenação por clique no cabeçalho (3º clique limpa) — mesma usada no envio em lote
    const listaOrd = ordenarListaDocs(lista);
    const TH = ({ k, label, className }: { k: string; label: string; className?: string }) => (
      <TableHead className={"text-center " + (className || "")}>
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase hover:text-foreground"
          onClick={() =>
            setOrdDocs((o) =>
              !o || o.chave !== k
                ? { chave: k, dir: 1 }
                : o.dir === 1
                  ? { chave: k, dir: -1 }
                  : null,
            )
          }
          title="Ordenar"
        >
          {label}
          <span className="text-[9px] w-3 inline-block">
            {ordDocs?.chave === k ? (ordDocs.dir === 1 ? "▲" : "▼") : ""}
          </span>
        </button>
      </TableHead>
    );
    const envIds = lista.map((d) => d.id);
    const envTodos = envIds.length > 0 && envIds.every((id) => envSel.has(id));
    return (
      <>
        {lista.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum CT-e" description={`Nenhum CT-e ${rotulo}.`} />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {rotulo === "autorizados" && !semSelecao && (
                    <TableHead className="w-6">
                      <input
                        type="checkbox"
                        checked={
                          lista
                            .filter((d) => d.status === "autorizado" && d.chave_acesso)
                            .every((d) => mdfSel.has(d.chave_acesso!)) &&
                          lista.some((d) => d.status === "autorizado" && d.chave_acesso)
                        }
                        onChange={() => {
                          const autorizados = lista
                            .filter((d) => d.status === "autorizado" && d.chave_acesso)
                            .map((d) => d.chave_acesso!);
                          setMdfSel((prev) =>
                            autorizados.every((k) => prev.has(k))
                              ? new Set([...prev].filter((k) => !autorizados.includes(k)))
                              : new Set([...prev, ...autorizados]),
                          );
                        }}
                        title="Selecionar CT-es autorizados"
                      />
                    </TableHead>
                  )}
                  {ehEnvio && !semSelecao && (
                    <TableHead className="w-6">
                      <input
                        type="checkbox"
                        checked={envTodos}
                        onChange={() =>
                          setEnvSel((prev) =>
                            envTodos ? new Set() : new Set([...prev, ...envIds]),
                          )
                        }
                        title="Selecionar todos p/ envio"
                      />
                    </TableHead>
                  )}
                  {rotulo === "autorizados" && semSelecao && lista.length > 0 && (
                    <TableHead className="w-6">
                      <input
                        type="checkbox"
                        checked={lista.every((d) => impSel.has(d.id))}
                        onChange={() => {
                          const ids = lista.map((d) => d.id);
                          setImpSel((prev) =>
                            ids.every((k) => prev.has(k))
                              ? new Set([...prev].filter((k) => !ids.includes(k)))
                              : new Set([...prev, ...ids]),
                          );
                        }}
                        title="Selecionar todos p/ importar"
                      />
                    </TableHead>
                  )}
                  <TH k="placas" label="Placa" />
                  <TH k="motorista" label="Motorista" />
                  <TH k="numero" label="Número" />
                  <TH k="serie" label="Série" />
                  <TH k="nfs" label="Notas Fiscais" />
                  <TH k="valor" label="Valor" />
                  <TH k="responsavel" label="Responsável" />
                  <TH k="dataEmi" label="Data Emissão" />
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaOrd.map((d) => {
                  const L = linhaDocs(d);
                  const nNFs = L.nfs ? L.nfs.split(", ") : [];
                  const info = { placas: L.placas ? L.placas.split(" / ") : [], motorista: L.motorista, dataEmi: L.dataEmi };
                  const isRascunho = d.status === "rascunho";
                  // Com MDF-e ativo: sem botão de cancelar em hipótese alguma
                  const stMdfRow = d.chave_acesso ? mdfStatusPorCte.get(d.chave_acesso) : undefined;
                  const cancBloq = stMdfRow === "autorizado" || stMdfRow === "encerrado";
                  return (
                    <TableRow key={d.id} className={isRascunho ? "bg-muted/30" : ""}>
                      {rotulo === "autorizados" && !semSelecao && d.chave_acesso && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={mdfSel.has(d.chave_acesso)}
                            onChange={() =>
                              setMdfSel((prev) => {
                                const next = new Set(prev);
                                if (next.has(d.chave_acesso!)) next.delete(d.chave_acesso!);
                                else next.add(d.chave_acesso!);
                                return next;
                              })
                            }
                            title="Selecionar para MDF-e"
                          />
                        </TableCell>
                      )}
                      {rotulo === "autorizados" && semSelecao && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={impSel.has(d.id)}
                            onChange={() =>
                              setImpSel((prev) => {
                                const next = new Set(prev);
                                if (next.has(d.id)) next.delete(d.id);
                                else next.add(d.id);
                                return next;
                              })
                            }
                            title="Selecionar p/ importar"
                          />
                        </TableCell>
                      )}
                      {ehEnvio && !semSelecao && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={envSel.has(d.id)}
                            onChange={() =>
                              setEnvSel((prev) => {
                                const next = new Set(prev);
                                if (next.has(d.id)) next.delete(d.id);
                                else next.add(d.id);
                                return next;
                              })
                            }
                            title="Selecionar p/ envio"
                          />
                        </TableCell>
                      )}
                    <TableCell className="font-mono text-xs">
                      {info.placas.length ? info.placas.join(" / ") : "—"}
                    </TableCell>
                    <TableCell
                      className="text-xs max-w-[160px] truncate"
                      title={info.motorista || ""}
                    >
                      {info.motorista || "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {d.numero ?? "—"}
                      {d.status === "rejeitado" && d.motivo_rejeicao ? (
                        <p
                          className="font-sans text-[10px] text-destructive/80 max-w-[160px] truncate"
                          title={d.motivo_rejeicao}
                        >
                          {d.motivo_rejeicao}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{d.serie ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {nNFs.length > 0 ? nNFs.join(", ") : d.chave_acesso ? "1" : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(Number(d.valor_servico ?? 0))}
                    </TableCell>
                    <TableCell
                      className="text-xs max-w-[140px] truncate"
                      title={(d as any).responsavel_emissao || ""}
                    >
                      {(d as any).responsavel_emissao || "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {info.dataEmi || "—"}
                    </TableCell>
                    <TableCell className="flex gap-1 justify-end whitespace-nowrap pl-1">
                      {isRascunho ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-primary"
                            onClick={() => editarRascunho(d)}
                            title="Editar rascunho"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setConfRascunho(d)}
                            title="Excluir rascunho"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {d.status === "autorizado" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-sky-600"
                                onClick={() => visualizarPdf(d)}
                                title="Visualizar DACTE"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-sky-600"
                                onClick={() => downloadXml(d)}
                                title="Baixar XML"
                              >
                                <FileCode className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-amber-600"
                                onClick={() => downloadPdf(d)}
                                title="Baixar DACTE (PDF)"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {d.status === "rejeitado" && String(d.xml_assinado || "").includes("<") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-sky-600"
                              onClick={() => downloadXml(d)}
                              title="Baixar XML rejeitado (para diagnóstico)"
                            >
                              <FileCode className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                      {!isRascunho && !cancBloq && d.status === "autorizado" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (!d.chave_acesso) return;
                            const stMdf = mdfStatusPorCte.get(d.chave_acesso);
                            if (stMdf === "encerrado") {
                              toast.error("Manifesto encerrado — o CT-e não pode ser cancelado");
                              return;
                            }
                            if (stMdf) {
                              toast.error(
                                "CT-e vinculado a um MDF-e ativo — cancele o manifesto primeiro",
                              );
                              return;
                            }
                            setCteCancelar({
                              chave: d.chave_acesso,
                              protocolo: d.protocolo_sefaz || undefined,
                              ambiente: SEFAZ_AMBIENTE,
                            });
                            setMotivoCanc("ERRO DE EMISSAO DO CT-E");
                          }}
                          title="Cancelar"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isRascunho && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600"
                          onClick={() => visualizarDoc(d)}
                          title="Ver dados e status"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isRascunho && d.status === "autorizado" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-violet-600"
                          onClick={() => substituirCte(d)}
                          title="Emitir CT-e de substituição"
                        >
                          <Repeat className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isRascunho && d.status === "autorizado" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-700"
                          onClick={() => complementarCte(d)}
                          title="Emitir CT-e complementar"
                          aria-label="Emitir CT-e complementar"
                        >
                          <FilePlus2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {cteCancelarLote && (
        <Dialog
          open={cteCancelarLote}
          onOpenChange={(v) => {
            if (!v) setCteCancelarLote(false);
          }}
        >
          <DialogContent className="inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] h-auto max-h-[90vh] p-4 gap-3">
            <DialogHeader>
              <DialogTitle>Cancelar CT-es selecionados</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Serão cancelados {autorizadosSelecionados.length} CT-e(s) autorizado(s). O
              processamento será feito um por vez.
            </p>
            <div className="space-y-2">
              <Label>Motivo (obrigatório)</Label>
              <Select value={motivoCanc} onValueChange={setMotivoCanc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ERRO DE EMISSAO DO CT-E">ERRO DE EMISSÃO DO CT-E</SelectItem>
                  <SelectItem value="CLIENTE CANCELOU O SERVICO">
                    CLIENTE CANCELOU O SERVIÇO
                  </SelectItem>
                  <SelectItem value="FALTA DE ENERGIA/IMPOSSIBILIDADE TECNICA">
                    FALTA DE ENERGIA/IMPOSSIBILIDADE TÉCNICA
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCteCancelarLote(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={cancelar.isPending || motivoCanc.length < 15}
                onClick={async () => {
                  const docsLote = [...autorizadosSelecionados];
                  setCteCancelarLote(false);
                  for (const d of docsLote) {
                    if (!d.chave_acesso) continue;
                    const st = mdfStatusPorCte.get(d.chave_acesso);
                    if (st) continue;
                    try {
                      await cancelar.mutateAsync({
                        chave: d.chave_acesso,
                        protocolo: d.protocolo_sefaz || undefined,
                        ambiente: SEFAZ_AMBIENTE,
                        justificativa: motivoCanc,
                      });
                    } catch {}
                  }
                  setMdfSel(new Set());
                }}
              >
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {impOpen && (
        <Dialog open={impOpen} onOpenChange={setImpOpen}>
          <DialogContent className="inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] h-auto max-h-[90vh] p-4 gap-3">
            <DialogHeader>
              <DialogTitle>Exportar</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Selecione o formato:</Label>
              <div className="flex flex-col gap-1.5">
                {(["pdf", "xml", "ambos"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="imp-tipo" checked={impTipo === v} onChange={() => setImpTipo(v)} />
                    {v === "pdf" ? "PDF" : v === "xml" ? "XML" : "PDF/XML"}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImpOpen(false)}>Voltar</Button>
              <Button disabled={impProc} onClick={() => void importarLote()}>
                {impProc ? "Baixando…" : "Baixar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {cteCancelar && (
        <Dialog
          open={!!cteCancelar}
          onOpenChange={(v) => {
            if (!v) setCteCancelar(null);
          }}
        >
          <DialogContent className="inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[calc(100vw-2rem)] h-auto max-h-[90vh] p-4 gap-3">
            <DialogHeader>
              <DialogTitle>Cancelar CT-e</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Motivo (obrigatório)</Label>
              <Select value={motivoCanc} onValueChange={setMotivoCanc}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ERRO DE EMISSAO DO CT-E">ERRO DE EMISSÃO DO CT-E</SelectItem>
                  <SelectItem value="CLIENTE CANCELOU O SERVICO">
                    CLIENTE CANCELOU O SERVIÇO
                  </SelectItem>
                  <SelectItem value="FALTA DE ENERGIA/IMPOSSIBILIDADE TECNICA">
                    FALTA DE ENERGIA/IMPOSSIBILIDADE TÉCNICA
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCteCancelar(null)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={!motivoCanc.trim() || cancelar.isPending}
                onClick={() => {
                  if (!cteCancelar) return;
                  cancelar.mutate(
                    { ...cteCancelar, justificativa: motivoCanc },
                    { onSettled: () => setCteCancelar(null) },
                  );
                }}
              >
                Confirmar Cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </>
    );
  };
  return (
    <div className="px-2 pb-2 pt-1 h-[calc(100dvh-88px)] sm:h-[calc(100dvh-104px)] lg:h-[calc(100dvh-120px)] min-h-[500px] flex flex-col gap-2">
      <div className="border-l-4 border-blue-500 pl-4 py-0.5 shrink-0">
        <h1 className="text-display text-2xl leading-tight md:text-3xl">CT-e</h1>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <Tabs value={statusTab} onValueChange={setStatusTab} className="flex-1 min-h-0 flex flex-col">
          {/* Cartão único: barra verde com título + abas + modo; conteúdo das abas abaixo */}
          <Card className="overflow-hidden border-2 border-primary/20 shadow-panel flex-1 min-h-0 flex flex-col">
            <div className="bg-primary text-primary-foreground px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" /> Cadastro de Mercadorias para Embarque
              </h3>
              <TabsList className="bg-white/25 p-1 gap-1 flex-1">
                <TabsTrigger
                  value="embarque"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  NF-es para embarque ({mercadorias.length})
                </TabsTrigger>
                <TabsTrigger
                  value="rascunhos"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  Aguardando envio ({docsByStatus.rascunhos.length})
                </TabsTrigger>
                <TabsTrigger
                  value="rejeitados"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  Rejeitados ({docsByStatus.rejeitados.length})
                </TabsTrigger>
                <TabsTrigger
                  value="cancelados"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  Cancelados ({docsByStatus.cancelados.length})
                </TabsTrigger>
                <TabsTrigger
                  value="autorizados"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  Autorizados ({docsByStatus.autorizados.length})
                </TabsTrigger>
                <TabsTrigger
                  value="ciot"
                  className="flex-1 text-xs px-3 py-1.5 font-medium text-white/80 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-green-900 data-[state=active]:font-bold data-[state=active]:shadow"
                >
                  CIOT ({(ciotOps ?? []).length})
                </TabsTrigger>
              </TabsList>
            </div>
            <CardContent className="p-3 bg-muted/20 overflow-visible flex-1 min-h-0 flex flex-col">
              <TabsContent value="embarque" className="mt-0 flex-1 min-h-0 flex flex-col gap-3">
                <div className="border rounded p-2 bg-background space-y-2 shrink-0">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-primary">
                        Embarque via CT-e
                      </Label>
                      <div className="flex flex-col gap-1 mt-1 text-xs">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="modo-embarque"
                            checked={(form as any).modoEmbarque !== "simplificado"}
                            onClick={() => setSelecionadas(new Set())}
                            onChange={() => setForm((f) => ({ ...f, modoEmbarque: "avulso" }))}
                          />{" "}
                          CT-e Avulso
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="modo-embarque"
                            checked={(form as any).modoEmbarque === "simplificado"}
                            onClick={() => setSelecionadas(new Set())}
                            onChange={() =>
                              setForm((f) => ({ ...f, modoEmbarque: "simplificado" }))
                            }
                          />{" "}
                          CT-e Simplificado
                        </label>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-primary">
                        Situação de Embarque
                      </Label>
                      <div className="flex flex-col gap-1 mt-1 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="radio" checked readOnly /> Pendentes de Liberação
                        </label>
                        <label className="flex items-center gap-1 opacity-60">
                          <input type="radio" disabled /> Embarques Liberados
                        </label>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-primary">
                        Período de Entrada
                      </Label>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <DateInput
                          value={periodoIni}
                          onChange={setPeriodoIni}
                          className="h-7 text-xs w-[150px] shrink-0"
                        />
                        <span className="text-xs shrink-0">Até</span>
                        <DateInput
                          value={periodoFim}
                          onChange={setPeriodoFim}
                          className="h-7 text-xs w-[150px] shrink-0"
                        />
                        {filtrosSalvos.filtros.length > 0 && (
                          <Select onValueChange={aplicarFiltroSalvo}>
                            <SelectTrigger className="h-7 w-[150px] text-xs">
                              <SelectValue placeholder="Filtros salvos" />
                            </SelectTrigger>
                            <SelectContent>
                              {filtrosSalvos.filtros.map((salvo) => (
                                <SelectItem key={salvo.id} value={salvo.id}>
                                  {salvo.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Listagem das Notas Fiscais */}
                <div className="border rounded overflow-hidden bg-background flex-1 min-h-0 flex flex-col">
                  <div className="bg-primary/8 text-primary/80 border-b border-primary/20 px-2 py-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      Listagem das Notas Fiscais
                    </span>
                    <span className="text-xs">
                      Qtde NF-e: {mercadoriasSorted.length}/{mercadorias.length}
                    </span>
                  </div>
                  <div className="overflow-auto flex-1 min-h-0">
                    <Table className="min-w-[1280px]">
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                          <TableHead className="w-6">
                            <input
                              type="checkbox"
                              title={
                                (form as any).modoEmbarque === "simplificado"
                                  ? "Selecionar todas visíveis"
                                  : "No CT-e Avulso, selecione uma NF-e por vez"
                              }
                              disabled={(form as any).modoEmbarque !== "simplificado"}
                              checked={
                                mercadoriasSorted.length > 0 &&
                                selecionadas.size === mercadoriasSorted.length
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const red = (form as any).modoEmbarque === "simplificado";
                                  const grupos = new Set(
                                    mercadoriasSorted.map((m) =>
                                      red ? m.emitCnpj || m.emit : m.tomadorCnpj || m.tomador,
                                    ),
                                  );
                                  if (grupos.size > 1) {
                                    toast.error(
                                      red
                                        ? "No modo simplificado, selecione NF-es do mesmo remetente"
                                        : "No simplificado, selecione NF-es do mesmo tomador",
                                    );
                                    return;
                                  }
                                  if (!red) {
                                    const dests = new Set(
                                      mercadoriasSorted.map((m) => m.destCnpj || m.dest),
                                    );
                                    if (dests.size > 1) {
                                      toast.error(
                                        "Há destinos diferentes na lista — selecione manualmente as do mesmo destinatário",
                                      );
                                      return;
                                    }
                                  }
                                setSelecionadas(new Set(mercadoriasSorted.map((m) => m.chave)));
                                } else setSelecionadas(new Set());
                              }}
                            />
                          </TableHead>
                          {(
                            [
                              { key: "emit", label: "Remetente" },
                              { key: "emitCnpj", label: "CNPJ Remetente" },
                              { key: "dest", label: "Destinatário" },
                              { key: "destCnpj", label: "CNPJ Destinatário" },
                              { key: "tomador", label: "Tomador" },
                              { key: "nNF", label: "Nº NF-e" },
                              { key: "serie", label: "Série" },
                              { key: "data", label: "Data Emissão" },
                              { key: "valor", label: "Valor" },
                              { key: "peso", label: "Peso" },
                            ] as const
                          ).map((col) => (
                            <TableHead
                              key={col.key}
                              className="text-xs cursor-pointer select-none hover:bg-muted/80"
                              onClick={() =>
                                setSortConfig((s) =>
                                  s.key === col.key
                                    ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
                                    : { key: col.key, dir: "asc" },
                                )
                              }
                            >
                              {col.label}
                              {sortConfig.key === col.key && (
                                <span className="ml-1">{sortConfig.dir === "asc" ? "▲" : "▼"}</span>
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mercadorias.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={12}
                              className="text-center text-xs text-muted-foreground py-8"
                            >
                              Nenhuma NF-e importada. Use "Importar NFes (XML)" abaixo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          mercadoriasSorted.map((m) => (
                            <TableRow
                              key={m.chave}
                              className={"text-xs" + (!nfTemPercurso(m) ? " text-red-600" : "")}
                              title={!nfTemPercurso(m) ? "Sem percurso cadastrado" : undefined}
                              data-selected={selecionadas.has(m.chave)}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selecionadas.has(m.chave)}
                                  onChange={(e) => {
                                    const next = new Set(selecionadas);
                                    if (e.target.checked) {
                                      const red = (form as any).modoEmbarque === "simplificado";
                                      if (!red) {
                                        // CT-e Avulso: várias NF-es desde que mesmo remetente + destinatário
                                        const kR = (x: (typeof mercadorias)[number]) => x.emitCnpj || x.emit;
                                        const kD = (x: (typeof mercadorias)[number]) => x.destCnpj || x.dest;
                                        const ref = mercadorias.find((x) => selecionadas.has(x.chave));
                                        if (ref) {
                                          if (kR(ref) !== kR(m)) {
                                            toast.error("O CT-e exige o mesmo remetente");
                                            return;
                                          }
                                          if (kD(ref) !== kD(m)) {
                                            toast.error("O CT-e exige o mesmo destinatário");
                                            return;
                                          }
                                        }
                                        next.add(m.chave);
                                        setSelecionadas(next);
                                        return;
                                      }
                                      // CT-e Simplificado: várias, só do mesmo remetente + tomador
                                      const kR = (x: (typeof mercadorias)[number]) => x.emitCnpj || x.emit;
                                      const kT = (x: (typeof mercadorias)[number]) =>
                                        x.tomadorCnpj || x.tomador;
                                      const ref = mercadorias.find((x) => selecionadas.has(x.chave));
                                      if (ref) {
                                        if (kR(ref) !== kR(m)) {
                                          toast.error(
                                            "No modo simplificado, o CT-e exige o mesmo remetente",
                                          );
                                          return;
                                        }
                                        if (kT(ref) !== kT(m)) {
                                          toast.error("O CT-e exige o mesmo tomador");
                                          return;
                                        }
                                      }
                                      next.add(m.chave);
                                      if (red) {
                                        const chaveRem = m.emitCnpj || m.emit;
                                        const outras = mercadorias.filter(
                                          (x) =>
                                            !next.has(x.chave) &&
                                            (x.emitCnpj || x.emit) === chaveRem,
                                        );
                                        if (outras.length > 0) {
                                          setConfRemetente({
                                            nome: (m.emit || "").slice(0, 60),
                                            chaves: outras.map((x) => x.chave),
                                          });
                                        }
                                      }
                                    } else next.delete(m.chave);
                                    setSelecionadas(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell className="truncate max-w-[200px]" title={m.emit}>
                                {m.emit}
                              </TableCell>
                              <TableCell className="font-mono text-[10px]">
                                {m.emitCnpj
                                  ? m.emitCnpj.replace(
                                      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                                      "$1.$2.$3/$4-$5",
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell className="truncate max-w-[200px]" title={m.dest}>
                                {m.dest}
                              </TableCell>
                              <TableCell className="font-mono text-[10px]">
                                {m.destCnpj
                                  ? m.destCnpj.replace(
                                      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                                      "$1.$2.$3/$4-$5",
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell
                                className="truncate max-w-[200px] text-amber-700"
                                title={m.tomador}
                              >
                                {m.tomador || "—"}
                              </TableCell>
                              <TableCell className="font-mono">{m.nNF}</TableCell>
                              <TableCell>{m.serie}</TableCell>
                              <TableCell>{m.data ? dateBR(m.data) : "—"}</TableCell>
                              <TableCell className="text-right">{brl(m.valor)}</TableCell>
                              <TableCell className="text-right">
                                {Number(m.peso).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Ações de importação múltipla */}
                {importProgress && (
                  <div className="pointer-events-none fixed left-1/2 top-4 z-[60] w-[min(28rem,90vw)] -translate-x-1/2 rounded-lg border bg-background p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between text-xs font-medium">
                      <span>
                        Importando XML {importProgress.feito}/{importProgress.total}…
                      </span>
                      <span>
                        {Math.round((importProgress.feito / Math.max(1, importProgress.total)) * 100)}%
                      </span>
                    </div>
                    <Progress value={(importProgress.feito / Math.max(1, importProgress.total)) * 100} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <label className="flex items-center gap-2 px-3 py-2 border rounded bg-accent text-accent-foreground cursor-pointer hover:bg-accent/70 text-xs font-medium">
                    <UploadCloud className="h-4 w-4" /> {isParsing ? "Importando…" : "Importar NFes (XML)"}
                    <input
                      type="file"
                      accept=".xml"
                      multiple
                      className="hidden"
                      disabled={isParsing}
                      onChange={(e) => {
                        if (isParsing) return;
                        if (e.target.files) handleImportNFeXml(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfLimpar(true)}
                    disabled={mercadorias.length === 0}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Limpar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selecionadas.size === 0}
                    title="Exclui do embarque apenas as NF-es selecionadas"
                    onClick={() => setConfExcSel(true)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Excluir selecionadas
                  </Button>

                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selecionadas.size === 0}
                      title="Seleciona todas as notas visíveis com o mesmo remetente e destinatário da primeira selecionada"
                      onClick={() => {
                        const ref = mercadoriasSorted.find((m) => selecionadas.has(m.chave));
                        if (!ref) {
                          toast.error("Selecione ao menos uma NF-e de referência");
                          return;
                        }
                        const kE = (m: (typeof mercadoriasSorted)[number]) => m.emitCnpj || m.emit;
                        const kD = (m: (typeof mercadoriasSorted)[number]) => m.destCnpj || m.dest;
                        const iguais = mercadoriasSorted.filter(
                          (m) => kE(m) === kE(ref) && kD(m) === kD(ref),
                        );
                        setSelecionadas(new Set(iguais.map((m) => m.chave)));
                        toast.success(`${iguais.length} NF-e(s) selecionadas`);
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Mesmo rem./dest.
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selecionadas.size === 0}
                      onClick={async () => {
                        if (selecionadas.size === 0) {
                          toast.error("Selecione ao menos uma NF-e");
                          return;
                        }
                        const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
                        const dests = new Set(sel.map((m) => m.destCnpj || m.dest));
                        const emits = new Set(sel.map((m) => m.emitCnpj || m.emit));
                        const tomads = new Set(sel.map((m) => m.tomadorCnpj || m.tomador));
                        if ((form as any).modoEmbarque === "simplificado" && emits.size > 1) {
                          toast.error("Remetentes diferentes");
                          return;
                        }
                        if ((form as any).modoEmbarque !== "simplificado" && dests.size > 1) {
                          toast.error("Destinatários diferentes");
                          return;
                        }
                        if (tomads.size > 1) {
                          toast.error("Tomadores diferentes");
                          return;
                        }
                        const semPerc = sel.filter((m) => !nfTemPercurso(m));
                        if (semPerc.length > 0) {
                          const p0 = semPerc[0] as any;
                          try {
                            localStorage.setItem(
                              "prefill_percurso_from_cte",
                              JSON.stringify({
                                remCnpj: String(p0.emitCnpj || "").replace(/\D/g, ""),
                                remNome: p0.emit || "",
                                remUF: (p0 as any).emitUF || "",
                                remXMun: (p0 as any).emitXMun || "",
                                destCnpj: String(p0.destCnpj || "").replace(/\D/g, ""),
                                destNome: p0.dest || "",
                                destUF: (p0 as any).destUF || "",
                                destXMun: (p0 as any).destXMun || "",
                                tomaCnpj: String(p0.tomadorCnpj || "").replace(/\D/g, ""),
                                tomaNome: p0.tomador || "",
                                returnTo: "/fiscal/cte",
                              }),
                            );
                          } catch {}
                          toast.info(`NF-e ${p0.nNF || ""} sem percurso cadastrado.`);
                          navigate({ to: "/fiscal/percursos" } as any);
                          return;
                        }
                        const somaV = sel.reduce((a, m) => a + m.valor, 0);
                        const somaP = sel.reduce((a, m) => a + m.peso, 0);
                        const first = sel[0] as (typeof sel)[0] & {
                          modFrete?: string;
                          tomadorUF?: string;
                          tomadorCMun?: string;
                          tomadorXMun?: string;
                          emitUF?: string;
                          emitCMun?: string;
                          emitXMun?: string;
                          destUF?: string;
                          destCMun?: string;
                          destXMun?: string;
                        };
                        const tomaByMod: Record<string, string> = {
                          "0": "0",
                          "1": "3",
                          "2": "4",
                          "3": "0",
                          "4": "3",
                          "9": "4",
                        };
                        // Sem modFrete na NF-e o padrão é CIF (toma 0, remetente paga).
                        // O "3" (frota própria) só vale quando explícito no cadastro.
                        const tomaSel = (first as any).modFrete
                          ? (tomaByMod[(first as any).modFrete] ?? "0")
                          : "0";
                        const tomCnpjDigits = (
                          ((first as any).tomadorCnpj || first.destCnpj || "") as string
                        ).replace(/\D/g, "");
                        const cTom = contatoByDoc.get(tomCnpjDigits) || {};
                        // Tomador consistente com o toma: 0/3 = remetente (emitente da NF-e),
                        // 1/4 = destinatário, 2 = terceiros (igual à troca manual de toma).
                        const tomaEhRemet = tomaSel === "0" || tomaSel === "3";
                        const tCnpjRaw = tomaEhRemet
                          ? (first as any).emitCnpj || ""
                          : (first as any).tomadorCnpj || first.destCnpj || "";
                        const tNomeRaw = tomaEhRemet
                          ? first.emit || ""
                          : (first as any).tomador || first.dest || "";
                        const tUF = (tomaEhRemet ? (first as any).emitUF : (first as any).tomadorUF) || "";
                        const tCMun = (tomaEhRemet ? (first as any).emitCMun : (first as any).tomadorCMun) || "";
                        const tXMun = (tomaEhRemet ? (first as any).emitXMun : (first as any).tomadorXMun) || "";
                        const tIE = (tomaEhRemet ? (first as any).emitIE : (first as any).tomadorIE) || "";
                        const tLgr = (tomaEhRemet ? (first as any).emitLogradouro : (first as any).tomadorLogradouro) || "";
                        const tBai = (tomaEhRemet ? (first as any).emitBairro : (first as any).tomadorBairro) || "";
                        const tCEP = (tomaEhRemet ? (first as any).emitCEP : (first as any).tomadorCEP) || "";
                        const cTom2 = contatoByDoc.get(String(tCnpjRaw || "").replace(/\D/g, "")) || cTom;
                        lastLookupTomador.current = String(tCnpjRaw || "").replace(/\D/g, "");
                        const tomF = {
                          toma: tomaSel,
                          cnpjTomador: tCnpjRaw,
                          xNomeTomador: tNomeRaw,
                          ufTomador: tUF || (cTom2 as any).uf || "",
                          cMunTomador: tCMun,
                          xMunTomador: tXMun || (cTom2 as any).cidade || "",
                          ieTomador: tIE || (cTom2 as any).ie || "",
                          logradouroTomador: tLgr || (cTom2 as any).logradouro || "",
                          nroTomador: (cTom2 as any).numero || "",
                          bairroTomador: tBai || (cTom2 as any).bairro || "",
                          cepTomador: tCEP || String((cTom2 as any).cep || "").replace(/\D/g, "") || "",
                          foneTomador: (cTom2 as any).telefone || "",
                          emailTomador: "",
                        };
                        setForm((f) => ({
                          ...f,
                          ...tomF,
                          cMunIni: (first as any).emitCMun || "",
                          xMunIni: (first as any).emitXMun || "",
                          ufIni: (first as any).emitUF || "",
                          cMunFim: (first as any).destCMun || "",
                          xMunFim: (first as any).destXMun || "",
                          ieDestinatario: (first as any).destIE || "",
                          ufFim: (first as any).destUF || "",
                          cMunEnv: (first as any).emitCMun || "",
                          xMunEnv: (first as any).emitXMun || "",
                          ufEnv: (first as any).emitUF || "",
                          vCarga: somaV.toFixed(2),
                          peso: String(somaP),
                          icmsBase: f.vPrest || "0.00",
                          ...LIMPA_VIAGEM,
                        }));
                        setViewDoc(null);
                        setAba("geral");
                        setOpen(true);
                        // Aplica o percurso na hora com dados frescos (recém-cadastrado
                        // pode ainda não estar no cache): não depende do efeito.
                        try {
                          await qc.refetchQueries({ queryKey: ["cte-percursos", empresa?.id] });
                        } catch {}
                        const frescos = ((qc.getQueryData(["cte-percursos", empresa?.id]) as any[]) ??
                          percursos) as any[];
                        const dgT = (v: any) => String(v || "").replace(/\D/g, "");
                        const mPerc = matchPercurso(
                          {
                            remDoc: dgT(first.emitCnpj),
                            destDoc: dgT(first.destCnpj),
                            tomaDoc: dgT(tCnpjRaw),
                          },
                          frescos as any,
                        );
                        if (mPerc) aplicarPercurso(mPerc as any);
                        // Toma/tomador recém-calculados prevalecem sobre o cadastro
                        // (que pode ter aprendido o padrão antigo "3")
                        setForm((f) => ({ ...f, ...tomF }));
                      }}
                    >
                      Gerar CT-e com {selecionadas.size || 0} selecionada(s)
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPercPickQuery("");
                        setPercPickSel("");
                        setPercPickOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Novo CT-e
                    </Button>
                  </div>
                </div>
              </TabsContent>
          <AlertDialog
            open={!!confRemetente}
            onOpenChange={(o) => {
              if (!o) setConfRemetente(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Selecionar todas do remetente?</AlertDialogTitle>
                <AlertDialogDescription>
                  {confRemetente &&
                    `Selecionar todas as ${confRemetente.chaves.length + 1} NF-e de ${confRemetente.nome}?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (confRemetente)
                      setSelecionadas((prev) => new Set([...prev, ...confRemetente.chaves]));
                    setConfRemetente(null);
                  }}
                >
                  Selecionar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={percPickOpen} onOpenChange={setPercPickOpen}>
            <DialogContent
              onEscapeKeyDown={(event) => event.stopPropagation()}
              className="fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none max-h-none rounded-none p-6 overflow-y-auto"
            >
              <DialogHeader>
                <DialogTitle>Novo CT-e — escolher percurso</DialogTitle>
              </DialogHeader>
              <Input
                className="h-7 text-xs"
                placeholder="Buscar por número ou nome..."
                value={percPickQuery}
                onChange={(e) => setPercPickQuery(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {percursos
                  .filter((r) => {
                    if (!percPickQuery) return true;
                    const q = percPickQuery.toLowerCase();
                    return [
                      r.codigo,
                      r.nome,
                      r.rem_nome || String(r.nome || "").split(" > ")[0],
                      r.dest_nome || String(r.nome || "").split(" > ")[1],
                      r.rem_cnpj,
                      r.dest_cnpj,
                    ].some((value) =>
                      String(value || "")
                        .toLowerCase()
                        .includes(q),
                    );
                  })
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setPercPickSel(r.codigo)}
                      onDoubleClick={() => novoAvulsoDePercurso(r)}
                      className={
                        "w-full text-left text-xs px-2 py-1.5 rounded border " +
                        (percPickSel === r.codigo
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:bg-muted")
                      }
                      title="Dois cliques para usar direto"
                    >
                      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap overflow-hidden">
                        <span className="font-mono font-semibold shrink-0">{r.codigo}</span>
                        <span
                          className="truncate"
                          title={`${r.rem_nome || r.nome || "Remetente não informado"} → ${r.dest_nome || "Destinatário não informado"}`}
                        >
                          {r.rem_nome ||
                            String(r.nome || "").split(" > ")[0] ||
                            "Remetente não informado"}{" "}
                          →{" "}
                          {r.dest_nome ||
                            String(r.nome || "").split(" > ")[1] ||
                            "Destinatário não informado"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          ({formatarCnpjPercurso(r.rem_cnpj)} → {formatarCnpjPercurso(r.dest_cnpj)})
                        </span>
                        {(r.coleta_xmun || r.entrega_xmun) && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {r.coleta_xmun || "?"}/{r.coleta_uf || "?"} → {r.entrega_xmun || "?"}/
                            {r.entrega_uf || "?"}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                {percursos.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum percurso cadastrado. Cadastre em Fiscal → Percursos.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPercPickOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!percursos.some((r) => r.codigo === percPickSel)}
                  onClick={() => {
                    const r = percursos.find((x) => x.codigo === percPickSel);
                    if (r) novoAvulsoDePercurso(r);
                  }}
                >
                  Usar percurso
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <TabsContent value="rascunhos" className="mt-0">
            {docsByStatus.rascunhos.length > 0 && (
              <div className="mb-2 flex items-center justify-end gap-2">
                {envSel.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {`${envSel.size} selecionado(s)`}
                </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={envSel.size === 0}
                  title="Preenche Nº CIOT e dados do pedágio nos rascunhos marcados"
                  onClick={() => { setLoteCiot(""); setLoteModo("manter"); setLoteOperadora(""); setLoteVpo(""); setLoteVale(""); setLoteCiotOpen(true); }}
                >
                  Preencher CIOT
                </Button>
                <Button
                  size="sm"
                  disabled={envSel.size === 0 || enviandoLote}
                  onClick={enviarSelecionados}
                >
                  {enviandoLote
                    ? "Enviando…"
                    : `Enviar selecionados${envSel.size > 0 ? ` (${envSel.size})` : ""}`}
                </Button>
              </div>
            )}
            {renderTabelaDocs(docsByStatus.rascunhos, "aguardando envio")}
          </TabsContent>
          <TabsContent value="autorizados" className="mt-0">
            {docsByStatus.autorizados.length > 0 && (
              <div className="mb-1 flex items-center justify-between gap-2">
                <Tabs value={mdfVincTab} onValueChange={(v) => { setMdfVincTab(v); setImpSel(new Set()); }}>
                  <TabsList className="mb-0">
                    <TabsTrigger
                      value="sem"
                      className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                    >
                      Sem MDF-e ({autSemMdf.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="com"
                      className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                    >
                      Com MDF-e ({autComMdf.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!autorizadosSelecionados.length}
                    onClick={cancelarSelecionados}
                    title="Cancelar CT-es selecionados"
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar selecionados
                    {autorizadosSelecionados.length > 0 ? ` (${autorizadosSelecionados.length})` : ""}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mdfSel.size === 0}
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          "prefill_mdf_from_cte",
                          JSON.stringify({ chaves: [...mdfSel] }),
                        );
                      } catch {}
                      setMdfSel(new Set());
                      navigate({ to: "/fiscal/mdf" } as any);
                    }}
                  >
                    <Truck className="mr-1 h-3 w-3" /> Gerar MDF-e ({mdfSel.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(mdfVincTab === "com" ? impSel.size : autSemMdf.filter((d) => d.chave_acesso && mdfSel.has(d.chave_acesso)).length) === 0 || impProc}
                    onClick={() => setImpOpen(true)}
                    title="Baixar XML/PDF dos selecionados"
                  >
                    <Download className="mr-1 h-3 w-3" /> Exportar ({mdfVincTab === "com" ? impSel.size : autSemMdf.filter((d) => d.chave_acesso && mdfSel.has(d.chave_acesso)).length})
                  </Button>
                </div>
              </div>
            )}
            {renderTabelaDocs(
              mdfVincTab === "com" ? autComMdf : autSemMdf,
              "autorizados",
              mdfVincTab === "com",
            )}
          </TabsContent>
          <TabsContent value="ciot" className="mt-0 space-y-3">
            <Card className="overflow-hidden">
              <div className="bg-primary/8 border-b border-primary/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                CT-es autorizados — selecione para uma operação CIOT
              </div>
              {docsByStatus.autorizados.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={Truck} title="Nenhum CT-e autorizado" description="Autorize CT-es para emitir o CIOT cobrindo um ou vários." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            docsByStatus.autorizados.length > 0 &&
                            docsByStatus.autorizados.every((d) => ciotSel.has(d.id))
                          }
                          onChange={() => {
                            setCiotSel((prev) => {
                              const todos = docsByStatus.autorizados.map((d) => d.id);
                              return todos.every((k) => prev.has(k))
                                ? new Set()
                                : new Set(todos);
                            });
                          }}
                          title="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead className="text-center">Número</TableHead>
                      <TableHead className="text-center">Placa</TableHead>
                      <TableHead className="text-center">Motorista</TableHead>
                      <TableHead className="text-center">Rota</TableHead>
                      <TableHead className="text-center">Peso (kg)</TableHead>
                      <TableHead className="text-center">Distância</TableHead>
                      <TableHead className="text-center">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docsByStatus.autorizados.map((d) => {
                      const f = formDeDocCiot(d);
                      const info = infoCteLinha(d.xml_assinado);
                      const ori = [String(f.xMunIni || ""), String(f.ufIni || "")].filter(Boolean).join("/");
                      const dst = [String(f.xMunFim || ""), String(f.ufFim || "")].filter(Boolean).join("/");
                      const rota = ori || dst ? `${ori || "—"} → ${dst || "—"}` : "—";
                      return (
                        <TableRow key={d.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={ciotSel.has(d.id)}
                              onChange={() =>
                                setCiotSel((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(d.id)) next.delete(d.id);
                                  else next.add(d.id);
                                  return next;
                                })
                              }
                              title="Selecionar para o CIOT"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-center">{d.numero ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-center">
                            {info.placas.length ? info.placas.join(" / ") : "—"}
                          </TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate" title={info.motorista || ""}>
                            {info.motorista || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-center">{rota}</TableCell>
                          <TableCell className="text-center text-xs">
                            {f.peso ? Number(String(f.peso).replace(",", "."))?.toLocaleString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {f.distanciaKm ? `${f.distanciaKm} km` : "—"}
                          </TableCell>
                          <TableCell className="text-right">{brl(Number(d.valor_servico) || 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
            {ciotSel.size > 0 && (
              <Card className="p-3 space-y-2">
                <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  Operação CIOT — {ciotSel.size} CT-e(s)
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={verificarFrotaCiot} disabled={ciotFrotaLoading || ciotSel.size === 0}>
                    {ciotFrotaLoading ? "Consultando…" : "Verificar frota na ANTT"}
                  </Button>
                  <Button size="sm" onClick={() => setCiotConfirma(true)} disabled={emitindoCiotLote || ciotSel.size === 0}>
                    {emitindoCiotLote ? "Emitindo…" : `Emitir CIOT (${ciotSel.size} CT-e)`}
                  </Button>
                </div>
                {ciotFrota && (
                  <div className="rounded border px-2 py-1 text-[11px] space-y-1">
                    {ciotFrota.map((g, gi) => {
                      const lista = Array.isArray(g.frota?.Frota) ? g.frota.Frota : [];
                      const msg = String(
                        (Array.isArray(g.situacao?.Mensagem) ? g.situacao.Mensagem[0] : g.situacao?.Mensagem) ||
                          (Array.isArray(g.frota?.Mensagem) ? g.frota.Mensagem[0] : g.frota?.Mensagem) || "",
                      );
                      return (
                        <div key={gi} className="space-y-0.5">
                          <div>
                            RNTRC: {String(g.situacao?.RNTRCTransportador ?? g.rntrc)}
                            {" • "}Ativo: {String(g.situacao?.RNTRCAtivo ?? "—")}
                            {" • "}Tipo: {String(g.situacao?.TipoTransportador ?? "—")}
                          </div>
                          {lista.map((v: any, i: number) => {
                            const sit = Number(v.SituacaoVeiculoFrotaTransportador ?? v.situacao);
                            return (
                              <div key={i} className={sit === 1 ? "text-green-700 font-semibold" : "text-destructive font-semibold"}>
                                {String(v.PlacaVeiculo ?? v.placa ?? "?")} → {sit === 1 ? "pertence à frota" : "NÃO pertence à frota"}
                              </div>
                            );
                          })}
                          {!lista.some((v: any) => Number(v.SituacaoVeiculoFrotaTransportador ?? v.situacao) === 1) && (
                            <div className="text-destructive">
                              Nenhuma placa deste RNTRC vinculada em homologação — peça o vínculo a pef@antt.gov.br; sem isso a declaração rejeita.
                            </div>
                          )}
                          {msg !== "" && <div className="text-muted-foreground">{msg}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Direto na ANTT (homologação) — só frota própria, sem TAC. Tomador único obrigatório.
                </p>
              </Card>
            )}
            <AlertDialog open={ciotConfirma} onOpenChange={setCiotConfirma}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Emitir CIOT</AlertDialogTitle>
                </AlertDialogHeader>
                {resumoCiot && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded border px-2 py-1">
                      <div className="text-[10px] text-muted-foreground">
                        Piso mínimo ANTT
                      </div>
                      <div className="font-semibold">
                        {resumoCiot.piso !== null ? brl(resumoCiot.piso) : "—"}
                      </div>
                    </div>
                    <div className="rounded border px-2 py-1">
                      <div className="text-[10px] text-muted-foreground">
                        Total CIOT
                      </div>
                      <div className="font-semibold">{brl(resumoCiot.valorTotal)}</div>
                    </div>
                  </div>
                )}
                {resumoCiot && !resumoCiot.motoOk && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                    Motoristas diferentes nos CT-es — uma operação CIOT exige o mesmo motorista.
                  </div>
                )}
                {resumoCiot?.abaixo && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                    Valores abaixo do piso mínimo — não será possível emitir.
                  </div>
                )}
                {resumoCiot && !resumoCiot.donoOk && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                    Tração {resumoCiot.placa || "—"}{" "}
                    {resumoCiot.donoDoc
                      ? `em nome de ${resumoCiot.donoNome || "terceiro"} — CIOT próprio exige cavalo no CNPJ do emissor.`
                      : "sem proprietário cadastrado — informe o CNPJ do emissor no veículo."}
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    data-acao
                    disabled={!resumoCiot || resumoCiot.abaixo || !resumoCiot.donoOk || !resumoCiot.motoOk || emitindoCiotLote}
                    onClick={emitirCiotLote}
                  >
                    Emitir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Card className="overflow-hidden">
              <div className="bg-primary/8 border-b border-primary/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                CIOTs emitidos ({(ciotOps ?? []).length})
              </div>
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Input
                  className="h-8 max-w-[200px] font-mono text-xs"
                  placeholder="Consultar CIOT (12 dígitos)"
                  value={ciotConsulta}
                  onChange={(e) => setCiotConsulta(e.target.value.replace(/\D/g, "").slice(0, 12))}
                />
                <Button size="sm" variant="outline" onClick={consultarCiotNaAntt} disabled={ciotConsultaLoading}>
                  {ciotConsultaLoading ? "Consultando…" : "Consultar na ANTT"}
                </Button>
                {ciotConsultaRes && (
                  <span className="text-[11px]">
                    {String(
                      (Array.isArray(ciotConsultaRes.Mensagem) ? ciotConsultaRes.Mensagem[0] : ciotConsultaRes.Mensagem) ||
                        ciotConsultaRes.message || "",
                    )}
                    {ciotConsultaRes.CodigoIdentificacaoOperacao && ciotConsultaRes.CodigoIdentificacaoOperacao.length > 12
                      ? ` • CIOT completo ${String(ciotConsultaRes.CodigoIdentificacaoOperacao)}`
                      : ""}
                  </span>
                )}
              </div>
              {!(ciotOps ?? []).length ? (
                <div className="p-4">
                  <EmptyState icon={Truck} title="Nenhum CIOT ainda" description="Selecione CT-es acima e emita." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CIOT</TableHead>
                      <TableHead>Protocolo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">CT-es</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ciotOps ?? []).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.ciot}</TableCell>
                        <TableCell className="font-mono text-xs">{o.protocolo || "—"}</TableCell>
                        <TableCell className="text-right">{brl(Number(o.valor_frete) || 0)}</TableCell>
                        <TableCell className="text-center">{Array.isArray(o.cte_ids) ? o.cte_ids.length : "—"}</TableCell>
                        <TableCell className="text-xs">{o.status}</TableCell>
                        <TableCell className="text-xs">{String(o.created_at || "").slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
          <TabsContent value="rejeitados" className="mt-0">
            {docsByStatus.rejeitados.length > 0 && (
              <div className="mb-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!empresa) return;
                    try {
                      await excluirRejeitadosCteFn({ data: { empresaId: empresa.id } });
                      toast.success("CT-e rejeitados excluídos");
                      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Limpar Rejeitados
                </Button>
              </div>
            )}
            {renderTabelaDocs(docsByStatus.rejeitados, "rejeitados")}
          </TabsContent>
          <TabsContent value="cancelados" className="mt-0 space-y-2">
            {docsByStatus.cancelados.length > 0 && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={devolverNfesCancelados}
                  disabled={devolvendoNfes}
                  title="Devolve para embarque as NF-es dos CT-es cancelados"
                >
                  {devolvendoNfes ? "Devolvendo…" : "Devolver NF-es p/ embarque"}
                </Button>
              </div>
            )}
            {renderTabelaDocs(docsByStatus.cancelados, "cancelados")}
          </TabsContent>
          </CardContent>
          </Card>
        </Tabs>
      )}
      <AlertDialog open={!!confRascunho} onOpenChange={(v) => { if (!v) setConfRascunho(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir este rascunho? As NF-e voltam para pendentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confRascunho && excluirRascunho(confRascunho)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confLimpar} onOpenChange={setConfLimpar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pendentes</AlertDialogTitle>
            <AlertDialogDescription>
              Remover {mercadorias.length} NF-e(s) pendentes do embarque?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!empresa || mercadorias.length === 0) return;
                const { error } = await supabase
                  .from("cte_nfes_pendentes" as any)
                  .delete()
                  .eq("empresa_id", empresa.id)
                  .eq("status", "pendente");
                if (error) toast.error(error.message);
                else {
                  setMercadorias([]);
                  setSelecionadas(new Set());
                  qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
                  toast.success("Pendentes removidos");
                }
                setConfLimpar(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confExcSel} onOpenChange={setConfExcSel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir selecionadas</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir {selecionadas.size} NF-e(s) selecionada(s) do embarque?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!empresa || selecionadas.size === 0) return;
                const chaves = Array.from(selecionadas);
                const { error } = await supabase
                  .from("cte_nfes_pendentes" as any)
                  .delete()
                  .eq("empresa_id", empresa.id)
                  .in("chave", chaves);
                if (error) toast.error(error.message);
                else {
                  setMercadorias((atual) => atual.filter((m) => !selecionadas.has(m.chave)));
                  setSelecionadas(new Set());
                  qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
                  toast.success(`${chaves.length} NF-e(s) excluída(s)`);
                }
                setConfExcSel(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={loteCiotOpen} onOpenChange={setLoteCiotOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Preencher CIOT ({envSel.size} rascunho{envSel.size !== 1 ? "s" : ""})</AlertDialogTitle>
            <AlertDialogDescription>
              Aplica nos rascunhos marcados. Campos vazios mantêm o valor atual de cada um.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Nº CIOT</Label>
              <Input className="h-8 font-mono" value={loteCiot} onChange={(e) => setLoteCiot(e.target.value.replace(/\D/g, "").slice(0, 12))} maxLength={12} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Pagto. pedágio</Label>
              <Select value={loteModo} onValueChange={setLoteModo}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manter">Manter atual</SelectItem>
                  <SelectItem value="tag-transportador">TAG Transportador</SelectItem>
                  <SelectItem value="tag-tomador">TAG Tomador</SelectItem>
                  <SelectItem value="free-flow">Free Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Operadora</Label>
              <Select value={loteOperadora || undefined} onValueChange={setLoteOperadora}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Manter atual" /></SelectTrigger>
                <SelectContent>
                  {PEDAGIO_OPERADORAS.map((o) => (
                    <SelectItem key={o.nome} value={o.nome}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Identificador VPO</Label>
              <Input className="h-8 font-mono" value={loteVpo} onChange={(e) => setLoteVpo(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Vale-pedágio (R$)</Label>
              <MoneyInput className="h-8" value={loteVale} onChange={setLoteVale} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-acao onClick={aplicarLoteCiotPedagio} disabled={loteSalvando}>
              {loteSalvando ? "Aplicando…" : "Aplicar no lote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={manualNfeOpen} onOpenChange={setManualNfeOpen}>
        <DialogContent
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setManualNfeOpen(false);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Inserir NF-e manualmente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modelo</Label>
              <Input
                value={manualNfe.modelo}
                onChange={(e) => setManualNfe((v) => ({ ...v, modelo: e.target.value }))}
                placeholder="55"
              />
            </div>
            <div>
              <Label>Chave NF-e</Label>
              <Input
                value={manualNfe.chave}
                onChange={(e) =>
                  setManualNfe((v) => ({
                    ...v,
                    chave: e.target.value.replace(/\D/g, "").slice(0, 44),
                  }))
                }
                placeholder="44 dígitos"
                maxLength={44}
              />
            </div>
            <div>
              <Label>Nº NF-e</Label>
              <Input
                value={manualNfe.nNF}
                onChange={(e) => setManualNfe((v) => ({ ...v, nNF: e.target.value }))}
                placeholder="Ex.: 12345"
              />
            </div>
            <div>
              <Label>Série</Label>
              <Input
                value={manualNfe.serie}
                onChange={(e) => setManualNfe((v) => ({ ...v, serie: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <Label>Remetente *</Label>
              <Input
                value={manualNfe.emit}
                onChange={(e) => setManualNfe((v) => ({ ...v, emit: e.target.value }))}
                placeholder="Nome ou razão social"
              />
            </div>
            <div>
              <Label>CNPJ remetente</Label>
              <Input
                value={manualNfe.emitCnpj}
                onChange={(e) => setManualNfe((v) => ({ ...v, emitCnpj: maskDoc(e.target.value) }))}
              />
            </div>
            <div className="col-span-2">
              <Label>Destinatário *</Label>
              <Input
                value={manualNfe.dest}
                onChange={(e) => setManualNfe((v) => ({ ...v, dest: e.target.value }))}
                placeholder="Nome ou razão social"
              />
            </div>
            <div>
              <Label>CNPJ destinatário</Label>
              <Input
                value={manualNfe.destCnpj}
                onChange={(e) => setManualNfe((v) => ({ ...v, destCnpj: maskDoc(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Data</Label>
              <DateInput
                value={manualNfe.data}
                onChange={(data) => setManualNfe((v) => ({ ...v, data }))}
              />
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input
                inputMode="decimal"
                value={manualNfe.qtde}
                onChange={(e) => setManualNfe((v) => ({ ...v, qtde: e.target.value }))}
              />
            </div>
            <div>
              <Label>Quantidade de peso (kg)</Label>
              <Input
                inputMode="decimal"
                value={manualNfe.peso}
                onChange={(e) => setManualNfe((v) => ({ ...v, peso: e.target.value }))}
              />
            </div>
            <div>
              <Label>Valor da NF-e</Label>
              <Input
                inputMode="decimal"
                value={manualNfe.valor}
                onChange={(e) => setManualNfe((v) => ({ ...v, valor: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualNfeOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={adicionarNfeManual}>Adicionar NF-e</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) setOpen(true);
          else fecharDialogo();
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            fecharDialogo();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            // Enter em campo de texto salva rascunho (textarea quebra linha; checkbox/radio/file ficam fora)
            if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              const t = event.target as HTMLElement;
              if (
                t.tagName === "INPUT" &&
                !["checkbox", "radio", "file", "button", "submit", "hidden"].includes((t as HTMLInputElement).type) &&
                !t.closest('[role="combobox"],[role="listbox"],[role="option"],[role="dialog"],[data-radix-popper-content-wrapper]')
              ) {
                event.preventDefault();
                if (!salvarRascunho.isPending) salvarRascunho.mutate();
              }
            }
          }}
          className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />{" "}
              {(form as any).modoEmbarque === "simplificado"
                ? "Conhecimento de Transporte Simplificado"
                : "Conhecimento de Transporte Avulso"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Emissão de CT-e (57) — versão 4.00 via mTLS SEFAZ.
            </p>
          </DialogHeader>

          <Tabs value={aba} onValueChange={setAba} className="w-full">
            <TabsList className="w-full justify-start gap-0 bg-muted/50 rounded-t-md">
              <TabsTrigger
                value="geral"
                className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
              >
                <Settings2 className="mr-1 h-3 w-3" />
                Geral
              </TabsTrigger>
              <TabsTrigger
                value="seguros"
                className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
              >
                <Truck className="mr-1 h-3 w-3" />
                Transporte
              </TabsTrigger>
              <TabsTrigger
                value="docs"
                className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
              >
                <FileText className="mr-1 h-3 w-3" />
                Tributação e Carga
              </TabsTrigger>
              <TabsTrigger
                value="obs"
                className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
              >
                <FileCode className="mr-1 h-3 w-3" />
                Observações
              </TabsTrigger>
            </TabsList>

            {/* === TAB: Geral === */}
            <TabsContent value="geral" className="mt-3 space-y-3">
              {viewDoc && (
                <Card className="p-3">
                  <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Situação do CT-e
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Chave de Acesso</Label>
                      <Input
                        className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent"
                        value={viewDoc?.chave_acesso || "— aguardando emissão —"}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        Protocolo de Envio
                      </Label>
                      <Input
                        className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent"
                        value={viewDoc ? viewDoc.protocolo_sefaz || "—" : "— aguardando emissão —"}
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Data Hora Envio</Label>
                      <Input
                        className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                        value={
                          viewDoc ? fmtDataHora(viewDoc.data_autorizacao) : "— aguardando emissão —"
                        }
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Motivo Envio</Label>
                      <Input
                        className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                        value={
                          viewDoc
                            ? viewDoc.status === "rejeitado"
                              ? viewDoc.motivo_rejeicao || "—"
                              : "Autorizado o uso do CT-e"
                            : "— aguardando emissão —"
                        }
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        Protocolo Cancelamento
                      </Label>
                      <Input
                        className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent"
                        value="���"
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        Data Hora Cancelamento
                      </Label>
                      <Input
                        className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                        value="—"
                        readOnly
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">
                        Motivo Cancelamento
                      </Label>
                      <Input
                        className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                        value="—"
                        readOnly
                      />
                    </div>
                  </div>
                </Card>
              )}
              {/* Header: Ambiente, Nº, Data, Tomador, Mod/Ser + CFOP */}
              <div className="grid grid-cols-2 md:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto] gap-2 border rounded p-3 bg-muted/20">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Ambiente</Label>
                  <div className="flex h-7 items-center rounded-md border bg-amber-50 px-2 text-[10px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    Homologação (testes)
                  </div>
                </div>
                <div className="w-44">
                  <Label className="text-[10px] text-muted-foreground">N° Conhecimento</Label>
                  <Input
                    className="h-7 text-xs font-mono bg-transparent"
                    value={viewDoc?.numero ?? "— aguardando emissão —"}
                    readOnly
                  />
                </div>
                <div className="w-[136px]">
                  <Label className="text-[10px] text-muted-foreground">Data Emissão</Label>
                  <DateInput
                    value={form.dataEmissao}
                    onChange={(v) => setForm({ ...form, dataEmissao: v })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Tomador do Serviço</Label>
                  <Popover open={tomadorOpen} onOpenChange={setTomadorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={tomadorOpen}
                        className="h-7 text-xs justify-between w-full font-normal"
                      >
                        <span className="truncate text-left">
                          {MOD_FRETE_OPTIONS.find((o) => o.value === form.toma)?.label ||
                            "Selecione o tomador"}
                        </span>
                        {lookingUpTomador ? (
                          <Loader2 className="ml-2 h-3 w-3 shrink-0 animate-spin" />
                        ) : (
                          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[480px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Ou digite o CNPJ do tomador..."
                          value={tomadorQuery}
                          onValueChange={(v) => {
                            setTomadorQuery(v);
                            const digits = v.replace(/\D/g, "").slice(0, 14);
                            if (digits.length === 14 && digits !== lastLookupTomador.current) {
                              onPickContatoTomador(digits);
                            }
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhuma opção.</CommandEmpty>
                          <CommandGroup heading="Tipo do tomador">
                            {MOD_FRETE_OPTIONS.map((opt) => (
                              <CommandItem
                                key={opt.value}
                                value={opt.value}
                                onSelect={() => {
                                  aplicarTomadorPorToma(opt.value);
                                  setTomadorOpen(false);
                                  setTomadorQuery("");
                                }}
                              >
                                <Check
                                  className={
                                    "mr-2 h-3 w-3 " +
                                    (form.toma === opt.value ? "opacity-100" : "opacity-0")
                                  }
                                />
                                <span className="truncate">{opt.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Mod / Série</Label>
                  <Input
                    className="h-7 text-xs font-mono w-[92px] text-center px-1 bg-transparent"
                    value="57 / 001"
                    readOnly
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Percurso</Label>
                    <Input
                      className="h-7 text-xs font-mono w-[76px] text-center px-1 bg-transparent"
                      value={percursoMatch?.codigo || "—"}
                      readOnly
                      title={
                        percursoMatch
                          ? `${percursoMatch?.nome || ""} — CFOP ${percursoMatch?.cfop || "—"} — Seg ${(percursoMatch as any)?.seg_nome || "—"}`
                          : "Nenhum percurso associado"
                      }
                    />
                </div>
              </div>
              <div className="border rounded p-3 bg-muted/20">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="flex-[2_1_320px] max-w-[700px] min-w-0">
                    <Label className="text-[10px] text-muted-foreground">CFOP Saída</Label>
                    <Popover open={cfopOpen} onOpenChange={setCfopOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={cfopOpen}
                          className="h-7 text-xs justify-between w-full font-normal"
                        >
                          <span className="truncate text-left">
                            {CFOPS_CTE.find((c) => c.codigo === form.cfop)?.descricao ||
                              CFOPS_CTE.find(
                                (c) => c.codigo.replace(/\D/g, "") === form.cfop.replace(/\D/g, ""),
                              )?.descricao ||
                              form.cfop ||
                              "Selecione CFOP"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[480px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Digite 5352 ou 5.352 ou comércio..."
                            value={cfopQuery}
                            onValueChange={setCfopQuery}
                          />
                          <CommandList onWheelCapture={(e) => e.stopPropagation()}>
                            <CommandEmpty>Nenhum CFOP encontrado.</CommandEmpty>
                            <CommandGroup>
                              {CFOPS_CTE.filter((cf) => {
                                if (!cfopQuery) return true;
                                const q = cfopQuery.toLowerCase();
                                const qDigits = q.replace(/\D/g, "");
                                const codeDigits = cf.codigo.replace(/\D/g, "");
                                const descLower = cf.descricao.toLowerCase();
                                const descDigits = cf.descricao.replace(/\D/g, "");
                                return (
                                  (qDigits &&
                                    (codeDigits.includes(qDigits) ||
                                      descDigits.includes(qDigits))) ||
                                  descLower.includes(q) ||
                                  cf.codigo.includes(cfopQuery)
                                );
                              }).map((cf) => (
                                <CommandItem
                                  key={cf.codigo}
                                  value={cf.codigo}
                                  onSelect={() => {
                                    setForm({ ...form, cfop: cf.codigo });
                                    setCfopOpen(false);
                                    setCfopQuery("");
                                  }}
                                >
                                  <Check
                                    className={
                                      "mr-2 h-3 w-3 " +
                                      (form.cfop === cf.codigo ? "opacity-100" : "opacity-0")
                                    }
                                  />
                                  {cf.descricao}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex-[1_1_160px] min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Coleta</Label>
                    <div className="flex gap-1">
                      <Input
                        readOnly
                        tabIndex={-1}
                        className="h-7 text-xs flex-1 min-w-0 bg-transparent"
                        placeholder="Município"
                        value={form.xMunIni}
                        title="Segue o remetente"
                      />
                      <Input
                        readOnly
                        tabIndex={-1}
                        title="Segue o remetente"
                        className="h-7 text-xs w-14 text-center shrink-0 bg-transparent"
                        placeholder="UF"
                        value={form.ufIni}
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="flex-[1_1_160px] min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Entrega</Label>
                    <div className="flex gap-1">
                      <Input
                        readOnly
                        tabIndex={-1}
                        className="h-7 text-xs flex-1 min-w-0 bg-transparent"
                        placeholder="Município"
                        value={form.xMunFim}
                        title="Segue redespacho/destinatario"
                      />
                      <Input
                        readOnly
                        tabIndex={-1}
                        title="Segue redespacho/destinatario"
                        className="h-7 text-xs w-14 text-center shrink-0 bg-transparent"
                        placeholder="UF"
                        value={form.ufFim}
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {mercadorias.length > 0 ? (
                (() => {
                  const sel = mercadorias.filter((m) => selecionadas.has(m.chave));
                  const active = sel.length > 0 ? sel[0] : mercadorias[0];
                  const percRem =
                    percursoMatch &&
                    (percursoMatch.rem_cnpj || "") === (active.emitCnpj || "").replace(/\D/g, "") &&
                    percursoMatch.rem_nome
                      ? {
                          ie: percursoMatch.rem_ie || "",
                          logradouro: percursoMatch.rem_logradouro || "",
                          numero: percursoMatch.rem_nro || "",
                          bairro: percursoMatch.rem_bairro || "",
                          cidade: percursoMatch.rem_xmun || "",
                          uf: percursoMatch.rem_uf || "",
                          cep: percursoMatch.rem_cep || "",
                          telefone: percursoMatch.rem_fone || "",
                        }
                      : null;
                  const cEmit =
                    contatoByDoc.get((active.emitCnpj || "").replace(/\D/g, "")) || percRem || {};
                  const percDes =
                    percursoMatch &&
                    (percursoMatch.dest_cnpj || "") ===
                      (active.destCnpj || "").replace(/\D/g, "") &&
                    percursoMatch.dest_nome
                      ? {
                          ie: percursoMatch.dest_ie || "",
                          logradouro: percursoMatch.dest_logradouro || "",
                          numero: percursoMatch.dest_nro || "",
                          bairro: percursoMatch.dest_bairro || "",
                          cidade: percursoMatch.dest_xmun || "",
                          uf: percursoMatch.dest_uf || "",
                          cep: percursoMatch.dest_cep || "",
                          telefone: percursoMatch.dest_fone || "",
                        }
                      : null;
                  const cDest =
                    contatoByDoc.get((active.destCnpj || "").replace(/\D/g, "")) || percDes || {};
                  const emitIE = active.emitIE || cEmit.ie || "";
                  const emitLgr = active.emitLogradouro || cEmit.logradouro || "";
                  const emitNro = active.emitNro || cEmit.numero || "";
                  const emitBai = active.emitBairro || cEmit.bairro || "";
                  const emitCid = active.emitXMun || cEmit.cidade || "";
                  const emitUF = active.emitUF || cEmit.uf || "";
                  const emitCEP = active.emitCEP || (cEmit.cep || "").replace(/\D/g, "") || "";
                  const emitFone = active.emitFone || cEmit.telefone || "";
                  const destIE = active.destIE || cDest.ie || "";
                  const destLgr = active.destLogradouro || cDest.logradouro || "";
                  const destNro = active.destNro || cDest.numero || "";
                  const destBai = active.destBairro || cDest.bairro || "";
                  const destCid = active.destXMun || cDest.cidade || "";
                  const destUF = active.destUF || cDest.uf || "";
                  const destCEP = active.destCEP || (cDest.cep || "").replace(/\D/g, "") || "";
                  const destFone = active.destFone || cDest.telefone || "";
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Remetente */}
                      <Card className="p-3">
                        <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 flex items-center gap-2">
                          <div className="h-6 w-6 rounded bg-emerald-500/10 grid place-items-center">
                            <UploadCloud className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <h5 className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                            Remetente
                          </h5>
                        </div>
                        <div className="space-y-0.5 text-[10px]">
                          <p className="font-medium text-xs">{active.emit || "—"}</p>
                          <p className="text-muted-foreground">
                            CNPJ:{" "}
                            {active.emitCnpj
                              ? active.emitCnpj.replace(
                                  /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                                  "$1.$2.$3/$4-$5",
                                )
                              : "—"}{" "}
                            {emitIE ? `IE: ${emitIE}` : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {[emitLgr && `${emitLgr}${emitNro ? `, ${emitNro}` : ""}`, emitBai]
                              .filter(Boolean)
                              .join(" — ") || "—"}
                          </p>
                          <p className="text-muted-foreground">
                            {emitCid || "—"}-{emitUF || "—"} {emitCEP ? `CEP: ${emitCEP}` : ""}
                          </p>
                          {emitFone && <p className="text-muted-foreground">Fone: {emitFone}</p>}
                        </div>
                      </Card>

                      {/* Destinatário */}
                      <Card className="p-3">
                        <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 flex items-center gap-2">
                          <div className="h-6 w-6 rounded bg-sky-500/10 grid place-items-center">
                            <Package className="h-3.5 w-3.5 text-sky-600" />
                          </div>
                          <h5 className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                            Destinatário
                          </h5>
                        </div>
                        <div className="space-y-0.5 text-[10px]">
                          <p className="font-medium text-xs">{active.dest || "—"}</p>
                          <p className="text-muted-foreground">
                            CNPJ:{" "}
                            {active.destCnpj
                              ? active.destCnpj.replace(
                                  /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                                  "$1.$2.$3/$4-$5",
                                )
                              : "—"}{" "}
                            {destIE ||
                            (
                              (contatoByDoc.get(String(active.destCnpj || "").replace(/\D/g, "")) ||
                                {}) as any
                            ).ie
                              ? `IE: ${destIE || ((contatoByDoc.get(String(active.destCnpj || "").replace(/\D/g, "")) || {}) as any).ie}`
                              : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {[destLgr && `${destLgr}${destNro ? `, ${destNro}` : ""}`, destBai]
                              .filter(Boolean)
                              .join(" — ") || "—"}
                          </p>
                          <p className="text-muted-foreground">
                            {destCid || "—"}-{destUF || "—"} {destCEP ? `CEP: ${destCEP}` : ""}
                          </p>
                          {destFone && <p className="text-muted-foreground">Fone: {destFone}</p>}
                        </div>
                      </Card>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-muted-foreground">
                  Importe NF-es para preencher remetente e destinatário
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Consignatário */}
                <Card className="p-3">
                  <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-amber-500/10 grid place-items-center">
                      <Building2 className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <h5 className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                      Consignatário
                    </h5>
                    <span className="text-[9px] text-muted-foreground hidden md:inline">
                      opcional
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Input
                        className="h-6 text-[10px] w-44 font-mono"
                        placeholder="CNPJ — digite p/ buscar"
                        value={fmtCnpjInput(form.cnpjConsignatario || "")}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                          setForm({ ...form, cnpjConsignatario: digits });
                          if (digits.length === 14 && digits !== lastLookupConsig.current) {
                            lastLookupConsig.current = digits;
                            lookupConsignatario(digits);
                          }
                        }}
                        maxLength={18}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={lookingUpConsig}
                        onClick={() => {
                          const d = (form.cnpjConsignatario || "").replace(/\D/g, "");
                          if (d.length !== 14) {
                            toast.error("CNPJ deve ter 14 dígitos");
                            return;
                          }
                          lastLookupConsig.current = d;
                          lookupConsignatario(d);
                        }}
                        title="Buscar CNPJ"
                      >
                        {lookingUpConsig ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Search className="h-3 w-3" />
                        )}
                      </Button>
                      {form.cnpjConsignatario && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={() => {
                            lastLookupConsig.current = "";
                            setForm({
                              ...form,
                              cnpjConsignatario: "",
                              xNomeConsignatario: "",
                              ieConsignatario: "",
                              ufConsignatario: "",
                              xMunConsignatario: "",
                              cepConsignatario: "",
                              logradouroConsignatario: "",
                              nroConsignatario: "",
                              bairroConsignatario: "",
                            });
                          }}
                          title="Limpar"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {form.xNomeConsignatario || form.cnpjConsignatario ? (
                    <div className="space-y-0.5 text-[10px]">
                      <p className="font-medium text-xs">{form.xNomeConsignatario || "—"}</p>
                      <p className="text-muted-foreground flex items-center gap-1 flex-wrap">
                        CNPJ: {form.cnpjConsignatario ? fmtCnpjInput(form.cnpjConsignatario) : "—"}{" "}
                        {form.ieConsignatario ||
                        (
                          (contatoByDoc.get(
                            String(form.cnpjConsignatario || "").replace(/\D/g, ""),
                          ) || {}) as any
                        ).ie
                          ? `IE: ${form.ieConsignatario || ((contatoByDoc.get(String(form.cnpjConsignatario || "").replace(/\D/g, "")) || {}) as any).ie}`
                          : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {[
                          form.logradouroConsignatario &&
                            `${form.logradouroConsignatario}${form.nroConsignatario ? `, ${form.nroConsignatario}` : ""}`,
                          form.bairroConsignatario,
                        ]
                          .filter(Boolean)
                          .join(" — ") || "—"}
                      </p>
                      <p className="text-muted-foreground">
                        {form.xMunConsignatario || "—"}-{form.ufConsignatario || "—"}{" "}
                        {form.cepConsignatario ? `CEP: ${form.cepConsignatario}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Digite o CNPJ para buscar os dados automaticamente
                    </p>
                  )}
                </Card>

                {/* Redespacho */}
                <Card className="p-3">
                  <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-violet-500/10 grid place-items-center">
                      <Truck className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <h5 className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                      Redespacho
                    </h5>
                    <span className="text-[9px] text-muted-foreground hidden md:inline">
                      opcional
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Input
                        className="h-6 text-[10px] w-44 font-mono"
                        placeholder="CNPJ — digite p/ buscar"
                        value={fmtCnpjInput(form.cnpjRedespacho || "")}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                          setForm({ ...form, cnpjRedespacho: digits });
                          if (digits.length === 14 && digits !== lastLookupRedesp.current) {
                            lastLookupRedesp.current = digits;
                            lookupRedespacho(digits);
                          }
                        }}
                        maxLength={18}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={lookingUpRedesp}
                        onClick={() => {
                          const d = (form.cnpjRedespacho || "").replace(/\D/g, "");
                          if (d.length !== 14) {
                            toast.error("CNPJ deve ter 14 dígitos");
                            return;
                          }
                          lastLookupRedesp.current = d;
                          lookupRedespacho(d);
                        }}
                        title="Buscar CNPJ"
                      >
                        {lookingUpRedesp ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Search className="h-3 w-3" />
                        )}
                      </Button>
                      {form.cnpjRedespacho && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={() => {
                            lastLookupRedesp.current = "";
                            setForm({
                              ...form,
                              cnpjRedespacho: "",
                              xNomeRedespacho: "",
                              ieRedespacho: "",
                              ufRedespacho: "",
                              xMunRedespacho: "",
                              cepRedespacho: "",
                              logradouroRedespacho: "",
                              nroRedespacho: "",
                              bairroRedespacho: "",
                            });
                          }}
                          title="Limpar"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {form.xNomeRedespacho || form.cnpjRedespacho ? (
                    <div className="space-y-0.5 text-[10px]">
                      <p className="font-medium text-xs">{form.xNomeRedespacho || "—"}</p>
                      <p className="text-muted-foreground flex items-center gap-1 flex-wrap">
                        CNPJ: {form.cnpjRedespacho ? fmtCnpjInput(form.cnpjRedespacho) : "—"}{" "}
                        {form.ieRedespacho ||
                        (
                          (contatoByDoc.get(String(form.cnpjRedespacho || "").replace(/\D/g, "")) ||
                            {}) as any
                        ).ie
                          ? `IE: ${form.ieRedespacho || ((contatoByDoc.get(String(form.cnpjRedespacho || "").replace(/\D/g, "")) || {}) as any).ie}`
                          : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {[
                          form.logradouroRedespacho &&
                            `${form.logradouroRedespacho}${form.nroRedespacho ? `, ${form.nroRedespacho}` : ""}`,
                          form.bairroRedespacho,
                        ]
                          .filter(Boolean)
                          .join(" — ") || "—"}
                      </p>
                      <p className="text-muted-foreground">
                        {form.xMunRedespacho || "—"}-{form.ufRedespacho || "—"}{" "}
                        {form.cepRedespacho ? `CEP: ${form.cepRedespacho}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Digite o CNPJ para buscar os dados automaticamente
                    </p>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* === TAB: Doc Mercadorias === */}
            <TabsContent value="docs" className="mt-3 space-y-3">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-primary/8 border-b border-primary/20 px-3 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Mercadorias Transportadas —{" "}
                    {mercadorias.filter((m) => selecionadas.has(m.chave)).length ||
                      mercadorias.length}{" "}
                    NF-e(s)
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setManualNfeOpen(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Inserir NF-e manual
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-[240px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-6">
                          <input
                            type="checkbox"
                            checked={
                              mercadorias.length > 0 && selecionadas.size === mercadorias.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                const red = (form as any).modoEmbarque === "simplificado";
                                const emits = new Set(mercadorias.map((m) => m.emitCnpj || m.emit));
                                const dests = new Set(mercadorias.map((m) => m.destCnpj || m.dest));
                                const tomads = new Set(
                                  mercadorias.map((m) => m.tomadorCnpj || m.tomador),
                                );
                                if (red && emits.size > 1) {
                                  toast.error("Remetentes diferentes");
                                  return;
                                }
                                if (!red && dests.size > 1) {
                                  toast.error("CT-e não pode ter destinatários diferentes");
                                  return;
                                }
                                if (tomads.size > 1) {
                                  toast.error("No simplificado, selecione NF-es do mesmo tomador");
                                  return;
                                }
                                setSelecionadas(new Set(mercadorias.map((m) => m.chave)));
                              } else setSelecionadas(new Set());
                            }}
                          />
                        </TableHead>
                        <TableHead className="text-[10px]">Modelo</TableHead>
                        <TableHead className="text-[10px]">Chave NFe</TableHead>
                        <TableHead className="text-[10px]">Remetente</TableHead>
                        <TableHead className="text-[10px]">Destinatário</TableHead>
                        <TableHead className="text-[10px]">Nº NF-e</TableHead>
                        <TableHead className="text-[10px]">Série</TableHead>
                        <TableHead className="text-[10px]">Data Doc</TableHead>
                        <TableHead className="text-[10px] text-right">Qtde</TableHead>
                        <TableHead className="text-[10px] text-right">Qtde Peso</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mercadorias.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={11}
                            className="text-center text-xs text-muted-foreground py-8"
                          >
                            Nenhuma NF-e importada
                          </TableCell>
                        </TableRow>
                      ) : (
                        (selecionadas.size > 0
                          ? mercadorias.filter((m) => selecionadas.has(m.chave))
                          : mercadorias
                        ).map((m) => (
                          <TableRow
                            key={m.chave}
                            className="text-[11px]"
                            data-selected={selecionadas.has(m.chave)}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selecionadas.has(m.chave)}
                                onChange={(e) => {
                                  const next = new Set(selecionadas);
                                  if (e.target.checked) {
                                    next.add(m.chave);
                                    const sel = mercadorias.filter((x) => next.has(x.chave));
                                    const red = (form as any).modoEmbarque === "simplificado";
                                    const emits = new Set(sel.map((x) => x.emitCnpj || x.emit));
                                    const dests = new Set(sel.map((x) => x.destCnpj || x.dest));
                                    const tomads = new Set(
                                      sel.map((x) => x.tomadorCnpj || x.tomador),
                                    );
                                    if (red && emits.size > 1) {
                                      toast.error("Remetentes diferentes");
                                      next.delete(m.chave);
                                    } else if (!red && dests.size > 1) {
                                      toast.error("CT-e não pode ter destinatários diferentes");
                                      next.delete(m.chave);
                                    } else if (tomads.size > 1) {
                                      toast.error("No simplificado, o CT-e exige o mesmo tomador");
                                      next.delete(m.chave);
                                    }
                                  } else next.delete(m.chave);
                                  setSelecionadas(next);
                                }}
                              />
                            </TableCell>
                            <TableCell>NFe</TableCell>
                            <TableCell
                              className="font-mono text-[9px] max-w-[120px] truncate"
                              title={m.chave}
                            >
                              {m.chave}
                            </TableCell>
                            <TableCell className="truncate max-w-[100px]" title={m.emit}>
                              {m.emit}
                            </TableCell>
                            <TableCell className="truncate max-w-[100px]" title={m.dest}>
                              {m.dest}
                            </TableCell>
                            <TableCell className="font-mono">{m.nNF}</TableCell>
                            <TableCell>{m.serie}</TableCell>
                            <TableCell>{m.data ? dateBR(m.data) : "—"}</TableCell>
                            <TableCell className="text-right">
                              {Number(m.qVol || 0) > 0
                                ? Number(m.qVol).toLocaleString("pt-BR", {
                                    maximumFractionDigits: 0,
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(m.peso).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-medium">{brl(m.valor)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {(() => {
                  const base =
                    selecionadas.size > 0
                      ? mercadorias.filter((m) => selecionadas.has(m.chave))
                      : mercadorias;
                  const totQ = base.reduce((a, m) => a + Number(m.qVol || 0), 0);
                  const totP = base.reduce((a, m) => a + Number(m.peso || 0), 0);
                  const totV = base.reduce((a, m) => a + Number(m.valor || 0), 0);
                  return (
                    <div className="grid grid-cols-[1fr_90px_110px_130px] border-t bg-muted/40 text-xs font-semibold">
                      <div className="px-2 py-1.5">
                        TOTAL — {base.length} NF-e(s) • VOL / KG / VALOR
                      </div>
                      <div className="px-2 py-1.5 text-right font-mono">
                        {totQ.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                      </div>
                      <div className="px-2 py-1.5 text-right font-mono">
                        {totP.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="px-2 py-1.5 text-right font-mono">{brl(totV)}</div>
                    </div>
                  );
                })()}
              </Card>

              {/* Tributação (fundida nesta aba) */}
              <Card className="p-3">
                <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-2 px-2 py-1 flex items-center gap-1.5">
                  <ReceiptText className="h-3.5 w-3.5 text-primary" />
                  <h5 className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Impostos
                  </h5>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">* CST</Label>
                    <Select value={form.icmsCST} onValueChange={() => {}} disabled>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">00 — Tributada integralmente</SelectItem>
                        <SelectItem value="10">
                          10 — Tributada e com cobrança do ICMS por substituição tributária
                        </SelectItem>
                        <SelectItem value="20">20 — Com redução de base de cálculo</SelectItem>
                        <SelectItem value="30">
                          30 — Isenta ou não tributada e com cobrança do ICMS por substituição
                          tributária
                        </SelectItem>
                        <SelectItem value="40">40 — Isenta</SelectItem>
                        <SelectItem value="41">41 — Não tributada</SelectItem>
                        <SelectItem value="50">50 — Suspensão</SelectItem>
                        <SelectItem value="51">51 — Diferimento</SelectItem>
                        <SelectItem value="60">
                          60 — ICMS cobrado anteriormente por substituição tributária
                        </SelectItem>
                        <SelectItem value="70">
                          70 — Com redução de base de cálculo e cobrança do ICMS por substituição
                          tributária
                        </SelectItem>
                        <SelectItem value="90">90 — Outras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Redução de Base (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value={(form as any).reducaoBase || "0.00"}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Alíquota ICMS (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value={form.icmsAliq}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Base Cálculo (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={totalPrestacao(form).toFixed(2)}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor ICMS (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={form.icmsValor}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-[10px] text-muted-foreground">
                      Valor do crédito outorgado/presumido (R$)
                    </Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={(form as any).creditoOutorgado || "0.00"}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">PIS (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value={form.pisAliq}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">COFINS (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value={form.cofinsAliq}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">IBS (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value="0.10"
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">CBS (%)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      prefix=""
                      value="0.90"
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-1">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor PIS (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={valorImposto(form.pisAliq)}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor COFINS (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={valorImposto(form.cofinsAliq)}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor IBS (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={valorImposto("0.10")}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor CBS (R$)</Label>
                    <MoneyInput
                      className="h-7 text-xs bg-muted"
                      value={valorImposto("0.90")}
                      onChange={() => {}}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Somente leitura — CST e impostos vêm do Percurso (Fiscal → Percursos) e são
                  aplicados ao gerar o CT-e.
                </p>
              </Card>
            </TabsContent>

            {/* === TAB: Seguros/Veículos === */}
            <TabsContent value="seguros" className="mt-1">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                <Card className="p-1.5">
                  <div className="bg-primary/8 border-b border-primary/20 -m-1.5 mb-0.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Seguro da Carga
                  </div>
                  <div className="space-y-0.5">
                    <div className="grid grid-cols-12 gap-1">
                      <div className="col-span-7">
                        <Label className="text-[10px] text-muted-foreground">Seguradora</Label>
                        <Popover open={seguradoraOpen} onOpenChange={setSeguradoraOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={seguradoraOpen}
                              className="h-6 text-[10px] justify-between w-full font-normal"
                            >
                              <span className="truncate">
                                {form.seguradoraNome || "Selecione seguradora"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[360px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                value={seguradoraQuery}
                                onValueChange={setSeguradoraQuery}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {seguradoras?.length
                                    ? "Nenhuma seguradora encontrada."
                                    : "Nenhuma seguradora cadastrada. Cadastre em Configurações."}
                                </CommandEmpty>
                                <CommandGroup>
                                  {(seguradoras ?? [])
                                    .filter((s) => {
                                      if (!seguradoraQuery) return true;
                                      const q = seguradoraQuery.toLowerCase();
                                      return (
                                        s.nome.toLowerCase().includes(q) ||
                                        (s.cnpj || "").toLowerCase().includes(q) ||
                                        (s.apolice_numero || "").toLowerCase().includes(q)
                                      );
                                    })
                                    .map((s) => (
                                      <CommandItem
                                        key={s.id}
                                        value={s.id}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            seguradoraId: s.id,
                                            seguradoraNome: s.nome,
                                            apolice: s.apolice_numero || f.apolice,
                                            averbacao: s.averbacao || f.averbacao,
                                          }));
                                          setSeguradoraOpen(false);
                                          setSeguradoraQuery("");
                                        }}
                                      >
                                        <Check
                                          className={
                                            "mr-2 h-3 w-3 " +
                                            (form.seguradoraId === s.id
                                              ? "opacity-100"
                                              : "opacity-0")
                                          }
                                        />
                                        <div className="flex flex-col">
                                          <span className="text-xs">{s.nome}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {s.cnpj || ""}{" "}
                                            {s.apolice_numero
                                              ? `• Apólice ${s.apolice_numero}`
                                              : ""}
                                          </span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="col-span-5">
                        <Label className="text-[10px] text-muted-foreground">Apólice</Label>
                        <Input
                          className="h-6 text-[10px]"
                          value={form.apolice}
                          onChange={(e) => setForm({ ...form, apolice: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Responsável</Label>
                        <Select
                          value={form.segResponsavel || "4"}
                          onValueChange={(v) => setForm({ ...form, segResponsavel: v })}
                        >
                          <SelectTrigger className="h-6 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RESPONSAVEL_CTE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Nº Averbação</Label>
                        <Input
                          className="h-6 text-[10px]"
                          value={form.averbacao}
                          onChange={(e) => setForm({ ...form, averbacao: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Base Seg.</Label>
                        <Input
                          className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                          value={form.vCarga}
                          readOnly
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor Doc.</Label>
                        <Input
                          className="h-6 text-[10px] bg-transparent dark:bg-transparent"
                          value={form.vCarga}
                          readOnly
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">RCTR-C</Label>
                        <Input
                          className="h-6 text-[10px]"
                          value={form.rctrC || ""}
                          onChange={(e) => setForm({ ...form, rctrC: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">RCF-DC</Label>
                        <Input
                          className="h-6 text-[10px]"
                          value={form.rcfDc || ""}
                          onChange={(e) => setForm({ ...form, rcfDc: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">V. Adicional</Label>
                        <Input
                          className="h-6 text-[10px]"
                          value={form.segAdicional || ""}
                          onChange={(e) => setForm({ ...form, segAdicional: e.target.value })}
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Total Seguro</Label>
                          <Input
                            className="h-6 text-[10px]"
                            value={form.segTotal || ""}
                            onChange={(e) => setForm({ ...form, segTotal: e.target.value })}
                          />
                        </div>
                        <label className="flex items-center gap-1 text-[10px] pb-1">
                          <input
                            type="checkbox"
                            checked={form.segRepassar === "S"}
                            onChange={(e) =>
                              setForm({ ...form, segRepassar: e.target.checked ? "S" : "" })
                            }
                          />{" "}
                          Repassar
                        </label>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-1.5">
                  <div className="bg-primary/8 border-b border-primary/20 -m-1.5 mb-0.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Dados do Veículo / Motorista
                  </div>
                  <div className="space-y-0.5">
                    <div className="grid grid-cols-3 gap-1">
                      <div className="col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Nome Motorista</Label>
                        <Popover open={motoristaOpen} onOpenChange={setMotoristaOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={motoristaOpen}
                              className="h-6 text-[10px] justify-between w-full font-normal"
                            >
                              <span className="truncate">
                                {form.motoristaNome || "Selecione motorista"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[360px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                value={motoristaQuery}
                                onValueChange={setMotoristaQuery}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {motoristas?.length
                                    ? "Nenhum motorista encontrado."
                                    : "Nenhum colaborador com cargo Motorista. Cadastre em RH."}
                                </CommandEmpty>
                                <CommandGroup>
                                  {(motoristas ?? [])
                                    .filter((m) => {
                                      if (!motoristaQuery) return true;
                                      const q = motoristaQuery.toLowerCase();
                                      return (
                                        m.nome.toLowerCase().includes(q) ||
                                        m.cargo.toLowerCase().includes(q) ||
                                        (m.cpf || "").includes(q)
                                      );
                                    })
                                    .map((m) => (
                                      <CommandItem
                                        key={m.id}
                                        value={m.id}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            motoristaId: m.id,
                                            motoristaNome: m.nome,
                                          }));
                                          setMotoristaOpen(false);
                                          setMotoristaQuery("");
                                        }}
                                      >
                                        <Check
                                          className={
                                            "mr-2 h-3 w-3 " +
                                            (form.motoristaId === m.id
                                              ? "opacity-100"
                                              : "opacity-0")
                                          }
                                        />
                                        <div className="flex flex-col">
                                          <span className="text-xs">{m.nome}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {m.cargo}
                                          </span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">CIOT</Label>
                        <div className="flex gap-1">
                          <Input
                            className="h-6 text-[10px] font-mono"
                            value={form.ciot || ""}
                            onChange={(e) => setForm((f: any) => ({ ...f, ciot: e.target.value }))}
                            disabled={(form as any).finalidadeEmissao === "Complemento"}
                          />
                        </div>
                        {(form as any).ciotProtocolo ? (
                          <div className="text-[9px] text-muted-foreground">Prot. ANTT: {(form as any).ciotProtocolo}</div>
                        ) : (
                          <div className="text-[9px] text-muted-foreground">Emissão na aba CIOT</div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          {"Tra\u00e7\u00e3o"}
                        </Label>
                        <Popover
                          open={veiculoOpen === "placaVeiculo"}
                          onOpenChange={(v) => {
                            setVeiculoOpen(v ? "placaVeiculo" : null);
                            if (v) setVeiculoQuery("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={veiculoOpen === "placaVeiculo"}
                              className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal"
                            >
                              <span className="truncate">
                                {form.placaVeiculo || "Selecione placa"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                value={veiculoQuery}
                                onValueChange={setVeiculoQuery}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {veiculos?.length
                                    ? "Nenhum veículo encontrado."
                                    : "Nenhum veículo cadastrado."}
                                </CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? [])
                                    .filter((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      const isReboque =
                                        tipo.includes("carreta") || tipo.includes("bitrem");
                                      if (isReboque) return false;
                                      if (!veiculoQuery) return true;
                                      const q = veiculoQuery.toLowerCase();
                                      return (
                                        v.placa.toLowerCase().includes(q) ||
                                        (v.marca_modelo || "").toLowerCase().includes(q)
                                      );
                                    })
                                    .map((v) => (
                                      <CommandItem
                                        key={v.id}
                                        value={v.placa}
                                        onSelect={() => {
                                          const tagV = (v as any).tag_pedagio || "";
                                          setForm((f) => ({
                                            ...f,
                                            placaVeiculo: v.placa.toUpperCase(),
                                            ...(tagV ? { pedagioTag: tagV } : {}),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        <Check
                                          className={
                                            "mr-2 h-3 w-3 " +
                                            (form.placaVeiculo === v.placa
                                              ? "opacity-100"
                                              : "opacity-0")
                                          }
                                        />
                                        <span className="text-xs font-mono truncate">
                                          {v.placa}
                                          {(v.marca_modelo || v.tipo) ? ` — ${v.marca_modelo || v.tipo}` : ""}
                                        </span>
                                      </CommandItem>
                                    ))}
                                  {veiculoQuery &&
                                    !(veiculos ?? []).some((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      return (
                                        !(tipo.includes("carreta") || tipo.includes("bitrem")) &&
                                        v.placa.toLowerCase() === veiculoQuery.toLowerCase()
                                      );
                                    }) && (
                                      <CommandItem
                                        value={veiculoQuery}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            placaVeiculo: veiculoQuery.toUpperCase(),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                      </CommandItem>
                                    )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {form.placaVeiculo ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[9px] text-muted-foreground underline"
                            onClick={() => setForm((f) => ({ ...f, placaVeiculo: "" }))}
                          >
                            limpar
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Reboque 1</Label>
                        <Popover
                          open={veiculoOpen === "semi1"}
                          onOpenChange={(v) => {
                            setVeiculoOpen(v ? "semi1" : null);
                            if (v) setVeiculoQuery("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={veiculoOpen === "semi1"}
                              className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal"
                            >
                              <span className="truncate">
                                {form.semiReboque1 || "Selecione placa"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                value={veiculoQuery}
                                onValueChange={setVeiculoQuery}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {veiculos?.length
                                    ? "Nenhum reboque encontrado."
                                    : "Nenhum veículo cadastrado."}
                                </CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? [])
                                    .filter((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      const isReboque =
                                        tipo.includes("carreta") ||
                                        tipo.includes("bitrem") ||
                                        tipo.includes("semi");
                                      if (!isReboque) return false;
                                      if (!veiculoQuery) return true;
                                      const q = veiculoQuery.toLowerCase();
                                      return (
                                        v.placa.toLowerCase().includes(q) ||
                                        (v.marca_modelo || "").toLowerCase().includes(q)
                                      );
                                    })
                                    .map((v) => (
                                      <CommandItem
                                        key={v.id}
                                        value={v.placa}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            semiReboque1: v.placa.toUpperCase(),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        <Check
                                          className={
                                            "mr-2 h-3 w-3 " +
                                            (form.semiReboque1 === v.placa
                                              ? "opacity-100"
                                              : "opacity-0")
                                          }
                                        />
                                        <span className="text-xs font-mono truncate">
                                          {v.placa}
                                          {(v.marca_modelo || v.tipo) ? ` — ${v.marca_modelo || v.tipo}` : ""}
                                        </span>
                                      </CommandItem>
                                    ))}
                                  {veiculoQuery &&
                                    !(veiculos ?? []).some((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      return (
                                        (tipo.includes("carreta") ||
                                          tipo.includes("bitrem") ||
                                          tipo.includes("semi")) &&
                                        v.placa.toLowerCase() === veiculoQuery.toLowerCase()
                                      );
                                    }) && (
                                      <CommandItem
                                        value={veiculoQuery}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            semiReboque1: veiculoQuery.toUpperCase(),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                      </CommandItem>
                                    )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {form.semiReboque1 ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[9px] text-muted-foreground underline"
                            onClick={() => setForm((f) => ({ ...f, semiReboque1: "" }))}
                          >
                            limpar
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Reboque 2</Label>
                        <Popover
                          open={veiculoOpen === "semi2"}
                          onOpenChange={(v) => {
                            setVeiculoOpen(v ? "semi2" : null);
                            if (v) setVeiculoQuery("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={veiculoOpen === "semi2"}
                              className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal"
                            >
                              <span className="truncate">
                                {form.semiReboque2 || "Selecione placa"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                value={veiculoQuery}
                                onValueChange={setVeiculoQuery}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {veiculos?.length
                                    ? "Nenhum reboque encontrado."
                                    : "Nenhum veículo cadastrado."}
                                </CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? [])
                                    .filter((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      const isReboque =
                                        tipo.includes("carreta") ||
                                        tipo.includes("bitrem") ||
                                        tipo.includes("semi");
                                      if (!isReboque) return false;
                                      if (!veiculoQuery) return true;
                                      const q = veiculoQuery.toLowerCase();
                                      return (
                                        v.placa.toLowerCase().includes(q) ||
                                        (v.marca_modelo || "").toLowerCase().includes(q)
                                      );
                                    })
                                    .map((v) => (
                                      <CommandItem
                                        key={v.id}
                                        value={v.placa}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            semiReboque2: v.placa.toUpperCase(),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        <Check
                                          className={
                                            "mr-2 h-3 w-3 " +
                                            (form.semiReboque2 === v.placa
                                              ? "opacity-100"
                                              : "opacity-0")
                                          }
                                        />
                                        <span className="text-xs font-mono truncate">
                                          {v.placa}
                                          {(v.marca_modelo || v.tipo) ? ` — ${v.marca_modelo || v.tipo}` : ""}
                                        </span>
                                      </CommandItem>
                                    ))}
                                  {veiculoQuery &&
                                    !(veiculos ?? []).some((v) => {
                                      const tipo = (v.tipo || "").toLowerCase();
                                      return (
                                        (tipo.includes("carreta") ||
                                          tipo.includes("bitrem") ||
                                          tipo.includes("semi")) &&
                                        v.placa.toLowerCase() === veiculoQuery.toLowerCase()
                                      );
                                    }) && (
                                      <CommandItem
                                        value={veiculoQuery}
                                        onSelect={() => {
                                          setForm((f) => ({
                                            ...f,
                                            semiReboque2: veiculoQuery.toUpperCase(),
                                          }));
                                          setVeiculoOpen(null);
                                          setVeiculoQuery("");
                                        }}
                                      >
                                        Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                      </CommandItem>
                                    )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {form.semiReboque2 ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[9px] text-muted-foreground underline"
                            onClick={() => setForm((f) => ({ ...f, semiReboque2: "" }))}
                          >
                            limpar
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] shrink-0">
                        <input
                          type="checkbox"
                          checked={form.possuiMoto2 === "S"}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              possuiMoto2: e.target.checked ? "S" : "",
                              ...(e.target.checked ? {} : { motorista2Nome: "", motorista2Id: "" }),
                            })
                          }
                        />{" "}
                        Possui Segundo Motorista
                      </label>
                      {form.possuiMoto2 === "S" && (
                        <div className="flex-1 min-w-0">
                          <Popover open={motorista2Open} onOpenChange={setMotorista2Open}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={motorista2Open}
                                className="h-6 text-[10px] justify-between w-full font-normal"
                              >
                                <span className="truncate">
                                  {(form as any).motorista2Nome || "Selecione o segundo motorista"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[360px] p-0" align="start">
                              <Command shouldFilter={false}>
                                <CommandInput
                                  value={motorista2Query}
                                  onValueChange={setMotorista2Query}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    {motoristas?.length
                                      ? "Nenhum motorista encontrado."
                                      : "Nenhum colaborador com cargo Motorista. Cadastre em RH."}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {(motoristas ?? [])
                                      .filter((m) => {
                                        if (!motorista2Query) return true;
                                        const q = motorista2Query.toLowerCase();
                                        return (
                                          m.nome.toLowerCase().includes(q) ||
                                          m.cargo.toLowerCase().includes(q) ||
                                          (m.cpf || "").includes(q)
                                        );
                                      })
                                      .map((m) => (
                                        <CommandItem
                                          key={m.id}
                                          value={m.id}
                                          onSelect={() => {
                                            setForm(
                                              (f) =>
                                                ({
                                                  ...f,
                                                  motorista2Id: m.id,
                                                  motorista2Nome: m.nome,
                                                }) as any,
                                            );
                                            setMotorista2Open(false);
                                            setMotorista2Query("");
                                          }}
                                        >
                                          <Check
                                            className={
                                              "mr-2 h-3 w-3 " +
                                              ((form as any).motorista2Id === m.id
                                                ? "opacity-100"
                                                : "opacity-0")
                                            }
                                          />
                                          <div className="flex flex-col">
                                            <span className="text-xs">{m.nome}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                              {m.cargo}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Pedágio / Taxas / Despesas Acessórias (ex-aba Taxas) */}
                <Card className="p-1.5">
                  <div className="bg-primary/8 border-b border-primary/20 -m-1.5 mb-0.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Componentes do Frete
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Valor Serviço</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.vPrest}
                        onChange={(v) => setForm((f) => ({ ...f, vPrest: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Taxa Coleta</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.taxaColeta}
                        onChange={(v) => setForm((f) => ({ ...f, taxaColeta: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Taxa Entrega</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.taxaEntrega}
                        onChange={(v) => setForm((f) => ({ ...f, taxaEntrega: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Ad Valorem</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.adValorem}
                        onChange={(v) => setForm((f) => ({ ...f, adValorem: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">GRIS</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.gris}
                        onChange={(v) => setForm((f) => ({ ...f, gris: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Outros</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.outrosPed}
                        onChange={(v) => setForm((f) => ({ ...f, outrosPed: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Desconto</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        value={form.descontoPed}
                        onChange={(v) => setForm((f) => ({ ...f, descontoPed: v }))}
                      />
                    </div>
                  </div>
                </Card>

                <Card className="p-1.5">
                  <div className="bg-primary/8 border-b border-primary/20 -m-1.5 mb-0.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Forma de Pagamento do Pedágio
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="pedagio_pagto"
                        checked={pagtoSeguro(form.pedagioPagto) === "free-flow"}
                        onChange={() => setForm({ ...form, pedagioPagto: "free-flow" })}
                        disabled={(form as any).finalidadeEmissao === "Complemento"}
                      />{" "}
                      Free Flow
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="pedagio_pagto"
                        checked={pagtoSeguro(form.pedagioPagto) === "tag-transportador"}
                        onChange={() => setForm({ ...form, pedagioPagto: "tag-transportador" })}
                        disabled={(form as any).finalidadeEmissao === "Complemento"}
                      />{" "}
                      TAG Transportador
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="pedagio_pagto"
                        checked={pagtoSeguro(form.pedagioPagto) === "tag-tomador"}
                        onChange={() => setForm({ ...form, pedagioPagto: "tag-tomador" })}
                        disabled={(form as any).finalidadeEmissao === "Complemento"}
                      />{" "}
                      TAG Tomador
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="pedagio_pagto"
                        checked={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        onChange={() => setForm({ ...form, pedagioPagto: "sem-pagamento" })}
                        disabled={(form as any).finalidadeEmissao === "Complemento"}
                      />{" "}
                      Sem Pagamento de Pedágio
                    </label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-1 mt-0.5">
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Operadora</Label>
                      <Select
                        disabled={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        value={form.pedagioOperadora || ""}
                        onValueChange={(v) => {
                          const op = PEDAGIO_OPERADORAS.find((o) => o.nome === v);
                          setForm({
                            ...form,
                            pedagioOperadora: v,
                            pedagioCnpj: op ? op.cnpj : form.pedagioCnpj,
                          });
                        }}
                      >
                        <SelectTrigger className="h-6 text-[11px]">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {PEDAGIO_OPERADORAS.map((o) => (
                            <SelectItem key={o.nome} value={o.nome}>
                              {o.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">CNPJ Operadora</Label>
                      <Input
                        className="h-6 text-[11px] font-mono"
                        disabled={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        value={fmtCnpjInput(form.pedagioCnpj || "")}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            pedagioCnpj: e.target.value.replace(/\D/g, "").slice(0, 14),
                          })
                        }
                        maxLength={18}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Vale Pedágio (R$)</Label>
                      <MoneyInput
                        className="h-6 text-[11px] font-medium"
                        disabled={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        value={form.valePedagio}
                        onChange={(v) => setForm((f) => ({ ...f, valePedagio: v }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Data Operação</Label>
                      <Input
                        className="h-6 text-[11px] bg-transparent"
                        title="Sempre a data de emissão"
                        value={String(form.pedagioDataOp || "")
                          .slice(0, 10)
                          .split("-")
                          .reverse()
                          .join("/")}
                        readOnly
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Identificador VPO</Label>
                      <Input
                        className="h-6 text-[11px]"
                        disabled={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        value={(form as any).pedagioIdentVPO || ""}
                        onChange={(e) =>
                          setForm({ ...form, pedagioIdentVPO: e.target.value } as any)
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">
                        CNPJ Responsável Pagamento
                      </Label>
                      <Input
                        className="h-6 text-[11px] font-mono bg-transparent"
                        title="Sempre o CNPJ da emissora"
                        value={fmtCnpjInput(form.pedagioRespCnpj || "")}
                        readOnly
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Nº TAG</Label>
                      <Input
                        className="h-6 text-[11px]"
                        disabled={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"}
                        value={form.pedagioTag || ""}
                        onChange={(e) => setForm({ ...form, pedagioTag: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
              </div>
              <Card className="p-1.5 mt-1.5">
                <div className="bg-primary/8 border-b border-primary/20 -m-1.5 mb-0.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  Finalidade e Documentos Referenciados
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                  <div className="md:col-span-2">
                    <Label className="text-[10px] text-muted-foreground">
                      Finalidade / Tipo de Serviço
                    </Label>
                    <Select
                      value={(() => {
                        const t = (form as any).tipoServico;
                        const f = (form as any).finalidadeEmissao || "Normal";
                        if (t && t !== "Normal") return t;
                        if (f === "Substituicao") return "";
                        return f;
                      })()}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          ...(v === "Complemento"
                            ? { finalidadeEmissao: "Complemento", tipoServico: "Normal" }
                            : v === "Normal"
                              ? {
                                  finalidadeEmissao: "Normal",
                                  tipoServico: "Normal",
                                  motivoComplemento: "",
                                  cteReferenciado: "",
                                }
                              : { finalidadeEmissao: "Normal", tipoServico: v }),
                        } as any)
                      }
                    >
                      <SelectTrigger className="h-6 text-[10px]">
                        <SelectValue placeholder="SUBSTITUIÇÃO (via ícone)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">NORMAL</SelectItem>
                        <SelectItem value="Complemento">COMPLEMENTO</SelectItem>
                        <SelectItem value="Subcontratacao">SUBCONTRATAÇÃO</SelectItem>
                        <SelectItem value="Redespacho">REDESPACHO</SelectItem>
                        <SelectItem value="Redespacho Intermediario">
                          REDESPACHO INTERMEDIÁRIO
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Forma de Emissão</Label>
                    <Select
                      value={(form as any).formaEmissao || "Normal"}
                      onValueChange={(v) => setForm({ ...form, formaEmissao: v } as any)}
                    >
                      <SelectTrigger className="h-6 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">NORMAL</SelectItem>
                        <SelectItem value="EPEC">EPEC</SelectItem>
                        <SelectItem value="FSDA">FSDA</SelectItem>
                        <SelectItem value="SVC">SVC-SP / SVC-RS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Forma de Pagamento</Label>
                    <Select
                      value={(form as any).formaPagamento || "Outros"}
                      onValueChange={(v) => setForm({ ...form, formaPagamento: v } as any)}
                    >
                      <SelectTrigger className="h-6 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A Vista">À VISTA</SelectItem>
                        <SelectItem value="A Prazo">A PRAZO</SelectItem>
                        <SelectItem value="Outros">OUTROS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {((form as any).finalidadeEmissao === "Complemento" ||
                  (form as any).finalidadeEmissao === "Substituicao" ||
                  ((form as any).tipoServico && (form as any).tipoServico !== "Normal")) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-1">
                    {(form as any).finalidadeEmissao === "Complemento" && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">
                          Motivo do Complemento
                        </Label>
                        <Select
                          value={(form as any).motivoComplemento || ""}
                          onValueChange={(v) => setForm({ ...form, motivoComplemento: v } as any)}
                        >
                          <SelectTrigger className="h-6 text-[10px]">
                            <SelectValue placeholder="Selecione o motivo" />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTIVOS_COMPLEMENTO.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">CT-e Original</Label>
                      {(form as any).finalidadeEmissao === "Complemento" ||
                      (form as any).finalidadeEmissao === "Substituicao" ? (
                        <div className="flex items-center gap-1">
                          <Select
                            value={(form as any).cteReferenciado || ""}
                            onValueChange={(v) => {
                              const base: any = { cteReferenciado: v };
                              if (v && (form as any).finalidadeEmissao === "Complemento") {
                                const orig = ((docs || []) as CteDoc[]).find(
                                  (x) =>
                                    String(x.chave_acesso || "").replace(/\D/g, "") ===
                                    String(v).replace(/\D/g, ""),
                                );
                                try {
                                  const f0 = JSON.parse(orig?.xml_assinado || "{}").form || {};
                                  Object.assign(base, {
                                    motoristaId: f0.motoristaId || "",
                                    motoristaNome: f0.motoristaNome || "",
                                    possuiMoto2: f0.possuiMoto2 || "",
                                    motorista2Id: f0.motorista2Id || "",
                                    motorista2Nome: f0.motorista2Nome || "",
                                    placaVeiculo: f0.placaVeiculo || "",
                                    placaReboque: f0.placaReboque || "",
                                    semiReboque1: f0.semiReboque1 || "",
                                    semiReboque2: f0.semiReboque2 || "",
                                    ciot: "",
                                    ciotProtocolo: "",
                                    pedagioPagto: "sem-pagamento",
                                    pedagioOperadora: "",
                                    pedagioCnpj: "",
                                    valePedagio: "0.00",
                                    pedagioTag: "",
                                    pedagioIdentVPO: "",
                                    pedagioDataOp: "",
                                    seguradoraNome: "",
                                    seguradoraId: "",
                                    apolice: "",
                                    averbacao: "",
                                    rctrC: "",
                                    rcfDc: "",
                                    segAdicional: "",
                                    segTotal: "",
                                    segRepassar: "",
                                    segResponsavel: "",
                                  });
                                } catch {
                                  /* mantém só a chave */
                                }
                              }
                              setForm({ ...form, ...base } as any);
                            }}
                          >
                            <SelectTrigger className="h-6 text-[10px] font-mono">
                              <SelectValue
                                placeholder={
                                  ctesCompativeis.length > 0
                                    ? "Selecione o CT-e original"
                                    : "Sem CT-e compatível no percurso"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(form as any).cteReferenciado &&
                                !ctesCompativeis.some(
                                  (d) =>
                                    String(d.chave_acesso || "").replace(/\D/g, "") ===
                                    String((form as any).cteReferenciado).replace(/\D/g, ""),
                                ) && (
                                  <SelectItem
                                    value={String((form as any).cteReferenciado).replace(/\D/g, "")}
                                  >
                                    CT-e {(form as any).cteReferenciado} (fora do percurso)
                                  </SelectItem>
                                )}
                              {ctesCompativeis.map((d) => {
                                const ch = String(d.chave_acesso || "").replace(/\D/g, "");
                                return (
                                  <SelectItem key={d.id} value={ch} title={ch}>
                                    CT-e {d.numero} •{" "}
                                    {d.valor_servico != null ? brl(Number(d.valor_servico)) : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {(form as any).cteReferenciado && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => setForm({ ...form, cteReferenciado: "" } as any)}
                              title="Limpar"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Input
                          className="h-6 text-[10px] font-mono"
                          placeholder="Chave do CT-e original (44 dígitos, outra empresa)"
                          value={(form as any).cteReferenciado || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              cteReferenciado: e.target.value.replace(/\D/g, "").slice(0, 44),
                            } as any)
                          }
                          maxLength={44}
                        />
                      )}
                    </div>
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground mt-1">
                  Avulso transmite como CT-e Normal; Simplificado transmite como CTeSimp.
                </p>
              </Card>
            </TabsContent>

            {/* TAB Status removida: finalidade foi para o Transporte; situação aparece na Geral em modo visualização */}

            {/* === TAB: Observações === */}
            <TabsContent value="obs" className="mt-3 space-y-3">
              <Card className="p-3">
                <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  Observações Gerais
                </div>
                <Textarea
                  className="min-h-[120px] text-xs font-mono resize-y"
                  value={(form as any).obsGerais || ""}
                  onChange={(e) => setForm({ ...form, obsGerais: e.target.value } as any)}
                />
              </Card>
              <Card className="p-3">
                <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  Observações CT-e Anulação/Substituição
                </div>
                <Textarea
                  className="min-h-[60px] text-xs font-mono resize-y"
                  value={(form as any).obsAnulacao || ""}
                  onChange={(e) => setForm({ ...form, obsAnulacao: e.target.value } as any)}
                />
              </Card>
              <Card className="p-3">
                <div className="bg-primary/8 border-b border-primary/20 -m-3 mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  Observações CT-e Globalizado
                </div>
                <Textarea
                  className="min-h-[60px] text-xs font-mono resize-y"
                  value={(form as any).obsGlobalizado || ""}
                  onChange={(e) => setForm({ ...form, obsGlobalizado: e.target.value } as any)}
                />
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={limparFormularioAoSair}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
            {!viewDoc && (
              <>
                <Button
                  variant="outline"
                  onClick={() => salvarRascunho.mutate()}
                  disabled={salvarRascunho.isPending}
                >
                  {salvarRascunho.isPending ? (
                    "Salvando..."
                  ) : (
                    <>
                      <FileText className="mr-1 h-3.5 w-3.5" /> Salvar Rascunho
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => previewXml.mutate()}
                  disabled={previewXml.isPending || !form.cnpjTomador || !form.xNomeTomador}
                >
                  {previewXml.isPending ? (
                    "Gerando..."
                  ) : (
                    <>
                      <FileText className="mr-1 h-3.5 w-3.5" /> Pré Visualizar
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => emitir.mutate()}
                  disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}
                >
                  {emitir.isPending ? (
                    "Enviando..."
                  ) : (
                    <>
                      <Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visor próprio de Pré-Visualização DACTE */}
      {previewOpen &&
        previewData &&
        (() => {
          const f = { ...form, ...previewData.form };
          const baseNfes =
            selecionadas.size > 0
              ? mercadorias.filter((m) => selecionadas.has(m.chave))
              : mercadorias;
          const nFes = baseNfes.map((m: any) => ({
            nNF: m.nNF || "",
            serie: m.serie || "1",
            valor: m.valor || 0,
            chave: m.chave || "",
          }));
          const first = mercadorias[0] || ({} as any);
          const cRem = contatoByDoc.get(((first as any).emitCnpj || "").replace(/\D/g, "")) || {};
          const cDst = contatoByDoc.get(((first as any).destCnpj || "").replace(/\D/g, "")) || {};
          const pdfBlob = gerarDactePdf({
            chave: previewData.chave,
            numero: previewData.proximo,
            serie: f.serie || "1",
            ambiente: SEFAZ_AMBIENTE,
            dataEmissao: new Date().toISOString(),
            emitCnpj: f.emit?.cnpj || "",
            emitNome: f.emit?.xNome || f.xNomeTomador || "",
            emitEndereco:
              `${f.emit?.logradouro || ""} ${f.emit?.nro || ""} ${f.emit?.bairro || ""}`.trim(),
            emitCidade: f.emit?.xMun || f.xMunEnv || "",
            emitUF: f.emit?.uf || f.ufEnv || "",
            emitBairro: (f.emit as any)?.bairro || "",
            emitCEP: (f.emit as any)?.cep || "",
            emitFone: (f.emit as any)?.fone || "",
            emitIE: f.emit?.ie || "ISENTO",
            respEmissao: respNome,
            tomadorCnpj: f.cnpjTomador || "",
            // Manter igual a HOMOLOG_TOMADOR_NOME em sefaz-cte.ts (SEFAZ exige em homologação: 646 rem / 649 dest)
            tomadorNome:
              SEFAZ_AMBIENTE === "homologacao"
                ? "CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
                : "",
            tomadorEndereco:
              `${(f.logradouroTomador || "").trim()}${f.nroTomador ? ", " + f.nroTomador : ""}${f.bairroTomador ? " - " + f.bairroTomador : ""}`.trim(),
            tomadorFone: f.foneTomador || "",
            tomadorCidade: f.xMunTomador || "",
            tomadorUF: f.ufTomador || "",
            remCnpj: first.emitCnpj || "",
            remNome:
              SEFAZ_AMBIENTE === "homologacao"
                ? "CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
                : first.emit || "",
            remCidade: first.emitXMun || cRem.cidade || "",
            remUF: first.emitUF || cRem.uf || "",
            remEndereco: first.emitLogradouro || cRem.logradouro || "",
            remBairro: first.emitBairro || cRem.bairro || "",
            remCEP: first.emitCEP || (cRem.cep || "").replace(/\D/g, "") || "",
            remIE: first.emitIE || cRem.ie || "",
            remFone: first.emitFone || cRem.telefone || "",
            destCnpj: first.destCnpj || "",
            destNome:
              SEFAZ_AMBIENTE === "homologacao"
                ? "CT-E EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
                : first.dest || "",
            destCidade: first.destXMun || cDst.cidade || "",
            destUF: first.destUF || cDst.uf || "",
            destEndereco: first.destLogradouro || cDst.logradouro || "",
            destBairro: first.destBairro || cDst.bairro || "",
            destCEP: first.destCEP || (cDst.cep || "").replace(/\D/g, "") || "",
            destIE: first.destIE || cDst.ie || "",
            destFone: first.destFone || cDst.telefone || "",
            cfop: f.cfop || "5353",
            cfopDescricao: CFOPS_CTE.find((c) => c.codigo === (f.cfop || "5353"))?.descricao || "",
            naturezaOperacao: "TRANSPORTE INTERESTADUAL - INDUSTRIAL",
            origemCidade: f.xMunIni || "",
            origemUF: f.ufIni || "",
            destinoCidade: f.xMunFim || "",
            destinoUF: f.ufFim || "",
            valorServico: totalPrestacao({ ...emptyForm, ...(f as any) }),
            valorCarga: f.vCarga || 0,
            qtdVol: (() => {
              const q = baseNfes.reduce((a: number, m: any) => a + Number((m as any).qVol || 0), 0);
              return q > 0 ? String(q) : "";
            })(),
            infQ: [{ q: String((f as any).peso ?? (f as any).pesoKg ?? 0), um: "KG" }],
            pesoKg: f.pesoKg || 0,
            icmsCST: f.icmsCST || "00",
            icmsBase: f.icms?.vBC || f.vPrest || 0,
            icmsAliq: f.icms?.pICMS || 0,
            icmsValor: f.icms?.vICMS || 0,
            reducaoBase: (f as any).reducaoBase || 0,
            produtoPredominante: (f as any).produtoPredominante || "",
            outrasCaract: (f as any).outrasCaracteristicas || "",
            nFes,
            comps: (
              [
                ["Frete Valor", f.vPrest],
                ["Coleta", (f as any).taxaColeta],
                ["Entrega", (f as any).taxaEntrega],
                ["Ad Valorem", (f as any).adValorem],
                ["GRIS", (f as any).gris],
                ["Outros", (f as any).outrosPed],
                ["Desconto", (f as any).descontoPed],
                ["Adicional", (f as any).adicionalPed],
              ] as Array<[string, any]>
            )
              .filter(([, vv]) => Number(vv) !== 0)
              .map(([nn, vv]) => ({ nome: nn, valor: Number(vv) || 0 })),
            placa: f.placaVeiculo || "",
            placaReboque: f.placaReboque || "",
            rntrc: f.rntrc || rntrcFinal || "",
            veiculos: [
              f.placaVeiculo,
              f.placaReboque,
              (f as any).semiReboque1,
              (f as any).semiReboque2,
            ]
              .map((p) => String(p || "").toUpperCase())
              .filter(Boolean)
              .filter((p, i, a) => a.indexOf(p) === i)
              .map((p) => {
                const fv = (veiculos || []).find((v) => String(v.placa || "").toUpperCase() === p);
                return {
                  tipo: "Própria",
                  placa: p,
                  renavam: (fv as any)?.renavam || "",
                  uf: (empresa as any)?.uf || "MG",
                  rntrc: (fv as any)?.rntrc || f.rntrc || rntrcFinal || "",
                };
              })
              .slice(0, 4),
            seguradoraNome: f.seguradoraNome || "",
            apolice: f.apolice || "",
            averbacao: f.averbacao || "",
            numeroAverbacao: f.averbacao || "",
            motoNome: f.motoristaNome || "",
            motoCPF: (motoristas || []).find((m: any) => m.id === f.motoristaId)?.cpf || "",
            moto2Nome: (f as any).motorista2Nome || "",
            moto2CPF:
              ((motoristas || []).find((m: any) => m.id === (f as any).motorista2Id) as any)?.cpf ||
              "",
            ciot: f.ciot || "",
            segCNPJ: (seguradoras || []).find((s: any) => s.id === f.seguradoraId)?.cnpj || "",
            valePedagio: f.valePedagio || "",
            valePedFornCNPJ: f.pedagioCnpj || "",
            valePedComprov: (f as any).pedagioIdentVPO || f.pedagioTag || "",
            valePedRespCNPJ: (f as any).pedagioRespCnpj || "",
            obs:
              [(f as any).obsGerais, (f as any).obsAnulacao, (f as any).obsGlobalizado]
                .filter(Boolean)
                .join(" • ") || "",
            protocolo: "",
            logoDataUrl: JUVENAL_LOGO || undefined,
          });
          const url = URL.createObjectURL(pdfBlob);
          if (lastPreviewUrl.current && lastPreviewUrl.current !== url)
            URL.revokeObjectURL(lastPreviewUrl.current);
          lastPreviewUrl.current = url;
          return (
            <DacteViewer
              titulo="Pré-Visualização DACTE"
              subtitulo={`Nº ${previewData.proximo} • Homologação (testes) • Chave ${previewData.chave}`}
              url={url}
              nomeArquivo={`DACTE-${previewData.proximo}.pdf`}
              onClose={() => {
                if (lastPreviewUrl.current) {
                  URL.revokeObjectURL(lastPreviewUrl.current);
                  lastPreviewUrl.current = null;
                }
                setPreviewOpen(false);
              }}
              acoes={
                <Button
                  size="sm"
                  onClick={() => {
                    setPreviewOpen(false);
                    emitir.mutate();
                  }}
                  disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}
                >
                  {emitir.isPending ? (
                    "Enviando..."
                  ) : (
                    <>
                      <Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e
                    </>
                  )}
                </Button>
              }
            />
          );
        })()}

      {/* Visor próprio DACTE (emitidos) */}
      {viewUrl && (
        <DacteViewer
          titulo={`DACTE ${viewNum}`}
          url={viewUrl}
          nomeArquivo={`DACTE-${viewNum || "emitido"}.pdf`}
          onClose={() => {
            URL.revokeObjectURL(viewUrl);
            setViewUrl(null);
          }}
        />
      )}
    </div>
  );
}
