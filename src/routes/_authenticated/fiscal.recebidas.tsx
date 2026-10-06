import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/erp/date-input";
import { Combobox } from "@/components/erp/combobox";
import { CondicaoPagamento } from "@/components/erp/condicao-pagamento";
import { MoneyInput } from "@/components/erp/money-input";
import { 
  FileDown, Search, AlertCircle, XCircle, 
  UploadCloud, Check, RefreshCw, KeyRound,
  Eye, Download, FileText, Trash2, Pencil
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { useMutation } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { consultarNFePorChaveFn } from "@/lib/sefaz-server";
import { gerarDanfePdf, DANFE_REV, type DanfeData } from "@/lib/danfe-pdf";
import { PdfViewer } from "@/components/erp/pdf-viewer";

export const Route = createFileRoute("/_authenticated/fiscal/recebidas")({
  component: NotasRecebidas,
});

interface NotaRecebida {
  id?: string;
  chave: string;
  emitente: string;
  cnpj: string;
  valor: number;
  data_emissao: string;
  situacao_sefaz: "autorizada" | "cancelada";
  numero_nf?: string;
  xml_completo?: string;
}

const FORMAS_PARCELA = ["Boleto", "Cartão de crédito", "Cartão de débito", "Cheque", "Dinheiro", "Duplicata", "Pix", "Transferência", "Outros"] as const;

// modFrete (transp) -> texto impresso no campo "Frete" do DANFE (padrão do modelo oficial)
const FRETE_POR_CONTA: Record<string, string> = {
  "0": "0-Por conta do Rem",
  "1": "1-Por conta do Dest",
  "2": "2-Por conta de Terceiros",
  "9": "9-Sem Frete",
};

interface ParsedXMLResult {
  chave: string;
  emitente: string;
  cnpj: string;
  nNF: string;
  total: number;
  xml: string;
  temDups: boolean;
  produtos: { codigo: string; nome: string; qtd: number; un: string; valor: number; categoria: string }[];
  parcelas: { numero: string; dataVencimento: string; valor: number; forma_pagamento: string; conta_bancaria_id: string }[];
}

interface SelectedFileItem {
  file: File;
  name: string;
  size: number;
}

const INITIAL_RECEBIDAS: NotaRecebida[] = [];

function parseProdutosDoXml(xml: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const detNodes = Array.from(doc.querySelectorAll("det"));
    return detNodes.map((det) => ({
      codigo: det.querySelector("prod > cProd")?.textContent || "",
      nome: det.querySelector("prod > xProd")?.textContent || "",
      qtd: parseFloat(det.querySelector("prod > qCom")?.textContent || "0"),
      un: det.querySelector("prod > uCom")?.textContent || "UN",
      valorUnit: parseFloat(det.querySelector("prod > vUnCom")?.textContent || "0"),
      valorTotal: parseFloat(det.querySelector("prod > vProd")?.textContent || "0"),
      categoria: "",
    }));
  } catch {
    return [];
  }
}

function parseParcelasDoXml(xml: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const dupNodes = Array.from(doc.querySelectorAll("cobr > dup"));
    return dupNodes.map((dup) => ({
      numero: dup.querySelector("nDup")?.textContent || "",
      dataVencimento: dup.querySelector("dVenc")?.textContent || "",
      valor: parseFloat(dup.querySelector("vDup")?.textContent || "0"),
      forma_pagamento: "Boleto",
      conta_bancaria_id: "",
    }));
  } catch {
    return [];
  }
}

// nNF ocupa os dígitos 26-34 da chave de acesso (44); serve de fallback quando o XML não traz <nNF>
function nNFdaChave(chave: string): string {
  const d = (chave || "").replace(/\D/g, "");
  if (d.length !== 44) return "";
  return String(parseInt(d.substring(25, 34), 10));
}

// série ocupa os dígitos 23-25 da chave; fallback quando o XML não traz <serie>
function nSerieDaChave(chave: string): string {
  const d = (chave || "").replace(/\D/g, "");
  if (d.length !== 44) return "";
  return String(parseInt(d.substring(22, 25), 10));
}

// Extrai do XML os campos do DANFE que não estão na lista de notas (emitente completo,
// destinatário, totais, transporte, duplicatas). Tudo é opcional — o PDF tolera ausências.
function parseDanfeDoXml(xml: string): Partial<DanfeData> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const txt = (sel: string) => doc.querySelector(sel)?.textContent || "";
    const num = (sel: string) => { const v = parseFloat(txt(sel)); return isNaN(v) ? undefined : v; };
    const out: Partial<DanfeData> = {};
    // Emitente
    out.emitEndereco = [txt("emit > enderEmit > xLgr"), txt("emit > enderEmit > nro")].filter(Boolean).join(", ");
    out.emitBairro = txt("emit > enderEmit > xBairro");
    out.emitCEP = txt("emit > enderEmit > CEP");
    out.emitCidade = txt("emit > enderEmit > xMun");
    out.emitUF = txt("emit > enderEmit > UF");
    out.emitFone = txt("emit > enderEmit > fone");
    out.emitIE = txt("emit > IE");
    out.emitIM = txt("emit > IM");
    // Destinatário
    out.destNome = txt("dest > xNome");
    out.destCnpj = txt("dest > CNPJ") || txt("dest > CPF");
    out.destEndereco = [txt("dest > enderDest > xLgr"), txt("dest > enderDest > nro")].filter(Boolean).join(", ");
    out.destBairro = txt("dest > enderDest > xBairro");
    out.destCEP = txt("dest > enderDest > CEP");
    out.destCidade = txt("dest > enderDest > xMun");
    out.destUF = txt("dest > enderDest > UF");
    out.destIE = txt("dest > IE");
    out.destFone = txt("dest > enderDest > fone");
    // Ide / operação
    out.naturezaOperacao = txt("ide > natOp");
    out.cfop = txt("det > prod > CFOP");
    out.serie = txt("ide > serie");
    out.dhEmi = txt("ide > dhEmi") || txt("ide > dEmi");
    const dhSai = txt("ide > dhSaiEnt") || txt("ide > dSaiEnt");
    if (dhSai) {
      out.dataSaidaEnt = dhSai;
      const tm = dhSai.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
      if (tm) out.horaSaidaEnt = tm[2] ? `${tm[1]}:${tm[2]}` : tm[1];
    }
    out.tpEntradaSaida = "1";
    out.emitIESubst = txt("emit > IEST");
    // Totais
    out.valorProdutos = num("total > ICMSTot > vProd");
    out.valorFrete = num("total > ICMSTot > vFrete");
    out.valorSeguro = num("total > ICMSTot > vSeg");
    out.valorDesconto = num("total > ICMSTot > vDesc");
    out.valorOutras = num("total > ICMSTot > vOutro");
    out.baseIcms = num("total > ICMSTot > vBC");
    out.valorIcms = num("total > ICMSTot > vICMS");
    out.baseIcmsST = num("total > ICMSTot > vBCST");
    out.valorIcmsST = num("total > ICMSTot > vST");
    out.vImpImportacao = num("total > ICMSTot > vII");
    out.vIcmsUfRemet = num("total > ICMSTot > vICMSUFRemet");
    out.vFcpUfDest = num("total > ICMSTot > vFCPUFDest");
    out.valorPis = num("total > ICMSTot > vPIS");
    out.valorIpi = num("total > ICMSTot > vIPI");
    out.vIcmsUfDest = num("total > ICMSTot > vICMSUFDest");
    out.vTotTrib = num("total > ICMSTot > vTotTrib");
    out.valorCofins = num("total > ICMSTot > vCOFINS");
    // Transporte
    out.transportadora = txt("transp > transporta > xNome");
    out.transpCnpj = txt("transp > transporta > CNPJ") || txt("transp > transporta > CPF");
    out.transpEndereco = txt("transp > transporta > xEnder");
    out.transpCidade = txt("transp > transporta > xMun");
    out.transpUF = txt("transp > transporta > UF");
    out.transpIE = txt("transp > transporta > IE");
    out.fretePorConta = FRETE_POR_CONTA[txt("transp > modFrete")] || "";
    out.placa = txt("transp > veicTransp > placa");
    out.placaUF = txt("transp > veicTransp > UF");
    out.volumes = txt("transp > vol > qVol");
    out.especie = txt("transp > vol > esp");
    out.marca = txt("transp > vol > marca");
    out.numeracao = txt("transp > vol > nVol");
    out.pesoBruto = txt("transp > vol > pesoB");
    out.pesoLiquido = txt("transp > vol > pesoL");
    // ISSQN
    out.issqnInscMun = txt("emit > IM");
    out.issqnTotalServicos = num("total > ISSQNtot > vServ");
    out.issqnBase = num("total > ISSQNtot > vBC");
    out.issqnValor = num("total > ISSQNtot > vISS");
    // Pagamento à vista (<pag><detPag>): forma + valor (quando não há duplicatas)
    const TPAG: Record<string, string> = {
      "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito", "04": "Cartão de Débito",
      "05": "Crédito Loja", "10": "Vale Alimentação", "11": "Vale Refeição", "12": "Vale Presente",
      "13": "Vale Combustível", "14": "Duplicata Mercantil", "15": "Boleto Bancário",
      "16": "Depósito Bancário", "17": "Pagamento Instantâneo (PIX)", "18": "Transferência Bancária",
      "19": "Programa de fidelidade", "90": "Sem pagamento", "99": "Outros",
    };
    out.pagamentos = Array.from(doc.querySelectorAll("pag > detPag")).map((p) => ({
      forma: TPAG[(p.querySelector("tPag")?.textContent || "").trim()] || (p.querySelector("tPag")?.textContent || ""),
      valor: parseFloat(p.querySelector("vPag")?.textContent || "0") || 0,
    }));
    out.temDupsXml = doc.querySelectorAll("cobr > dup").length > 0;
    out.infoComplementares = txt("infAdic > infCpl");
    out.protocolo = txt("protNFe > infProt > nProt");
    out.protocoloData = txt("protNFe > infProt > dhRecbto");
    return out;
  } catch {
    return {};
  }
}

// Campos fiscais por item (NCM/CST/CFOP/IPI/alíquotas), na ordem dos <det>
function itensFiscaisDoXml(xml: string): { ncm: string; cst: string; cfop: string; vIpi: string; aliqIcms: string; aliqIpi: string; vBC: string; vICMS: string; vDesc: string; cProd: string; xProd: string; qCom: string; uCom: string; vUnCom: string; vProd: string }[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    return Array.from(doc.querySelectorAll("det")).map((d) => {
      // CST (lucro real/presumido) ou CSOSN (Simples: ICMSSN101/102/201/202/500/900)
      const icmsG = d.querySelector("imposto > ICMS") || d.querySelector("imposto > ICMSSN101")
        || d.querySelector("imposto > ICMSSN102") || d.querySelector("imposto > ICMSSN201")
        || d.querySelector("imposto > ICMSSN202") || d.querySelector("imposto > ICMSSN500")
        || d.querySelector("imposto > ICMSSN900");
      return {
        ncm: d.querySelector("prod > NCM")?.textContent || d.querySelector("prod NCM")?.textContent || "",
        cst: icmsG?.querySelector("CST")?.textContent || icmsG?.querySelector("CSOSN")?.textContent
          || d.querySelector("imposto CST")?.textContent || d.querySelector("imposto CSOSN")?.textContent
          || d.querySelector("imposto > IPI > CST")?.textContent || "",
        cfop: d.querySelector("prod > CFOP")?.textContent || d.querySelector("prod CFOP")?.textContent || "",
      vIpi: d.querySelector("imposto > IPI > vIPI")?.textContent || "",
      aliqIcms: d.querySelector("imposto > ICMS > pICMS")?.textContent || "",
      aliqIpi: d.querySelector("imposto > IPI > pIPI")?.textContent || "",
      vBC: d.querySelector("imposto > ICMS > vBC")?.textContent || "",
      vICMS: d.querySelector("imposto > ICMS > vICMS")?.textContent || "",
      vDesc: d.querySelector("prod > vDesc")?.textContent || "",
      cProd: d.querySelector("prod > cProd")?.textContent || "",
      xProd: d.querySelector("prod > xProd")?.textContent || "",
      qCom: d.querySelector("prod > qCom")?.textContent || "",
      uCom: d.querySelector("prod > uCom")?.textContent || "",
      vUnCom: d.querySelector("prod > vUnCom")?.textContent || "",
      vProd: d.querySelector("prod > vProd")?.textContent || "",
      };
    });
  } catch {
    return [];
  }
}

function NotasRecebidas() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("manifesto");
  
  // Categorias existentes para autocomplete
  const { data: categoriasExistentes = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-produtos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("produtos")
        .select("categoria")
        .eq("empresa_id", empresa!.id)
        .not("categoria", "is", null)
        .abortSignal(signal);
      if (error) throw error;
      return [...new Set((data ?? []).map((p: any) => p.categoria).filter(Boolean))].sort() as string[];
    },
  });

  // Contas financeiras para seleção de banco
  const { data: contasBancarias = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-bancarias-opts", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome, padrao")
        .eq("empresa_id", empresa!.id)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; padrao?: boolean | null }[];
    },
  });
  const contaPadraoId = (contasBancarias as any[]).find((c) => c.padrao)?.id as string | undefined;

  // Categorias financeiras (pagar) para Select no modal
  const { data: catsFinanceiras = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-financeiras-pagar", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("categorias_financeiras")
        .select("id, nome")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", "pagar")
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  
  // Criação inline de categoria (para o Select de categoria dos produtos importados)
  const [novaCatOpen, setNovaCatOpen] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState("");
  const [novaCatContext, setNovaCatContext] = useState<{ origem: "import" | "import-todas" | "detalhe"; index: number } | null>(null);
  const [mesmaCategoria, setMesmaCategoria] = useState(false);
  const [categoriaUnica, setCategoriaUnica] = useState("");
  const criarCategoriaInline = useMutation({
    mutationFn: async (nome: string) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const n = nome.trim();
      if (!n) throw new Error("Informe o nome da categoria");
      const { data, error } = await supabase
        .from("categorias_financeiras")
        .insert({ empresa_id: empresa.id, nome: n, tipo: "pagar" } as any)
        .select("id, nome")
        .single();
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe uma categoria com esse nome");
        throw error;
      }
      return data as { id: string; nome: string };
    },
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ["categorias-financeiras-pagar", empresa?.id] });
      qc.invalidateQueries({ queryKey: ["cadastros-categorias", empresa?.id] });
      qc.invalidateQueries({ queryKey: ["categorias-opt", empresa?.id] });
      if (novaCatContext) {
        if (novaCatContext.origem === "import" && importResults) {
          const novas = [...importResults.produtos];
          novas[novaCatContext.index] = { ...novas[novaCatContext.index], categoria: cat.nome };
          setImportResults({ ...importResults, produtos: novas });
        } else if (novaCatContext.origem === "import-todas" && importResults) {
          setImportResults({ ...importResults, produtos: importResults.produtos.map((p) => ({ ...p, categoria: cat.nome })) });
          setCategoriaUnica(cat.nome);
        } else if (novaCatContext.origem === "detalhe" && notaDetalhe) {
          const novas = [...notaDetalhe.produtos];
          novas[novaCatContext.index] = { ...novas[novaCatContext.index], categoria: cat.nome };
          setNotaDetalhe({ ...notaDetalhe, produtos: novas });
        }
      }
      toast.success(`Categoria "${cat.nome}" criada`);
      setNovaCatOpen(false);
      setNovaCatNome("");
      setNovaCatContext(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Notas Recebidas State
  const [notas, setNotas] = useState<NotaRecebida[]>(INITIAL_RECEBIDAS);
  const [search, setSearch] = useState("");
  const [filtroMes, setFiltroMes] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  // Importação XML State
  const [dragging, setDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importResults, setImportResults] = useState<ParsedXMLResult | null>(null);
  // Notas restantes do lote após a atual em conferência (importação de vários XMLs)
  const [filaXml, setFilaXml] = useState<ParsedXMLResult[]>([]);
  // Tela de lançamento: abre sozinha ao terminar o processamento
  const [analiseOpen, setAnaliseOpen] = useState(false);
  // Saída com pendências: continuar depois (mantém a fila) ou encerrar (descarta)
  const [confSair, setConfSair] = useState(false);

  // Ações de manifestação do destinatário (ciência, confirmação, desconhecimento)
  const [chaveImportModal, setChaveImportModal] = useState(false);
  const [chaveInput, setChaveInput] = useState("");
  const [isImportingByKey, setIsImportingByKey] = useState(false);

  // Carregar notas do banco ao montar
  useEffect(() => {
    if (!empresa) return;
    (async () => {
      const { data: notasDb } = await supabase
        .from("notas_importadas" as never)
        .select("id,empresa_id,chave_acesso,emitente,cnpj_emitente,valor_total,data_emissao,numero_nf,xml_completo,created_at")
        .eq("empresa_id", empresa.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (notasDb && Array.isArray(notasDb)) {
        setNotas((notasDb as any[]).map(n => ({
          id: n.id,
          chave: n.chave_acesso,
          emitente: n.emitente,
          cnpj: n.cnpj_emitente,
          valor: Number(n.valor_total) || 0,
          data_emissao: n.data_emissao || "",
          situacao_sefaz: "autorizada" as const,
          numero_nf: n.numero_nf || "",
          xml_completo: (n as any).xml_completo || "",
        })));
      }
    })();
  }, [empresa?.id]);

  // Mutation para excluir nota importada
  const excluirNota = useMutation({
    mutationFn: async (nota: NotaRecebida) => {
      if (!nota.id) throw new Error("Nota sem ID");
      // Buscar lançamentos vinculados
      const { data: vinculadas } = await supabase
        .from("notas_importadas_parcelas" as never)
        .select("lancamento_id")
        .eq("nota_id", nota.id);
      // Excluir parcelas PRIMEIRO (remove FK reference para lancamentos_financeiros)
      await supabase.from("notas_importadas_parcelas" as never).delete().eq("nota_id", nota.id);
      // Excluir itens
      await supabase.from("notas_importadas_itens" as never).delete().eq("nota_id", nota.id);
      // Excluir lançamentos financeiros vinculados (agora sem FK bloqueando)
      const lancIds = (vinculadas ?? []).map((v: any) => v.lancamento_id).filter(Boolean);
      if (lancIds.length > 0) {
        await supabase.from("lancamentos_financeiros").delete().in("id", lancIds);
      }
      // Excluir a nota
      const { error } = await supabase.from("notas_importadas" as never).delete().eq("id", nota.id);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, nota: NotaRecebida) => {
      setNotas(prev => prev.filter(n => n.chave !== nota.chave));
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      void registrarAuditoria("excluir", `NF-e ${nota.numero_nf || ""} (${nota.emitente}) excluída`, { chave: nota.chave, numero_nf: nota.numero_nf, valor: nota.valor });
      toast.success("Nota e lançamentos vinculados excluídos com sucesso.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Modal de detalhes da nota importada por chave
  const [confExcluirNota, setConfExcluirNota] = useState<NotaRecebida | null>(null);
  const [notaDetalhe, setNotaDetalhe] = useState<{
    id?: string;
    chave: string;
    emitente: string;
    cnpj: string;
    valor: number;
    data: string;
    nNF: string;
    produtos: { codigo: string; nome: string; qtd: number; un: string; valorUnit: number; valorTotal: number; categoria: string }[];
    parcelas: { numero: string; dataVencimento: string; valor: number; forma_pagamento: string; conta_bancaria_id: string }[];
    xml: string;
  } | null>(null);

  // Trilha de auditoria (tabela auditoria_eventos): quem lançou/alterou/excluiu cada nota
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
        modulo: "fiscal",
        acao,
        entidade: "nota_compra",
        detalhes: { ...detalhes, descricao, user_nome: nome, user_email: u.email || "" },
      } as any);
    } catch { /* trilha indisponível: não bloqueia o fluxo */ }
  };
  const trilhaQuery = useQuery({
    enabled: trilhaOpen && !!empresa,
    queryKey: ["auditoria-notas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria_eventos" as never)
        .select("id,created_at,acao,detalhes")
        .eq("empresa_id", empresa!.id as never)
        .eq("modulo", "fiscal")
        .eq("entidade", "nota_compra")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [pdfNota, setPdfNota] = useState<{ url: string; nome: string; subtitulo: string; nota: NotaRecebida } | null>(null);
  const fecharPdfNota = () => {
    setPdfNota((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  };

  const handleImportarPorChave = async () => {
    if (!empresa) return toast.error("Empresa não selecionada");
    const chave = chaveInput.replace(/\D/g, "");
    if (chave.length !== 44) {
      toast.error("Chave de acesso inválida", { description: "A chave deve conter 44 dígitos numéricos." });
      return;
    }

    setIsImportingByKey(true);
    try {
      const result = await consultarNFePorChaveFn({ data: { empresaId: empresa.id, chave } });

      if (result.nota) {
        const xml = result.nota.xml;
        let produtos: { codigo: string; nome: string; qtd: number; un: string; valorUnit: number; valorTotal: number; categoria: string }[] = [];
        let parcelas: { numero: string; dataVencimento: string; valor: number; forma_pagamento: string; conta_bancaria_id: string }[] = [];
        let nNF = "";

        if (xml) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "text/xml");
            nNF = doc.querySelector("ide > nNF")?.textContent || "";
            const detNodes = Array.from(doc.querySelectorAll("det"));
            produtos = detNodes.map((det) => {
              const cProd = det.querySelector("prod > cProd")?.textContent || "";
              const xProd = det.querySelector("prod > xProd")?.textContent || "";
              const qCom = parseFloat(det.querySelector("prod > qCom")?.textContent || "0");
              const uCom = det.querySelector("prod > uCom")?.textContent || "UN";
              const vUnCom = parseFloat(det.querySelector("prod > vUnCom")?.textContent || "0");
              const vProd = parseFloat(det.querySelector("prod > vProd")?.textContent || "0");
              return { codigo: cProd, nome: xProd, qtd: qCom, un: uCom, valorUnit: vUnCom, valorTotal: vProd, categoria: "" };
            });
            // Extrair parcelas (cobr/dup)
            const dupNodes = Array.from(doc.querySelectorAll("cobr > dup"));
            parcelas = dupNodes.map((dup) => ({
              numero: dup.querySelector("nDup")?.textContent || "",
              dataVencimento: dup.querySelector("dVenc")?.textContent || "",
              valor: parseFloat(dup.querySelector("vDup")?.textContent || "0"),
              forma_pagamento: "Boleto",
              conta_bancaria_id: "",
            }));
          } catch {
            // XML não parseável
          }
        }

        if (!nNF) nNF = nNFdaChave(result.nota.chave);

        setNotaDetalhe({
          chave: result.nota.chave,
          emitente: result.nota.emitente,
          cnpj: result.nota.cnpj,
          valor: result.nota.valor,
          data: result.nota.data,
          nNF,
          produtos,
          parcelas,
          xml: xml || "",
        });
        setChaveImportModal(false);
        setChaveInput("");
      } else {
        const d = result.debug;
        toast.error("Nota não encontrada", {
          description: d ? `${d.xMotivo} (cStat: ${d.cStat})` : "Verifique a chave de acesso e tente novamente.",
          duration: 8000,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao consultar chave", { description: msg });
    } finally {
      setIsImportingByKey(false);
    }
  };

  // Importação XML actions
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragging(true);
    } else if (e.type === "dragleave") {
      setDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesList = Array.from(e.dataTransfer.files).map(f => ({
        file: f,
        name: f.name,
        size: f.size
      }));
      void processarArquivos(filesList);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesList = Array.from(e.target.files).map(f => ({
        file: f,
        name: f.name,
        size: f.size
      }));
      e.target.value = "";
      void processarArquivos(filesList);
    }
  };

  // Parseia um arquivo XML em ParsedXMLResult; retorna null para duplicadas (com toast)
  const parseArquivoXml = async (fileItem: SelectedFileItem): Promise<ParsedXMLResult | null> => {
    const text = await fileItem.file.text();

    // Tentativa de parse XML via DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");

    const chNFe = doc.querySelector("chNFe")?.textContent ||
                  doc.querySelector("infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") || "";
    const emit = doc.querySelector("emit > xNome")?.textContent || "";
    const cnpj = doc.querySelector("emit > CNPJ")?.textContent || "45.997.418/0001-09";
    const nNF = doc.querySelector("ide > nNF")?.textContent || nNFdaChave(chNFe);
    const vNFStr = doc.querySelector("total > ICMSTot > vNF")?.textContent;
    const vNF = vNFStr ? parseFloat(vNFStr) : 0;

    const detNodes = Array.from(doc.querySelectorAll("det"));

    let parsedChave = chNFe;
    let parsedEmitente = emit;
    let parsedProdutos: { codigo: string; nome: string; qtd: number; un: string; valor: number; categoria: string }[] = [];

    if (detNodes.length > 0) {
      parsedProdutos = detNodes.map((det) => {
        const cProd = det.querySelector("prod > cProd")?.textContent || "PROD" + Math.floor(Math.random() * 1000);
        const xProd = det.querySelector("prod > xProd")?.textContent || "Produto do XML";
        const qCom = parseFloat(det.querySelector("prod > qCom")?.textContent || "1");
        const uCom = det.querySelector("prod > uCom")?.textContent || "UN";
        const vUnCom = parseFloat(det.querySelector("prod > vUnCom")?.textContent || "100");
        return { codigo: cProd, nome: xProd, qtd: qCom, un: uCom, valor: vUnCom, categoria: "" };
      });
    } else {
      // Fallback estruturado baseado no arquivo caso não seja XML padrão SEFAZ
      const fileHash = String(Math.abs(fileItem.name.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0))) + fileItem.size;
      parsedChave = "352608" + fileHash.padStart(38, "0").slice(-38);
      parsedEmitente = fileItem.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").toUpperCase() + " LTDA";
      parsedProdutos = [
        { codigo: "PROD-" + fileHash.slice(0, 4), nome: `Item ${fileItem.name.replace(/\.xml$/i, "")} Wireless`, qtd: 5, un: "UN", valor: 150.00, categoria: "" },
        { codigo: "PROD-" + fileHash.slice(4, 8), nome: `Acessório ${fileItem.name.replace(/\.xml$/i, "")} Pro`, qtd: 3, un: "UN", valor: 110.00, categoria: "" },
        { codigo: "PROD-" + fileHash.slice(8, 12), nome: `Componente IPS ${fileItem.name.replace(/\.xml$/i, "")}`, qtd: 2, un: "UN", valor: 450.00, categoria: "" }
      ];
    }

    // Verificar no banco de dados (fonte da verdade: excluir a nota libera a chave)
    if (empresa && parsedChave) {
      const { data: existente } = await supabase
        .from("notas_importadas" as never)
        .select("id")
        .eq("empresa_id", empresa.id)
        .eq("chave_acesso", parsedChave)
        .maybeSingle();
      if (existente) {
        toast.error("NF já importada.");
        return null;
      }
    }

    const totalCalculado = vNF || parsedProdutos.reduce((acc, p) => acc + (p.qtd * p.valor), 0);

    // Parse parcelas do XML (cobr/dup)
    const dupNodes = Array.from(doc.querySelectorAll("cobr > dup"));
    const parsedParcelas = dupNodes.map((dup) => ({
      numero: dup.querySelector("nDup")?.textContent || "",
      dataVencimento: dup.querySelector("dVenc")?.textContent || "",
      valor: parseFloat(dup.querySelector("vDup")?.textContent || "0"),
      forma_pagamento: "Boleto",
      conta_bancaria_id: "",
    }));
    if (parsedParcelas.length === 0) {
      parsedParcelas.push({
        numero: "001",
        dataVencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        valor: totalCalculado,
        forma_pagamento: "Boleto",
        conta_bancaria_id: "",
      });
    }

    return { chave: parsedChave, emitente: parsedEmitente, cnpj, nNF, total: totalCalculado, xml: text, temDups: dupNodes.length > 0, produtos: parsedProdutos, parcelas: parsedParcelas };
  };

  // Processa os arquivos na hora (seleção ou arrasto já disparam a análise)
  const processarArquivos = async (arquivos: SelectedFileItem[]) => {
    if (arquivos.length === 0 || isProcessing) return;

    const invalidFiles = arquivos.filter(f => !f.name.toLowerCase().endsWith('.xml'));
    if (invalidFiles.length > 0) {
      toast.error(`Arquivo inválido detectado: ${invalidFiles[0].name}. Apenas arquivos .xml são permitidos.`);
      return;
    }

    setIsProcessing(true);

    try {
      // Processa TODOS os arquivos; duplicadas são puladas com aviso
      const pendentes: ParsedXMLResult[] = [];
      for (const f of arquivos) {
        try {
          const r = await parseArquivoXml(f);
          if (!r) continue;
          if (pendentes.some((p) => p.chave === r.chave)) {
            toast.error("NF já importada.");
            continue;
          }
          pendentes.push(r);
        } catch (e: any) {
          toast.error(`Erro na leitura do XML: ${f.name}`, {
            description: "Verifique se o arquivo está no formato padrão da SEFAZ ou se não está corrompido. " + e.message
          });
        }
      }
      if (pendentes.length === 0) return;

      setImportResults(pendentes[0]);
      setFilaXml(pendentes.slice(1));
      setMesmaCategoria(false);
      setAnaliseOpen(true);
      toast.success("XML(s) importados(s).");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmarXmlUpload = async () => {
    if (!importResults || !empresa) return;
    setIsSaving(true);

    try {
      // Verificar duplicidade
      const { data: existente } = await supabase
        .from("notas_importadas" as never)
        .select("id")
        .eq("empresa_id", empresa.id)
        .eq("chave_acesso", importResults.chave)
        .maybeSingle();
      if (existente) {
        toast.error("Esta nota já foi importada anteriormente.");
        setIsSaving(false);
        return;
      }

      let fornecedorId: string | null = null;
      const { data: contatosExistentes } = await supabase
        .from("contatos")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("nome", `%${importResults.emitente.slice(0, 15)}%`)
        .maybeSingle();

      if (contatosExistentes) {
        fornecedorId = contatosExistentes.id;
      } else {
        let dadosApi: any = null;
        const cnpjDigits = importResults.cnpj.replace(/\D/g, "");
        if (cnpjDigits.length === 14) {
          for (const url of [
            `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`,
            `https://receitaws.com.br/v1/cnpj/${cnpjDigits}`,
          ]) {
            try {
              const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
              if (res.ok) { dadosApi = await res.json(); break; }
            } catch { /* tenta próxima */ }
          }
        }
        const { data: novoContato } = await supabase
          .from("contatos")
          .insert({
            empresa_id: empresa.id,
            nome: dadosApi?.razao_social || dadosApi?.nome || importResults.emitente,
            documento: importResults.cnpj,
            tipo: "fornecedor" as any,
            email: dadosApi?.email || null,
            telefone: dadosApi?.ddd_telefone_1 || dadosApi?.telefone || null,
            cep: dadosApi?.cep || null,
            logradouro: dadosApi?.logradouro || null,
            numero: dadosApi?.numero || null,
            complemento: dadosApi?.complemento || null,
            bairro: dadosApi?.bairro || null,
            cidade: dadosApi?.municipio || dadosApi?.city || null,
            uf: dadosApi?.uf || dadosApi?.state || null,
          } as any)
          .select("id").single();
        if (novoContato) fornecedorId = novoContato.id;
      }

      // Validar categorias obrigatórias
      const semCategoria = importResults.produtos.filter(p => !p.categoria || p.categoria.trim() === "");
      if (semCategoria.length > 0) {
        toast.error("Categoria obrigatória");
        setIsSaving(false);
        return;
      }

      for (const p of importResults.produtos) {
        const { data: prodExistente } = await supabase
          .from("produtos")
          .select("id, estoque_atual")
          .eq("empresa_id", empresa.id)
          .or(`codigo.eq.${p.codigo},nome.ilike.%${p.nome.slice(0, 10)}%`)
          .maybeSingle();

        let prodId: string;
        if (prodExistente) {
          prodId = prodExistente.id;
          await (supabase.from("produtos") as any).update({ estoque_atual: (Number(prodExistente.estoque_atual) || 0) + p.qtd, preco_custo: p.valor, categoria: p.categoria || (prodExistente as any).categoria || null }).eq("id", prodId);
        } else {
          const { data: novoProd } = await supabase
            .from("produtos")
            .insert({ empresa_id: empresa.id, codigo: p.codigo, nome: p.nome, unidade: p.un, preco_custo: p.valor, preco_venda: p.valor * 1.4, estoque_atual: p.qtd, ativo: true, categoria: p.categoria || null } as any)
            .select("id").single();
          prodId = novoProd!.id;
        }

        await supabase.from("movimentacoes_estoque").insert({
          empresa_id: empresa.id, produto_id: prodId, tipo: "entrada", quantidade: p.qtd,
          custo_unitario: p.valor, observacoes: `Entrada via Importação de XML (Chave: ${importResults.chave})`
        });
      }

      // 5. Salvar nota no banco
      const { data: notaSalva } = await supabase
        .from("notas_importadas" as never)
        .insert({
          empresa_id: empresa.id,
          chave_acesso: importResults.chave,
          emitente: importResults.emitente,
          cnpj_emitente: importResults.cnpj,
          numero_nf: importResults.nNF,
          data_emissao: new Date().toISOString().split("T")[0],
          valor_total: importResults.total,
          situacao: "lancada",
          xml_completo: importResults.xml || null,
        } as any)
        .select("id")
        .single();

      const notaId = (notaSalva as any)?.id;

      // 6. Salvar itens no banco
      if (notaId && importResults.produtos.length > 0) {
        await supabase.from("notas_importadas_itens" as never).insert(
          importResults.produtos.map(p => ({
            nota_id: notaId,
            codigo: p.codigo,
            nome: p.nome,
            quantidade: p.qtd,
            unidade: p.un,
            valor_unitario: p.valor,
            valor_total: p.qtd * p.valor,
            categoria: p.categoria || null,
          })) as any
        );
      }

      // 7. Buscar categoria financeira correspondente
      let categoriaFinanceiraId: string | null = null;
      const primeiraCategoria = importResults.produtos[0]?.categoria;
      if (primeiraCategoria) {
        const { data: cat } = await supabase
          .from("categorias_financeiras")
          .select("id")
          .eq("empresa_id", empresa.id)
          .ilike("nome", `%${primeiraCategoria}%`)
          .maybeSingle();
        if (cat) categoriaFinanceiraId = cat.id;
      }

      // 8. Lançar parcelas no contas a pagar — fornecedor vai na coluna Fornecedor, descrição só NF-e
      if (importResults.parcelas.length > 0) {
        for (const parc of importResults.parcelas) {
          const { data: lanc } = await supabase
            .from("lancamentos_financeiros")
            .insert({
              empresa_id: empresa.id,
              tipo: "pagar",
              status: "aberto",
              descricao: `NF-e ${importResults.nNF}`,
              valor: parc.valor,
              data_vencimento: parc.dataVencimento,
              contato_id: fornecedorId,
              categoria_id: categoriaFinanceiraId,
              observacoes: `Chave: ${importResults.chave} | Parcela ${parc.numero}`,
              forma_pagamento: (parc as any).forma_pagamento || "Boleto",
              conta_bancaria_id: (parc as any).conta_bancaria_id || null,
            } as any)
            .select("id")
            .single();

          if (notaId && lanc) {
            await supabase.from("notas_importadas_parcelas" as never).insert({
              nota_id: notaId,
              numero: parc.numero,
              data_vencimento: parc.dataVencimento,
              valor: parc.valor,
              lancamento_id: lanc.id,
            } as any);
          }
        }
      } else {
        // Sem parcelas no XML → criar 1 título com vencimento em 30 dias
        const vencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { data: lanc } = await supabase
          .from("lancamentos_financeiros")
          .insert({
            empresa_id: empresa.id,
            tipo: "pagar",
            status: "aberto",
            descricao: `NF-e ${importResults.nNF}`,
            valor: importResults.total,
            data_vencimento: vencimento,
            contato_id: fornecedorId,
            categoria_id: categoriaFinanceiraId,
            observacoes: `Chave: ${importResults.chave}`,
            forma_pagamento: "Boleto",
            conta_bancaria_id: null,
          } as any)
          .select("id")
          .single();

        if (notaId && lanc) {
          await supabase.from("notas_importadas_parcelas" as never).insert({
            nota_id: notaId,
            numero: "Única",
            data_vencimento: vencimento,
            valor: importResults.total,
            lancamento_id: lanc.id,
          } as any);
        }
      }


      setNotas(prev => [{
        id: notaId,
        chave: importResults.chave, emitente: importResults.emitente, cnpj: importResults.cnpj,
        valor: importResults.total, data_emissao: new Date().toISOString(), situacao_sefaz: "autorizada",
        numero_nf: importResults.nNF, xml_completo: importResults.xml || ""
      }, ...prev]);

      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });

      toast.success("Importação concluída.");
      void registrarAuditoria("lancar", `NF-e ${importResults.nNF} (${importResults.emitente}) lançada: ${brl(importResults.total)}`, { chave: importResults.chave, numero_nf: importResults.nNF, valor: importResults.total });
      if (filaXml.length > 0) {
        setImportResults(filaXml[0]);
        setFilaXml(filaXml.slice(1));
        setMesmaCategoria(false);
      } else {
        setImportResults(null);
        setAnaliseOpen(false);
      }
    } catch (err: any) {
      toast.error("Falha na gravação", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleIgnorarNota = () => {
    if (!importResults) return;
    if (filaXml.length > 0) {
      setImportResults(filaXml[0]);
      setFilaXml(filaXml.slice(1));
      setMesmaCategoria(false);
    } else {
      setImportResults(null);
      setAnaliseOpen(false);
    }
    toast.info("Nota ignorada.");
  };

  const handleLancarNota = async () => {
    if (!notaDetalhe || !empresa) return;
    setIsSaving(true);

    try {
      // 0. Verificar se a nota já foi importada
      const { data: existente } = await supabase
        .from("notas_importadas" as never)
        .select("id")
        .eq("empresa_id", empresa.id)
        .eq("chave_acesso", notaDetalhe.chave)
        .maybeSingle();
      if (existente) {
        toast.error("Esta nota já foi importada anteriormente.");
        setIsSaving(false);
        return;
      }

      // 1. Salvar nota no banco
      const { data: notaSalva } = await supabase
        .from("notas_importadas" as never)
        .insert({
          empresa_id: empresa.id,
          chave_acesso: notaDetalhe.chave,
          emitente: notaDetalhe.emitente,
          cnpj_emitente: notaDetalhe.cnpj,
          numero_nf: notaDetalhe.nNF,
          data_emissao: notaDetalhe.data,
          valor_total: notaDetalhe.valor,
          situacao: "lancada",
          xml_completo: notaDetalhe.xml,
        } as any)
        .select("id")
        .single();

      const notaId = (notaSalva as any)?.id;

      // 2. Salvar itens no banco
      if (notaId && notaDetalhe.produtos.length > 0) {
        await supabase.from("notas_importadas_itens" as never).insert(
          notaDetalhe.produtos.map(p => ({
            nota_id: notaId,
            codigo: p.codigo,
            nome: p.nome,
            quantidade: p.qtd,
            unidade: p.un,
            valor_unitario: p.valorUnit,
            valor_total: p.valorTotal,
            categoria: p.categoria || null,
          })) as any
        );
      }

      // 3. Obter ou criar fornecedor
      let fornecedorId: string | null = null;
      const { data: contatosExistentes } = await supabase
        .from("contatos")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("nome", `%${notaDetalhe.emitente.slice(0, 15)}%`)
        .maybeSingle();

      if (contatosExistentes) {
        fornecedorId = contatosExistentes.id;
      } else {
        // Buscar dados do CNPJ via APIs públicas para preencher o cadastro
        let dadosApi: any = null;
        const cnpjDigits = notaDetalhe.cnpj.replace(/\D/g, "");
        if (cnpjDigits.length === 14) {
          for (const url of [
            `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`,
            `https://receitaws.com.br/v1/cnpj/${cnpjDigits}`,
          ]) {
            try {
              const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
              if (res.ok) { dadosApi = await res.json(); break; }
            } catch { /* tenta próxima */ }
          }
        }
        const { data: novoContato } = await supabase
          .from("contatos")
          .insert({
            empresa_id: empresa.id,
            nome: dadosApi?.razao_social || dadosApi?.nome || notaDetalhe.emitente,
            documento: notaDetalhe.cnpj,
            tipo: "fornecedor" as any,
            email: dadosApi?.email || null,
            telefone: dadosApi?.ddd_telefone_1 || dadosApi?.telefone || null,
            cep: dadosApi?.cep || null,
            logradouro: dadosApi?.logradouro || null,
            numero: dadosApi?.numero || null,
            complemento: dadosApi?.complemento || null,
            bairro: dadosApi?.bairro || null,
            cidade: dadosApi?.municipio || dadosApi?.city || null,
            uf: dadosApi?.uf || dadosApi?.state || null,
          } as any)
          .select("id").single();
        if (novoContato) fornecedorId = novoContato.id;
      }

      // 4. Atualizar ou criar produtos e registrar movimentações
      // Validar categorias obrigatórias
      const semCategoria = notaDetalhe.produtos.filter(p => !p.categoria || p.categoria.trim() === "");
      if (semCategoria.length > 0) {
        toast.error("Categoria obrigatória");
        setIsSaving(false);
        return;
      }

      let totalQtd = 0;
      for (const p of notaDetalhe.produtos) {
        totalQtd += p.qtd;
        const { data: prodExistente } = await supabase
          .from("produtos" as any)
          .select("id, estoque_atual, categoria")
          .eq("empresa_id", empresa.id)
          .or(`codigo.eq.${p.codigo},nome.ilike.%${p.nome.slice(0, 10)}%`)
          .maybeSingle();

        let prodId: string;
        if (prodExistente) {
          prodId = (prodExistente as any).id;
          await (supabase.from("produtos") as any).update({ estoque_atual: (Number((prodExistente as any).estoque_atual) || 0) + p.qtd, preco_custo: p.valorUnit, categoria: p.categoria || (prodExistente as any).categoria || null }).eq("id", prodId);
        } else {
          const { data: novoProd } = await (supabase
            .from("produtos")
            .insert({ empresa_id: empresa.id, codigo: p.codigo, nome: p.nome, unidade: p.un, preco_custo: p.valorUnit, preco_venda: p.valorUnit * 1.4, estoque_atual: p.qtd, ativo: true, categoria: p.categoria || null } as any)
            .select("id") as any).single();
          prodId = novoProd!.id;
        }

        await supabase.from("movimentacoes_estoque").insert({
          empresa_id: empresa.id, produto_id: prodId, tipo: "entrada", quantidade: p.qtd,
          custo_unitario: p.valorUnit, observacoes: `Entrada NF-e ${notaDetalhe.nNF} (Chave: ${notaDetalhe.chave})`
        });
      }

      // 5. Lançar parcelas no contas a pagar (só se houver parcelas)
      // Buscar categoria financeira correspondente ao produto (primeiro produto da nota)
      let categoriaFinanceiraId: string | null = null;
      const primeiraCategoria = notaDetalhe.produtos[0]?.categoria;
      if (primeiraCategoria) {
        const { data: cat } = await supabase
          .from("categorias_financeiras")
          .select("id")
          .eq("empresa_id", empresa.id)
          .ilike("nome", `%${primeiraCategoria}%`)
          .maybeSingle();
        if (cat) categoriaFinanceiraId = cat.id;
      }

      if (notaDetalhe.parcelas.length > 0) {
        for (const parc of notaDetalhe.parcelas) {
          const { data: lanc } = await supabase
            .from("lancamentos_financeiros")
            .insert({
              empresa_id: empresa.id,
              tipo: "pagar",
              status: "aberto",
              descricao: `NF-e ${notaDetalhe.nNF}`,
              valor: parc.valor,
              data_vencimento: parc.dataVencimento,
              contato_id: fornecedorId,
              categoria_id: categoriaFinanceiraId,
              observacoes: `Chave: ${notaDetalhe.chave} | Parcela ${parc.numero}`,
              forma_pagamento: (parc as any).forma_pagamento || "Boleto",
              conta_bancaria_id: (parc as any).conta_bancaria_id || null,
            } as any)
            .select("id")
            .single();

          if (notaId && lanc) {
            await supabase.from("notas_importadas_parcelas" as never).insert({
              nota_id: notaId,
              numero: parc.numero,
              data_vencimento: parc.dataVencimento,
              valor: parc.valor,
              lancamento_id: lanc.id,
            } as any);
          }
        }
      }

      // 6. Adicionar à lista local
      setNotas(prev => [{
        id: notaId,
        chave: notaDetalhe.chave,
        emitente: notaDetalhe.emitente,
        cnpj: notaDetalhe.cnpj,
        valor: notaDetalhe.valor,
        data_emissao: notaDetalhe.data,
        situacao_sefaz: "autorizada",
        numero_nf: notaDetalhe.nNF,
        xml_completo: notaDetalhe.xml
      }, ...prev]);

      // 7. Invalidação de React Query
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });

      const msgParcelas = notaDetalhe.parcelas.length > 0
        ? ` e ${notaDetalhe.parcelas.length} parcela(s) no contas a pagar`
        : " (sem parcelas — estoque atualizado)";
      toast.success(`Nota lançada! ${notaDetalhe.produtos.length} produtos (${totalQtd} un.)${msgParcelas}.`);
      void registrarAuditoria("lancar", `NF-e ${notaDetalhe.nNF} (${notaDetalhe.emitente}) lançada: ${brl(notaDetalhe.valor)}`, { chave: notaDetalhe.chave, numero_nf: notaDetalhe.nNF, valor: notaDetalhe.valor });
      setNotaDetalhe(null);
    } catch (err: any) {
      toast.error("Falha ao lançar nota", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAlterarNota = async () => {
    if (!notaDetalhe?.id || !empresa) return;
    setIsSaving(true);
    try {
      const semCategoria = notaDetalhe.produtos.filter(p => !p.categoria || p.categoria.trim() === "");
      if (semCategoria.length > 0) {
        toast.error("Categoria obrigatória");
        setIsSaving(false);
        return;
      }

      // Buscar itens antigos para calcular delta de estoque
      const { data: itensAntigos } = await supabase.from("notas_importadas_itens" as never).select("codigo, quantidade").eq("nota_id", notaDetalhe.id as any);
      const mapaAntigo = new Map<string, number>();
      (itensAntigos as any[] || []).forEach((it: any) => mapaAntigo.set(it.codigo, Number(it.quantidade) || 0));

      // 1. Atualizar nota
      await (supabase.from("notas_importadas" as never) as any).update({ valor_total: notaDetalhe.valor, situacao: "lancada" } as any).eq("id", notaDetalhe.id);

      // 2. Atualizar estoque por delta e recriar itens
      for (const p of notaDetalhe.produtos) {
        const qtdAntiga = mapaAntigo.get(p.codigo) ?? 0;
        const delta = p.qtd - qtdAntiga;
        const { data: prodExistente } = await supabase.from("produtos").select("id, estoque_atual, categoria").eq("empresa_id", empresa.id).or(`codigo.eq.${p.codigo},nome.ilike.%${p.nome.slice(0, 10)}%`).maybeSingle();
        let prodId: string | null = prodExistente ? (prodExistente as any).id : null;
        if (prodExistente) {
          prodId = (prodExistente as any).id;
          const novoEstoque = (Number((prodExistente as any).estoque_atual) || 0) + delta;
          await (supabase.from("produtos") as any).update({ estoque_atual: novoEstoque, preco_custo: p.valorUnit, categoria: p.categoria || (prodExistente as any).categoria || null }).eq("id", prodId);
          if (delta !== 0) {
            await supabase.from("movimentacoes_estoque").insert({ empresa_id: empresa.id, produto_id: prodId!, tipo: delta > 0 ? "entrada" : "saida", quantidade: Math.abs(delta), custo_unitario: p.valorUnit, observacoes: `Ajuste NF-e ${notaDetalhe.nNF} alterada (Chave: ${notaDetalhe.chave})` });
          }
        } else {
          const { data: novoProd } = await (supabase.from("produtos").insert({ empresa_id: empresa.id, codigo: p.codigo, nome: p.nome, unidade: p.un, preco_custo: p.valorUnit, preco_venda: p.valorUnit * 1.4, estoque_atual: p.qtd, ativo: true, categoria: p.categoria || null } as any).select("id") as any).single();
          prodId = novoProd!.id;
          await supabase.from("movimentacoes_estoque").insert({ empresa_id: empresa.id, produto_id: prodId!, tipo: "entrada", quantidade: p.qtd, custo_unitario: p.valorUnit, observacoes: `Entrada NF-e ${notaDetalhe.nNF} alterada (Chave: ${notaDetalhe.chave})` });
        }
      }
      // Itens removidos: devolver estoque
      for (const [codigo, qtdAntiga] of mapaAntigo.entries()) {
        if (!notaDetalhe.produtos.some(p => p.codigo === codigo)) {
          const { data: prod } = await supabase.from("produtos").select("id, estoque_atual").eq("empresa_id", empresa.id).eq("codigo", codigo).maybeSingle();
          if (prod) {
            await supabase.from("produtos").update({ estoque_atual: (Number((prod as any).estoque_atual) || 0) - qtdAntiga }).eq("id", (prod as any).id);
            await supabase.from("movimentacoes_estoque").insert({ empresa_id: empresa.id, produto_id: (prod as any).id, tipo: "saida", quantidade: qtdAntiga, custo_unitario: 0, observacoes: `Remoção produto NF-e ${notaDetalhe.nNF} alterada` });
          }
        }
      }
      // Recriar itens
      await supabase.from("notas_importadas_itens" as never).delete().eq("nota_id", notaDetalhe.id as any);
      if (notaDetalhe.produtos.length > 0) {
        await supabase.from("notas_importadas_itens" as never).insert(notaDetalhe.produtos.map(p => ({ nota_id: notaDetalhe.id, codigo: p.codigo, nome: p.nome, quantidade: p.qtd, unidade: p.un, valor_unitario: p.valorUnit, valor_total: p.valorTotal, categoria: p.categoria || null })) as any);
      }

      // 3. Parcelas/lançamentos: reaproveita ou recria
      const { data: parcelasAntigas } = await supabase.from("notas_importadas_parcelas" as never).select("id, lancamento_id").eq("nota_id", notaDetalhe.id as any);
      const lancIdsAntigos = ((parcelasAntigas as any[]) || []).map((pa: any) => pa.lancamento_id).filter(Boolean);
      // Buscar categoria financeira
      let categoriaFinanceiraId: string | null = null;
      const primeiraCategoria = notaDetalhe.produtos[0]?.categoria;
      if (primeiraCategoria) {
        const { data: cat } = await supabase.from("categorias_financeiras").select("id").eq("empresa_id", empresa.id).ilike("nome", `%${primeiraCategoria}%`).maybeSingle();
        if (cat) categoriaFinanceiraId = (cat as any).id;
      }
      // Buscar fornecedor id atual
      let fornecedorId: string | null = null;
      const { data: cont } = await supabase.from("contatos").select("id").eq("empresa_id", empresa.id).ilike("nome", `%${notaDetalhe.emitente.slice(0, 15)}%`).maybeSingle();
      if (cont) fornecedorId = (cont as any).id;

      // Deletar parcelas antigas e lançamentos antigos
      await supabase.from("notas_importadas_parcelas" as never).delete().eq("nota_id", notaDetalhe.id as any);
      if (lancIdsAntigos.length > 0) {
        await supabase.from("lancamentos_financeiros").delete().in("id", lancIdsAntigos);
      }
      // Recriar parcelas/lançamentos com dados atuais (forma/banco) — descrição só NF-e, fornecedor na coluna
      if (notaDetalhe.parcelas.length > 0) {
        for (const parc of notaDetalhe.parcelas) {
          const { data: lanc } = await supabase.from("lancamentos_financeiros").insert({ empresa_id: empresa.id, tipo: "pagar", status: "aberto", descricao: `NF-e ${notaDetalhe.nNF}`, valor: parc.valor, data_vencimento: parc.dataVencimento, contato_id: fornecedorId, categoria_id: categoriaFinanceiraId, observacoes: `Chave: ${notaDetalhe.chave} | Parcela ${parc.numero}`, forma_pagamento: (parc as any).forma_pagamento || "Boleto", conta_bancaria_id: (parc as any).conta_bancaria_id || null } as any).select("id").single();
          if (lanc) await supabase.from("notas_importadas_parcelas" as never).insert({ nota_id: notaDetalhe.id, numero: parc.numero, data_vencimento: parc.dataVencimento, valor: parc.valor, lancamento_id: (lanc as any).id } as any);
        }
      }

      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Nota alterada com sucesso");
      void registrarAuditoria("alterar", `NF-e ${notaDetalhe.nNF} (${notaDetalhe.emitente}) alterada: ${brl(notaDetalhe.valor)}`, { chave: notaDetalhe.chave, numero_nf: notaDetalhe.nNF, valor: notaDetalhe.valor });
      setNotaDetalhe(null);
    } catch (err: any) {
      toast.error("Falha ao alterar nota", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrar notas recebidas
  const mesesDisponiveis = useMemo(() => {
    const meses = new Set<string>();
    notas.forEach(n => {
      if (n.data_emissao) {
        meses.add(n.data_emissao.slice(0, 7)); // "YYYY-MM"
      }
    });
    return Array.from(meses).sort().reverse();
  }, [notas]);

  const filteredNotas = notas.filter(n => {
    const matchSearch = n.emitente.toLowerCase().includes(search.toLowerCase()) || 
      n.chave.includes(search) || 
      (n.numero_nf && n.numero_nf.includes(search)) ||
      n.cnpj.includes(search);
    const matchMes = filtroMes === "todos" || (n.data_emissao || "").startsWith(filtroMes);
    return matchSearch && matchMes;
  });

  type DadosNota = {
    id?: string;
    chave: string;
    emitente: string;
    cnpj: string;
    valor: number;
    data: string;
    nNF: string;
    produtos: { codigo: string; nome: string; qtd: number; un: string; valorUnit: number; valorTotal: number; categoria: string }[];
    parcelas: { numero: string; dataVencimento: string; valor: number; forma_pagamento: string; conta_bancaria_id: string }[];
    xml: string;
  };

  // Carrega os dados completos da nota (itens/parcelas) preferindo o registro local;
  // só recorre à SEFAZ quando não há id nem XML guardado. Compartilhado pelo diálogo
  // de detalhes e pela geração do DANFE.
  const carregarDadosNota = async (n: NotaRecebida): Promise<DadosNota | null> => {
    if (n.id) {
      const { data: itens } = await supabase.from("notas_importadas_itens" as never).select("codigo, nome, quantidade, unidade, valor_unitario, valor_total, categoria").eq("nota_id", n.id as any);
      const { data: parcelasDB } = await supabase.from("notas_importadas_parcelas" as never).select("numero, data_vencimento, valor, lancamento_id").eq("nota_id", n.id as any);
      const produtos = ((itens as any[]) || []).map((it: any) => ({ codigo: it.codigo, nome: it.nome, qtd: Number(it.quantidade), un: it.unidade, valorUnit: Number(it.valor_unitario), valorTotal: Number(it.valor_total), categoria: it.categoria || "" }));
      let parcelas: DadosNota["parcelas"] = [];
      if (parcelasDB && (parcelasDB as any).length > 0) {
        const lancIds = (parcelasDB as any[]).map((p: any) => p.lancamento_id).filter(Boolean);
        const lancMap = new Map<string, any>();
        if (lancIds.length > 0) {
          const { data: lancs } = await supabase.from("lancamentos_financeiros").select("id, forma_pagamento, conta_bancaria_id").in("id", lancIds);
          ((lancs as any[]) || []).forEach((l: any) => lancMap.set(l.id, l));
        }
        parcelas = (parcelasDB as any[]).map((p: any) => {
          const lanc = lancMap.get(p.lancamento_id);
          return { numero: p.numero, dataVencimento: p.data_vencimento, valor: Number(p.valor), forma_pagamento: lanc?.forma_pagamento || "Boleto", conta_bancaria_id: lanc?.conta_bancaria_id || "" };
        });
      }
      const xmlLocal = n.xml_completo || "";
      let produtosFinais = produtos;
      let parcelasFinais = parcelas;
      if (produtos.length === 0 && xmlLocal) {
        produtosFinais = parseProdutosDoXml(xmlLocal);
        if (parcelas.length === 0) parcelasFinais = parseParcelasDoXml(xmlLocal);
      }
      return {
        id: n.id, chave: n.chave, emitente: n.emitente, cnpj: n.cnpj,
        nNF: n.numero_nf || nNFdaChave(n.chave), data: n.data_emissao, valor: n.valor,
        produtos: produtosFinais, parcelas: parcelasFinais, xml: xmlLocal,
      };
    }
    if (n.xml_completo) {
      const xml = n.xml_completo;
      const produtos = parseProdutosDoXml(xml);
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "text/xml");
      const nNF = doc.querySelector("nNF")?.textContent || n.numero_nf || nNFdaChave(n.chave);
      const parcelas = parseParcelasDoXml(xml);
      return { id: n.id, chave: n.chave, emitente: n.emitente, cnpj: n.cnpj, nNF, data: n.data_emissao, valor: n.valor, produtos, parcelas, xml };
    }
    if (!empresa) return null;
    toast.info("Buscando detalhes da nota na SEFAZ...");
    try {
      const result = await consultarNFePorChaveFn({ data: { empresaId: empresa.id, chave: n.chave } });
      if (result.sucesso && result.xml) {
        const xml = result.xml;
        const produtos = parseProdutosDoXml(xml);
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        const nNF = doc.querySelector("nNF")?.textContent || n.numero_nf || nNFdaChave(n.chave);
        const parcelas = parseParcelasDoXml(xml);
        return { id: n.id, chave: n.chave, emitente: n.emitente, cnpj: n.cnpj, nNF, data: n.data_emissao, valor: n.valor, produtos, parcelas, xml };
      }
      toast.error(result.erro || "Não foi possível buscar detalhes");
      return null;
    } catch {
      toast.error("Erro ao consultar SEFAZ");
      return null;
    }
  };

  const handleVerNota = async (n: NotaRecebida) => {
    const d = await carregarDadosNota(n);
    if (d) setNotaDetalhe(d);
  };

  // Monta o DanfeData a partir dos dados carregados + campos extras do XML.
  const montarDanfe = (d: DadosNota): DanfeData => {
    const extra = d.xml ? parseDanfeDoXml(d.xml) : {};
    const fisc = d.xml ? itensFiscaisDoXml(d.xml) : [];
    const serie = extra.serie || nSerieDaChave(d.chave);
    return {
      ...extra,
      chave: d.chave,
      numero: d.nNF || nNFdaChave(d.chave),
      serie,
      temXml: !!d.xml,
      dataEmissao: d.data,
      ambiente: "producao",
      emitNome: d.emitente,
      emitCnpj: d.cnpj,
      produtos: d.produtos.map((p, i) => {
        const f = fisc[i];
        return {
          codigo: f?.cProd || p.codigo, nome: f?.xProd || p.nome,
          qtd: f?.qCom || p.qtd, un: f?.uCom || p.un,
          valorUnit: f?.vUnCom || p.valorUnit, valorTotal: f?.vProd || p.valorTotal,
          cfop: f?.cfop || extra.cfop || "",
          ncm: f?.ncm || "", cst: f?.cst || "",
          desconto: f?.vDesc || "",
          vIpi: f?.vIpi || "", aliqIcms: f?.aliqIcms || "", aliqIpi: f?.aliqIpi || "",
          baseIcms: f?.vBC || "", vIcms: f?.vICMS || "",
        };
      }),
      parcelas: d.parcelas.map((p) => ({ numero: p.numero, dataVencimento: p.dataVencimento, valor: p.valor })),
      valorTotal: d.valor,
    };
  };

  // Garante o XML da nota: usa o guardado ou busca na SEFAZ (cura notas antigas
  // lançadas sem XML) e grava de volta no banco + estado local.
  const garantirXmlNota = async (n: NotaRecebida): Promise<string> => {
    if (n.xml_completo) return n.xml_completo;
    if (!empresa) return "";
    try {
      const result = await consultarNFePorChaveFn({ data: { empresaId: empresa.id, chave: n.chave } });
      const xml = (result as any)?.xml || "";
      if (xml && n.id) {
        await (supabase.from("notas_importadas" as never) as any).update({ xml_completo: xml }).eq("id", n.id);
        setNotas((prev) => prev.map((x) => (x.chave === n.chave ? { ...x, xml_completo: xml } : x)));
      }
      return xml;
    } catch {
      return "";
    }
  };

  const abrirPdfDaNota = async (n: NotaRecebida) => {
    const d = await carregarDadosNota(n);
    if (!d) return;
    if (!d.xml) {
      const xml = await garantirXmlNota(n);
      if (!xml) { toast.error("XML não disponível para esta nota."); return; }
      d.xml = xml;
    }
    const blob = gerarDanfePdf(montarDanfe(d));
    const url = URL.createObjectURL(blob);
    const numero = d.nNF || nNFdaChave(n.chave) || "—";
    setPdfNota((p) => { if (p) URL.revokeObjectURL(p.url); return { url, nome: `DANFE_${numero}.pdf`, subtitulo: `${d.emitente} — NF-e ${numero}`, nota: n }; });
  };

  const handleBaixarXml = async (n: NotaRecebida) => {
    const xml = n.xml_completo || await garantirXmlNota(n);
    if (!xml) { toast.error("XML não disponível para esta nota."); return; }
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NFe_${n.numero_nf || n.chave.slice(0, 44)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // "Baixar PDF" gera o mesmo DANFE exibido na prévia (mesmo construtor do CT-e).
  const handleBaixarPdf = async (n: NotaRecebida) => {
    const d = await carregarDadosNota(n);
    if (!d) return;
    if (!d.xml) {
      const xml = await garantirXmlNota(n);
      if (!xml) { toast.error("XML não disponível para esta nota."); return; }
      d.xml = xml;
    }
    const blob = gerarDanfePdf(montarDanfe(d));
    const url = URL.createObjectURL(blob);
    const numero = d.nNF || nNFdaChave(n.chave) || "nota";
    const a = document.createElement("a");
    a.href = url;
    a.download = `DANFE_${numero}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader 
        eyebrow="Gestão Fiscal" 
        title="Notas de Compra" 
        description="Consulte notas fiscais emitidas contra seu CNPJ e importe XMLs para o estoque e financeiro." 
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTrilhaOpen(true)} className="h-10 rounded-xl px-4 shadow-sm">
              Trilha de auditoria
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/80 h-auto w-full max-w-[420px] flex-wrap gap-1 rounded-xl p-1.5">
          <TabsTrigger value="manifesto" className="flex-1 text-xs sm:text-sm">Notas de Compra</TabsTrigger>
          <TabsTrigger value="xml" className="flex-1 text-xs sm:text-sm">Importação de XML</TabsTrigger>
        </TabsList>

        <TabsContent value="manifesto" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por emitente, CNPJ ou chave..."
                  className="h-10 rounded-xl pl-10 shadow-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="h-10 shrink-0 rounded-xl border border-input bg-background px-3.5 text-sm font-medium shadow-sm transition-all hover:shadow-md"
              >
                <option value="todos">Todos os meses</option>
                {mesesDisponiveis.map(m => {
                  const [ano, mes] = m.split("-");
                  const nomesMes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                  return <option key={m} value={m}>{nomesMes[parseInt(mes)-1]}/{ano}</option>;
                })}
              </select>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => setChaveImportModal(true)}
              className="h-10 w-full shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md sm:w-auto"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Importar por Chave
            </Button>
          </div>

          <Card className="overflow-hidden rounded-2xl border-muted shadow-panel bg-card/60 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_td]:text-[13px] [&_td]:text-center [&_th]:px-2 [&_td]:border-l [&_td]:border-border [&_td:first-child]:border-l-0 [&_th]:border-l [&_th]:border-white/25 [&_th:first-child]:border-l-0">
                <TableHeader className="bg-primary supports-[backdrop-filter]:bg-primary [&_th]:text-primary-foreground">
                  <TableRow>
                    <TableHead className="text-center">Emissão</TableHead>
                    <TableHead className="text-center">Fornecedor</TableHead>
                    <TableHead className="text-center">Série - NF</TableHead>
                    <TableHead className="text-center">Valor (R$)</TableHead>
                    <TableHead className="text-center w-28">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNotas.map((n) => {
                    return (
                      <TableRow key={n.chave} className="transition-colors hover:bg-accent/30 cursor-pointer" onClick={() => handleVerNota(n)}>
                        <TableCell className="text-tabular text-muted-foreground whitespace-nowrap">{dateBR(n.data_emissao)}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="font-medium text-foreground truncate">{n.emitente}</div>
                        </TableCell>
                        <TableCell className="text-tabular text-muted-foreground whitespace-nowrap">
                          <div className="font-mono text-xs">{[nSerieDaChave(n.chave), n.numero_nf || nNFdaChave(n.chave)].filter(Boolean).join(" - ") || "—"}</div>
                        </TableCell>
                        <TableCell className="text-tabular font-medium text-foreground whitespace-nowrap">{brl(n.valor)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" onClick={() => abrirPdfDaNota(n)}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Ver DANFE</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" onClick={() => handleBaixarXml(n)}>
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Baixar XML</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" onClick={() => handleBaixarPdf(n)}>
                                    <FileText className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Baixar PDF</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0 text-destructive hover:text-destructive"
                                    disabled={excluirNota.isPending}
                                    onClick={() => setConfExcluirNota(n)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Excluir nota</TooltipContent>
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
          </Card>
        </TabsContent>

        <TabsContent value="xml" className="space-y-4">
          <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
            <Card className="rounded-2xl md:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="pb-2">
                <CardTitle className="tracking-tight">Área de Upload</CardTitle>
                <CardDescription className="leading-relaxed">
                  Arraste os arquivos XML de seus fornecedores ou clique para selecionar. Você pode importar múltiplos arquivos de uma só vez.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center transition-all ${
                    dragging ? "border-primary bg-primary/5 shadow-md" : "border-muted hover:border-primary/50 hover:shadow-md"
                  }`}
                >
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted/60">
                    <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-foreground text-center">
                    Arraste os arquivos XML aqui ou
                  </p>
                  <label className="mt-2 cursor-pointer">
                    <span className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-px hover:bg-primary/90 hover:shadow-md">
                      Selecionar Arquivos
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".xml"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">Apenas arquivos no formato .xml</p>
                  {isProcessing && (
                    <p className="text-xs font-medium text-primary mt-2 flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Lendo XMLs...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold tracking-tight">Como funciona?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                <div>
                  <h5 className="font-medium text-foreground mb-1">1. Leitura de Dados</h5>
                  <p className="text-xs">O sistema lê o XML, identifica o fornecedor, produtos e valores fiscais de tributos.</p>
                </div>
                <div>
                  <h5 className="font-medium text-foreground mb-1">2. Entrada no Estoque</h5>
                  <p className="text-xs">Se os produtos já estiverem cadastrados, o saldo de estoque é atualizado. Se não, o sistema sugere o pré-cadastro.</p>
                </div>
                <div>
                  <h5 className="font-medium text-foreground mb-1">3. Lançamento no Financeiro</h5>
                  <p className="text-xs">Uma conta a pagar é gerada automaticamente no financeiro com base nas duplicatas de cobrança do XML.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {importResults && !analiseOpen && (
            <Button onClick={() => setAnaliseOpen(true)} className="h-10 rounded-xl px-5 text-white shadow-md transition-all hover:-translate-y-px hover:bg-primary/90 hover:shadow-lg">
              Continuar lançando notas ({filaXml.length + 1} restante(s))
            </Button>
          )}

          <Dialog open={analiseOpen && !!importResults} onOpenChange={(o) => { if (!o && importResults) setConfSair(true); else setAnaliseOpen(o); }}>
            <DialogContent className="flex flex-col">
              <DialogTitle className="sr-only">Lançar notas fiscais</DialogTitle>
              {importResults && (
            <Card className="flex min-h-0 flex-1 flex-col border-muted bg-card/60 backdrop-blur-sm shadow-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
              <CardHeader className="shrink-0 bg-muted/30 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">Resultado da Análise do XML</CardTitle>
                    {filaXml.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Fila: {filaXml.length} nota(s) restante(s) após confirmar
                      </span>
                    )}
                    </div>
                    <CardDescription className="truncate text-xs">
                      NF-e {[nSerieDaChave(importResults.chave), importResults.nNF].filter(Boolean).join(" - ")} · Fornecedor: <strong className="font-semibold">{importResults.emitente}</strong>
                    </CardDescription>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] text-muted-foreground">Total do XML</span>
                    <div className="text-lg font-bold leading-tight text-foreground">{brl(importResults.total)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <div className="overflow-hidden rounded-2xl border">
                  <div className="border-b border-primary/20 bg-primary/8 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">Produtos Importados</div>
                  <div className="space-y-3 p-4">
                  {importResults.produtos.length > 1 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="mesma-categoria"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={mesmaCategoria}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setMesmaCategoria(on);
                            if (on) {
                              const cat = importResults.produtos[0]?.categoria || "";
                              setCategoriaUnica(cat);
                              setImportResults({ ...importResults, produtos: importResults.produtos.map((p) => ({ ...p, categoria: cat })) });
                            }
                          }}
                        />
                        <label htmlFor="mesma-categoria" className="text-xs font-medium text-foreground cursor-pointer">
                          Mesma categoria para todas as peças
                        </label>
                      </div>
                      {mesmaCategoria && (
                        <div className="w-[220px]">
                          <Combobox
                            value={categoriaUnica || "__none__"}
                            onChange={(v) => {
                              if (v === "__nova__") {
                                setNovaCatContext({ origem: "import-todas", index: -1 });
                                setNovaCatNome("");
                                setNovaCatOpen(true);
                                return;
                              }
                              const cat = v === "__none__" ? "" : v;
                              setCategoriaUnica(cat);
                              setImportResults({ ...importResults, produtos: importResults.produtos.map((p) => ({ ...p, categoria: cat })) });
                            }}
                            options={[
                              { value: "__none__", label: "Sem categoria" },
                              ...catsFinanceiras.map((c) => ({ value: c.nome, label: c.nome })),
                              { value: "__nova__", label: "+ Nova categoria" },
                            ]}
                            placeholder="Selecione"
                            searchPlaceholder="Digite para buscar..."
                            emptyText="Nenhum item encontrado."
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="border rounded-xl overflow-hidden bg-background/50 shadow-sm">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Ref XML</TableHead>
                          <TableHead>Produto Mapeado</TableHead>
                          <TableHead className="text-center">Qtd</TableHead>
                          <TableHead className="text-center">UN</TableHead>
                          <TableHead className="text-right">Unitário</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                          <TableHead className="w-[160px]">Categoria *</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResults.produtos.map((p, i) => (
                          <TableRow key={p.codigo} className="text-xs">
                            <TableCell className="font-mono text-muted-foreground">{p.codigo}</TableCell>
                            <TableCell className="font-medium text-foreground">{p.nome}</TableCell>
                            <TableCell className="text-center text-tabular">{p.qtd}</TableCell>
                            <TableCell className="text-center">{p.un}</TableCell>
                            <TableCell className="text-right text-tabular">{brl(p.valor)}</TableCell>
                            <TableCell className="text-right text-tabular font-medium text-foreground">{brl(p.qtd * p.valor)}</TableCell>
                            <TableCell>
                              {mesmaCategoria ? (
                                <span className="text-xs text-muted-foreground">{p.categoria || "Sem categoria"}</span>
                              ) : (
                              <Combobox
                                value={p.categoria || "__none__"}
                                onChange={(v) => {
                                  if (v === "__nova__") {
                                    setNovaCatContext({ origem: "import", index: i });
                                    setNovaCatNome("");
                                    setNovaCatOpen(true);
                                    return;
                                  }
                                  const novas = [...importResults.produtos];
                                  novas[i] = { ...novas[i], categoria: v === "__none__" ? "" : v };
                                  setImportResults({ ...importResults, produtos: novas });
                                }}
                                options={[
                                  { value: "__none__", label: "Sem categoria" },
                                  ...catsFinanceiras.map((c) => ({ value: c.nome, label: c.nome })),
                                  { value: "__nova__", label: "+ Nova categoria" },
                                ]}
                                placeholder="Selecione"
                                searchPlaceholder="Digite para buscar..."
                                emptyText="Nenhum item encontrado."
                              />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 shadow-sm">
                  <CondicaoPagamento
                    key={importResults.chave + importResults.total}
                    total={importResults.total}
                    parcelas={importResults.parcelas}
                    onChange={(parcelas) => setImportResults({ ...importResults, parcelas })}
                    contas={contasBancarias}
                    formas={FORMAS_PARCELA}
                    travarRegen={!!importResults.temDups}
                    contaPadrao={contaPadraoId}
                    emptyHint="Nenhuma parcela. Altere a condição acima para gerar, adicione manualmente ou deixe vazio para gerar 1 título com vencimento em 30 dias."
                  />
                </div>

              </CardContent>
              <div className="shrink-0 border-t border-border bg-card p-3 sm:p-4">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={isSaving} onClick={() => setConfSair(true)} className="h-10 rounded-xl">Cancelar</Button>
                  <Button variant="outline" disabled={isSaving} onClick={handleIgnorarNota} className="h-10 rounded-xl text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                    Ignorar Nota
                  </Button>
                  <Button onClick={handleConfirmarXmlUpload} disabled={isSaving} className="h-10 rounded-xl px-5 text-white shadow-md transition-all hover:-translate-y-px hover:bg-primary/90 hover:shadow-lg">
                    {isSaving ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Gerando Entrada & Financeiro...
                      </>
                    ) : (
                      "Confirmar Entrada no Estoque & Financeiro"
                    )}
                  </Button>
                </div>
              </div>
            </Card>
              )}
            </DialogContent>
          </Dialog>
          <AlertDialog open={confSair} onOpenChange={setConfSair}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sair sem lançar tudo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ainda há {(filaXml?.length ?? 0) + 1} nota(s) para lançar. Continuar depois mantém a fila no botão "Continuar lançando notas"; encerrar descarta o restante.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAnaliseOpen(false)}>Continuar depois</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { setConfSair(false); setAnaliseOpen(false); setImportResults(null); setFilaXml([]); }}
                >
                  Encerrar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>

  <Dialog open={chaveImportModal} onOpenChange={setChaveImportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar NF-e por Chave de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Digite a chave de acesso de 44 dígitos da nota fiscal que deseja importar.
            </p>
            <Input
              placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
              value={chaveInput}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d\s]/g, "");
                setChaveInput(v);
              }}
              maxLength={59}
              className="font-mono text-sm tracking-wider"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && chaveInput.replace(/\D/g, "").length === 44) {
                  handleImportarPorChave();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {chaveInput.replace(/\D/g, "").length}/44 dígitos
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChaveImportModal(false); setChaveInput(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleImportarPorChave}
              disabled={isImportingByKey || chaveInput.replace(/\D/g, "").length !== 44}
            >
              {isImportingByKey ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Consultando SEFAZ...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Importar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de detalhes da nota importada por chave */}
      <Dialog open={!!notaDetalhe} onOpenChange={(open) => { if (!open) setNotaDetalhe(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da NF-e</DialogTitle>
          </DialogHeader>
          {notaDetalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Emitente:</span>
                  <p className="font-medium">{notaDetalhe.emitente}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">CNPJ:</span>
                  <p className="font-mono">{notaDetalhe.cnpj}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Nº NF-e:</span>
                  <p className="font-medium">{notaDetalhe.nNF || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Data Emissão:</span>
                  <p>{dateBR(notaDetalhe.data)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Chave de Acesso:</span>
                  <p className="font-mono text-xs">{notaDetalhe.chave}</p>
                </div>
              </div>

              {notaDetalhe.produtos.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Produtos ({notaDetalhe.produtos.length} itens)</h4>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Produto</TableHead>
                          <TableHead className="text-xs text-right">Qtd</TableHead>
                          <TableHead className="text-xs">Un.</TableHead>
                          <TableHead className="text-xs text-right">V. Unit.</TableHead>
                          <TableHead className="text-xs text-right">V. Total</TableHead>
                          <TableHead className="text-xs w-[160px]">Categoria *</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notaDetalhe.produtos.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                            <TableCell className="text-xs">{p.nome}</TableCell>
                            <TableCell className="text-right text-xs">{p.qtd}</TableCell>
                            <TableCell className="text-xs">{p.un}</TableCell>
                            <TableCell className="text-right text-xs">{brl(p.valorUnit)}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{brl(p.valorTotal)}</TableCell>
                            <TableCell>
                              <Combobox
                                value={p.categoria || "__none__"}
                                onChange={(v) => {
                                  if (v === "__nova__") {
                                    setNovaCatContext({ origem: "detalhe", index: i });
                                    setNovaCatNome("");
                                    setNovaCatOpen(true);
                                    return;
                                  }
                                  const novas = [...notaDetalhe.produtos];
                                  novas[i] = { ...novas[i], categoria: v === "__none__" ? "" : v };
                                  setNotaDetalhe({ ...notaDetalhe, produtos: novas });
                                }}
                                options={[
                                  { value: "__none__", label: "Sem categoria" },
                                  ...catsFinanceiras.map((c) => ({ value: c.nome, label: c.nome })),
                                  { value: "__nova__", label: "+ Nova categoria" },
                                ]}
                                placeholder="Selecione"
                                searchPlaceholder="Digite para buscar..."
                                emptyText="Nenhum item encontrado."
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div>
                <CondicaoPagamento
                  key={(notaDetalhe.chave || '') + notaDetalhe.valor}
                  total={notaDetalhe.valor}
                  parcelas={notaDetalhe.parcelas}
                  onChange={(parcelas) => setNotaDetalhe({ ...notaDetalhe, parcelas })}
                  contas={contasBancarias}
                  formas={FORMAS_PARCELA}
                  travarRegen={!!notaDetalhe.xml && notaDetalhe.parcelas.length > 0 && (notaDetalhe.xml.match(/<dup[\s>]/g) || []).length > 0}
                  contaPadrao={contaPadraoId}
                  emptyHint="Nenhuma parcela no XML. Altere a condição acima para gerar, adicione manualmente ou deixe vazio para lançar como pagamento único."
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <span className="text-muted-foreground text-sm">Valor Total:</span>
                  <p className="text-lg font-bold">{brl(notaDetalhe.valor)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setNotaDetalhe(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={notaDetalhe.id ? handleAlterarNota : handleLancarNota} disabled={isSaving} className={notaDetalhe.id ? "bg-primary hover:bg-primary/90 text-white" : ""}>
                    {isSaving ? (
                      <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> {notaDetalhe.id ? "Salvando..." : "Lançando..."}</>
                    ) : notaDetalhe.id ? (
                      <><Pencil className="mr-2 h-4 w-4" /> Alterar</>
                    ) : (
                      <><Check className="mr-2 h-4 w-4" /> Lançar Nota</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog criar categoria inline */}
      <Dialog open={novaCatOpen} onOpenChange={(o) => { if (!o) { setNovaCatOpen(false); setNovaCatNome(""); setNovaCatContext(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova categoria (Despesa)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome *</label>
              <Input
                autoFocus
                placeholder="Ex: Peças, Combustível..."
                value={novaCatNome}
                onChange={(e) => setNovaCatNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (novaCatNome.trim()) criarCategoriaInline.mutate(novaCatNome); } }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNovaCatOpen(false); setNovaCatNome(""); setNovaCatContext(null); }}>Cancelar</Button>
            <Button disabled={criarCategoriaInline.isPending || !novaCatNome.trim()} onClick={() => criarCategoriaInline.mutate(novaCatNome)}>
              {criarCategoriaInline.isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Criar categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confExcluirNota} onOpenChange={(v) => { if (!v) setConfExcluirNota(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir esta nota e todos os lançamentos financeiros vinculados?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confExcluirNota && excluirNota.mutate(confExcluirNota)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trilhaOpen} onOpenChange={setTrilhaOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trilha de auditoria — Notas de Compra</DialogTitle>
          </DialogHeader>
          {trilhaQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : trilhaQuery.isError ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Trilha indisponível no momento.</p>
          ) : (trilhaQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum evento registrado ainda. Lançar, alterar ou excluir notas gera registros aqui.</p>
          ) : (
            <div className="divide-y divide-border">
              {(trilhaQuery.data ?? []).map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 py-2.5">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    ev.acao === "excluir" ? "bg-destructive/10 text-destructive"
                    : ev.acao === "alterar" ? "bg-primary/10 text-primary"
                    : "bg-success/10 text-success"
                  }`}>
                    {ev.acao === "excluir" ? "Excluiu" : ev.acao === "alterar" ? "Alterou" : "Lançou"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{ev.detalhes?.descricao || "—"}</p>
                    <p className="text-xs text-muted-foreground">
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

      {pdfNota && (
        <PdfViewer
          titulo="DANFE — Nota de Compra"
          subtitulo={pdfNota.subtitulo}
          url={pdfNota.url}
          nomeArquivo={pdfNota.nome}
          rev={DANFE_REV}
          onClose={fecharPdfNota}
          acoes={
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const nota = pdfNota.nota;
                fecharPdfNota();
                await handleVerNota(nota);
              }}
            >
              Detalhes / Lançar
            </Button>
          }
        />
      )}
    </>
  );
}
