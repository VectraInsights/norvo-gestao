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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Truck, Plus, FileText, Search, Ban, UploadCloud, FileCode, UsersRound, MapPin, Package, DollarSign, Building2, Route as RouteIcon, Trash2, Filter, Calendar, CheckCircle2, ChevronsUpDown, Check, ReceiptText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { emitirCteFn, consultarCteFn, cancelarCteFn } from "@/lib/sefaz-cte-server";
import { CFOPS_CTE, MOD_FRETE_OPTIONS, RESPONSAVEL_CTE_OPTIONS } from "@/lib/cfops-transporte";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";

export const Route = createFileRoute("/_authenticated/fiscal/cte")({
  component: CtePage,
  head: () => ({ meta: [{ title: "CT-e — Norvo" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ fromNFe: (search.fromNFe as string) || undefined }),
});

type CteDoc = { id: string; numero: string | null; serie: string | null; status: string; valor_servico: number | null; chave_acesso: string | null; created_at: string; motivo_rejeicao: string | null; protocolo_sefaz: string | null };

function CtePage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [isParsing, setIsParsing] = useState(false);
  const [mercadorias, setMercadorias] = useState<Array<{ chave: string; nNF: string; serie: string; emit: string; emitCnpj: string; emitUF: string; emitCMun: string; emitXMun: string; dest: string; destCnpj: string; destUF: string; destCMun: string; destXMun: string; valor: number; peso: number; data: string; tomador: string; tomadorCnpj: string; tomadorUF: string; tomadorCMun: string; tomadorXMun: string; modFrete: string }>>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [filtroEmpresa] = useState("ROSE TRANSPORTES");
  const [filtroRemetente, setFiltroRemetente] = useState("TODOS REMETENTES");
  const [filtroDestinatario, setFiltroDestinatario] = useState("TODOS OS DESTINATÁRIOS");
  const [periodoIni, setPeriodoIni] = useState("2026-08-21");
  const [periodoFim, setPeriodoFim] = useState("2026-08-28");

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-documentos", empresa?.id],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any).select("id,numero,serie,status,valor_servico,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    toma: "3", cnpjTomador: "", xNomeTomador: "", ufTomador: "MG", cMunTomador: "3106200", xMunTomador: "BELO HORIZONTE", cfop: "5353",
    vPrest: "0.00", vCarga: "0.00", peso: "0", rntrc: "",
    // Impostos — base e alíquotas editáveis (corrigido: base padrão = vPrest, não vCarga)
    icmsCST: "00", icmsBase: "1000.00", icmsAliq: "0.00", icmsValor: "0.00",
    pisAliq: "0.00", cofinsAliq: "0.00", irAliq: "0.00", inssAliq: "0.00", csllAliq: "0.00",
    // Veículo / Motorista / Seguro — menus tipo CFOP
    motoristaNome: "", motoristaId: "", ciot: "",
    placaVeiculo: "", placaReboque: "", semiReboque1: "", semiReboque2: "",
    seguradoraNome: "", seguradoraId: "", apolice: "", averbacao: "",
    cMunEnv: "3106200", xMunEnv: "BELO HORIZONTE", ufEnv: "MG", cMunIni: "3106200", xMunIni: "BELO HORIZONTE", ufIni: "MG", cMunFim: "3550308", xMunFim: "SAO PAULO", ufFim: "SP", dataEmissao: new Date().toISOString().slice(0,10),
  });
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
        tomador_nome: string | null; tomador_cnpj: string | null; tomador_uf: string | null; tomador_cmun: string | null; tomador_xmun: string | null; mod_frete: string | null;
      }>;
    },
  });
  useEffect(() => {
    if (pendentesDB) {
      const mapped = pendentesDB.map(r => ({
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
  }, [pendentesDB]);

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
      let added = 0;
      let duplicadas = 0;
      const novas: typeof mercadorias = [];
      for (const file of xmls) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const emitCnpj = doc.querySelector("emit > CNPJ")?.textContent || "";
        const emitXNome = doc.querySelector("emit > xNome")?.textContent || "";
        const emitUF = doc.querySelector("emit > enderEmit > UF")?.textContent || "";
        const emitCMun = doc.querySelector("emit > enderEmit > cMun")?.textContent || "";
        const emitXMun = doc.querySelector("emit > enderEmit > xMun")?.textContent || "";
        const destCnpj = doc.querySelector("dest > CNPJ")?.textContent || doc.querySelector("dest > CPF")?.textContent || "";
        const destXNome = doc.querySelector("dest > xNome")?.textContent || "";
        const destUF = doc.querySelector("dest > enderDest > UF")?.textContent || "";
        const destCMun = doc.querySelector("dest > enderDest > cMun")?.textContent || "";
        const destXMun = doc.querySelector("dest > enderDest > xMun")?.textContent || "";
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
        let tomadorNome = destXNome;
        let tomadorCnpj = destCnpj;
        let tomadorUF = destUF;
        let tomadorCMun = destCMun;
        let tomadorXMun = destXMun;
        if (modFrete === "0") {
          tomadorNome = emitXNome; tomadorCnpj = emitCnpj;
          tomadorUF = emitUF; tomadorCMun = emitCMun; tomadorXMun = emitXMun;
        } else if (modFrete === "2") {
          const transpCnpj = doc.querySelector("transp > transporta > CNPJ")?.textContent || "";
          const transpXNome = doc.querySelector("transp > transporta > xNome")?.textContent || "";
          if (transpCnpj || transpXNome) { tomadorNome = transpXNome || tomadorNome; tomadorCnpj = transpCnpj || tomadorCnpj; }
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
        novas.push({ chave: chaveNorm, nNF, serie, emit: emitXNome, emitCnpj, emitUF, emitCMun, emitXMun, dest: destXNome, destCnpj, destUF, destCMun, destXMun, valor, peso, data: dhEmi.slice(0, 10), tomador: tomadorNome, tomadorCnpj, tomadorUF, tomadorCMun, tomadorXMun, modFrete });
        if (added === 0 && mercadorias.length === 0) {
          const tomaByMod: Record<string, string> = { "0": "0", "1": "3", "2": "4", "3": "0", "4": "3", "9": "4" };
          const tomaIni = tomaByMod[modFrete] ?? "3";
          setForm(f => ({
            ...f,
            toma: !f.cnpjTomador ? tomaIni : f.toma,
            cnpjTomador: tomadorCnpj || f.cnpjTomador,
            xNomeTomador: tomadorNome || f.xNomeTomador,
            ufTomador: tomadorUF || f.ufTomador,
            cMunTomador: tomadorCMun || f.cMunTomador,
            xMunTomador: tomadorXMun || f.xMunTomador,
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

  const salvarRascunho = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      const { error } = await supabase.from("cte_documentos" as any).insert({
        empresa_id: empresa.id,
        status: "rascunho",
        tomador_nome: form.xNomeTomador,
        tomador_cnpj: form.cnpjTomador,
        cfop: form.cfop,
        v_prest: parseFloat(form.vPrest) || 0,
        v_carga: parseFloat(form.vCarga) || 0,
        peso_kg: parseFloat(form.peso) || 0,
        rntrc: form.rntrc || null,
        uf_envio: form.ufEnv,
        municipio_envio: form.xMunEnv,
        uf_inicio: form.ufIni,
        municipio_inicio: form.xMunIni,
        uf_fim: form.ufFim,
        municipio_fim: form.xMunFim,
        dados_json: JSON.stringify(form),
        chaves_nfe: chaves,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rascunho salvo");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emitir = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!form.xNomeTomador || !form.cnpjTomador) throw new Error("Informe tomador");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      if (chaves.length > 0) {
        const sel = mercadorias.filter(m => chaves.includes(m.chave));
        const dests = new Set(sel.map(m => m.destCnpj || m.dest));
        if (dests.size > 1) throw new Error("CT-e não pode ter destinos diferentes. Selecione NF-es do mesmo destinatário.");
      }
      const ret: any = await emitirCteFn({ data: { empresaId: empresa.id, input: {
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, vPrest: parseFloat(form.vPrest)||0, vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: form.rntrc,
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        icms: { CST: form.icmsCST, vBC: parseFloat(form.vPrest)||0, pICMS: parseFloat(form.icmsAliq)||0, vICMS: parseFloat(form.icmsValor)||0 },
        impostos: { pisAliq: parseFloat(form.pisAliq)||0, cofinsAliq: parseFloat(form.cofinsAliq)||0, irAliq: parseFloat(form.irAliq)||0, inssAliq: parseFloat(form.inssAliq)||0, csllAliq: parseFloat(form.csllAliq)||0 },
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador },
        emit: { xNome: form.xNomeTomador, ie: "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv } as any,
        chavesNFe: chaves,
      } } });
      return ret;
    },
    onSuccess: async (ret: any) => {
      if (ret.sucesso) {
        toast.success(`CT-e ${ret.chave} autorizado` + (ret.protocolo ? ` prot ${ret.protocolo}` : ""));
        setOpen(false);
        // marca NF-es usadas como embarcadas (dedup global continua bloqueando re-import)
        const chavesUsadas = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
        if (empresa && chavesUsadas.length > 0) {
          await supabase.from("cte_nfes_pendentes" as any).update({ status: "embarcada" }).in("chave", chavesUsadas).eq("empresa_id", empresa.id);
          qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          setSelecionadas(new Set());
        }
      } else toast.error(ret.xMotivo || ret.motivo || "Rejeitado");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const consultar = useMutation({
    mutationFn: async (chave: string) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      return consultarCteFn({ data: { empresaId: empresa.id, chave } });
    },
    onSuccess: (ret: any) => toast.success(`Consulta: ${ret.cStat} ${ret.xMotivo}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (chave: string) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const just = prompt("Justificativa de cancelamento (mín. 15 caracteres):") || "";
      if (just.length < 15) throw new Error("Justificativa muito curta");
      return cancelarCteFn({ data: { empresaId: empresa.id, chave, justificativa: just } });
    },
    onSuccess: (ret: any) => {
      if ((ret as any).sucesso) toast.success("CT-e cancelado");
      else toast.error((ret as any).xMotivo || "Falha ao cancelar");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <PageHeader eyebrow="Fiscal" title="CT-e" description="Conhecimento de Transporte Eletrônico (57) — emissão robusta estilo STM, com múltiplas NF-es por CT-e." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo CT-e</Button>} />

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
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Remetente</TableHead>
                    <TableHead className="text-xs">CNPJ Remetente</TableHead>
                    <TableHead className="text-xs">Destinatário</TableHead>
                    <TableHead className="text-xs">CNPJ Destinatário</TableHead>
                    <TableHead className="text-xs">Tomador</TableHead>
                    <TableHead className="text-xs">Nº NF-e</TableHead>
                    <TableHead className="text-xs">Série</TableHead>
                    <TableHead className="text-xs">Data Emissão</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Peso</TableHead>
                    <TableHead className="text-xs">Chave</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mercadorias.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-8">Nenhuma NF-e importada. Use “Importar NFes (XML)” abaixo.</TableCell></TableRow>
                  ) : (
                    mercadorias.map((m) => (
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
                        <TableCell className="font-mono">18837</TableCell>
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
                        <TableCell className="font-mono truncate max-w-[140px]" title={m.chave}>{m.chave.slice(0,22)}...</TableCell>
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
            <Button variant="outline" size="sm" onClick={async () => { if (!empresa) return; if (mercadorias.length === 0) return; if (!confirm(`Remover ${mercadorias.length} NF-e(s) pendentes?`)) return; const { error } = await supabase.from("cte_nfes_pendentes" as any).delete().eq("empresa_id", empresa.id).eq("status", "pendente"); if (error) toast.error(error.message); else { setMercadorias([]); setSelecionadas(new Set()); qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] }); toast.success("Pendentes removidos"); } }} disabled={mercadorias.length===0}><Trash2 className="mr-1 h-3 w-3" /> Limpar</Button>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selecionadas.size===0}
                onClick={() => {
                  if (selecionadas.size===0) { toast.error("Selecione ao menos uma NF-e"); return; }
                  const sel = mercadorias.filter(m => selecionadas.has(m.chave));
                  const dests = new Set(sel.map(m => m.destCnpj || m.dest));
                  if (dests.size > 1) { toast.error("Não pode emitir o mesmo CT-e para destinos diferentes"); return; }
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
              <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" /> Novo CT-e avulso</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : !docs?.length ? (
        <EmptyState icon={Truck} title="Nenhum CT-e" description="Os CT-es emitidos aparecerão aqui." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Série</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Chave</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>{docs.map(d => (
              <TableRow key={d.id}><TableCell className="font-mono">{d.numero ?? "—"}</TableCell><TableCell>{d.serie ?? "—"}</TableCell><TableCell><Badge variant="secondary" className={d.status==="autorizado"?"bg-emerald-500/15 text-emerald-600":d.status==="rejeitado"?"bg-destructive/15 text-destructive":""}>{d.status}</Badge></TableCell><TableCell className="text-right">{brl(Number(d.valor_servico ?? 0))}</TableCell><TableCell className="font-mono text-xs truncate max-w-[220px]" title={d.chave_acesso||""}>{d.chave_acesso ?? "—"}</TableCell><TableCell className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => d.chave_acesso && consultar.mutate(d.chave_acesso)} title="Consultar SEFAZ"><Search className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={d.status!=="autorizado"} onClick={() => d.chave_acesso && cancelar.mutate(d.chave_acesso)} title="Cancelar"><Ban className="h-3.5 w-3.5" /></Button>
              </TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </Card>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded-b-md rounded-tr-md p-3 bg-muted/20">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Remetente (emitente da NF-e) */}
                <Card className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded bg-emerald-500/10 grid place-items-center"><UploadCloud className="h-3.5 w-3.5 text-emerald-600" /></div>
                    <h5 className="text-xs font-semibold">Remetente</h5>
                  </div>
                  {mercadorias.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      <p className="font-medium">{mercadorias[0].emit || "—"}</p>
                      <p className="text-muted-foreground font-mono text-[10px]">{mercadorias[0].emitCnpj ? mercadorias[0].emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</p>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Importe NF-es para preencher</p>}
                </Card>

                {/* Destinatário */}
                <Card className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded bg-sky-500/10 grid place-items-center"><Package className="h-3.5 w-3.5 text-sky-600" /></div>
                    <h5 className="text-xs font-semibold">Destinatário</h5>
                  </div>
                  {mercadorias.length > 0 ? (
                    <div className="space-y-1 text-xs">
                      <p className="font-medium">{mercadorias[0].dest || "—"}</p>
                      <p className="text-muted-foreground font-mono text-[10px]">{mercadorias[0].destCnpj ? mercadorias[0].destCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"}</p>
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Importe NF-es para preencher</p>}
                </Card>
              </div>

              {/* Tomador */}
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded bg-primary/10 grid place-items-center"><UsersRound className="h-3.5 w-3.5 text-primary" /></div>
                  <h5 className="text-xs font-semibold">Tomador do Serviço</h5>
                  <span className="text-[10px] text-muted-foreground">(toma {form.toma})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Select value={form.toma} onValueChange={v => setForm({...form, toma: v})}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOD_FRETE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="h-7 text-xs" placeholder="CNPJ *" value={form.cnpjTomador} onChange={e=>setForm({...form,cnpjTomador:e.target.value})} />
                  <Input className="h-7 text-xs md:col-span-2" placeholder="Nome / Razão Social *" value={form.xNomeTomador} onChange={e=>setForm({...form,xNomeTomador:e.target.value})} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Input className="h-7 text-xs" placeholder="UF" value={form.ufTomador} onChange={e=>setForm({...form,ufTomador:e.target.value.toUpperCase()})} maxLength={2} />
                  <Input className="h-7 text-xs md:col-span-2" placeholder="Município" value={form.xMunTomador} onChange={e=>setForm({...form,xMunTomador:e.target.value})} />
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
                            if (e.target.checked) { const dests = new Set(mercadorias.map(m => m.destCnpj || m.dest)); if (dests.size > 1) { toast.error("Destinos diferentes"); return; } setSelecionadas(new Set(mercadorias.map(m => m.chave))); } else setSelecionadas(new Set());
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
                              if (e.target.checked) { next.add(m.chave); const sel = mercadorias.filter(x => next.has(x.chave)); const dests = new Set(sel.map(x => x.destCnpj || x.dest)); if (dests.size > 1) { toast.error("Destinos diferentes"); next.delete(m.chave); } } else next.delete(m.chave);
                              setSelecionadas(next);
                            }} />
                          </TableCell>
                          <TableCell>NFe</TableCell>
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
            <Button variant="outline" onClick={() => setOpen(false)}><Ban className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>
            <Button variant="outline" onClick={() => salvarRascunho.mutate()} disabled={salvarRascunho.isPending}>
              {salvarRascunho.isPending ? "Salvando..." : <><FileText className="mr-1 h-3.5 w-3.5" /> Salvar Rascunho</>}
            </Button>
            <Button variant="outline" disabled><FileText className="mr-1 h-3.5 w-3.5" /> Pré Visualizar</Button>
            <Button onClick={() => emitir.mutate()} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {emitir.isPending ? "Enviando..." : <><Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
