import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Truck, Plus, FileText, Search, Ban, UploadCloud, FileCode, UsersRound, MapPin, Package, DollarSign, Building2, Route as RouteIcon, Trash2, Filter, Calendar, CheckCircle2, ChevronsUpDown, Check, ReceiptText, Pencil, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { emitirCteFn, consultarCteFn, cancelarCteFn, previewCteXmlFn, excluirRejeitadosCteFn } from "@/lib/sefaz-cte-server";
import { CFOPS_CTE, MOD_FRETE_OPTIONS, RESPONSAVEL_CTE_OPTIONS } from "@/lib/cfops-transporte";
import { gerarDactePdf } from "@/lib/dacte-pdf";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";

export const Route = createFileRoute("/_authenticated/fiscal/cte")({
  component: CtePage,
  head: () => ({ meta: [{ title: "CT-e — Norvo" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ fromNFe: (search.fromNFe as string) || undefined }),
});

type CteDoc = { id: string; numero: string | null; serie: string | null; status: string; valor_servico: number | null; chave_acesso: string | null; created_at: string; motivo_rejeicao: string | null; protocolo_sefaz: string | null; xml_assinado: string | null; ambiente: string | null };

function CtePage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [isParsing, setIsParsing] = useState(false);
  const [mercadorias, setMercadorias] = useState<Array<{ chave: string; nNF: string; serie: string; emit: string; emitCnpj: string; emitUF: string; emitCMun: string; emitXMun: string; emitIE?: string; emitLogradouro?: string; emitBairro?: string; emitCEP?: string; emitFone?: string; dest: string; destCnpj: string; destUF: string; destCMun: string; destXMun: string; destIE?: string; destLogradouro?: string; destBairro?: string; destCEP?: string; destFone?: string; valor: number; peso: number; data: string; tomador: string; tomadorCnpj: string; tomadorUF: string; tomadorCMun: string; tomadorXMun: string; tomadorIE?: string; tomadorLogradouro?: string; tomadorBairro?: string; tomadorCEP?: string; modFrete: string }>>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [filtroEmpresa] = useState("ROSE TRANSPORTES");
  const [filtroRemetente, setFiltroRemetente] = useState("TODOS REMETENTES");
  const [filtroDestinatario, setFiltroDestinatario] = useState("TODOS OS DESTINATÁRIOS");
  const [periodoIni, setPeriodoIni] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); });
  const [periodoFim, setPeriodoFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "nNF", dir: "asc" });
  const [editingRascunhoId, setEditingRascunhoId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState("autorizados");

  // Cancelamento: justificativas pré-salvas (SEFAZ exige mín. 15 caracteres).
  // A última usada fica salva e já vem selecionada na próxima vez.
  const JUSTIFICATIVAS_CANCELAMENTO = [
    "Cancelamento por emissão incorreta do CT-e",
    "CT-e emitido com erro de preenchimento dos dados",
    "Valor da prestação informado incorretamente",
    "Dados do tomador informados incorretamente",
    "CT-e emitido em duplicidade",
  ];
  const [cancelTarget, setCancelTarget] = useState<{ chave: string; protocolo?: string; numero?: string | null } | null>(null);
  const [cancelJust, setCancelJust] = useState(() => {
    try { return localStorage.getItem("norvo_cte_cancel_just") || JUSTIFICATIVAS_CANCELAMENTO[0]; }
    catch { return JUSTIFICATIVAS_CANCELAMENTO[0]; }
  });

  const mercadoriasSorted = useMemo(() => {
    const arr = [...mercadorias];
    arr.sort((a, b) => {
      const va = (a as any)[sortConfig.key] ?? "";
      const vb = (b as any)[sortConfig.key] ?? "";
      if (typeof va === "number" && typeof vb === "number") return sortConfig.dir === "asc" ? va - vb : vb - va;
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return sortConfig.dir === "asc" ? -1 : 1;
      if (sa > sb) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [mercadorias, sortConfig]);

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-documentos", empresa?.id],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any)        .select("id,numero,serie,status,valor_servico,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz,xml_assinado,ambiente").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const docsByStatus = useMemo(() => {
    if (!docs) return { autorizados: [], rejeitados: [], cancelados: [], rascunhos: [] };
    return {
      autorizados: docs.filter(d => d.status === "autorizado"),
      rejeitados: docs.filter(d => d.status === "rejeitado"),
      cancelados: docs.filter(d => d.status === "cancelado"),
      rascunhos: docs.filter(d => d.status === "rascunho"),
    };
  }, [docs]);

  // NF-es reservadas em rascunhos: continuam "pendente" no banco (não são deletadas),
  // mas ficam ocultas da listagem para não serem reutilizadas em outro CT-e.
  const chavesEmRascunho = useMemo(() => {
    const s = new Set<string>();
    for (const d of (docs ?? [])) {
      if ((d as any).status !== "rascunho") continue;
      try {
        const p = JSON.parse((d as any).xml_assinado || "{}");
        for (const c of (p.chavesNFe || [])) if (c) s.add(String(c));
      } catch {}
    }
    return s;
  }, [docs]);

  const filteredDocs = useMemo(() => {
    switch (statusTab) {
      case "autorizados": return docsByStatus.autorizados;
      case "rejeitados": return docsByStatus.rejeitados;
      case "cancelados": return docsByStatus.cancelados;
      case "rascunhos": return docsByStatus.rascunhos;
      default: return docs ?? [];
    }
  }, [statusTab, docsByStatus, docs]);

  const downloadXml = (doc: CteDoc) => {
    if (!doc.xml_assinado) { toast.error("XML não disponível"); return; }
    let xmlContent = doc.xml_assinado;
    try {
      const parsed = JSON.parse(doc.xml_assinado);
      if (parsed.xml) xmlContent = parsed.xml;
    } catch {}
    if (!xmlContent || !xmlContent.includes("<")) { toast.error("XML não encontrado no registro"); return; }
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CTe_${doc.numero || "0"}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("XML baixado");
  };

  const downloadPdf = (doc: CteDoc) => {
    if (!doc.xml_assinado) { toast.error("XML não disponível para gerar PDF"); return; }
    try {
      const parser = new DOMParser();
      let xmlStr = doc.xml_assinado;
      try { const p = JSON.parse(doc.xml_assinado); if (p.xml) xmlStr = p.xml; } catch {}
      if (!xmlStr.includes("<")) { toast.error("XML inválido"); return; }
      const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
      const tag = (sel: string) => xmlDoc.querySelector(sel)?.textContent || "";
      const nFes = Array.from(xmlDoc.querySelectorAll("det")).map(det => ({
        nNF: det.querySelector("infNFe > ide > nNF")?.textContent || "",
        serie: det.querySelector("infNFe > ide > serie")?.textContent || "1",
        valor: parseFloat(det.querySelector("infNFe > total > ICMSTot > vNF")?.textContent || "0"),
      }));
      const pdfBlob = gerarDactePdf({
        chave: doc.chave_acesso || "",
        numero: doc.numero || "",
        serie: doc.serie || "1",
        modelo: form.modelo || "57",
        ambiente: doc.ambiente || "producao",
        dataEmissao: doc.created_at,
        emitCnpj: tag("infCte > emit > CNPJ") || "",
        emitNome: tag("infCte > emit > xNome") || "",
        emitEndereco: `${tag("infCte > emit > enderEmit > xLgr")} ${tag("infCte > emit > enderEmit > nro")}`.trim(),
        emitCidade: tag("infCte > emit > enderEmit > xMun") || "",
        emitUF: tag("infCte > emit > enderEmit > UF") || "",
        emitIE: tag("infCte > emit > IE") || "",
        tomadorCnpj: tag("infCte > toma > CNPJ") || "",
        tomadorNome: tag("infCte > toma > xNome") || "",
        tomadorEndereco: `${tag("infCte > toma > enderToma > xLgr")} ${tag("infCte > toma > enderToma > nro")}`.trim(),
        tomadorCidade: tag("infCte > toma > enderToma > xMun") || "",
        tomadorUF: tag("infCte > toma > enderToma > UF") || "",
        remCnpj: tag("infCte > emit > CNPJ") || "",
        remNome: tag("infCte > emit > xNome") || "",
        remEndereco: `${tag("infCte > emit > enderEmit > xLgr")} ${tag("infCte > emit > enderEmit > nro")}`.trim(),
        remCidade: tag("infCte > emit > enderEmit > xMun") || "",
        remUF: tag("infCte > emit > enderEmit > UF") || "",
        remCEP: tag("infCte > emit > enderEmit > CEP") || "",
        destCnpj: tag("infCte > toma > CNPJ") || "",
        destNome: tag("infCte > toma > xNome") || "",
        destEndereco: `${tag("infCte > toma > enderToma > xLgr")} ${tag("infCte > toma > enderToma > nro")}`.trim(),
        destCidade: tag("infCte > toma > enderToma > xMun") || "",
        destUF: tag("infCte > toma > enderToma > UF") || "",
        destCEP: tag("infCte > toma > enderToma > CEP") || "",
        cfop: tag("infCte > ide > CFOP") || "5353",
        naturezaOperacao: tag("infCte > ide > natOp") || "TRANSPORTE",
        origemCidade: tag("infCte > ide > xMunIni") || "",
        origemUF: tag("infCte > ide > UFIni") || "",
        destinoCidade: tag("infCte > ide > xMunFim") || "",
        destinoUF: tag("infCte > ide > UFFim") || "",
        valorServico: parseFloat(tag("infCte > vPrest > vTPrest")) || Number(doc.valor_servico) || 0,
        valorCarga: parseFloat(tag("infCte > infCarga > vCarga")) || 0,
        pesoKg: parseFloat(tag("infCte > infCarga > infQ > qCarga")) || 0,
        icmsCST: tag("infCte > imp > ICMS > ICMS00 > CST") || tag("infCte > imp > ICMS > ICMS90 > CST") || "00",
        icmsBase: parseFloat(tag("infCte > imp > ICMS > ICMS00 > vBC") || tag("infCte > imp > ICMS > ICMS90 > vBC") || "0"),
        icmsAliq: parseFloat(tag("infCte > imp > ICMS > ICMS00 > pICMS") || tag("infCte > imp > ICMS > ICMS90 > pICMS") || "0"),
        icmsValor: parseFloat(tag("infCte > imp > ICMS > ICMS00 > vICMS") || tag("infCte > imp > ICMS > ICMS90 > vICMS") || "0"),
        nFes,
        placa: tag("infModal > rodo > veic > placa") || "",
        rntrc: tag("infModal > rodo > RNTRC") || "",
        protocolo: doc.protocolo_sefaz || "",
      });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DACTE_${doc.numero || "0"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF baixado");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF", { description: e.message });
    }
  };

  const [open, setOpen] = useState(false);
  const emptyForm = { toma: "3", cnpjTomador: "", xNomeTomador: "", ufTomador: "MG", cMunTomador: "3106200", xMunTomador: "BELO HORIZONTE", ieTomador: "", logradouroTomador: "", nroTomador: "", bairroTomador: "", cepTomador: "", foneTomador: "", emailTomador: "", cnpjConsignatario: "", xNomeConsignatario: "", ieConsignatario: "", ufConsignatario: "", xMunConsignatario: "", cepConsignatario: "", logradouroConsignatario: "", nroConsignatario: "", bairroConsignatario: "", cnpjRedespacho: "", xNomeRedespacho: "", ieRedespacho: "", ufRedespacho: "", xMunRedespacho: "", cepRedespacho: "", logradouroRedespacho: "", nroRedespacho: "", bairroRedespacho: "", ambiente: "homologacao" as "homologacao" | "producao", modelo: "57", cfop: "5353", vPrest: "0.00", vCarga: "0.00", peso: "0", rntrc: "", icmsCST: "00", icmsBase: "1000.00", icmsAliq: "0.00", icmsValor: "0.00", pisAliq: "0.00", cofinsAliq: "0.00", irAliq: "0.00", inssAliq: "0.00", csllAliq: "0.00", motoristaNome: "", motoristaId: "", ciot: "", placaVeiculo: "", placaReboque: "", semiReboque1: "", semiReboque2: "", seguradoraNome: "", seguradoraId: "", apolice: "", averbacao: "", cMunEnv: "3106200", xMunEnv: "BELO HORIZONTE", ufEnv: "MG", cMunIni: "3106200", xMunIni: "BELO HORIZONTE", ufIni: "MG", cMunFim: "3550308", xMunFim: "SAO PAULO", ufFim: "SP", dataEmissao: new Date().toISOString().slice(0,10) };
  const [form, setForm] = useState(emptyForm);
  const [cfopOpen, setCfopOpen] = useState(false);
  const [cfopQuery, setCfopQuery] = useState("");

  // Auto-calcula ICMS: vICMS = vPrest (base) * aliquota / 100
  useEffect(() => {
    const base = parseFloat(form.vPrest) || 0;
    const aliq = parseFloat(form.icmsAliq) || 0;
    const calc = (base * aliq / 100).toFixed(2);
    if (calc !== form.icmsValor) setForm(f => ({ ...f, icmsValor: calc }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vPrest, form.icmsAliq]);

  // NF-es pendentes persistidas (sobrevivem a F5/troca de tela) — dedup global por chave
  const { data: pendentesDB } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-nfes-pendentes", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cte_nfes_pendentes" as any).select("*").eq("empresa_id", empresa!.id).eq("status", "pendente").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        chave: string; n_nf: string | null; serie: string | null; emit_nome: string | null; emit_cnpj: string | null; emit_uf: string | null; emit_cmun: string | null; emit_xmun: string | null;
        dest_nome: string | null; dest_cnpj: string | null; dest_uf: string | null; dest_cmun: string | null; dest_xmun: string | null;
        valor: number | null; peso: number | null; data_emissao: string | null;
        tomador_nome: string | null; tomador_cnpj: string | null; tomador_uf: string | null; tomador_cmun: string | null; tomador_xmun: string | null; tomador_ie: string | null; tomador_logradouro: string | null; tomador_bairro: string | null; tomador_cep: string | null; mod_frete: string | null;
      }>;
    },
  });
  useEffect(() => {
    if (pendentesDB) {
      const mapped = pendentesDB.filter(r => !chavesEmRascunho.has(r.chave)).map(r => ({
        chave: r.chave,
        nNF: r.n_nf || "",
        serie: r.serie || "1",
        emit: r.emit_nome || "",
        emitCnpj: r.emit_cnpj || "",
        emitUF: r.emit_uf || "",
        emitCMun: r.emit_cmun || "",
        emitXMun: r.emit_xmun || "",
        dest: r.dest_nome || "",
        destCnpj: r.dest_cnpj || "",
        destUF: r.dest_uf || "",
        destCMun: r.dest_cmun || "",
        destXMun: r.dest_xmun || "",
        valor: Number(r.valor ?? 0),
        peso: Number(r.peso ?? 0),
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
      setMercadorias(mapped);
      if (mapped.length > 0 && mapped[0].emitCMun) {
        const first = mapped[0];
        setForm(f => ({
          ...f,
          cMunIni: first.emitCMun || f.cMunIni,
          xMunIni: first.emitXMun || f.xMunIni,
          ufIni: first.emitUF || f.ufIni,
          cMunFim: first.destCMun || f.cMunFim,
          xMunFim: first.destXMun || f.xMunFim,
          ufFim: first.destUF || f.ufFim,
          cMunEnv: first.emitCMun || f.cMunEnv,
          xMunEnv: first.emitXMun || f.xMunEnv,
          ufEnv: first.emitUF || f.ufEnv,
        }));
      }
    }
  }, [pendentesDB, chavesEmRascunho]);

  // Motoristas (cargo contém Motorista), Veículos e Seguradoras para menus tipo CFOP
  const [motoristaOpen, setMotoristaOpen] = useState(false);
  const [motoristaQuery, setMotoristaQuery] = useState("");
  const [veiculoOpen, setVeiculoOpen] = useState<string | null>(null);
  const [veiculoQuery, setVeiculoQuery] = useState("");
  const [seguradoraOpen, setSeguradoraOpen] = useState(false);
  const [seguradoraQuery, setSeguradoraQuery] = useState("");
  const { data: motoristas } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-motoristas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaboradores" as never).select("id,nome,cargo,cpf").eq("empresa_id", empresa!.id).eq("status", "ativo").ilike("cargo", "%motorist%").order("nome").limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; nome: string; cargo: string; cpf: string | null }>;
    },
  });
  const { data: veiculos } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos-cte", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos" as never).select("id,placa,marca_modelo,tipo").eq("empresa_id", empresa!.id).order("placa").limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; placa: string; marca_modelo: string | null; tipo: string | null }>;
    },
  });
  const { data: seguradoras } = useQuery({
    enabled: !!empresa,
    queryKey: ["seguradoras", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("seguradoras" as never).select("id,nome,cnpj,apolice_numero,averbacao").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome").limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; nome: string; cnpj: string | null; apolice_numero: string | null; averbacao: string | null }>;
    },
  });

  // PIS/COFINS automático conforme regime da empresa
  const { data: regimeData } = useQuery({
    enabled: !!empresa,
    queryKey: ["empresa-regime", empresa?.id],
    queryFn: async () => {
      const { data: cfg } = await supabase.from("nfe_config").select("regime_tributario").eq("empresa_id", empresa!.id).maybeSingle();
      if ((cfg as any)?.regime_tributario) return String((cfg as any).regime_tributario);
      const { data: emp } = await supabase.from("empresas").select("regime_tributario").eq("id", empresa!.id).maybeSingle();
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
    setForm(f => {
      const isDefaultPis = f.pisAliq === "0.00" || f.pisAliq === "" || f.pisAliq === "0";
      const isDefaultCofins = f.cofinsAliq === "0.00" || f.cofinsAliq === "" || f.cofinsAliq === "0";
      // só auto-preenche se ainda estiver no padrão (não sobrescreve edição manual)
      if (!isDefaultPis && !isDefaultCofins) return f;
      return {
        ...f,
        pisAliq: isDefaultPis ? target.pis : f.pisAliq,
        cofinsAliq: isDefaultCofins ? target.cofins : f.cofinsAliq,
      };
    });
  }, [regimeData, empresa?.id]);

  // Templates de CT-e (mesmo remetente/destino/tomador) — tabela cte_templates
  type CteTemplate = { id: string; nome: string; toma: string; cnpj_tomador: string | null; x_nome_tomador: string | null; uf_tomador: string | null; c_mun_tomador: string | null; x_mun_tomador: string | null; cfop: string | null; rntrc: string | null; c_mun_env: string | null; x_mun_env: string | null; uf_env: string | null; c_mun_ini: string | null; x_mun_ini: string | null; uf_ini: string | null; c_mun_fim: string | null; x_mun_fim: string | null; uf_fim: string | null; dados: Record<string, unknown> | null };
  const [templateNome, setTemplateNome] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const { data: templates } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-templates", empresa?.id],
    queryFn: async (): Promise<CteTemplate[]> => {
      const { data, error } = await supabase.from("cte_templates" as any).select("*").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as CteTemplate[];
    },
  });
  const salvarTemplate = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const nome = templateNome.trim();
      if (!nome) throw new Error("Informe um nome para o template");
      const payload = {
        empresa_id: empresa.id,
        nome,
        toma: form.toma,
        cnpj_tomador: form.cnpjTomador || null,
        x_nome_tomador: form.xNomeTomador || null,
        uf_tomador: form.ufTomador || null,
        c_mun_tomador: form.cMunTomador || null,
        x_mun_tomador: form.xMunTomador || null,
        cfop: form.cfop || null,
        rntrc: form.rntrc || null,
        c_mun_env: form.cMunEnv || null,
        x_mun_env: form.xMunEnv || null,
        uf_env: form.ufEnv || null,
        c_mun_ini: form.cMunIni || null,
        x_mun_ini: form.xMunIni || null,
        uf_ini: form.ufIni || null,
        c_mun_fim: form.cMunFim || null,
        x_mun_fim: form.xMunFim || null,
        uf_fim: form.ufFim || null,
        dados: { ...form } as unknown as Record<string, unknown>,
      };
      const { error } = await supabase.from("cte_templates" as any).upsert(payload, { onConflict: "empresa_id,nome" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template salvo");
      setTemplateNome("");
      qc.invalidateQueries({ queryKey: ["cte-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const excluirTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cte_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template excluído");
      setSelectedTemplateId("");
      qc.invalidateQueries({ queryKey: ["cte-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const aplicarTemplate = (t: CteTemplate) => {
    const d = (t.dados as any) || {};
    setForm(f => ({
      ...f,
      toma: t.toma || (d.toma as string) || f.toma,
      cnpjTomador: t.cnpj_tomador || (d.cnpjTomador as string) || f.cnpjTomador,
      xNomeTomador: t.x_nome_tomador || (d.xNomeTomador as string) || f.xNomeTomador,
      ufTomador: t.uf_tomador || (d.ufTomador as string) || f.ufTomador,
      cMunTomador: t.c_mun_tomador || (d.cMunTomador as string) || f.cMunTomador,
      xMunTomador: t.x_mun_tomador || (d.xMunTomador as string) || f.xMunTomador,
      cfop: t.cfop || (d.cfop as string) || f.cfop,
      rntrc: t.rntrc ?? (d.rntrc as string) ?? f.rntrc,
      icmsCST: (d.icmsCST as string) || (t as any).icms_cst || f.icmsCST,
      icmsBase: (d.icmsBase as string) || (t as any).icms_base || f.icmsBase,
      icmsAliq: (d.icmsAliq as string) || (t as any).icms_aliq || f.icmsAliq,
      icmsValor: (d.icmsValor as string) || (t as any).icms_valor || f.icmsValor,
      pisAliq: (d.pisAliq as string) || f.pisAliq,
      cofinsAliq: (d.cofinsAliq as string) || f.cofinsAliq,
      irAliq: (d.irAliq as string) || f.irAliq,
      inssAliq: (d.inssAliq as string) || f.inssAliq,
      csllAliq: (d.csllAliq as string) || f.csllAliq,
      cMunEnv: t.c_mun_env || (d.cMunEnv as string) || f.cMunEnv,
      xMunEnv: t.x_mun_env || (d.xMunEnv as string) || f.xMunEnv,
      ufEnv: t.uf_env || (d.ufEnv as string) || f.ufEnv,
      cMunIni: t.c_mun_ini || (d.cMunIni as string) || f.cMunIni,
      xMunIni: t.x_mun_ini || (d.xMunIni as string) || f.xMunIni,
      ufIni: t.uf_ini || (d.ufIni as string) || f.ufIni,
      cMunFim: t.c_mun_fim || (d.cMunFim as string) || f.cMunFim,
      xMunFim: t.x_mun_fim || (d.xMunFim as string) || f.xMunFim,
      ufFim: t.uf_fim || f.ufFim,
    }));
    toast.success(`Template "${t.nome}" aplicado`);
  };

  const handleImportNFeXml = async (files: FileList | File[]) => {
    if (!empresa) { toast.error("Selecione uma empresa"); return; }
    const list = Array.from(files as any as File[]);
    const xmls = list.filter(f => f.name.toLowerCase().endsWith(".xml"));
    if (xmls.length === 0) { toast.error("Selecione XMLs de NF-e"); return; }
    setIsParsing(true);
    try {
      const lookupContato = async (cnpj: string) => {
        const doc = (cnpj || "").replace(/\D/g, "");
        if (!doc || doc.length < 11) return null;
        const { data } = await supabase.from("contatos" as any).select("nome,logradouro,numero,bairro,cidade,uf,cep,telefone").eq("empresa_id", empresa!.id).eq("documento", doc).maybeSingle();
        return data || null;
      };
      const upsertContatoFromNfe = async (cnpj: string, nome: string, ie: string, uf: string, cidade: string, logradouro: string, bairro: string, cep: string, fone: string, tipo: "cliente" | "fornecedor" | "transportadora" | "ambos") => {
        const doc = (cnpj || "").replace(/\D/g, "");
        if (!doc || doc.length < 11 || !nome) return;
        const { data: existente } = await supabase.from("contatos" as any).select("id").eq("empresa_id", empresa!.id).eq("documento", doc).maybeSingle();
        if (existente) return;
        await supabase.from("contatos" as any).insert({ empresa_id: empresa!.id, nome, tipo, documento: doc, uf: uf || null, cidade: cidade || null, logradouro: logradouro || null, bairro: bairro || null, cep: cep || null, telefone: fone || null });
      };
      let added = 0;
      let duplicadas = 0;
      const novas: typeof mercadorias = [];
      for (const file of xmls) {
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
        const destCnpj = doc.querySelector("dest > CNPJ")?.textContent || doc.querySelector("dest > CPF")?.textContent || "";
        const destXNome = doc.querySelector("dest > xNome")?.textContent || "";
        const destIE = doc.querySelector("dest > IE")?.textContent || "";
        const destUF = doc.querySelector("dest > enderDest > UF")?.textContent || "";
        const destCMun = doc.querySelector("dest > enderDest > cMun")?.textContent || "";
        const destXMun = doc.querySelector("dest > enderDest > xMun")?.textContent || "";
        const destLgr = doc.querySelector("dest > enderDest > xLgr")?.textContent || "";
        const destBairro = doc.querySelector("dest > enderDest > xBairro")?.textContent || "";
        const destCEP = doc.querySelector("dest > enderDest > CEP")?.textContent || "";
        const destFone = doc.querySelector("dest > enderDest > fone")?.textContent || "";
        const vNF = doc.querySelector("total > ICMSTot > vNF")?.textContent || doc.querySelector("vNF")?.textContent || "0";
        const pesoB = doc.querySelector("transp > vol > pesoB")?.textContent || doc.querySelector("vol > pesoB")?.textContent || "";
        const nNF = doc.querySelector("ide > nNF")?.textContent || file.name.replace(/\.xml$/i, "");
        const serie = doc.querySelector("ide > serie")?.textContent || "1";
        const dhEmi = doc.querySelector("ide > dhEmi")?.textContent || "";
        const chave = doc.querySelector("infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") || doc.querySelector("chNFe")?.textContent || `${Date.now()}${added}`;
        const chaveNorm = chave.replace(/\D/g, "");
        if (!chaveNorm || chaveNorm.length < 20) { duplicadas++; continue; }
        if (novas.some(m => m.chave === chaveNorm)) { duplicadas++; continue; }
        const peso = pesoB ? parseFloat(pesoB) : 1000;
        const valor = parseFloat(vNF) || 0;
        const modFrete = doc.querySelector("transp > modFrete")?.textContent || "";

        // Lookup endereço no cadastro de contatos (XML de NF-e pode não trazer endereço)
        const [emitContato, destContato] = await Promise.all([lookupContato(emitCnpj), lookupContato(destCnpj)]);
        const emitLog = emitLgr || (emitContato as any)?.logradouro || "";
        const emitNro = (emitContato as any)?.numero || "";
        const emitBai = emitBairro || (emitContato as any)?.bairro || "";
        const emitCepFin = emitCEP || (emitContato as any)?.cep || "";
        const emitCidFin = emitXMun || (emitContato as any)?.cidade || "";
        const emitUfFin = emitUF || (emitContato as any)?.uf || "";
        const emitFoneFin = emitFone || (emitContato as any)?.telefone || "";
        const destLog = destLgr || (destContato as any)?.logradouro || "";
        const destNro = (destContato as any)?.numero || "";
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
          tomadorNome = emitXNome; tomadorCnpj = emitCnpj;
          tomadorUF = emitUF; tomadorCMun = emitCMun; tomadorXMun = emitXMun;
          tomadorIE = emitIE; tomadorLog = emitLgr; tomadorBai = emitBairro; tomadorCep = emitCEP;
        } else if (modFrete === "2") {
          const transpCnpj = doc.querySelector("transp > transporta > CNPJ")?.textContent || "";
          const transpXNome = doc.querySelector("transp > transporta > xNome")?.textContent || "";
          const transpIE = doc.querySelector("transp > transporta > IE")?.textContent || "";
          if (transpCnpj || transpXNome) { tomadorNome = transpXNome || tomadorNome; tomadorCnpj = transpCnpj || tomadorCnpj; tomadorIE = transpIE || tomadorIE; }
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
          dest_nome: destXNome,
          dest_cnpj: destCnpj,
          dest_uf: destUF || null,
          dest_cmun: destCMun || null,
          dest_xmun: destXMun || null,
          valor,
          peso,
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
        const { error } = await supabase.from("cte_nfes_pendentes" as any).insert(payload);
        if (error) {
          if ((error as any).code === "23505" || String(error.message).toLowerCase().includes("duplicate")) {
            duplicadas++;
            continue;
          }
          toast.error(`Falha ao salvar NF ${nNF}: ${error.message}`);
          continue;
        }
        novas.push({ chave: chaveNorm, nNF, serie, emit: emitXNome, emitCnpj, emitUF: emitUfFin, emitCMun, emitXMun: emitCidFin, emitIE, emitLogradouro: emitLog, emitBairro: emitBai, emitCEP: emitCepFin, emitFone: emitFoneFin, dest: destXNome, destCnpj, destUF: destUfFin, destCMun, destXMun: destCidFin, destIE, destLogradouro: destLog, destBairro: destBai, destCEP: destCepFin, destFone: destFoneFin, valor, peso, data: dhEmi.slice(0, 10), tomador: tomadorNome, tomadorCnpj, tomadorUF, tomadorCMun, tomadorXMun, tomadorIE, tomadorLogradouro: tomadorLog, tomadorBairro: tomadorBai, tomadorCEP: tomadorCep, modFrete });
        upsertContatoFromNfe(emitCnpj, emitXNome, emitIE, emitUF, emitXMun, emitLgr, emitBairro, emitCEP, emitFone, "fornecedor").catch(() => {});
        upsertContatoFromNfe(destCnpj, destXNome, destIE, destUF, destXMun, destLgr, destBairro, destCEP, destFone, "cliente").catch(() => {});
        if (added === 0 && mercadorias.length === 0) {
          const tomaByMod: Record<string, string> = { "0": "0", "1": "3", "2": "4", "3": "0", "4": "3", "9": "4" };
          const tomaIni = tomaByMod[modFrete] ?? "3";
          let tomadorIE = destIE;
          if (modFrete === "0") tomadorIE = emitIE;
          else if (modFrete === "2") tomadorIE = doc.querySelector("transp > transporta > IE")?.textContent || destIE;
          setForm(f => ({
            ...f,
            toma: !f.cnpjTomador ? tomaIni : f.toma,
            cnpjTomador: tomadorCnpj || f.cnpjTomador,
            xNomeTomador: tomadorNome || f.xNomeTomador,
            ieTomador: tomadorIE || f.ieTomador,
            ufTomador: tomadorUF || f.ufTomador,
            cMunTomador: tomadorCMun || f.cMunTomador,
            xMunTomador: tomadorXMun || f.xMunTomador,
            logradouroTomador: tomadorLog || f.logradouroTomador,
            bairroTomador: tomadorBai || f.bairroTomador,
            cepTomador: tomadorCep || f.cepTomador,
            cMunIni: emitCMun || f.cMunIni,
            xMunIni: emitXMun || f.xMunIni,
            ufIni: emitUF || f.ufIni,
            cMunFim: destCMun || f.cMunFim,
            xMunFim: destXMun || f.xMunFim,
            ufFim: destUF || f.ufFim,
            cMunEnv: emitCMun || f.cMunEnv,
            xMunEnv: emitXMun || f.xMunEnv,
            ufEnv: emitUF || f.ufEnv,
          }));
        }
        added++;
      }
      if (added > 0) {
        const merged = [...mercadorias, ...novas];
        setMercadorias(merged);
        const somaV = merged.reduce((a, m) => a + (m.valor || 0), 0);
        const somaP = merged.reduce((a, m) => a + (m.peso || 0), 0);
        setForm(f => ({ ...f, vCarga: somaV.toFixed(2), peso: String(somaP), icmsBase: f.vPrest || "0.00" }));
        qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa!.id] });
        if (duplicadas > 0) toast.success(`${added} importada(s), ${duplicadas} já existiam (chave duplicada bloqueada)`);
        else toast.success(`${added} XML(s) importado(s) — selecione os que irão no CT-e`);
      } else if (duplicadas > 0) {
        toast.info(`${duplicadas} NF-e(s) já importadas anteriormente — dedup por chave (independe de CT-e)`);
      } else {
        toast.info("Nenhum XML novo");
      }
    } catch (e: any) {
      toast.error("Falha ao ler XML", { description: e.message });
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("prefill_cte_from_nfe");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setForm(f => ({ ...f, cnpjTomador: p.destCnpj || f.cnpjTomador, xNomeTomador: p.destXNome || f.xNomeTomador, ufTomador: p.destUF || f.ufTomador, cMunTomador: p.destCMun || f.cMunTomador, xMunTomador: p.destXMun || f.xMunTomador, vCarga: p.vCarga ? String(p.vCarga) : f.vCarga, peso: p.peso ? String(p.peso) : f.peso }));
        setOpen(true);
        localStorage.removeItem("prefill_cte_from_nfe");
      } catch {}
    } else if (search.fromNFe) {
      setOpen(true);
    }
  }, [search.fromNFe]);

  const excluirRascunho = async (doc: CteDoc) => {
    if (!empresa) return;
    if (!confirm("Excluir este rascunho? As NF-e reservadas nele voltam para a lista.")) return;
    try {
      await supabase.from("cte_documentos" as any).delete().eq("id", doc.id);
      // NF-es nunca saíram do "pendente" (reserva, não delete) — só reaparecem na lista
      toast.success("Rascunho excluído — NF-e liberadas para uso");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
    } catch (e: any) {
      toast.error("Erro ao excluir rascunho", { description: e.message });
    }
  };

  const editarRascunho = async (doc: CteDoc) => {
    if (!empresa) return;
    try {
      const parsed = JSON.parse(doc.xml_assinado || "{}");
      if (parsed.form) setForm(parsed.form);
      if (parsed.nfs && parsed.nfs.length > 0) {
        const mapped = parsed.nfs.map((r: any) => ({
          chave: r.chave, nNF: r.nNF || "", serie: r.serie || "1",
          emit: r.emit || "", emitCnpj: r.emitCnpj || "", emitUF: r.emitUF || "", emitCMun: r.emitCMun || "", emitXMun: r.emitXMun || "",
          dest: r.dest || "", destCnpj: r.destCnpj || "", destUF: r.destUF || "", destCMun: r.destCMun || "", destXMun: r.destXMun || "",
          valor: Number(r.valor ?? 0), peso: Number(r.peso ?? 0), data: r.data || "",
          tomador: r.tomador || "", tomadorCnpj: r.tomadorCnpj || "", tomadorUF: r.tomadorUF || "", tomadorCMun: r.tomadorCMun || "", tomadorXMun: r.tomadorXMun || "",
          modFrete: r.modFrete || "",
        }));
        setMercadorias(mapped);
        setSelecionadas(new Set(parsed.chavesNFe || []));
      }
      setEditingRascunhoId(doc.id);
      setOpen(true);
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
    } catch (e: any) {
      toast.error("Erro ao carregar rascunho", { description: e.message });
    }
  };

  const salvarRascunho = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      const nfsSalvas = mercadorias.filter(m => chaves.includes(m.chave)).map(m => ({
        chave: m.chave, nNF: m.nNF, serie: m.serie,
        emit: m.emit, emitCnpj: m.emitCnpj, emitUF: m.emitUF, emitCMun: m.emitCMun, emitXMun: m.emitXMun,
        dest: m.dest, destCnpj: m.destCnpj, destUF: m.destUF, destCMun: m.destCMun, destXMun: m.destXMun,
        valor: m.valor, peso: m.peso, data: m.data,
        tomador: m.tomador, tomadorCnpj: m.tomadorCnpj, tomadorUF: m.tomadorUF, tomadorCMun: m.tomadorCMun, tomadorXMun: m.tomadorXMun,
        modFrete: m.modFrete,
      }));
      const proximo = 1;
      const { error } = await supabase.from("cte_documentos" as any).insert({
        empresa_id: empresa.id,
        status: "rascunho",
        numero: proximo,
        serie: "1",
        valor_servico: parseFloat(form.vPrest) || 0,
        peso_carga: parseFloat(form.peso) || 0,
        xml_assinado: JSON.stringify({ form, chavesNFe: chaves, nfs: nfsSalvas }),
      } as any);
      if (error) throw error;
      if (editingRascunhoId) {
        await supabase.from("cte_documentos" as any).delete().eq("id", editingRascunhoId);
      }
      // NÃO deleta as NF-es: elas continuam "pendente" no banco e ficam ocultas
      // da listagem via chavesEmRascunho (reserva). Assim emissão/cancelamento
      // sempre encontram as linhas para embarcar/reverter.
    },
    onSuccess: () => {
      toast.success("Rascunho salvo");
      setMercadorias([]);
      setSelecionadas(new Set());
      setEditingRascunhoId(null);
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa!.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reconciliação pós-emissão: se a resposta se perder no transporte, a verdade
  // está em cte_documentos. Procura doc criado a partir do início da tentativa.
  const emitT0 = useRef(0);
  const emitChaves = useRef<string[]>([]);
  const emitRascunhoId = useRef<string | null>(null);
  const reconciliarEmissao = async (erroOriginal?: string) => {
    await new Promise(r => setTimeout(r, 2500));
    if (!empresa) { toast.error(erroOriginal || "Sem retorno do servidor"); return; }
    try {
      const { data } = await supabase.from("cte_documentos" as any)
        .select("chave_acesso,status,motivo_rejeicao,protocolo_sefaz,numero,created_at")
        .eq("empresa_id", empresa.id).eq("ambiente", form.ambiente)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const doc: any = data;
      if (doc && new Date(doc.created_at).getTime() >= emitT0.current - 5000) {
        if (doc.status === "autorizado") {
          toast.success(`CT-e ${doc.chave_acesso} autorizado` + (doc.protocolo_sefaz ? ` prot ${doc.protocolo_sefaz}` : ""));
          const rid = emitRascunhoId.current;
          if (rid) {
            await supabase.from("cte_documentos" as any).delete().eq("id", rid);
            emitRascunhoId.current = null;
            setEditingRascunhoId(null);
          }
          const chavesUsadas = emitChaves.current;
          if (chavesUsadas.length > 0) setMercadorias(prev => prev.filter(m => !chavesUsadas.includes(m.chave)));
          setSelecionadas(new Set());
        } else if (doc.status === "rejeitado") {
          toast.error(doc.motivo_rejeicao || "Rejeitado pela SEFAZ");
        } else {
          toast.info(`CT-e ${doc.numero ?? ""} está como "${doc.status}" — verifique a lista.`);
        }
      } else {
        toast.error(erroOriginal || "Sem retorno do servidor e nenhum CT-e novo — verifique a lista.");
      }
    } catch {
      toast.error(erroOriginal || "Sem retorno do servidor — verifique a lista.");
    }
    qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
  };

  const emitir = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!form.xNomeTomador || !form.cnpjTomador) throw new Error("Informe tomador");
      if (!form.ieTomador) toast.warning("IE do tomador não informado — o SEFAZ pode rejeitar");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      emitT0.current = Date.now();
      emitChaves.current = chaves;
      emitRascunhoId.current = editingRascunhoId;
      if (chaves.length > 0) {
        const sel = mercadorias.filter(m => chaves.includes(m.chave));
        const dests = new Set(sel.map(m => m.destCnpj || m.dest));
        const emits = new Set(sel.map(m => m.emitCnpj || m.emit));
        const tomads = new Set(sel.map(m => m.tomadorCnpj || m.tomador));
        if (emits.size > 1) throw new Error("CT-e não pode ter remetentes diferentes. Selecione NF-es do mesmo remetente.");
        if (dests.size > 1) throw new Error("CT-e não pode ter destinatários diferentes. Selecione NF-es do mesmo destinatário.");
        if (tomads.size > 1) throw new Error("CT-e não pode ter tomadores diferentes. Selecione NF-es do mesmo tomador.");
      }
      const ret: any = await emitirCteFn({ data: { empresaId: empresa.id, input: {
        ambiente: form.ambiente, modelo: form.modelo,
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, vPrest: parseFloat(form.vPrest)||0, vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: form.rntrc,
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        icms: { CST: form.icmsCST, vBC: parseFloat(form.vPrest)||0, pICMS: parseFloat(form.icmsAliq)||0, vICMS: parseFloat(form.icmsValor)||0 },
        impostos: { pisAliq: parseFloat(form.pisAliq)||0, cofinsAliq: parseFloat(form.cofinsAliq)||0, irAliq: parseFloat(form.irAliq)||0, inssAliq: parseFloat(form.inssAliq)||0, csllAliq: parseFloat(form.csllAliq)||0 },
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador, ie: form.ieTomador || undefined, logradouro: form.logradouroTomador || undefined, nro: form.nroTomador || undefined, bairro: form.bairroTomador || undefined, cep: form.cepTomador || undefined, fone: form.foneTomador || undefined, email: form.emailTomador || undefined },
        emit: { xNome: empresa.razao_social || empresa.nome_fantasia, ie: empresa.ie || "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv, uf: empresa.uf || "MG", cnpj: empresa.cnpj, crt: empresa.regime_tributario || "3", logradouro: empresa.logradouro, nro: empresa.numero, bairro: empresa.bairro, cep: empresa.cep } as any,
        chavesNFe: chaves,
      } } });
    },
    onSuccess: async (ret: any) => {
      console.log("[CTE-EMITIR-RESP]", JSON.stringify({ sucesso: ret?.sucesso, cStat: ret?.cStat, xMotivo: ret?.xMotivo, motivo: ret?.motivo, chave: ret?.chave, protocolo: ret?.protocolo }));
      if (ret?.sucesso) {
        toast.success(`CT-e ${ret.chave} autorizado` + (ret.protocolo ? ` prot ${ret.protocolo}` : ""));
        setOpen(false);
        if (editingRascunhoId) {
          await supabase.from("cte_documentos" as any).delete().eq("id", editingRascunhoId);
          setEditingRascunhoId(null);
        }
        const chavesUsadas = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
        if (empresa && chavesUsadas.length > 0) {
          const { error: embErr } = await supabase.from("cte_nfes_pendentes" as any).update({ status: "embarcada" }).in("chave", chavesUsadas).eq("empresa_id", empresa.id);
          if (embErr) toast.error(`CT-e autorizado, mas falha ao baixar NF-e da lista: ${embErr.message}`);
          // remove da listagem na hora (não depende do refetch)
          setMercadorias(prev => prev.filter(m => !chavesUsadas.includes(m.chave)));
          setSelecionadas(new Set());
          qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
        }
      } else {
        // resposta vazia: reconcilia com o banco (fonte da verdade)
        await reconciliarEmissao();
        return;
      }
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => {
      console.error("[CTE-EMITIR-ERR]", e);
      // pode ser erro de validação (sem ida ao servidor) ou transporte perdido:
      // a reconciliação decide — mostra a mensagem original se nada novo existir
      void reconciliarEmissao(`Falha no envio: ${e.message}`);
    },
  });

  const consultar = useMutation({
    mutationFn: async (chave: string) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      return consultarCteFn({ data: { empresaId: empresa.id, chave } });
    },
    onSuccess: (ret: any) => toast.success(`Consulta: ${ret?.cStat || "?"} ${ret?.xMotivo || ""}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async ({ chave, protocolo, justificativa }: { chave: string; protocolo?: string; justificativa: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const just = (justificativa || "").trim();
      if (just.length < 15) throw new Error("Justificativa muito curta (mín. 15 caracteres)");
      const ret = await cancelarCteFn({ data: { empresaId: empresa.id, chave, justificativa: just, protocolo } });
      return { ...ret, chave };
    },
    onSuccess: async (ret: any) => {
      if ((ret as any)?.sucesso) {
        toast.success("CT-e cancelado");
        if (empresa && ret?.chave) {
          const { data: doc } = await supabase.from("cte_documentos" as any).select("xml_assinado").eq("chave_acesso", ret.chave).maybeSingle();
          let xmlStr = doc?.xml_assinado || "";
          try { const p = JSON.parse(xmlStr); if (p.xml) xmlStr = p.xml; } catch {}
          const chavesNfe = [...xmlStr.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map((m: any)=>m[1]);
          console.log("[CTE-CANCEL-REVERT] chave:", ret.chave, "chavesNfe:", chavesNfe);
          if (chavesNfe.length > 0) {
            const { data: revertidas, error } = await supabase.from("cte_nfes_pendentes" as any).update({ status: "pendente" }).in("chave", chavesNfe).eq("empresa_id", empresa.id).select("id");
            console.log("[CTE-CANCEL-REVERT] revertidas:", revertidas?.length, "update error:", error);
            if (error) toast.error(`CT-e cancelado, mas falha ao devolver NF-e: ${error.message}`);
            else if ((revertidas?.length || 0) < chavesNfe.length) toast.info("CT-e cancelado. Algumas NF-es não estavam mais na base — reimporte o XML se precisar.");
            qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          }
        }
      } else toast.error((ret as any).xMotivo || "Falha ao cancelar");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{ xml: string; chave: string; proximo: string; ambiente: string; form: any } | null>(null);
  const previewXml = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      return previewCteXmlFn({ data: { empresaId: empresa.id, input: {
        ambiente: form.ambiente, modelo: form.modelo,
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, vPrest: parseFloat(form.vPrest)||0, vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: form.rntrc,
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        icms: { CST: form.icmsCST, vBC: parseFloat(form.vPrest)||0, pICMS: parseFloat(form.icmsAliq)||0, vICMS: parseFloat(form.icmsValor)||0 },
        impostos: { pisAliq: parseFloat(form.pisAliq)||0, cofinsAliq: parseFloat(form.cofinsAliq)||0, irAliq: parseFloat(form.irAliq)||0, inssAliq: parseFloat(form.inssAliq)||0, csllAliq: parseFloat(form.csllAliq)||0 },
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador, ie: form.ieTomador || undefined, logradouro: form.logradouroTomador || undefined, nro: form.nroTomador || undefined, bairro: form.bairroTomador || undefined, cep: form.cepTomador || undefined, fone: form.foneTomador || undefined, email: form.emailTomador || undefined },
        emit: { xNome: empresa.razao_social || empresa.nome_fantasia, ie: empresa.ie || "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv, uf: empresa.uf || "MG", cnpj: empresa.cnpj, crt: empresa.regime_tributario || "3", logradouro: empresa.logradouro, nro: empresa.numero, bairro: empresa.bairro, cep: empresa.cep } as any,
        chavesNFe: chaves,
      } } });
    },
    onSuccess: (ret: any) => {
      setPreviewData(ret);
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <PageHeader eyebrow="Fiscal" title="CT-e" description="Conhecimento de Transporte Eletrônico (57) — emissão robusta estilo STM, com múltiplas NF-es por CT-e." actions={<Button size="sm" onClick={() => { setForm(emptyForm); setSelecionadas(new Set()); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Novo CT-e</Button>} />

      {/* Cadastro de Mercadorias para Embarque — estilo STM */}
      <Card className="overflow-hidden border-2 border-primary/20 shadow-panel">
        <div className="bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> Cadastro de Mercadorias para Embarque</h3>
          <span className="text-xs opacity-80">CT-e Avulso • Sem Mercadoria/Percurso</span>
        </div>
        <CardContent className="p-3 space-y-3 bg-muted/20 overflow-visible">
          <div className="border rounded p-2 bg-background space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold text-primary">Embarque via CT-e</Label>
                <div className="flex flex-col gap-1 mt-1 text-xs">
                  <label className="flex items-center gap-1"><input type="radio" checked readOnly /> CT-e Avulso</label>
                  <label className="flex items-center gap-1 opacity-60"><input type="radio" disabled /> CT-e Redes­pacho</label>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-primary">Situação de Embarque</Label>
                <div className="flex flex-col gap-1 mt-1 text-xs">
                  <label className="flex items-center gap-1"><input type="radio" checked readOnly /> Pendentes de Liberação</label>
                  <label className="flex items-center gap-1 opacity-60"><input type="radio" disabled /> Embarques Liberados</label>
                </div>
              </div>
                <div>
                <Label className="text-xs font-semibold text-primary">Período de Entrada</Label>
                <div className="flex items-center gap-1.5 mt-1">
                  <DateInput value={periodoIni} onChange={setPeriodoIni} className="h-7 text-xs flex-1 min-w-0" />
                  <span className="text-xs shrink-0">Até</span>
                  <DateInput value={periodoFim} onChange={setPeriodoFim} className="h-7 text-xs flex-1 min-w-0" />
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 px-2"><Search className="h-3 w-3 mr-1" />Consulta</Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground border-t pt-2">
              <span>Qtde NF-e: <span className="font-bold text-foreground">{mercadorias.length}</span></span>
              <span className="text-muted-foreground/40">•</span>
              <span>Peso Bruto: <span className="font-bold text-foreground">{Number(mercadorias.reduce((a,m)=>a+m.peso,0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span></span>
              <span className="text-muted-foreground/40">•</span>
              <span>Valor: <span className="font-bold text-foreground">{brl(mercadorias.reduce((a,m)=>a+m.valor,0))}</span></span>
            </div>
          </div>

          {/* Listagem das Notas Fiscais */}
          <div className="border rounded overflow-hidden bg-background">
            <div className="bg-sky-600 text-white px-2 py-1 flex items-center justify-between">
              <span className="text-xs font-semibold">Listagem das Notas Fiscais</span>
              <span className="text-xs">Qtde NF-e: {mercadorias.length}</span>
            </div>
            <div className="overflow-x-auto max-h-[220px]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="w-6">
                      <input
                        type="checkbox"
                        checked={mercadorias.length > 0 && selecionadas.size === mercadorias.length}
                        onChange={e => {
                          if (e.target.checked) {
                            const dests = new Set(mercadorias.map(m => m.destCnpj || m.dest));
                            if (dests.size > 1) {
                              toast.error("Não pode selecionar NF-es com destinos diferentes");
                              return;
                            }
                            setSelecionadas(new Set(mercadorias.map(m => m.chave)));
                          } else setSelecionadas(new Set());
                        }}
                      />
                    </TableHead>
                    {([
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
                    ] as const).map(col => (
                      <TableHead
                        key={col.key}
                        className="text-xs cursor-pointer select-none hover:bg-muted/80"
                        onClick={() => setSortConfig(s => s.key === col.key ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: col.key, dir: "asc" })}
                      >
                        {col.label}
                        {sortConfig.key === col.key && <span className="ml-1">{sortConfig.dir === "asc" ? "▲" : "▼"}</span>}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mercadorias.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-8">Nenhuma NF-e importada. Use "Importar NFes (XML)" abaixo.</TableCell></TableRow>
                  ) : (
                    mercadoriasSorted.map((m) => (
                      <TableRow key={m.chave} className="text-xs" data-selected={selecionadas.has(m.chave)}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selecionadas.has(m.chave)}
                            onChange={e => {
                              const next = new Set(selecionadas);
                              if (e.target.checked) {
                                next.add(m.chave);
                                const sel = mercadorias.filter(x => next.has(x.chave));
                                const dests = new Set(sel.map(x => x.destCnpj || x.dest));
                                if (dests.size > 1) {
                                  toast.error("Não pode emitir o mesmo CT-e para destinos diferentes");
                                  next.delete(m.chave);
                                }
                              } else next.delete(m.chave);
                              setSelecionadas(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="truncate max-w-[110px]" title={m.emit}>{m.emit}</TableCell>
                        <TableCell className="font-mono text-[10px]">{m.emitCnpj ? m.emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</TableCell>
                        <TableCell className="truncate max-w-[110px]" title={m.dest}>{m.dest}</TableCell>
                        <TableCell className="font-mono text-[10px]">{m.destCnpj ? m.destCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</TableCell>
                        <TableCell className="truncate max-w-[110px] text-amber-700" title={m.tomador}>{m.tomador || "—"}</TableCell>
                        <TableCell className="font-mono">{m.nNF}</TableCell>
                        <TableCell>{m.serie}</TableCell>
                        <TableCell>{m.data ? dateBR(m.data) : "—"}</TableCell>
                        <TableCell className="text-right">{brl(m.valor)}</TableCell>
                        <TableCell className="text-right">{Number(m.peso).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Ações de importação múltipla */}
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 px-3 py-2 border rounded bg-amber-100 dark:bg-amber-900/30 cursor-pointer hover:bg-amber-200 text-xs font-medium">
              <UploadCloud className="h-4 w-4" /> Importar NFes (XML)
              <input type="file" accept=".xml" multiple className="hidden" onChange={e => { if (e.target.files) handleImportNFeXml(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            <Button variant="outline" size="sm" onClick={async () => { if (!empresa) return; const visiveis = mercadorias.map(m => m.chave); if (visiveis.length === 0) return; if (!confirm(`Remover ${visiveis.length} NF-e(s) pendentes? (as reservadas em rascunho são mantidas)`)) return; const { error } = await supabase.from("cte_nfes_pendentes" as any).delete().in("chave", visiveis).eq("empresa_id", empresa.id).eq("status", "pendente"); if (error) toast.error(error.message); else { setMercadorias([]); setSelecionadas(new Set()); qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] }); toast.success("Pendentes removidos"); } }} disabled={mercadorias.length===0}><Trash2 className="mr-1 h-3 w-3" /> Limpar</Button>
            <Button variant="outline" size="sm" onClick={async () => { if (!empresa) return; try { await excluirRejeitadosCteFn({ data: { empresaId: empresa.id } }); toast.success("CT-e rejeitados excluídos"); qc.invalidateQueries({ queryKey: ["cte-documentos"] }); } catch(e:any) { toast.error(e.message); } }}><Trash2 className="mr-1 h-3 w-3" /> Limpar Rejeitados</Button>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selecionadas.size===0}
                onClick={() => {
                  if (selecionadas.size===0) { toast.error("Selecione ao menos uma NF-e"); return; }
                  const sel = mercadorias.filter(m => selecionadas.has(m.chave));
                  const dests = new Set(sel.map(m => m.destCnpj || m.dest));
                  const emits = new Set(sel.map(m => m.emitCnpj || m.emit));
                  const tomads = new Set(sel.map(m => m.tomadorCnpj || m.tomador));
                  if (emits.size > 1) { toast.error("Remetentes diferentes"); return; }
                  if (dests.size > 1) { toast.error("Destinatários diferentes"); return; }
                  if (tomads.size > 1) { toast.error("Tomadores diferentes"); return; }
                  const somaV = sel.reduce((a,m)=>a+m.valor,0);
                  const somaP = sel.reduce((a,m)=>a+m.peso,0);
                  const first = sel[0] as typeof sel[0] & { modFrete?: string; tomadorUF?: string; tomadorCMun?: string; tomadorXMun?: string; emitUF?: string; emitCMun?: string; emitXMun?: string; destUF?: string; destCMun?: string; destXMun?: string };
                  const tomaByMod: Record<string,string> = { "0":"0", "1":"3", "2":"4", "3":"0", "4":"3", "9":"4" };
                  const tomaSel = (first as any).modFrete ? (tomaByMod[(first as any).modFrete] ?? "3") : "3";
                  setForm(f => ({
                    ...f,
                    toma: tomaSel,
                    cnpjTomador: (first as any).tomadorCnpj || first.destCnpj || f.cnpjTomador,
                    xNomeTomador: (first as any).tomador || first.dest || f.xNomeTomador,
                    ufTomador: (first as any).tomadorUF || f.ufTomador,
                    cMunTomador: (first as any).tomadorCMun || f.cMunTomador,
                    xMunTomador: (first as any).tomadorXMun || f.xMunTomador,
                    ieTomador: (first as any).tomadorIE || f.ieTomador,
                    logradouroTomador: (first as any).tomadorLogradouro || f.logradouroTomador,
                    bairroTomador: (first as any).tomadorBairro || f.bairroTomador,
                    cepTomador: (first as any).tomadorCEP || f.cepTomador,
                    cMunIni: (first as any).emitCMun || f.cMunIni,
                    xMunIni: (first as any).emitXMun || f.xMunIni,
                    ufIni: (first as any).emitUF || f.ufIni,
                    cMunFim: (first as any).destCMun || f.cMunFim,
                    xMunFim: (first as any).destXMun || f.xMunFim,
                    ufFim: (first as any).destUF || f.ufFim,
                    cMunEnv: (first as any).emitCMun || f.cMunEnv,
                    xMunEnv: (first as any).emitXMun || f.xMunEnv,
                    ufEnv: (first as any).emitUF || f.ufEnv,
                    vCarga: somaV.toFixed(2),
                    peso: String(somaP),
                    icmsBase: f.vPrest || "0.00",
                  }));
                  setOpen(true);
                }}
              >
                Gerar CT-e com {selecionadas.size || 0} selecionada(s)
              </Button>
              <Button size="sm" onClick={() => { setForm(emptyForm); setSelecionadas(new Set()); setOpen(true); }}><Plus className="mr-1 h-3 w-3" /> Novo CT-e avulso</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="mb-2">
            <TabsTrigger value="autorizados" className="text-xs">Autorizados ({docsByStatus.autorizados.length})</TabsTrigger>
            <TabsTrigger value="rejeitados" className="text-xs">Rejeitados ({docsByStatus.rejeitados.length})</TabsTrigger>
            <TabsTrigger value="cancelados" className="text-xs">Cancelados ({docsByStatus.cancelados.length})</TabsTrigger>
            <TabsTrigger value="rascunhos" className="text-xs">Rascunhos ({docsByStatus.rascunhos.length})</TabsTrigger>
          </TabsList>
          {filteredDocs.length === 0 ? (
            <EmptyState icon={Truck} title="Nenhum CT-e" description={`Nenhum CT-e ${statusTab}.`} />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Série</TableHead><TableHead>Status</TableHead><TableHead>Notas Fiscais</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Chave</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
                <TableBody>{filteredDocs.map(d => {
                  const nNFs = (() => { try { const j = JSON.parse(d.xml_assinado || "{}"); return j.nfs?.map((n: any) => n.nNF).filter(Boolean) || []; } catch { } try { const chaves = [...(d.xml_assinado||"").matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m=>m[1]); if (chaves.length===0) return []; return chaves.map(ch=>ch.slice(25,34).replace(/^0+/,"") || "0"); } catch { return []; } })();
                  const isRascunho = d.status === "rascunho";
                  return (
                  <TableRow key={d.id} className={isRascunho ? "bg-muted/30" : ""}><TableCell className="font-mono">{d.numero ?? "—"}</TableCell><TableCell>{d.serie ?? "—"}</TableCell><TableCell title={d.status==="rejeitado" && d.motivo_rejeicao ? d.motivo_rejeicao : ""}><Badge variant="secondary" className={d.status==="autorizado"?"bg-emerald-500/15 text-emerald-600":d.status==="rejeitado"?"bg-destructive/15 text-destructive":d.status==="cancelado"?"bg-orange-500/15 text-orange-600":isRascunho?"bg-amber-500/15 text-amber-600":""}>{d.status}{d.status==="rejeitado" && d.motivo_rejeicao ? ` — ${d.motivo_rejeicao.slice(0,60)}` : ""}</Badge></TableCell>                  <TableCell className="text-xs">{nNFs.length > 0 ? nNFs.join(", ") : d.chave_acesso ? "1" : "—"}</TableCell><TableCell className="text-right">{brl(Number(d.valor_servico ?? 0))}</TableCell><TableCell className="font-mono text-xs break-all" title={d.chave_acesso||""}>{d.chave_acesso ?? "—"}</TableCell><TableCell className="flex gap-1">
                    {isRascunho ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => editarRascunho(d)} title="Editar rascunho"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluirRascunho(d)} title="Excluir rascunho"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => d.chave_acesso && consultar.mutate(d.chave_acesso)} title="Consultar SEFAZ"><Search className="h-3.5 w-3.5" /></Button>
                        {d.status === "autorizado" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-sky-600" onClick={() => downloadXml(d)} title="Baixar XML"><FileCode className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => downloadPdf(d)} title="Baixar DACTE (PDF)"><Download className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </>
                    )}
                    {!isRascunho && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={d.status!=="autorizado"} onClick={() => d.chave_acesso && setCancelTarget({ chave: d.chave_acesso, protocolo: d.protocolo_sefaz || undefined, numero: (d as any).numero ?? null })} title="Cancelar"><Ban className="h-3.5 w-3.5" /></Button>}
                  </TableCell></TableRow>
                  );
                })}</TableBody>
              </Table>
            </Card>
          )}
        </Tabs>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Conhecimento de Transporte Avulso</DialogTitle>
            <p className="text-sm text-muted-foreground">Emissão de CT-e (57) — versão 4.00 via mTLS SEFAZ.</p>
          </DialogHeader>

          {/* Templates: mesmo remetente/destino/tomador do dia anterior */}
          <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1.5"><FileCode className="h-3.5 w-3.5 text-primary" /> Templates</span>
              <span className="text-[10px] text-muted-foreground">{templates?.length ?? 0} salvo(s)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <div className="flex gap-1.5">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Selecione um template" /></SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nome} — {t.x_nome_tomador || t.cnpj_tomador || t.cfop}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedTemplateId} onClick={() => { const t = templates?.find(x => x.id === selectedTemplateId); if (t) aplicarTemplate(t); }}>Aplicar</Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={!selectedTemplateId} onClick={() => { if (selectedTemplateId && confirm("Excluir template?")) excluirTemplate.mutate(selectedTemplateId); }} title="Excluir template"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="flex gap-1.5">
                <Input className="h-7 text-xs flex-1" placeholder="Nome do template (ex: Rose→SP CIF)" value={templateNome} onChange={e => setTemplateNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && templateNome.trim()) salvarTemplate.mutate(); }} />
                <Button size="sm" className="h-7 text-xs" disabled={!templateNome.trim() || salvarTemplate.isPending} onClick={() => salvarTemplate.mutate()}>{salvarTemplate.isPending ? "Salvando..." : "Salvar atual"}</Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Salva tomador, CFOP, RNTRC e rota (coleta/entrega). Amanhã basta selecionar e clicar Aplicar — ainda respeita a NF-e se quiser sobrescrever.</p>
          </div>

          <Tabs defaultValue="tomador" className="w-full">
            <TabsList className="w-full justify-start gap-0 bg-muted/50 rounded-t-md">
              <TabsTrigger value="tomador" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><UsersRound className="mr-1 h-3 w-3" />Remetente/Destinatário</TabsTrigger>
              <TabsTrigger value="docs" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="mr-1 h-3 w-3" />Doc Mercadorias</TabsTrigger>
              <TabsTrigger value="seguros" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><Truck className="mr-1 h-3 w-3" />Seguros/Veículos</TabsTrigger>
              <TabsTrigger value="taxas" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="mr-1 h-3 w-3" />Taxas/Despesas</TabsTrigger>
              <TabsTrigger value="impostos" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><ReceiptText className="mr-1 h-3 w-3" />Impostos</TabsTrigger>
            </TabsList>

            {/* Header: Nº Conhecimento, Data, CFOP */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded-b-md rounded-tr-md p-3 bg-muted/20">
              <div>
                <Label className="text-[10px] text-muted-foreground">Ambiente</Label>
                <ToggleGroup type="single" value={form.ambiente} onValueChange={v => { if (v) setForm({...form, ambiente: v as "homologacao" | "producao"}); }} className="bg-background border rounded-md h-7 mt-0.5">
                  <ToggleGroupItem value="homologacao" className="h-6 text-[10px] px-2 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">Homologação</ToggleGroupItem>
                  <ToggleGroupItem value="producao" className="h-6 text-[10px] px-2 data-[state=on]:bg-green-600/10 data-[state=on]:text-green-700">Produção</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div><Label className="text-[10px] text-muted-foreground">N° Conhecimento</Label><Input className="h-7 text-xs font-mono" value="— aguardando emissão —" readOnly /></div>
              <div><Label className="text-[10px] text-muted-foreground">Data Emissão</Label><DateInput value={form.dataEmissao} onChange={v => setForm({...form, dataEmissao: v})} className="h-7 text-xs" /></div>
              <div>
                <Label className="text-[10px] text-muted-foreground">CFOP Saída</Label>
                <Popover open={cfopOpen} onOpenChange={setCfopOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={cfopOpen} className="h-7 text-xs justify-between w-full font-normal">
                      <span className="truncate text-left">{CFOPS_CTE.find(c => c.codigo === form.cfop)?.descricao || CFOPS_CTE.find(c => c.codigo.replace(/\D/g,"") === form.cfop.replace(/\D/g,""))?.descricao || form.cfop || "Selecione CFOP"}</span>
                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[480px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Digite 5352 ou 5.352 ou comércio..." value={cfopQuery} onValueChange={setCfopQuery} />
                      <CommandList>
                        <CommandEmpty>Nenhum CFOP encontrado.</CommandEmpty>
                        <CommandGroup>
                          {CFOPS_CTE.filter(cf => {
                            if (!cfopQuery) return true;
                            const q = cfopQuery.toLowerCase();
                            const qDigits = q.replace(/\D/g, "");
                            const codeDigits = cf.codigo.replace(/\D/g, "");
                            const descLower = cf.descricao.toLowerCase();
                            const descDigits = cf.descricao.replace(/\D/g, "");
                            return (qDigits && (codeDigits.includes(qDigits) || descDigits.includes(qDigits))) || descLower.includes(q) || cf.codigo.includes(cfopQuery);
                          }).map(cf => (
                            <CommandItem key={cf.codigo} value={cf.codigo} onSelect={() => { setForm({ ...form, cfop: cf.codigo }); setCfopOpen(false); setCfopQuery(""); }}>
                              <Check className={"mr-2 h-3 w-3 " + (form.cfop === cf.codigo ? "opacity-100" : "opacity-0")} />
                              {cf.descricao}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-[9px] text-muted-foreground mt-1">Digite só números (5352) — salva com ponto (5.352) na descrição.</p>
              </div>
            </div>

            {/* === TAB: Remetente/Destinatário === */}
            <TabsContent value="tomador" className="mt-3 space-y-3">
              {mercadorias.length > 0 ? (() => {
                const sel = mercadorias.filter(m => selecionadas.has(m.chave));
                const active = sel.length > 0 ? sel[0] : mercadorias[0];
                return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Remetente */}
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded bg-emerald-500/10 grid place-items-center"><UploadCloud className="h-3.5 w-3.5 text-emerald-600" /></div>
                      <h5 className="text-xs font-semibold">Remetente</h5>
                    </div>
                    <div className="space-y-0.5 text-[10px]">
                      <p className="font-medium text-xs">{active.emit || "—"}</p>
                      <p className="text-muted-foreground">CNPJ: {active.emitCnpj ? active.emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"} {active.emitIE ? `IE: ${active.emitIE}` : ""}</p>
                      <p className="text-muted-foreground">{[active.emitLogradouro, active.emitBairro].filter(Boolean).join(", ") || "—"}</p>
                      <p className="text-muted-foreground">{active.emitXMun || "—"}-{active.emitUF || "—"} {active.emitCEP ? `CEP: ${active.emitCEP}` : ""}</p>
                      {active.emitFone && <p className="text-muted-foreground">Fone: {active.emitFone}</p>}
                    </div>
                  </Card>

                  {/* Destinatário */}
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded bg-sky-500/10 grid place-items-center"><Package className="h-3.5 w-3.5 text-sky-600" /></div>
                      <h5 className="text-xs font-semibold">Destinatário</h5>
                    </div>
                    <div className="space-y-0.5 text-[10px]">
                      <p className="font-medium text-xs">{active.dest || "—"}</p>
                      <p className="text-muted-foreground">CNPJ: {active.destCnpj ? active.destCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"} {active.destIE ? `IE: ${active.destIE}` : ""}</p>
                      <p className="text-muted-foreground">{[active.destLogradouro, active.destBairro].filter(Boolean).join(", ") || "—"}</p>
                      <p className="text-muted-foreground">{active.destXMun || "—"}-{active.destUF || "—"} {active.destCEP ? `CEP: ${active.destCEP}` : ""}</p>
                      {active.destFone && <p className="text-muted-foreground">Fone: {active.destFone}</p>}
                    </div>
                  </Card>
                </div>
                );
              })() : <p className="text-xs text-muted-foreground">Importe NF-es para preencher remetente e destinatário</p>}

              {/* Consignatário */}
              <Card className="p-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-5 w-5 rounded bg-amber-500/10 grid place-items-center"><Building2 className="h-3 w-3 text-amber-600" /></div>
                  <h5 className="text-xs font-semibold">Consignatário</h5>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  <Input className="h-6 text-[10px] col-span-2" placeholder="CNPJ" value={form.cnpjConsignatario || ""} onChange={e=>setForm({...form,cnpjConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px] col-span-3" placeholder="Nome / Razão Social" value={form.xNomeConsignatario || ""} onChange={e=>setForm({...form,xNomeConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="IE" value={form.ieConsignatario || ""} onChange={e=>setForm({...form,ieConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="UF" value={form.ufConsignatario || ""} onChange={e=>setForm({...form,ufConsignatario:e.target.value.toUpperCase()})} maxLength={2} />
                  <Input className="h-6 text-[10px] col-span-3" placeholder="Município" value={form.xMunConsignatario || ""} onChange={e=>setForm({...form,xMunConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="CEP" value={form.cepConsignatario || ""} onChange={e=>setForm({...form,cepConsignatario:e.target.value})} maxLength={8} />
                  <Input className="h-6 text-[10px] col-span-4" placeholder="Logradouro" value={form.logradouroConsignatario || ""} onChange={e=>setForm({...form,logradouroConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Nº" value={form.nroConsignatario || ""} onChange={e=>setForm({...form,nroConsignatario:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Bairro" value={form.bairroConsignatario || ""} onChange={e=>setForm({...form,bairroConsignatario:e.target.value})} />
                </div>
              </Card>

              {/* Redespacho */}
              <Card className="p-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-5 w-5 rounded bg-violet-500/10 grid place-items-center"><Truck className="h-3 w-3 text-violet-600" /></div>
                  <h5 className="text-xs font-semibold">Redespacho</h5>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  <Input className="h-6 text-[10px] col-span-2" placeholder="CNPJ" value={form.cnpjRedespacho || ""} onChange={e=>setForm({...form,cnpjRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px] col-span-3" placeholder="Nome / Razão Social" value={form.xNomeRedespacho || ""} onChange={e=>setForm({...form,xNomeRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="IE" value={form.ieRedespacho || ""} onChange={e=>setForm({...form,ieRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="UF" value={form.ufRedespacho || ""} onChange={e=>setForm({...form,ufRedespacho:e.target.value.toUpperCase()})} maxLength={2} />
                  <Input className="h-6 text-[10px] col-span-3" placeholder="Município" value={form.xMunRedespacho || ""} onChange={e=>setForm({...form,xMunRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="CEP" value={form.cepRedespacho || ""} onChange={e=>setForm({...form,cepRedespacho:e.target.value})} maxLength={8} />
                  <Input className="h-6 text-[10px] col-span-4" placeholder="Logradouro" value={form.logradouroRedespacho || ""} onChange={e=>setForm({...form,logradouroRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Nº" value={form.nroRedespacho || ""} onChange={e=>setForm({...form,nroRedespacho:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Bairro" value={form.bairroRedespacho || ""} onChange={e=>setForm({...form,bairroRedespacho:e.target.value})} />
                </div>
              </Card>

              {/* Tomador */}
              <Card className="p-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-5 w-5 rounded bg-primary/10 grid place-items-center"><UsersRound className="h-3 w-3 text-primary" /></div>
                  <h5 className="text-xs font-semibold">Tomador do Serviço</h5>
                  <span className="text-[10px] text-muted-foreground">(toma {form.toma})</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  <Select value={form.toma} onValueChange={v => setForm({...form, toma: v})}>
                    <SelectTrigger className="h-6 text-[10px] col-span-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOD_FRETE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="h-6 text-[10px] col-span-2" placeholder="CNPJ *" value={form.cnpjTomador} onChange={e=>setForm({...form,cnpjTomador:e.target.value})} />
                  <Input className="h-6 text-[10px] col-span-2" placeholder="Nome / Razão Social *" value={form.xNomeTomador} onChange={e=>setForm({...form,xNomeTomador:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="UF" value={form.ufTomador} onChange={e=>setForm({...form,ufTomador:e.target.value.toUpperCase()})} maxLength={2} />
                  <Input className="h-6 text-[10px] col-span-2" placeholder="Município" value={form.xMunTomador} onChange={e=>setForm({...form,xMunTomador:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="IE" value={form.ieTomador} onChange={e=>setForm({...form,ieTomador:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="CEP" value={form.cepTomador} onChange={e=>setForm({...form,cepTomador:e.target.value})} maxLength={8} />
                  <Input className="h-6 text-[10px] col-span-3" placeholder="Logradouro" value={form.logradouroTomador} onChange={e=>setForm({...form,logradouroTomador:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Nº" value={form.nroTomador} onChange={e=>setForm({...form,nroTomador:e.target.value})} />
                  <Input className="h-6 text-[10px]" placeholder="Bairro" value={form.bairroTomador} onChange={e=>setForm({...form,bairroTomador:e.target.value})} />
                  <Input className="h-6 text-[10px] col-span-2" placeholder="Telefone" value={form.foneTomador} onChange={e=>setForm({...form,foneTomador:e.target.value})} />
                  <Input className="h-6 text-[10px] col-span-2" placeholder="E-mail" value={form.emailTomador} onChange={e=>setForm({...form,emailTomador:e.target.value})} />
                </div>
              </Card>

              {/* Rota: Origem / Destino */}
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded bg-sky-500/10 grid place-items-center"><RouteIcon className="h-3.5 w-3.5 text-sky-600" /></div>
                  <h5 className="text-xs font-semibold">Rota — Local Coleta / Local Entrega</h5>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <Input className="h-7 text-xs md:col-span-2" placeholder="Local Coleta" value={form.xMunIni} onChange={e=>setForm({...form,xMunIni:e.target.value})} />
                  <Input className="h-7 text-xs" placeholder="UF" value={form.ufIni} onChange={e=>setForm({...form,ufIni:e.target.value.toUpperCase()})} maxLength={2} />
                  <Input className="h-7 text-xs md:col-span-2" placeholder="Local Entrega" value={form.xMunFim} onChange={e=>setForm({...form,xMunFim:e.target.value})} />
                  <Input className="h-7 text-xs" placeholder="UF" value={form.ufFim} onChange={e=>setForm({...form,ufFim:e.target.value.toUpperCase()})} maxLength={2} />
                </div>
              </Card>
            </TabsContent>

            {/* === TAB: Doc Mercadorias === */}
            <TabsContent value="docs" className="mt-3">
              <Card className="overflow-hidden">
                <div className="bg-sky-600 text-white px-3 py-1.5 text-xs font-semibold">Mercadorias Transportadas — {mercadorias.filter(m => selecionadas.has(m.chave)).length || mercadorias.length} NF-e(s)</div>
                <div className="overflow-x-auto max-h-[240px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-6">
                          <input type="checkbox" checked={mercadorias.length > 0 && selecionadas.size === mercadorias.length} onChange={e => {
                            if (e.target.checked) { const emits = new Set(mercadorias.map(m => m.emitCnpj || m.emit)); const dests = new Set(mercadorias.map(m => m.destCnpj || m.dest)); const tomads = new Set(mercadorias.map(m => m.tomadorCnpj || m.tomador)); if (emits.size > 1) { toast.error("Remetentes diferentes"); return; } if (dests.size > 1) { toast.error("Destinatários diferentes"); return; } if (tomads.size > 1) { toast.error("Tomadores diferentes"); return; } setSelecionadas(new Set(mercadorias.map(m => m.chave))); } else setSelecionadas(new Set());
                          }} />
                        </TableHead>
                        <TableHead className="text-[10px]">Modelo</TableHead>
                        <TableHead className="text-[10px]">Chave NFe</TableHead>
                        <TableHead className="text-[10px]">Remetente</TableHead>
                        <TableHead className="text-[10px]">Destinatário</TableHead>
                        <TableHead className="text-[10px]">Nº NF-e</TableHead>
                        <TableHead className="text-[10px]">Série</TableHead>
                        <TableHead className="text-[10px]">Data Doc</TableHead>
                        <TableHead className="text-[10px] text-right">Qtde Peso</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mercadorias.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">Nenhuma NF-e importada</TableCell></TableRow>
                      ) : (selecionadas.size > 0 ? mercadorias.filter(m => selecionadas.has(m.chave)) : mercadorias).map(m => (
                        <TableRow key={m.chave} className="text-[11px]" data-selected={selecionadas.has(m.chave)}>
                          <TableCell>
                            <input type="checkbox" checked={selecionadas.has(m.chave)} onChange={e => {
                              const next = new Set(selecionadas);
                              if (e.target.checked) { next.add(m.chave); const sel = mercadorias.filter(x => next.has(x.chave)); const emits = new Set(sel.map(x => x.emitCnpj || x.emit)); const dests = new Set(sel.map(x => x.destCnpj || x.dest)); const tomads = new Set(sel.map(x => x.tomadorCnpj || x.tomador)); if (emits.size > 1) { toast.error("Remetentes diferentes"); next.delete(m.chave); } else if (dests.size > 1) { toast.error("Destinatários diferentes"); next.delete(m.chave); } else if (tomads.size > 1) { toast.error("Tomadores diferentes"); next.delete(m.chave); } } else next.delete(m.chave);
                              setSelecionadas(next);
                            }} />
                          </TableCell>
                          <TableCell>NF-e</TableCell>
                          <TableCell className="font-mono text-[9px] max-w-[120px] truncate" title={m.chave}>{m.chave}</TableCell>
                          <TableCell className="truncate max-w-[100px]" title={m.emit}>{m.emit}</TableCell>
                          <TableCell className="truncate max-w-[100px]" title={m.dest}>{m.dest}</TableCell>
                          <TableCell className="font-mono">{m.nNF}</TableCell>
                          <TableCell>{m.serie}</TableCell>
                          <TableCell>{m.data ? dateBR(m.data) : "—"}</TableCell>
                          <TableCell className="text-right">{Number(m.peso).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right font-medium">{brl(m.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            {/* === TAB: Seguros/Veículos === */}
            <TabsContent value="seguros" className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="p-3">
                  <h5 className="text-xs font-semibold mb-2">Seguro da Carga</h5>
                  <div className="space-y-2">
                    <div><Label className="text-[10px] text-muted-foreground">Seguradora</Label>
                      <Popover open={seguradoraOpen} onOpenChange={setSeguradoraOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={seguradoraOpen} className="h-7 text-xs justify-between w-full font-normal">
                            <span className="truncate">{form.seguradoraNome || "Selecione seguradora"}</span>
                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput placeholder="Buscar seguradora..." value={seguradoraQuery} onValueChange={setSeguradoraQuery} />
                            <CommandList>
                              <CommandEmpty>{seguradoras?.length ? "Nenhuma seguradora encontrada." : "Nenhuma seguradora cadastrada. Cadastre em Configurações."}</CommandEmpty>
                              <CommandGroup>
                                {(seguradoras ?? []).filter(s => {
                                  if (!seguradoraQuery) return true;
                                  const q = seguradoraQuery.toLowerCase();
                                  return s.nome.toLowerCase().includes(q) || (s.cnpj || "").toLowerCase().includes(q) || (s.apolice_numero || "").toLowerCase().includes(q);
                                }).map(s => (
                                  <CommandItem key={s.id} value={s.id} onSelect={() => { setForm(f => ({ ...f, seguradoraId: s.id, seguradoraNome: s.nome, apolice: s.apolice_numero || f.apolice, averbacao: s.averbacao || f.averbacao })); setSeguradoraOpen(false); setSeguradoraQuery(""); }}>
                                    <Check className={"mr-2 h-3 w-3 " + (form.seguradoraId === s.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col"><span className="text-xs">{s.nome}</span><span className="text-[10px] text-muted-foreground">{s.cnpj || ""} {s.apolice_numero ? `• Apólice ${s.apolice_numero}` : ""}</span></div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Apólice</Label><Input className="h-7 text-xs" placeholder="Nº Apólice" value={form.apolice} onChange={e => setForm({ ...form, apolice: e.target.value })} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Base Calc. Seg.</Label><Input className="h-7 text-xs" value={form.vCarga} readOnly /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Valor Doc.</Label><Input className="h-7 text-xs" value={form.vCarga} readOnly /></div>
                      <div><Label className="text-[10px] text-muted-foreground">RCTR-C</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                      <div><Label className="text-[10px] text-muted-foreground">RCF-DC</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Valor Adicional</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1"><Label className="text-[10px] text-muted-foreground">Total Seguro</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                        <label className="flex items-center gap-1 text-[10px] pb-1"><input type="checkbox" /> Repassar</label>
                      </div>
                    </div>
                    <div><Label className="text-[10px] text-muted-foreground">Responsável</Label>
                      <Select defaultValue="4">
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESPONSAVEL_CTE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-[10px] text-muted-foreground">Nº Averbação</Label><Input className="h-7 text-xs" placeholder="Nº Averbação (opcional)" value={form.averbacao} onChange={e => setForm({ ...form, averbacao: e.target.value })} /></div>
                  </div>
                </Card>

                <Card className="p-3">
                  <h5 className="text-xs font-semibold mb-2">Dados do Veículo / Motorista</h5>
                  <div className="space-y-2">
                    <div><Label className="text-[10px] text-muted-foreground">Nome Motorista</Label>
                      <Popover open={motoristaOpen} onOpenChange={setMotoristaOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={motoristaOpen} className="h-7 text-xs justify-between w-full font-normal">
                            <span className="truncate">{form.motoristaNome || "Selecione motorista"}</span>
                            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput placeholder="Buscar motorista..." value={motoristaQuery} onValueChange={setMotoristaQuery} />
                            <CommandList>
                              <CommandEmpty>{motoristas?.length ? "Nenhum motorista encontrado." : "Nenhum colaborador com cargo Motorista. Cadastre em RH."}</CommandEmpty>
                              <CommandGroup>
                                {(motoristas ?? []).filter(m => {
                                  if (!motoristaQuery) return true;
                                  const q = motoristaQuery.toLowerCase();
                                  return m.nome.toLowerCase().includes(q) || m.cargo.toLowerCase().includes(q) || (m.cpf || "").includes(q);
                                }).map(m => (
                                  <CommandItem key={m.id} value={m.id} onSelect={() => { setForm(f => ({ ...f, motoristaId: m.id, motoristaNome: m.nome })); setMotoristaOpen(false); setMotoristaQuery(""); }}>
                                    <Check className={"mr-2 h-3 w-3 " + (form.motoristaId === m.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col"><span className="text-xs">{m.nome}</span><span className="text-[10px] text-muted-foreground">{m.cargo}</span></div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">CIOT</Label><Input className="h-7 text-xs" placeholder="Nº CIOT" /></div>
                      <div><Label className="text-[10px] text-muted-foreground">% Agregados</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Placa Veículo</Label>
                        <Popover open={veiculoOpen === "placaVeiculo"} onOpenChange={v => { setVeiculoOpen(v ? "placaVeiculo" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "placaVeiculo"} className="h-7 text-xs justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.placaVeiculo || "ABC-1234"}</span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput placeholder="Buscar placa..." value={veiculoQuery} onValueChange={setVeiculoQuery} />
                              <CommandList>
                                <CommandEmpty>{veiculos?.length ? "Nenhum veículo encontrado." : "Nenhum veículo cadastrado."}</CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? []).filter(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    const isReboque = tipo.includes("carreta") || tipo.includes("bitrem");
                                    if (isReboque) return false;
                                    if (!veiculoQuery) return true;
                                    const q = veiculoQuery.toLowerCase();
                                    return v.placa.toLowerCase().includes(q) || (v.marca_modelo || "").toLowerCase().includes(q);
                                  }).map(v => (
                                    <CommandItem key={v.id} value={v.placa} onSelect={() => { setForm(f => ({ ...f, placaVeiculo: v.placa.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      <Check className={"mr-2 h-3 w-3 " + (form.placaVeiculo === v.placa ? "opacity-100" : "opacity-0")} />
                                      <div className="flex flex-col"><span className="text-xs font-mono">{v.placa}</span><span className="text-[10px] text-muted-foreground">{v.marca_modelo || v.tipo || ""}</span></div>
                                    </CommandItem>
                                  ))}
                                  {veiculoQuery && !(veiculos ?? []).some(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    return !(tipo.includes("carreta") || tipo.includes("bitrem")) && v.placa.toLowerCase() === veiculoQuery.toLowerCase();
                                  }) && (
                                    <CommandItem value={veiculoQuery} onSelect={() => { setForm(f => ({ ...f, placaVeiculo: veiculoQuery.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Placa Reboque</Label>
                        <Popover open={veiculoOpen === "placaReboque"} onOpenChange={v => { setVeiculoOpen(v ? "placaReboque" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "placaReboque"} className="h-7 text-xs justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.placaReboque || "ABC-1234"}</span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput placeholder="Buscar placa..." value={veiculoQuery} onValueChange={setVeiculoQuery} />
                              <CommandList>
                                <CommandEmpty>{veiculos?.length ? "Nenhum reboque encontrado." : "Nenhum veículo cadastrado."}</CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? []).filter(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    const isReboque = tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi");
                                    if (!isReboque) return false;
                                    if (!veiculoQuery) return true;
                                    const q = veiculoQuery.toLowerCase();
                                    return v.placa.toLowerCase().includes(q) || (v.marca_modelo || "").toLowerCase().includes(q);
                                  }).map(v => (
                                    <CommandItem key={v.id} value={v.placa} onSelect={() => { setForm(f => ({ ...f, placaReboque: v.placa.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      <Check className={"mr-2 h-3 w-3 " + (form.placaReboque === v.placa ? "opacity-100" : "opacity-0")} />
                                      <div className="flex flex-col"><span className="text-xs font-mono">{v.placa}</span><span className="text-[10px] text-muted-foreground">{v.marca_modelo || v.tipo || ""}</span></div>
                                    </CommandItem>
                                  ))}
                                  {veiculoQuery && !(veiculos ?? []).some(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    return (tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi")) && v.placa.toLowerCase() === veiculoQuery.toLowerCase();
                                  }) && (
                                    <CommandItem value={veiculoQuery} onSelect={() => { setForm(f => ({ ...f, placaReboque: veiculoQuery.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Semi Reboque 1</Label>
                        <Popover open={veiculoOpen === "semi1"} onOpenChange={v => { setVeiculoOpen(v ? "semi1" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "semi1"} className="h-7 text-xs justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.semiReboque1 || "ABC-1234"}</span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput placeholder="Buscar placa..." value={veiculoQuery} onValueChange={setVeiculoQuery} />
                              <CommandList>
                                <CommandEmpty>{veiculos?.length ? "Nenhum reboque encontrado." : "Nenhum veículo cadastrado."}</CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? []).filter(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    const isReboque = tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi");
                                    if (!isReboque) return false;
                                    if (!veiculoQuery) return true;
                                    const q = veiculoQuery.toLowerCase();
                                    return v.placa.toLowerCase().includes(q) || (v.marca_modelo || "").toLowerCase().includes(q);
                                  }).map(v => (
                                    <CommandItem key={v.id} value={v.placa} onSelect={() => { setForm(f => ({ ...f, semiReboque1: v.placa.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      <Check className={"mr-2 h-3 w-3 " + (form.semiReboque1 === v.placa ? "opacity-100" : "opacity-0")} />
                                      <div className="flex flex-col"><span className="text-xs font-mono">{v.placa}</span><span className="text-[10px] text-muted-foreground">{v.marca_modelo || v.tipo || ""}</span></div>
                                    </CommandItem>
                                  ))}
                                  {veiculoQuery && !(veiculos ?? []).some(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    return (tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi")) && v.placa.toLowerCase() === veiculoQuery.toLowerCase();
                                  }) && (
                                    <CommandItem value={veiculoQuery} onSelect={() => { setForm(f => ({ ...f, semiReboque1: veiculoQuery.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Semi Reboque 2</Label>
                        <Popover open={veiculoOpen === "semi2"} onOpenChange={v => { setVeiculoOpen(v ? "semi2" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "semi2"} className="h-7 text-xs justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.semiReboque2 || "ABC-1234"}</span>
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput placeholder="Buscar placa..." value={veiculoQuery} onValueChange={setVeiculoQuery} />
                              <CommandList>
                                <CommandEmpty>{veiculos?.length ? "Nenhum reboque encontrado." : "Nenhum veículo cadastrado."}</CommandEmpty>
                                <CommandGroup>
                                  {(veiculos ?? []).filter(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    const isReboque = tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi");
                                    if (!isReboque) return false;
                                    if (!veiculoQuery) return true;
                                    const q = veiculoQuery.toLowerCase();
                                    return v.placa.toLowerCase().includes(q) || (v.marca_modelo || "").toLowerCase().includes(q);
                                  }).map(v => (
                                    <CommandItem key={v.id} value={v.placa} onSelect={() => { setForm(f => ({ ...f, semiReboque2: v.placa.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      <Check className={"mr-2 h-3 w-3 " + (form.semiReboque2 === v.placa ? "opacity-100" : "opacity-0")} />
                                      <div className="flex flex-col"><span className="text-xs font-mono">{v.placa}</span><span className="text-[10px] text-muted-foreground">{v.marca_modelo || v.tipo || ""}</span></div>
                                    </CommandItem>
                                  ))}
                                  {veiculoQuery && !(veiculos ?? []).some(v => {
                                    const tipo = (v.tipo || "").toLowerCase();
                                    return (tipo.includes("carreta") || tipo.includes("bitrem") || tipo.includes("semi")) && v.placa.toLowerCase() === veiculoQuery.toLowerCase();
                                  }) && (
                                    <CommandItem value={veiculoQuery} onSelect={() => { setForm(f => ({ ...f, semiReboque2: veiculoQuery.toUpperCase() })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
                                      Usar &quot;{veiculoQuery.toUpperCase()}&quot;
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[10px]"><input type="checkbox" /> Possui Segundo Motorista</label>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* === TAB: Taxas/Despesas Acessórias === */}
            <TabsContent value="taxas" className="mt-3 space-y-3">
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2">Pedágio / Taxas / Despesas Acessórias</h5>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">Pedágio (3 Eixos)</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Sec/Cat</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Adicional</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Desconto</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Outros</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Total Mercadorias</Label><Input className="h-7 text-xs" value={form.vCarga} readOnly /></div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                  <div><Label className="text-[10px] text-muted-foreground">Ad Valorem</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">GRIS</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Taxa Coleta</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Taxa Entrega</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Valor Serviço</Label><MoneyInput className="h-7 text-xs font-medium" value={form.vPrest} onChange={v => setForm(f => ({ ...f, vPrest: v }))} /></div>
                </div>
              </Card>

              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2">Forma de Pagamento do Pedágio</h5>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" defaultChecked /> Free Flow</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" /> TAG Transportador</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" /> TAG Tomador</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" /> Sem Pagto Pedágio</label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <div><Label className="text-[10px] text-muted-foreground">Operadora</Label><Input className="h-7 text-xs" placeholder="Ex: SEM PARAR" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">CNPJ Operadora</Label><Input className="h-7 text-xs" placeholder="00.000.000/0000-00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Vale Pedágio (R$)</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Nº TAG</Label><Input className="h-7 text-xs" placeholder="Nº TAG" /></div>
                </div>
              </Card>
            </TabsContent>

            {/* === TAB: Impostos === */}
            <TabsContent value="impostos" className="mt-3 space-y-3">
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5 text-primary" /> ICMS</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">CST</Label>
                    <Select value={form.icmsCST} onValueChange={v => setForm({ ...form, icmsCST: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">00 — Tributação normal</SelectItem>
                        <SelectItem value="20">20 — Com redução</SelectItem>
                        <SelectItem value="45">45 — Isento</SelectItem>
                        <SelectItem value="60">60 — ICMS cobrado por ST</SelectItem>
                        <SelectItem value="90">90 — Outras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">Base Cálculo (R$)</Label><MoneyInput className="h-7 text-xs bg-muted" value={form.vPrest} onChange={() => {}} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Alíquota ICMS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.icmsAliq} onChange={v => setForm({ ...form, icmsAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Valor ICMS (R$)</Label><MoneyInput className="h-7 text-xs bg-muted" value={form.icmsValor} onChange={() => {}} placeholder="0,00" /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Digite só números — vírgula preenche automaticamente. Ponto só para milhares. Base padrão = Valor do Serviço.</p>
              </Card>
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2">Outros Impostos — Alíquotas (%)</h5>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">PIS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.pisAliq} onChange={v => setForm({ ...form, pisAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">COFINS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.cofinsAliq} onChange={v => setForm({ ...form, cofinsAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">IR (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.irAliq} onChange={v => setForm({ ...form, irAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">INSS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.inssAliq} onChange={v => setForm({ ...form, inssAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">CSLL (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.csllAliq} onChange={v => setForm({ ...form, csllAliq: v })} placeholder="0,00" /></div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Cálculos do Serviço — Rodapé (corrigido: base = icmsBase editável, não vCarga) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 border rounded p-3 bg-muted/20">
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Base Cálculo ICMS</p><p className="text-xs font-mono font-medium">{brl(Number(form.vPrest))}</p><p className="text-[8px] text-muted-foreground">igual ao Valor do Serviço</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Alíquota ICMS</p><p className="text-xs font-mono">{Number(form.icmsAliq).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Valor ICMS</p><p className="text-xs font-mono font-medium text-primary">{brl(Number(form.icmsValor))}</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Valor Serviço</p><p className="text-xs font-mono font-medium">{brl(Number(form.vPrest))}</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Total Prestação</p><p className="text-xs font-mono font-bold">{brl(Number(form.vPrest))}</p></div>
          </div>

          {/* Observações */}
          <Card className="p-3">
            <h5 className="text-xs font-semibold mb-1">Observações do Conhecimento</h5>
            <div className="border rounded overflow-hidden">
              <div className="grid grid-cols-[28px_1fr_60px] bg-muted text-[10px] font-semibold">
                <div className="px-1 py-1 text-center">Linha</div>
                <div className="px-1 py-1 border-l">Descrição da Observação</div>
                <div className="px-1 py-1 border-l text-right">Tamanho</div>
              </div>
              <Textarea className="min-h-[60px] rounded-none border-0 border-t text-xs font-mono resize-none focus-visible:ring-0" placeholder={"01 — \n02 — \n03 — Protocolo Pedidos:"} />
            </div>
          </Card>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); setEditingRascunhoId(null); setMercadorias([]); setSelecionadas(new Set()); qc.invalidateQueries({ queryKey: ["cte-documentos"] }); qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa?.id] }); }}><Ban className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>
            <Button variant="outline" onClick={() => salvarRascunho.mutate()} disabled={salvarRascunho.isPending}>
              {salvarRascunho.isPending ? "Salvando..." : <><FileText className="mr-1 h-3.5 w-3.5" /> Salvar Rascunho</>}
            </Button>
            <Button variant="outline" onClick={() => previewXml.mutate()} disabled={previewXml.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {previewXml.isPending ? "Gerando..." : <><FileText className="mr-1 h-3.5 w-3.5" /> Pré Visualizar</>}
            </Button>
            <Button onClick={() => emitir.mutate()} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {emitir.isPending ? "Enviando..." : <><Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Pré-Visualização DACTE */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Pré-Visualização DACTE
              {previewData && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  Nº {previewData.proximo} • {previewData.ambiente === "homologacao" ? "Homologação" : "Produção"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewData && (() => {
            const f = previewData.form;
            const nFes = (f.nFes || []).map((n: any) => ({ nNF: n.nNF || n.numero || "", serie: n.serie || "1", valor: n.valor || 0 }));
            const first = mercadorias[0] || {} as any;
            const pdfBlob = gerarDactePdf({
              chave: previewData.chave,
              numero: previewData.proximo,
              serie: f.serie || "1",
              ambiente: previewData.ambiente,
              dataEmissao: new Date().toISOString(),
              emitCnpj: f.emit?.cnpj || "",
              emitNome: f.emit?.xNome || f.xNomeTomador || "",
              emitEndereco: `${f.emit?.logradouro || ""} ${f.emit?.nro || ""} ${f.emit?.bairro || ""}`.trim(),
              emitCidade: f.emit?.xMun || f.xMunEnv || "",
              emitUF: f.emit?.uf || f.ufEnv || "",
              emitIE: f.emit?.ie || "ISENTO",
              tomadorCnpj: f.cnpjTomador || "",
              tomadorNome: f.xNomeTomador || "",
              tomadorEndereco: `${f.logradouroTomador || ""} ${f.nroTomador || ""} ${f.bairroTomador || ""}`.trim(),
              tomadorCidade: f.xMunTomador || "",
              tomadorUF: f.ufTomador || "",
              remCnpj: first.emitCnpj || "",
              remNome: first.emit || "",
              remCidade: first.emitXMun || "",
              remUF: first.emitUF || "",
              remEndereco: first.emitLogradouro || "",
              remBairro: first.emitBairro || "",
              remCEP: first.emitCEP || "",
              remIE: first.emitIE || "",
              remFone: first.emitFone || "",
              destCnpj: first.destCnpj || "",
              destNome: first.dest || "",
              destCidade: first.destXMun || "",
              destUF: first.destUF || "",
              destEndereco: first.destLogradouro || "",
              destBairro: first.destBairro || "",
              destCEP: first.destCEP || "",
              destIE: first.destIE || "",
              destFone: first.destFone || "",
              cfop: f.cfop || "5353",
              naturezaOperacao: "TRANSPORTE INTERESTADUAL - INDUSTRIAL",
              origemCidade: f.xMunIni || "",
              origemUF: f.ufIni || "",
              destinoCidade: f.xMunFim || "",
              destinoUF: f.ufFim || "",
              valorServico: f.vPrest || 0,
              valorCarga: f.vCarga || 0,
              pesoKg: f.pesoKg || 0,
              icmsCST: f.icmsCST || "00",
              icmsBase: f.icms?.vBC || f.vPrest || 0,
              icmsAliq: f.icms?.pICMS || 0,
              icmsValor: f.icms?.vICMS || 0,
              nFes,
              placa: f.placaVeiculo || "",
              placaReboque: f.placaReboque || "",
              rntrc: f.rntrc || "",
              obs: f.obs || "",
              protocolo: "",
            });
            const url = URL.createObjectURL(pdfBlob);
            return <iframe src={url} className="flex-1 w-full min-h-[500px] border-0" />;
          })()}
          <div className="flex items-center justify-between px-4 py-2 border-t text-[10px] text-muted-foreground">
            <span>Chave: {previewData?.chave || "—"}</span>
          </div>
          <DialogFooter className="px-4 pb-4">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button onClick={() => { setPreviewOpen(false); emitir.mutate(); }} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {emitir.isPending ? "Enviando..." : <><Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancelar CT-e {cancelTarget?.numero ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Motivo pré-salvo</Label>
              <Select
                value={JUSTIFICATIVAS_CANCELAMENTO.includes(cancelJust) ? cancelJust : "__custom"}
                onValueChange={(v) => { if (v !== "__custom") setCancelJust(v); }}
              >
                <SelectTrigger><SelectValue placeholder="Escolha o motivo" /></SelectTrigger>
                <SelectContent>
                  {JUSTIFICATIVAS_CANCELAMENTO.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                  <SelectItem value="__custom">Outro (digitar abaixo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Justificativa (mín. 15 caracteres)</Label>
              <Textarea rows={3} value={cancelJust} onChange={(e) => setCancelJust(e.target.value)} />
              <p className={`text-xs ${cancelJust.trim().length >= 15 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {cancelJust.trim().length} caracteres (mín. 15)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={cancelar.isPending || cancelJust.trim().length < 15}
              onClick={() => {
                if (!cancelTarget) return;
                const just = cancelJust.trim();
                try { localStorage.setItem("norvo_cte_cancel_just", just); } catch {}
                cancelar.mutate({ chave: cancelTarget.chave, protocolo: cancelTarget.protocolo, justificativa: just });
                setCancelTarget(null);
              }}
            >
              {cancelar.isPending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
