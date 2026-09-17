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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Truck, Plus, FileText, Search, Ban, UploadCloud, FileCode, MapPin, Package, Building2, Trash2, Filter, Calendar, CheckCircle2, ChevronsUpDown, Check, ReceiptText, Pencil, Download, Eye, Settings2, X, Loader2, ClipboardList, Printer } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { limparIE } from "@/lib/ie";
import { emitirCteFn, consultarCteFn, cancelarCteFn, previewCteXmlFn, excluirRejeitadosCteFn } from "@/lib/sefaz-cte-server";
import { CFOPS_CTE, MOD_FRETE_OPTIONS, RESPONSAVEL_CTE_OPTIONS } from "@/lib/cfops-transporte";
import { gerarDactePdf } from "@/lib/dacte-pdf";
import { completarLogradouro, temTipoLogradouro } from "@/lib/endereco";
import { JUVENAL_LOGO } from "@/lib/juvenal-logo";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";

/* Visor próprio de DACTE: tela cheia do sistema (sem a barra do navegador),
 * com Baixar, Imprimir, zoom e Fechar (Esc). */
function DacteViewer({ titulo, subtitulo, url, nomeArquivo, onClose, acoes }: {
  titulo: string; subtitulo?: string; url: string; nomeArquivo: string;
  onClose: () => void; acoes?: any;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(() =>
    typeof window === "undefined" ? 100 : Math.min(200, Math.max(100, Math.round(window.innerWidth / 12))),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
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
    if (w) { w.focus(); w.print(); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{titulo}</span>
        {subtitulo && <span className="max-w-full truncate text-xs text-muted-foreground">{subtitulo}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Reduzir zoom" onClick={() => setZoom((z) => Math.max(50, z - 10))}>−</Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{zoom}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Ampliar zoom" onClick={() => setZoom((z) => Math.min(200, z + 10))}>+</Button>
          <Button size="sm" variant="outline" onClick={baixar}><Download className="mr-1 h-3.5 w-3.5" /> Baixar</Button>
          <Button size="sm" variant="outline" onClick={imprimir}><Printer className="mr-1 h-3.5 w-3.5" /> Imprimir</Button>
          {acoes}
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Fechar (Esc)" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/40">
        <iframe ref={frameRef} src={`${url}#toolbar=0&navpanes=0&zoom=${zoom}`} title={titulo} className="h-full min-h-[70vh] w-full border-0 bg-white" />
      </div>
    </div>
  );
}

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
  const [mercadorias, setMercadorias] = useState<Array<{ chave: string; nNF: string; serie: string; emit: string; emitCnpj: string; emitUF: string; emitCMun: string; emitXMun: string; emitIE?: string; emitLogradouro?: string; emitBairro?: string; emitCEP?: string; emitFone?: string; dest: string; destCnpj: string; destUF: string; destCMun: string; destXMun: string; destIE?: string; destLogradouro?: string; destBairro?: string; destCEP?: string; destFone?: string; valor: number; peso: number; data: string; tomador: string; tomadorCnpj: string; tomadorUF: string; tomadorCMun: string; tomadorXMun: string; tomadorIE?: string; tomadorLogradouro?: string; tomadorBairro?: string; tomadorCEP?: string; modFrete: string; qVol?: number }>>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confRemetente, setConfRemetente] = useState<{ nome: string; chaves: string[] } | null>(null);
  const [filtroEmpresa] = useState("ROSE TRANSPORTES");
  const [filtroRemetente, setFiltroRemetente] = useState("TODOS REMETENTES");
  const [filtroDestinatario, setFiltroDestinatario] = useState("TODOS OS DESTINATÁRIOS");
  const [periodoIni, setPeriodoIni] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); });
  const [periodoFim, setPeriodoFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "nNF", dir: "asc" });
  const [editingRascunhoId, setEditingRascunhoId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState("embarque");
  const [respNome, setRespNome] = useState("");
  useEffect(() => { (async () => { try { const { data } = await supabase.auth.getUser(); const usr = (data as any)?.user; if (!usr) return; let nm = (usr?.user_metadata as any)?.nome || ""; if (!nm && empresa) { const { data: eu } = await supabase.from("empresa_users" as any).select("nome").eq("empresa_id", (empresa as any).id).eq("user_id", usr.id).maybeSingle(); nm = (eu as any)?.nome || ""; } setRespNome(nm || ""); } catch {} })(); }, [(empresa as any)?.id]);

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


  // Chaves reservadas em rascunhos (inclui rascunhos antigos, cujas NF-es foram deletadas do banco)
  const chavesEmRascunho = useMemo(() => {
    const s = new Set<string>();
    for (const d of (docs ?? [])) {
      if ((d as any).status !== "rascunho") continue;
      try {
        const p = JSON.parse((d as any).xml_assinado || "{}");
        for (const c of (p.chavesNFe || [])) if (c) s.add(String(c).replace(/\D/g, ""));
        for (const nf of (p.nfs || [])) if (nf?.chave) s.add(String(nf.chave).replace(/\D/g, ""));
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
    if (!xmlContent || !xmlContent.includes("<")) { toast.error("XML não encontrado no registro"); return; }
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
        chave: det.querySelector("chNFe")?.textContent || "",
      }));
      const gIcms = ["ICMS00", "ICMS20", "ICMS45", "ICMS60", "ICMS90", "ICMSOutraUF"].find(g => tag("infCte > imp > ICMS > " + g + " > CST"));
      const tagI = (f: string) => (gIcms ? tag("infCte > imp > ICMS > " + gIcms + " > " + f) : "");
      const xmlObs = Array.from(xmlDoc.querySelectorAll("ObsCont > xTexto, ObsFisco > xTexto")).map(e => (e.textContent || "").trim()).filter(Boolean).join(" ");      let pjForm: any = {};
      try { const pj = JSON.parse(doc.xml_assinado); if (pj && pj.form) pjForm = pj.form; } catch {}
      const obsPercurso = pjForm.obsGerais || "";
      const dg = (st: any) => String(st || "").replace(/\D/g, "");
      let percObs = "", percColX = "", percColU = "", percEntX = "", percEntU = "";
      let percDstDoc = "", percDstNome = "", percDstX = "", percDstU = "", percDstLog = "", percDstNro = "", percDstBairro = "", percDstCep = "", percDstIE = "", percDstFone = "";
      let remD = "", dstD = "", tomaD = "";
      let nfRef: any = null;
      let percRemNome = "", percRemX = "", percRemU = "", percRemLog = "", percRemNro = "", percRemBairro = "", percRemCep = "", percRemIE = "", percRemFone = "";
      let hit: any = null;
      try {
        try {
          const chs0 = nFes.map((nn: any) => dg(nn.chave)).filter((cc: string) => cc.length === 44).slice(0, 5);
          if (empresa && chs0.length > 0) {
            const { data: nfs0 } = await supabase.from("cte_nfes_pendentes" as any).select("chave,emit_cnpj,emit_nome,emit_uf,emit_cmun,emit_xmun,dest_cnpj,dest_nome,dest_uf,dest_cmun,dest_xmun").eq("empresa_id", (empresa as any).id).in("chave", chs0);
            const rows0 = ((nfs0 as any[]) || []);
            if (rows0.length > 0) nfRef = rows0[0];
          }
        } catch {}
        remD = dg(tag("infCte > rem > CNPJ") || tag("infCte > rem > CPF")) || dg(nfRef?.emit_cnpj) || dg(tag("infCte > emit > CNPJ") || tag("infCte > emit > CPF"));
        dstD = dg(tag("infCte > dest > CNPJ") || tag("infCte > dest > CPF"));
        tomaD = dg(xmlDoc.querySelector("toma4 > CNPJ")?.textContent || xmlDoc.querySelector("toma4 > CPF")?.textContent || xmlDoc.querySelector("infCte > toma > CNPJ")?.textContent || "");
        if (!tomaD) {
          const t3 = (xmlDoc.querySelector("toma3 > toma")?.textContent || xmlDoc.querySelector("infCte > toma > toma")?.textContent || "").trim();
          tomaD = t3 === "0" ? remD : t3 === "3" ? dstD : "";
        }
          if (!dstD && nfRef) {
            const dd = dg(nfRef.dest_cnpj);
            if (dd) dstD = dd;
          }
        if (empresa && remD && dstD) {
          const { data: prcs } = await supabase.from("cte_percursos" as any).select("obs_gerais,coleta_xmun,coleta_uf,entrega_xmun,entrega_uf,rem_cnpj,dest_cnpj,toma_cnpj,rem_nome,rem_xmun,rem_uf,rem_logradouro,rem_nro,rem_bairro,rem_cep,rem_ie,rem_fone,dest_nome,dest_xmun,dest_uf,dest_logradouro,dest_nro,dest_bairro,dest_cep,dest_ie,dest_fone").eq("empresa_id", (empresa as any).id);
          const list = ((prcs as any[]) || []);
          hit = list.find(pp => dg(pp.rem_cnpj) === remD && dg(pp.dest_cnpj) === dstD && (!tomaD || dg(pp.toma_cnpj) === tomaD)) || list.find(pp => dg(pp.rem_cnpj) === remD && dg(pp.dest_cnpj) === dstD) || null;
          if (hit) { percObs = hit.obs_gerais || ""; percColX = hit.coleta_xmun || ""; percColU = hit.coleta_uf || ""; percEntX = hit.entrega_xmun || ""; percEntU = hit.entrega_uf || ""; percDstDoc = hit.dest_cnpj || ""; percDstNome = hit.dest_nome || ""; percDstX = hit.dest_xmun || ""; percDstU = hit.dest_uf || ""; percDstLog = hit.dest_logradouro || ""; percDstNro = hit.dest_nro || ""; percDstBairro = hit.dest_bairro || ""; percDstCep = hit.dest_cep || ""; percDstIE = hit.dest_ie || ""; percDstFone = hit.dest_fone || ""; percRemNome = hit.rem_nome || ""; percRemX = hit.rem_xmun || ""; percRemU = hit.rem_uf || ""; percRemLog = hit.rem_logradouro || ""; percRemNro = hit.rem_nro || ""; percRemBairro = hit.rem_bairro || ""; percRemCep = hit.rem_cep || ""; percRemIE = hit.rem_ie || ""; percRemFone = hit.rem_fone || ""; }
        }
      } catch {}
      let ctDstNome = "", ctDstX = "", ctDstU = "";
      try {
        if (empresa && (remD || dstD || tomaD)) {
          const { data: cts } = await supabase.from("fiscal_cadastros" as any).select("documento,nome,cidade,uf").eq("empresa_id", (empresa as any).id);
          const cl = ((cts as any[]) || []);
          const fnd = (dd: string) => cl.find(cc => String(cc.documento || "").replace(/\D/g, "") === dd);
          const cD = dstD ? fnd(dstD) : null;
          if (cD) { ctDstNome = cD.nome || ""; ctDstX = cD.cidade || ""; ctDstU = cD.uf || ""; }
        }
      } catch {}
      let cRemFull: any = null, cDstFull: any = null, cTomFull: any = null, emitFoneE = "";
      try {
        if (empresa && (remD || dstD || tomaD)) {
          const { data: cts2 } = await supabase.from("fiscal_cadastros" as any).select("documento,nome,logradouro,numero,bairro,cidade,uf,cep,ie,telefone").eq("empresa_id", (empresa as any).id);
          const cl2 = ((cts2 as any[]) || []);
          const f2 = (dd: string) => cl2.find(cc => String(cc.documento || "").replace(/\D/g, "") === dd);
          if (remD) cRemFull = f2(remD);
          if (dstD) cDstFull = f2(dstD);          if (tomaD) cTomFull = f2(tomaD);
          const emitD = dg(tag("infCte > emit > CNPJ") || tag("infCte > emit > CPF"));
          if (emitD) { const cEmi = f2(emitD); if (cEmi) emitFoneE = ((cEmi as any).telefone || "").replace(/\D/g, ""); }
        }
      } catch {}
      let emitFoneC = "", remFoneC = "", motoCPFC = "", segCNPJC = "";
      try {
        if (empresa && (remD || tomaD)) {
          const { data: cts2 } = await supabase.from("fiscal_cadastros" as any).select("documento,telefone").eq("empresa_id", (empresa as any).id);
          const cl2 = ((cts2 as any[]) || []);
          const f2 = (dd: string) => cl2.find(cc => String(cc.documento || "").replace(/\D/g, "") === dd);
          const cE = remD ? f2(remD) : null;
          if (cE) { emitFoneC = ((cE as any).telefone || "").replace(/\D/g, ""); remFoneC = emitFoneC; }
        }
        const segId = (pjForm as any).seguradoraId || "";
        if (empresa && segId) {
          const { data: sg } = await supabase.from("seguradoras" as any).select("cnpj").eq("empresa_id", (empresa as any).id).eq("id", segId).maybeSingle();
          if (sg) segCNPJC = (sg as any).cnpj || "";
        }
        const motId = (pjForm as any).motoristaId || "";
        if (empresa && motId) {
          const { data: cb } = await supabase.from("colaboradores" as any).select("cpf").eq("empresa_id", (empresa as any).id).eq("id", motId).maybeSingle();
          if (cb) motoCPFC = String((cb as any).cpf || "").replace(/\D/g, "");
        }
      } catch {}
      let destNomeFix = tag("infCte > dest > xNome") || (nfRef?.dest_nome || "") || "";
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) destNomeFix = percDstNome;
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) destNomeFix = ctDstNome;
      if (!destNomeFix || destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) destNomeFix = tag("infCte > toma > xNome") || "";
      if (destNomeFix.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) destNomeFix = "";
      let healed = false;
      if (!hit && empresa && remD.length === 14 && dstD.length === 14) {
        try {
          const { data: mx } = await supabase.from("cte_percursos" as any).select("codigo").eq("empresa_id", (empresa as any).id).order("codigo", { ascending: false }).limit(1);
          const last = parseInt(((((mx as any[]) || [])[0] as any)?.codigo || "0"), 10) || 0;
          const detX1 = tag("det > xMunIni") || "";
          const detX2 = tag("det > xMunFim") || "";
          const nmA = tag("infCte > emit > xNome") || remD;
          let nmB = tag("infCte > toma > xNome") || "";
          if (!nmB || nmB.startsWith("CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO")) nmB = dstD;
          const { error: insErr } = await supabase.from("cte_percursos" as any).insert({ empresa_id: (empresa as any).id, codigo: String(last + 1).padStart(4, "0"), nome: (nmA + " > " + nmB).slice(0, 120), rem_cnpj: remD, dest_cnpj: dstD, toma_cnpj: tomaD, coleta_xmun: detX1, coleta_uf: tag("infCte > ide > UFIni") || "", entrega_xmun: detX2, entrega_uf: tag("infCte > ide > UFFim") || "", cfop: tag("infCte > ide > CFOP") || "5353", obs_gerais: "" });
          if (!insErr) healed = true;
          else { const k2 = "perc-err:" + (doc.chave_acesso || ""); try { const g = localStorage.getItem(k2); if (!g) { localStorage.setItem(k2, "1"); toast.warning("Percurso auto: " + String((insErr as any)?.message || insErr).slice(0, 140)); } } catch {} }
        } catch {}
      }
      const percWarnKey = "perc-warn:" + (doc.chave_acesso || "");
      const percWarned = (() => { try { return !!localStorage.getItem(percWarnKey); } catch { return false; } })();
      if (!healed && !percObs && !percColX && !percWarned) { try { localStorage.setItem(percWarnKey, "1"); } catch {} toast.warning("Percurso nao localizado: obs e cidades ficam em branco"); }
      if (healed) toast.info("Percurso criado automaticamente - complete a observacao em Percursos");
      const xmlComps = Array.from(xmlDoc.querySelectorAll("vPrest > Comp")).map(cc => ({ nome: (cc.querySelector("xNome")?.textContent || "").trim(), valor: parseFloat(cc.querySelector("vComp")?.textContent || "0") || 0 })).filter(cc => cc.nome).slice(0, 8);
      const dhEmi = tag("infCte > ide > dhEmi") || "";
      const versaoCte = xmlDoc.querySelector("infCte")?.getAttribute("versao") || "4.00";
      const toma3 = (xmlDoc.querySelector("toma3 > toma")?.textContent || "").trim();
      const toma4x = !!xmlDoc.querySelector("toma4, infCte > toma4");
      const proPred = tag("infCte > infCarga > proPred") || "";
      const xOutCat = tag("infCte > infCarga > xOutCat") || "";
      const infQ = Array.from(xmlDoc.querySelectorAll("infCte > infCarga > infQ")).map(q => ({ q: q.querySelector("qCarga")?.textContent || "", um: q.querySelector("tpMed")?.textContent || q.querySelector("cUnid")?.textContent || "" })).slice(0, 3);
      const ibsBase = tag("infCte > imp > IBSCBS > vBC") || tag("infCte > imp > IBSCBS > vBCIBS") || "";
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
      const veicsXml = Array.from(rodoEl?.querySelectorAll("veic, reboque") || []).map(v => ({ tipo: (/^t/i.test(v.querySelector("tpProp")?.textContent || "") ? "Terceiro" : "Própria"), placa: v.querySelector("placa")?.textContent || "", renavam: v.querySelector("RENAVAM")?.textContent || "", uf: v.querySelector("UF")?.textContent || "", rntrc: v.querySelector("RNTRC")?.textContent || rq("RNTRC") || "" }));
      const motoEl = rodoEl?.querySelector("moto");
      const propEl = rodoEl?.querySelector("prop");
      const valeEl = rodoEl?.querySelector("valePed");
      const lacresXml = Array.from(rodoEl?.querySelectorAll("lacRodo > nLacre") || []).map(e => (e.textContent || "").trim()).filter(Boolean).join(", ");
      const rodoRNTRC = rq("RNTRC") || "";
      const emitUfXml = tag("infCte > emit > enderEmit > UF") || "";
      const placasForm = [(pjForm as any).placaVeiculo, (pjForm as any).placaReboque, (pjForm as any).semiReboque1, (pjForm as any).semiReboque2].map(p => String(p || "").toUpperCase()).filter(Boolean);
      let veicsFrota: Array<any> = [];
      try {
        if (empresa && placasForm.length) {
          const { data: fv } = await supabase.from("veiculos" as never).select("placa,renavam,rntrc").eq("empresa_id", (empresa as any).id).in("placa", placasForm);
          veicsFrota = ((fv as any[]) || []);
        }
      } catch {}
      const temPlacaXml = new Set(veicsXml.map(v => String(v.placa || "").toUpperCase()));
      const veicsFin = [...veicsXml, ...placasForm.filter(p => !temPlacaXml.has(p)).map(p => {
        const fv = veicsFrota.find((x: any) => String(x.placa || "").toUpperCase() === p);
        return { tipo: "Própria", placa: p, renavam: fv?.renavam || "", uf: emitUfXml, rntrc: fv?.rntrc || rodoRNTRC };
      })].slice(0, 4);
      const remLogRaw = tag("infCte > rem > enderRem > xLgr") || percRemLog || (cRemFull as any)?.logradouro || tag("infCte > emit > enderEmit > xLgr") || "";
      const remNroRaw = tag("infCte > rem > enderRem > nro") || percRemNro || (cRemFull as any)?.numero || tag("infCte > emit > enderEmit > nro") || "";
      const remCepRaw = tag("infCte > rem > enderRem > CEP") || percRemCep || (cRemFull as any)?.cep || tag("infCte > emit > enderEmit > CEP") || "";
      const dstLogRaw = tag("infCte > dest > enderDest > xLgr") || percDstLog || (cDstFull as any)?.logradouro || "";
      const dstNroRaw = tag("infCte > dest > enderDest > nro") || percDstNro || (cDstFull as any)?.numero || "";
      const dstCepRaw = tag("infCte > dest > enderDest > CEP") || percDstCep || (cDstFull as any)?.cep || "";
      const tomLogRaw = tag("infCte > toma > enderToma > xLgr") || (cTomFull as any)?.logradouro || "";
      const tomNroRaw = tag("infCte > toma > enderToma > nro") || (cTomFull as any)?.numero || "";
      const tomCepRaw = tag("infCte > toma > enderToma > CEP") || (cTomFull as any)?.cep || "";
      const tomBairroRaw = tag("infCte > toma > enderToma > xBairro") || (cTomFull as any)?.bairro || "";
      const emitLogRaw = tag("infCte > emit > enderEmit > xLgr") || "";
      const emitNroRaw = tag("infCte > emit > enderEmit > nro") || "";
      const emitCepRaw = tag("infCte > emit > enderEmit > CEP") || "";
      const [emitLogEnr, remLogEnr, dstLogEnr, tomLogEnr] = await Promise.all([completarLogradouro(emitLogRaw, emitCepRaw), completarLogradouro(remLogRaw, remCepRaw), completarLogradouro(dstLogRaw, dstCepRaw), completarLogradouro(tomLogRaw, tomCepRaw)]);
      try {
        const pendUpd: Array<any> = [];
        const fixCad = (docDigits: string, atual: string, novo: string) => {
          if (!empresa || !docDigits || !novo || novo === atual) return;
          if (atual && temTipoLogradouro(atual)) return;
          pendUpd.push(supabase.from("fiscal_cadastros" as any).update({ logradouro: novo }).eq("empresa_id", (empresa as any).id).eq("documento", docDigits));
        };
        fixCad(remD, ((cRemFull as any)?.logradouro || ""), remLogEnr);
        fixCad(dstD, ((cDstFull as any)?.logradouro || ""), dstLogEnr);
        if (pendUpd.length) await Promise.all(pendUpd);
      } catch {}
      let totQVol = 0;
      try {
        const chavesNfeXml = Array.from(xmlDoc.querySelectorAll("det > infNFe > chNFe")).map(e => (((e as any).textContent) || "").replace(/\D/g, "")).filter(c => c.length >= 20);
        if (empresa && chavesNfeXml.length) {
          const { data: qrows } = await supabase.from("cte_nfes_pendentes" as any).select("qvol").eq("empresa_id", (empresa as any).id).in("chave", chavesNfeXml);
          totQVol = (((qrows as any[]) || []).reduce((a: number, r: any) => a + (Number(r?.qvol) || 0), 0));
        }
      } catch {}
            const pdfBlob = gerarDactePdf({
        chave: doc.chave_acesso || "",
        numero: doc.numero || "",
        serie: doc.serie || "1",
        ambiente: doc.ambiente || "producao",
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
        tomadorEndereco: `${tomLogEnr}${tomNroRaw ? ", " + tomNroRaw : ""}${tomBairroRaw ? " - " + tomBairroRaw : ""}`.trim(),
        tomadorFone: tag("infCte > toma > fone") || (cTomFull as any)?.telefone || "",
        tomadorCidade: tag("infCte > toma > enderToma > xMun") || "",
        tomadorUF: tag("infCte > toma > enderToma > UF") || "",
        remCnpj: tag("infCte > rem > CNPJ") || tag("infCte > rem > CPF") || dg(nfRef?.emit_cnpj) || tag("infCte > emit > CNPJ") || "",
        remNome: tag("infCte > rem > xNome") || (nfRef?.emit_nome || "") || percRemNome || tag("infCte > emit > xNome") || "",
        remCidade: tag("infCte > rem > enderRem > xMun") || (nfRef?.emit_xmun || "") || percRemX || (cRemFull as any)?.cidade || tag("infCte > emit > enderEmit > xMun") || "",
        remUF: tag("infCte > rem > enderRem > UF") || (nfRef?.emit_uf || "") || percRemU || (cRemFull as any)?.uf || tag("infCte > emit > enderEmit > UF") || "",
        remEndereco: ((remLogEnr || "") + " " + (remNroRaw || "")).trim(),
        remBairro: tag("infCte > rem > enderRem > xBairro") || percRemBairro || (cRemFull as any)?.bairro || tag("infCte > emit > enderEmit > xBairro") || "",
        remCEP: tag("infCte > rem > enderRem > CEP") || percRemCep || (cRemFull as any)?.cep || tag("infCte > emit > enderEmit > CEP") || "",
        remIE: tag("infCte > rem > IE") || percRemIE || (cRemFull as any)?.ie || tag("infCte > emit > IE") || "",
        remFone: remFoneC || percRemFone,
        destCnpj: tag("infCte > dest > CNPJ") || percDstDoc || dstD || tag("infCte > toma > CNPJ") || "",
        destNome: destNomeFix,
        destCidade: tag("infCte > dest > enderDest > xMun") || (nfRef?.dest_xmun || "") || percDstX || ctDstX || (cDstFull as any)?.cidade || tag("infCte > toma > enderToma > xMun") || "",
        destUF: tag("infCte > dest > enderDest > UF") || (nfRef?.dest_uf || "") || percDstU || ctDstU || (cDstFull as any)?.uf || tag("infCte > toma > enderToma > UF") || "",
        destEndereco: ((dstLogEnr || "") + " " + (dstNroRaw || "")).trim() || "",
        destBairro: tag("infCte > dest > enderDest > xBairro") || percDstBairro || (cDstFull as any)?.bairro || "",
        destCEP: tag("infCte > dest > enderDest > CEP") || percDstCep || (cDstFull as any)?.cep || "",
        destIE: tag("infCte > dest > IE") || percDstIE || (cDstFull as any)?.ie || "",
        destFone: percDstFone || (cDstFull as any)?.telefone || "",
        expCnpj: tag("infCte > exped > CNPJ") || "",
        expNome: tag("infCte > exped > xNome") || "",
        expCidade: tag("infCte > exped > enderExped > xMun") || "",
        expUF: tag("infCte > exped > enderExped > UF") || "",
        expEndereco: ((tag("infCte > exped > enderExped > xLgr") || "") + " " + (tag("infCte > exped > enderExped > nro") || "")).trim(),
        expIE: tag("infCte > exped > IE") || "",
        recCnpj: tag("infCte > receb > CNPJ") || "",
        recNome: tag("infCte > receb > xNome") || "",
        recCidade: tag("infCte > receb > enderReceb > xMun") || "",
        recUF: tag("infCte > receb > enderReceb > UF") || "",
        recEndereco: ((tag("infCte > receb > enderReceb > xLgr") || "") + " " + (tag("infCte > receb > enderReceb > nro") || "")).trim(),
        recIE: tag("infCte > receb > IE") || "",
        cfop: tag("infCte > ide > CFOP") || "5353",
        cfopDescricao: (CFOPS_CTE.find(c => c.codigo === (tag("infCte > ide > CFOP") || "5353"))?.descricao || ""),
        naturezaOperacao: tag("infCte > ide > natOp") || "TRANSPORTE",
        origemCidade: tag("det > xMunIni") || tag("infCte > ide > xMunIni") || pjForm.xMunIni || percColX || "",
        origemUF: tag("infCte > ide > UFIni") || pjForm.ufIni || percColU || "",
        destinoCidade: tag("det > xMunFim") || tag("infCte > ide > xMunFim") || pjForm.xMunFim || percEntX || "",
        destinoUF: tag("infCte > ide > UFFim") || pjForm.ufFim || percEntU || "",
        valorServico: parseFloat(tag("infCte > vPrest > vTPrest")) || Number(doc.valor_servico) || 0,
        valorCarga: parseFloat(tag("infCte > infCarga > vCarga")) || parseFloat(tag("infCte > infCarga > vMerc")) || 0,
        pesoKg: parseFloat(tag("infCte > infCarga > qCarga")) || 0,
        icmsCST: tagI("CST") || "00",
        icmsBase: parseFloat(tagI("vBC")) || 0,
        icmsAliq: parseFloat(tagI("pICMS")) || 0,
        icmsValor: parseFloat(tagI("vICMS")) || 0,
        nFes,
        comps: xmlComps.length > 0 ? xmlComps : (([['Frete Valor', (pjForm as any).vPrest], ['Adicional', (pjForm as any).adicionalPed], ['Desconto', (pjForm as any).descontoPed], ['Outros', (pjForm as any).outrosPed], ['Ad Valorem', (pjForm as any).adValorem], ['GRIS', (pjForm as any).gris], ['Coleta', (pjForm as any).taxaColeta], ['Entrega', (pjForm as any).taxaEntrega]] as Array<[string, any]>).filter(([, vv]) => Number(vv) !== 0).map(([nn, vv]) => ({ nome: nn, valor: Number(vv) || 0 }))),
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
        valePedFornCNPJ: valeEl?.querySelector("cnpjForn")?.textContent || valeEl?.querySelector("CNPJForn")?.textContent || (pjForm as any).pedagioCnpj || "",
        valePedComprov: valeEl?.querySelector("nCompra")?.textContent || valeEl?.querySelector("nComp")?.textContent || (pjForm as any).pedagioIdentVPO || (pjForm as any).pedagioTag || "",
        valePedRespCNPJ: valeEl?.querySelector("cnpjResp")?.textContent || valeEl?.querySelector("CNPJResp")?.textContent || (pjForm as any).pedagioRespCnpj || "",
        ibsBase, ibsCST, ibsClass,
        cbsAliq: gtxt(gCBS, "pCBS"), cbsValor: gtxt(gCBS, "vCBS"),
        ibsMunAliq: gtxt(gMun, "pIBSMun"), ibsMunValor: gtxt(gMun, "vIBSMun"),
        ibsUfAliq: gtxt(gUF, "pIBSUF"), ibsUfValor: gtxt(gUF, "vIBSUF"),
        vTotTrib,
        infoAdicionais: complXEmi,
        ciot: rq("CIOT") || (pjForm as any).ciot || "",
        dataPrevEntrega: rq("dPrev") || "",
        veiculos: veicsFin,
        motoNome: motoEl?.querySelector("xNome")?.textContent || (pjForm as any).motoristaNome || "",
        motoCPF: motoEl?.querySelector("CPF")?.textContent || motoCPFC,
        lacres: lacresXml,
        propDoc: propEl?.querySelector("CNPJ")?.textContent || propEl?.querySelector("CPF")?.textContent || "",
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
  const emptyForm = { toma: "3", ieDestinatario: "", cnpjTomador: "", xNomeTomador: "", ufTomador: "MG", cMunTomador: "3106200", xMunTomador: "BELO HORIZONTE", ieTomador: "", logradouroTomador: "", nroTomador: "", bairroTomador: "", cepTomador: "", foneTomador: "", emailTomador: "", cnpjConsignatario: "", xNomeConsignatario: "", ieConsignatario: "", ufConsignatario: "", xMunConsignatario: "", cepConsignatario: "", logradouroConsignatario: "", nroConsignatario: "", bairroConsignatario: "", cnpjRedespacho: "", xNomeRedespacho: "", ieRedespacho: "", ufRedespacho: "", xMunRedespacho: "", cepRedespacho: "", logradouroRedespacho: "", nroRedespacho: "", bairroRedespacho: "", ambiente: "homologacao" as "homologacao" | "producao", cfop: "5353", vPrest: "0.00", vCarga: "0.00", peso: "0", rntrc: "", icmsCST: "00", icmsBase: "1000.00", icmsAliq: "0.00", icmsValor: "0.00", reducaoBase: "0.00", creditoOutorgado: "0.00", pisAliq: "0.00", cofinsAliq: "0.00", irAliq: "0.00", inssAliq: "0.00", csllAliq: "0.00", motoristaNome: "", motoristaId: "", ciot: "", placaVeiculo: "", placaReboque: "", semiReboque1: "", semiReboque2: "", seguradoraNome: "", seguradoraId: "", apolice: "", averbacao: "", cMunEnv: "3106200", xMunEnv: "BELO HORIZONTE", ufEnv: "MG", cMunIni: "3106200", xMunIni: "BELO HORIZONTE", ufIni: "MG", cMunFim: "3550308", xMunFim: "SAO PAULO", ufFim: "SP",     dataEmissao: new Date().toISOString().slice(0,10),
    formaPagamento: "Outros", finalidadeEmissao: "Normal", tipoServico: "Normal", formaEmissao: "Normal", modoEmbarque: "avulso" as "avulso" | "redespacho",
    cteReferenciado: "", chaveCompAnulacao: "", dataDeclaracao: "",
    obsGerais: "", obsAnulacao: "", obsGlobalizado: "",
    adicionalPed: "0.00", descontoPed: "0.00", outrosPed: "0.00", adValorem: "0.00", gris: "0.00", taxaColeta: "0.00", taxaEntrega: "0.00", valePedagio: "0.00", pedagioPagto: "sem-pagamento", pedagioOperadora: "", pedagioCnpj: "", pedagioTag: "", pedagioRespCnpj: "", pedagioIdentVPO: "", pedagioDataOp: "", distanciaKm: "", duracaoHoras: "", rctrC: "0.00", rcfDc: "0.00", segAdicional: "0.00", segTotal: "0.00", segRepassar: "", segResponsavel: "4",
  };
  // Percurso NÃO guarda motorista nem frete: ao abrir um CT-e novo, esses dados de viagem zeram
  const LIMPA_VIAGEM = { motoristaNome: "", motoristaId: "", ciot: "", placaVeiculo: "", placaReboque: "", semiReboque1: "", semiReboque2: "", vPrest: "0.00", adicionalPed: "0.00", descontoPed: "0.00", outrosPed: "0.00", adValorem: "0.00", gris: "0.00", taxaColeta: "0.00", taxaEntrega: "0.00", valePedagio: "0.00", pedagioPagto: "sem-pagamento", pedagioOperadora: "", pedagioCnpj: "", pedagioTag: "", pedagioRespCnpj: "", pedagioIdentVPO: "", pedagioDataOp: "", distanciaKm: "", duracaoHoras: "" };
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
  // Novo CT-e preservando dados fiscais (CFOP, impostos, status) — só limpa dados da NF/tomador/rota
  const novoCtePreservandoFiscal = () => {
    setForm(f => {
      const keep: any = {};
      for (const k of ["ambiente", "cfop", "icmsCST", "icmsAliq", "reducaoBase", "creditoOutorgado", "pisAliq", "cofinsAliq", "irAliq", "inssAliq", "csllAliq", "formaPagamento", "finalidadeEmissao", "tipoServico", "formaEmissao"]) keep[k] = (f as any)[k];
      return { ...emptyForm, ...keep, ...LIMPA_VIAGEM };
    });
    setSelecionadas(new Set());
    setEditingRascunhoId(null);
    setOpen(true);
  };
  const [cfopOpen, setCfopOpen] = useState(false);
  const [cfopQuery, setCfopQuery] = useState("");
  useEffect(() => {
    if (!open || !empresa) return;
    const cnpjEmp = String((empresa as any).cnpj || "").replace(/\D/g, "");
    if (cnpjEmp.length !== 14) return;
    setForm(f => (f.pedagioRespCnpj ? f : { ...f, pedagioRespCnpj: cnpjEmp }));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dEmi = String(form.dataEmissao || "").slice(0, 10);
    if (!dEmi) return;
    setForm(f => (f.pedagioDataOp === dEmi ? f : { ...f, pedagioDataOp: dEmi }));
  }, [open, form.dataEmissao]);

  // Total da prestação = Valor Serviço + componentes − Desconto (vale-pedágio NÃO integra: Lei 10.209/2001 art. 2º)
  const num2 = (v: any) => parseFloat(v) || 0;
  const totalPrestacao = (f: typeof emptyForm) =>
    Math.max(0, num2(f.vPrest) + num2(f.adicionalPed) + num2(f.outrosPed) + num2(f.adValorem) + num2(f.gris) + num2(f.taxaColeta) + num2(f.taxaEntrega) - num2(f.descontoPed));

  // Pedágio: com cobrança (Free Flow / TAGs) os dados são obrigatórios — alimentam o MDF-e e barram a emissão
  const Traciona = (tipo: any) => { const t = String(tipo || "").toLowerCase(); return t.indexOf("cavalo") >= 0 || (t.indexOf("truck") >= 0 && t.indexOf("bitruck") < 0); };
  const validarPedagio = (f: typeof emptyForm) => {
    const modo = pagtoSeguro(f.pedagioPagto) as string;
    if (modo === "sem-pagamento") return;
    const rotulo = modo === "free-flow" ? "Free Flow" : modo === "tag-transportador" ? "TAG Transportador" : "TAG Tomador";
    const errs: string[] = [];
    if (!((f.pedagioOperadora || "").trim())) errs.push("Operadora");
    if ((f.pedagioCnpj || "").replace(/\D/g, "").length !== 14) errs.push("CNPJ da Operadora (14 dígitos)");
    if ((parseFloat(f.valePedagio) || 0) <= 0) errs.push("Vale Pedágio (R$) maior que zero");
    if (((f as any).pedagioRespCnpj || "").replace(/\D/g, "").length !== 14) errs.push("CNPJ Resp. Pagto (14 dígitos)");
    if (!(((f as any).pedagioIdentVPO || "").trim()) && !((f.pedagioTag || "").trim())) errs.push("Identificador VPO");
    if ((modo === "tag-transportador" || modo === "tag-tomador") && !((f.pedagioTag || "").trim())) errs.push("Nº TAG");
    if (errs.length) throw new Error(`Pedágio obrigatório (${rotulo}): informe ${errs.join("; ")}`);
  };

  // Auto-calcula ICMS sobre o TOTAL da prestação: vICMS = base * aliquota / 100
  useEffect(() => {
    const base = totalPrestacao(form);
    const aliq = parseFloat(form.icmsAliq) || 0;
    const calc = (base * aliq / 100).toFixed(2);
    if (calc !== form.icmsValor) setForm(f => ({ ...f, icmsValor: calc }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vPrest, form.adicionalPed, form.descontoPed, form.outrosPed, form.adValorem, form.gris, form.taxaColeta, form.taxaEntrega, form.icmsAliq]);

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
      setMercadorias(mapped);
      if (mapped.length > 0 && mapped[0].emitCMun) {
        const first = mapped[0];
        setForm(f => ({
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
  const { data: rntrcCad } = useQuery({
    enabled: !!empresa,
    queryKey: ["rntrc-cte", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rntrc_lista" as never).select("rntrc,cnpj").eq("empresa_id", empresa!.id).order("rntrc");
      if (error) throw error;
      const rows = ((data ?? []) as Array<{ rntrc: string; cnpj: string | null }>);
      const empDigits = String((empresa as any).cnpj || "").replace(/\D/g, "");
      return rows.find(r => String(r.cnpj || "").replace(/\D/g, "") === empDigits && empDigits)?.rntrc || rows[0]?.rntrc || "";
    },
  });
  const normRntrc8 = (v: string) => { const u = String(v || "").toUpperCase(); if (u === "ISENTO") return u; let d = u.replace(/\D/g, ""); while (d.length > 8 && d.startsWith("0")) d = d.slice(1); return d; };
  const rntrcFinal = normRntrc8(rntrcCad || form.rntrc || "");
  const { data: veiculos } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos-cte", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos" as never).select("id,placa,marca_modelo,tipo,renavam,rntrc,tag_pedagio").eq("empresa_id", empresa!.id).order("placa").limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; placa: string; marca_modelo: string | null; tipo: string | null; renavam: string | null; rntrc: string | null; tag_pedagio: string | null }>;
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
      const { data } = await supabase.from("fiscal_cadastros" as any).select("*").eq("empresa_id", empresa.id).eq("documento", digits).maybeSingle();
      if (data) {
        const c = data as any;
        return { nome: c.nome || "", logradouro: c.logradouro || "", numero: c.numero || "", bairro: c.bairro || "", cidade: c.cidade || "", uf: c.uf || "", cep: String(c.cep || "").replace(/\D/g, ""), fone: c.telefone || "", ie: c.ie || "", fromContatos: true };
      }
    }
    let d: any = null;
    for (const url of [`https://brasilapi.com.br/api/cnpj/v1/${digits}`, `https://receitaws.com.br/v1/cnpj/${digits}`]) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { d = await res.json(); break; }
      } catch { /* tenta próxima */ }
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
  // Insert resiliente: tenta com `ie`, se a migration ainda não foi aplicada reinsere sem
  const insertContatoResiliente = async (row: Record<string, unknown>) => {
    const { error } = await supabase.from("fiscal_cadastros" as any).insert(row as any);
    if (error && /ie/i.test(error.message || "")) {
      const { ie: _omit, ...semIe } = row;
      await supabase.from("fiscal_cadastros" as any).insert(semIe as any);
    }
  };
  const lookupConsignatario = async (digits: string) => {
    if (digits.length !== 14 || !empresa) return;
    setLookingUpConsig(true);
    try {
      const d = await buscarDadosCnpj(digits);
      if (!d) { toast.error("CNPJ não encontrado"); return; }
      setForm(f => ({ ...f, cnpjConsignatario: digits, xNomeConsignatario: d.nome || f.xNomeConsignatario, ieConsignatario: (d as any).ie || f.ieConsignatario, ufConsignatario: d.uf || f.ufConsignatario, xMunConsignatario: d.cidade || f.xMunConsignatario, cepConsignatario: d.cep || f.cepConsignatario, logradouroConsignatario: d.logradouro || f.logradouroConsignatario, nroConsignatario: d.numero || f.nroConsignatario, bairroConsignatario: d.bairro || f.bairroConsignatario }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({ empresa_id: empresa.id, nome: d.nome, documento: digits, uf: d.uf || null, cidade: d.cidade || null, logradouro: d.logradouro || null, numero: d.numero || null, bairro: d.bairro || null, cep: d.cep || null, telefone: d.fone || null });
      }
      toast.success("Consignatário localizado");
    } catch (e: any) { toast.error(e.message || "Falha ao buscar CNPJ"); }
    finally { setLookingUpConsig(false); }
  };
  const lookupRedespacho = async (digits: string) => {
    if (digits.length !== 14 || !empresa) return;
    setLookingUpRedesp(true);
    try {
      const d = await buscarDadosCnpj(digits);
      if (!d) { toast.error("CNPJ não encontrado"); return; }
      setForm(f => ({ ...f, cnpjRedespacho: digits, xNomeRedespacho: d.nome || f.xNomeRedespacho, ieRedespacho: (d as any).ie || f.ieRedespacho, ufRedespacho: d.uf || f.ufRedespacho, xMunRedespacho: d.cidade || f.xMunRedespacho, cepRedespacho: d.cep || f.cepRedespacho, logradouroRedespacho: d.logradouro || f.logradouroRedespacho, nroRedespacho: d.numero || f.nroRedespacho, bairroRedespacho: d.bairro || f.bairroRedespacho }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({ empresa_id: empresa.id, nome: d.nome, documento: digits, uf: d.uf || null, cidade: d.cidade || null, logradouro: d.logradouro || null, numero: d.numero || null, bairro: d.bairro || null, cep: d.cep || null, telefone: d.fone || null });
      }
      toast.success("Redespacho localizado");
    } catch (e: any) { toast.error(e.message || "Falha ao buscar CNPJ"); }
    finally { setLookingUpRedesp(false); }
  };

  // Contatos p/ completar Remetente/Destinatário na tela (XML pode não trazer endereço/IE)
  const { data: contatosCte } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cte", empresa?.id],
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase.from("fiscal_cadastros" as any).select("documento,nome,ie,logradouro,numero,bairro,cidade,uf,cep,telefone").eq("empresa_id", empresa!.id);
      return (data ?? []) as any[];
    },
  });
  const contatoByDoc = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of contatosCte ?? []) if ((c as any).documento) m.set(String((c as any).documento).replace(/\D/g, ""), c);
    return m;
  }, [contatosCte]);
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
      if (!d) { toast.error("CNPJ não encontrado"); return; }
      setForm(f => ({ ...f, cnpjTomador: digits, xNomeTomador: d.nome || f.xNomeTomador, ieTomador: (d as any).ie || f.ieTomador, ufTomador: d.uf || f.ufTomador, xMunTomador: d.cidade || f.xMunTomador, cepTomador: d.cep || f.cepTomador, logradouroTomador: d.logradouro || f.logradouroTomador, nroTomador: d.numero || f.nroTomador, bairroTomador: d.bairro || f.bairroTomador, foneTomador: (d as any).fone || f.foneTomador }));
      if (!(d as any).fromContatos && d.nome) {
        await insertContatoResiliente({ empresa_id: empresa.id, nome: d.nome, documento: digits, uf: d.uf || null, cidade: d.cidade || null, logradouro: d.logradouro || null, numero: d.numero || null, bairro: d.bairro || null, cep: d.cep || null, telefone: (d as any).fone || null });
      }
      toast.success("Tomador localizado");
    } catch (e: any) { toast.error(e.message || "Falha ao buscar CNPJ"); }
    finally { setLookingUpTomador(false); }
  };
  // Escolheu/digitou CNPJ no dropdown: define toma (0 emit / 1 dest / 2 terceiros) e busca dados
  const onPickContatoTomador = (digits: string) => {
    const d = (digits || "").replace(/\D/g, "");
    if (d.length !== 14) return;
    const sel = mercadorias.filter(m => selecionadas.has(m.chave));
    const a = sel.length > 0 ? sel[0] : mercadorias[0];
    const emitD = a ? (a.emitCnpj || "").replace(/\D/g, "") : "";
    const destD = a ? (a.destCnpj || "").replace(/\D/g, "") : "";
    setForm(f => ({ ...f, toma: d && d === emitD ? "0" : d && d === destD ? "1" : "2" }));
    lastLookupTomador.current = d;
    lookupTomador(d);
    setTomadorOpen(false);
    setTomadorQuery("");
  };
  const aplicarTomadorPorToma = (v: string) => {
    const sel = mercadorias.filter(m => selecionadas.has(m.chave));
    const first = (sel.length > 0 ? sel[0] : mercadorias[0]) as any;
    if (!first) { setForm(f => ({ ...f, toma: v })); return; }
    const isEmit = v === "0" || v === "3";
    const isDest = v === "1" || v === "4";
    if (!isEmit && !isDest) {
      lastLookupTomador.current = "";
      setForm(f => ({ ...f, toma: v, cnpjTomador: "", xNomeTomador: "", ieTomador: "", ufTomador: "", cMunTomador: "", xMunTomador: "", cepTomador: "", logradouroTomador: "", nroTomador: "", bairroTomador: "", foneTomador: "", emailTomador: "" }));
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
    setForm(f => ({ ...f, toma: v,
      cnpjTomador: digits, xNomeTomador: src.nome || f.xNomeTomador,
      ieTomador: src.ie || c.ie || f.ieTomador,
      ufTomador: src.uf || c.uf || f.ufTomador,
      cMunTomador: src.cMun || f.cMunTomador, xMunTomador: src.xMun || c.cidade || f.xMunTomador,
      cepTomador: src.cep || (c.cep || "").replace(/\D/g, "") || f.cepTomador,
      logradouroTomador: src.lgr || c.logradouro || f.logradouroTomador,
      nroTomador: c.numero || f.nroTomador, bairroTomador: src.bai || c.bairro || f.bairroTomador,
      foneTomador: src.fone || c.telefone || f.foneTomador,
    }));
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
        const { data } = await supabase.from("fiscal_cadastros" as any).select("nome,logradouro,numero,bairro,cidade,uf,cep,telefone").eq("empresa_id", empresa!.id).eq("documento", doc).maybeSingle();
        return data || null;
      };
      const upsertContatoFromNfe = async (cnpj: string, nome: string, ie: string, uf: string, cidade: string, logradouro: string, bairro: string, cep: string, fone: string, numero: string) => {
        const doc = (cnpj || "").replace(/\D/g, "");
        if (!doc || doc.length < 11 || !nome) return;
        const { data: existente } = await supabase.from("fiscal_cadastros" as any).select("id,nome").eq("empresa_id", empresa!.id).eq("documento", doc).maybeSingle();
        if (existente) {
          const upd: Record<string, unknown> = {};
          if (!(existente as any)?.nome && nome) upd.nome = nome;
          if (ie) upd.ie = ie;
          if (uf) upd.uf = uf;
          if (cidade) upd.cidade = cidade;
          if (logradouro) upd.logradouro = logradouro;
          if (numero) upd.numero = numero;
          if (bairro) upd.bairro = bairro;
          if (cep) upd.cep = cep;
          if (fone) upd.telefone = fone;
          if (Object.keys(upd).length) await supabase.from("fiscal_cadastros" as any).update(upd).eq("empresa_id", empresa!.id).eq("documento", doc);
          return;
        }
        const { error } = await supabase.from("fiscal_cadastros" as any).insert({ empresa_id: empresa!.id, nome, documento: doc, ie: ie || null, uf: uf || null, cidade: cidade || null, logradouro: logradouro || null, numero: numero || null, bairro: bairro || null, cep: cep || null, telefone: fone || null });
        if (error && /ie/i.test(error.message || "")) {
          await supabase.from("fiscal_cadastros" as any).insert({ empresa_id: empresa!.id, nome, documento: doc, uf: uf || null, cidade: cidade || null, logradouro: logradouro || null, numero: numero || null, bairro: bairro || null, cep: cep || null, telefone: fone || null });
        }
      };
      let added = 0;
      let duplicadas = 0;
      let reservadas = 0;
      const novas: typeof mercadorias = [];
      // Status atual no banco p/ bloquear reimport de NF reservada (rascunho) ou embarcada
      const { data: existentes } = await supabase.from("cte_nfes_pendentes" as any).select("chave,status").eq("empresa_id", empresa!.id);
      const statusPorChave = new Map<string, string>((existentes as any[] || []).map(r => [String(r.chave).replace(/\D/g, ""), String(r.status)]));
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
        const emitNroXml = doc.querySelector("emit > enderEmit > nro")?.textContent || "";
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
        const destNroXml = doc.querySelector("dest > enderDest > nro")?.textContent || "";
        const vNF = doc.querySelector("total > ICMSTot > vNF")?.textContent || doc.querySelector("vNF")?.textContent || "0";
        const pesoB = doc.querySelector("transp > vol > pesoB")?.textContent || doc.querySelector("vol > pesoB")?.textContent || "";
        const nNF = doc.querySelector("ide > nNF")?.textContent || file.name.replace(/\.xml$/i, "");
        const serie = doc.querySelector("ide > serie")?.textContent || "1";
        const dhEmi = doc.querySelector("ide > dhEmi")?.textContent || "";
        const chave = doc.querySelector("infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") || doc.querySelector("chNFe")?.textContent || `${Date.now()}${added}`;
        const chaveNorm = chave.replace(/\D/g, "");
        if (!chaveNorm || chaveNorm.length < 20) { duplicadas++; continue; }
        if (novas.some(m => m.chave === chaveNorm)) { duplicadas++; continue; }
        // Bloqueia NF já reservada em rascunho ou embarcada em CT-e (evita duplicidade)
        const stExistente = statusPorChave.get(chaveNorm);
        if (chavesEmRascunho.has(chaveNorm) || (stExistente && stExistente !== "pendente")) { reservadas++; continue; }
        const peso = pesoB ? parseFloat(pesoB) : 1000;
        let qVolNum = Array.from(doc.querySelectorAll("transp > vol > qVol")).reduce((a, e) => a + (parseFloat(e.textContent || "") || 0), 0);
        if (!qVolNum) qVolNum = Array.from(doc.querySelectorAll("det > prod > qCom")).reduce((a, e) => a + (parseFloat(e.textContent || "") || 0), 0);
        const valor = parseFloat(vNF) || 0;
        const modFrete = doc.querySelector("transp > modFrete")?.textContent || "";

        // Lookup endereço no cadastro fiscal (XML de NF-e pode não trazer endereço)
        const [emitContato, destContato] = await Promise.all([lookupContato(emitCnpj), lookupContato(destCnpj)]);
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
        const { error } = await supabase.from("cte_nfes_pendentes" as any).insert(payload);
        if (error) {
          if ((error as any).code === "23505" || String(error.message).toLowerCase().includes("duplicate")) {
            duplicadas++;
            continue;
          }
          toast.error(`Falha ao salvar NF ${nNF}: ${error.message}`);
          continue;
        }
        novas.push({ chave: chaveNorm, nNF, serie, emit: emitXNome, emitCnpj, emitUF: emitUfFin, emitCMun, emitXMun: emitCidFin, emitIE, emitLogradouro: emitLog, emitBairro: emitBai, emitCEP: emitCepFin, emitFone: emitFoneFin, dest: destXNome, destCnpj, destUF: destUfFin, destCMun, destXMun: destCidFin, destIE, destLogradouro: destLog, destBairro: destBai, destCEP: destCepFin, destFone: destFoneFin, valor, peso, qVol: qVolNum, data: dhEmi.slice(0, 10), tomador: tomadorNome, tomadorCnpj, tomadorUF, tomadorCMun, tomadorXMun, tomadorIE, tomadorLogradouro: tomadorLog, tomadorBairro: tomadorBai, tomadorCEP: tomadorCep, modFrete });
        upsertContatoFromNfe(emitCnpj, emitXNome, emitIE, emitUF, emitXMun, emitLgr, emitBairro, emitCEP, emitFone, emitNro).catch(() => {});
        upsertContatoFromNfe(destCnpj, destXNome, destIE, destUF, destXMun, destLgr, destBairro, destCEP, destFone, destNro).catch(() => {});
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
        const extra = reservadas > 0 ? `, ${reservadas} bloqueada(s) (em rascunho/CT-e)` : "";
        if (duplicadas > 0) toast.success(`${added} importada(s), ${duplicadas} já existiam (chave duplicada bloqueada)${extra}`);
        else toast.success(`${added} XML(s) importado(s) — selecione os que irão no CT-e${extra}`);
      } else if (duplicadas > 0 || reservadas > 0) {
        toast.info(`${duplicadas} NF-e(s) já importadas; ${reservadas} bloqueada(s) por estar(em) em rascunho ou CT-e`);
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
    if (!confirm("Excluir este rascunho? As NF-e voltam para pendentes.")) return;
    try {
      const parsed = JSON.parse(doc.xml_assinado || "{}");
      await supabase.from("cte_documentos" as any).delete().eq("id", doc.id);
      if (parsed.nfs && parsed.nfs.length > 0) {
        for (const nf of parsed.nfs) {
          await supabase.from("cte_nfes_pendentes" as any).upsert({
            empresa_id: empresa.id, chave: nf.chave, n_nf: nf.nNF, serie: nf.serie,
            emit_nome: nf.emit, emit_cnpj: nf.emitCnpj, emit_uf: nf.emitUF, emit_cmun: nf.emitCMun, emit_xmun: nf.emitXMun,
            dest_nome: nf.dest, dest_cnpj: nf.destCnpj, dest_uf: nf.destUF, dest_cmun: nf.destCMun, dest_xmun: nf.destXMun,
            valor: nf.valor, peso: nf.peso, data_emissao: nf.data || null,
            tomador_nome: nf.tomador, tomador_cnpj: nf.tomadorCnpj, tomador_uf: nf.tomadorUF, tomador_cmun: nf.tomadorCMun, tomador_xmun: nf.tomadorXMun,
            mod_frete: nf.modFrete, status: "pendente",
          }, { onConflict: "empresa_id,chave" });
        }
      }
      toast.success("Rascunho excluído — NF-e voltaram para pendentes");
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
      pularPercursoRef.current = true;
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
        valor: m.valor, peso: m.peso, qVol: (m as any).qVol || 0, data: m.data,
        tomador: m.tomador, tomadorCnpj: m.tomadorCnpj, tomadorUF: m.tomadorUF, tomadorCMun: m.tomadorCMun, tomadorXMun: m.tomadorXMun,
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
        await supabase.from("cte_documentos" as any).delete().eq("id", editingRascunhoId);
      }
      if (empresa && chaves.length > 0) {
        // Reserva as NF-es no rascunho SEM deletar (status rascunho): voltam sozinhas ao emitir/cancelar/excluir
        await supabase.from("cte_nfes_pendentes" as any).update({ status: "rascunho" }).in("chave", chaves).eq("empresa_id", empresa.id);
      }
    },
    onSuccess: () => {
      toast.success("Rascunho salvo");
      persistirPercursoSilencioso();
      setMercadorias([]);
      setSelecionadas(new Set());
      setEditingRascunhoId(null);
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
      qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa!.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emittingRef = useRef(false);
  const emitir = useMutation({
    mutationFn: async () => {
      // Trava contra duplo clique: duas emissões concorrentes calculariam o mesmo número.
      // Retorna marcador silencioso (sem toast de erro) em vez de throw.
      if (emittingRef.current) return { ignored: true };
      emittingRef.current = true;
      try {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!form.xNomeTomador || !form.cnpjTomador) throw new Error("Informe tomador");
      
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
      if (chaves.length > 0) {
        const sel = mercadorias.filter(m => chaves.includes(m.chave));
        const dests = new Set(sel.map(m => m.destCnpj || m.dest));
        const emits = new Set(sel.map(m => m.emitCnpj || m.emit));
        const tomads = new Set(sel.map(m => m.tomadorCnpj || m.tomador));
        if (emits.size > 1) throw new Error("CT-e não pode ter remetentes diferentes. Selecione NF-es do mesmo remetente.");
        if ((form as any).modoEmbarque !== "redespacho" && dests.size > 1) throw new Error("CT-e não pode ter destinatários diferentes. Selecione NF-es do mesmo destinatário.");
        if (tomads.size > 1) throw new Error("CT-e não pode ter tomadores diferentes. Selecione NF-es do mesmo tomador.");
      }
      const pend: string[] = [];
      const ieOk = (vv: any) => String(vv || "").trim().length > 0;
      if (!ieOk((empresa as any).ie)) pend.push("IE do remetente (empresa)");
      const selDocs = mercadorias.filter(m => chaves.includes(m.chave));
            const m0 = (selDocs[0] || {}) as any;
      const destCt2 = (contatoByDoc.get(String(m0.destCnpj || "").replace(/\D/g, "")) || {}) as any;
      const destIeOk = form.ieDestinatario || m0.destIE || destCt2.ie || ((percursoMatch as any)?.dest_ie || "");
      if (selDocs.length > 0 && !ieOk(destIeOk)) pend.push("IE do destinatario");
            const tomCt = (contatoByDoc.get(String(form.cnpjTomador || "").replace(/\D/g, "")) || {}) as any;
      if (!ieOk(form.ieTomador || tomCt.ie)) pend.push("IE do tomador");
      if (String(form.cnpjConsignatario || "").replace(/\D/g, "").length === 14 && !ieOk(form.ieConsignatario)) pend.push("IE do consignatario");
      if (String(form.cnpjRedespacho || "").replace(/\D/g, "").length === 14 && !ieOk(form.ieRedespacho)) pend.push("IE do redespacho");
      if (!String(form.motoristaNome || "").trim()) pend.push("Motorista");
      if (!rntrcFinal || /^ISENTO$/i.test(rntrcFinal) || rntrcFinal.replace(/\D/g, "").length !== 8) pend.push("RNTRC da empresa com 8 digitos (cadastre em Configuracoes > RNTRC)");
      if (!String(form.placaVeiculo || "").trim()) pend.push("Placa da tracao (veiculo 1)");
      else {
        const vv = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === String(form.placaVeiculo || "").toUpperCase());
        if (vv && Traciona(vv.tipo) && !String(form.semiReboque1 || "").trim()) pend.push("Placa do reboque (veiculo 1 de tracao)");
      }
      if (!(parseFloat(form.vPrest) > 0)) pend.push("Valor do servico maior que zero");
      if (!String(form.icmsCST || "").trim()) pend.push("CST do ICMS");
      if (!String(form.cfop || "").trim()) pend.push("CFOP");
      if (!String(form.icmsAliq || "").trim()) pend.push("Aliquota do ICMS");
      if (!String(form.seguradoraNome || "").trim()) pend.push("Seguradora");
      if (!String(form.apolice || "").trim()) pend.push("Apolice do seguro");
      if (!String(form.segResponsavel || "").trim()) pend.push("Responsavel do seguro");
      if (pend.length > 0) throw new Error("Para emitir informe: " + pend.join("; "));
      validarPedagio(form);
      const ret: any = await emitirCteFn({ data: { empresaId: empresa.id, form, input: {
        ambiente: form.ambiente,
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, tpServ: (form as any).modoEmbarque === "redespacho" ? "2" : "0", vPrest: totalPrestacao(form), vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: rntrcFinal,
        modalRod: { rntrc: rntrcFinal, veiculos: (() => { const vv = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === String(form.placaVeiculo || "").toUpperCase()); return form.placaVeiculo ? [{ placa: String(form.placaVeiculo).toUpperCase(), uf: empresa.uf || "MG", renavam: (vv as any)?.renavam || undefined }] : []; })() },
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        icms: { CST: form.icmsCST, vBC: totalPrestacao(form), pICMS: parseFloat(form.icmsAliq)||0, vICMS: parseFloat(form.icmsValor)||0 },
        impostos: { pisAliq: parseFloat(form.pisAliq)||0, cofinsAliq: parseFloat(form.cofinsAliq)||0, irAliq: parseFloat(form.irAliq)||0, inssAliq: parseFloat(form.inssAliq)||0, csllAliq: parseFloat(form.csllAliq)||0 },
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador, ie: form.ieTomador || undefined, logradouro: form.logradouroTomador || undefined, nro: form.nroTomador || undefined, bairro: form.bairroTomador || undefined, cep: form.cepTomador || undefined, fone: form.foneTomador || undefined, email: form.emailTomador || undefined },
        emit: { xNome: empresa.razao_social || empresa.nome_fantasia, ie: empresa.ie || "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv, uf: empresa.uf || "MG", cnpj: empresa.cnpj, crt: empresa.regime_tributario || "3", logradouro: empresa.logradouro, nro: empresa.numero, bairro: empresa.bairro, cep: empresa.cep } as any,
        chavesNFe: chaves,
      } } });
      return ret;
      } finally {
        emittingRef.current = false;
      }
    },
    onSuccess: async (ret: any) => {
      if ((ret as any)?.ignored) return;
      if (ret?.sucesso) {
        toast.success(`CT-e ${ret.chave} autorizado` + (ret.protocolo ? ` prot ${ret.protocolo}` : ""));
        setOpen(false);
        persistirPercursoSilencioso();
        try {
          const plSync = String(form.placaVeiculo || "").toUpperCase();
          const tgSync = String(form.pedagioTag || "").trim();
          if (empresa && plSync && tgSync) {
            const vvSync = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === plSync);
            if (vvSync && (vvSync as any).tag_pedagio !== tgSync) {
              await (supabase.from("veiculos" as never) as any).update({ tag_pedagio: tgSync }).eq("empresa_id", empresa.id).eq("placa", plSync);
              qc.invalidateQueries({ queryKey: ["veiculos-cte", empresa.id] });
            }
          }
        } catch {}
        let rascunhoNfs: any[] = [];
        if (editingRascunhoId) {
          const { data: rascDoc } = await supabase.from("cte_documentos" as any).select("xml_assinado").eq("id", editingRascunhoId).maybeSingle();
          try { const p = JSON.parse(rascDoc?.xml_assinado || "{}"); if (p.nfs) rascunhoNfs = p.nfs; } catch {}
          await supabase.from("cte_documentos" as any).delete().eq("id", editingRascunhoId);
          setEditingRascunhoId(null);
        }
        const chavesUsadas = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);
        if (empresa && chavesUsadas.length > 0) {
          const { count, error: embErr } = await supabase.from("cte_nfes_pendentes" as any).update({ status: "embarcada" }).in("chave", chavesUsadas).eq("empresa_id", empresa.id).select("chave", { count: "exact", head: true });
          if (embErr) toast.error(`CT-e autorizado, mas falha ao baixar NF-e: ${embErr.message}`);
          if (!count || count === 0) {
            for (const nf of rascunhoNfs) {
              if (!nf?.chave || !chavesUsadas.includes(nf.chave)) continue;
              await supabase.from("cte_nfes_pendentes" as any).upsert({
                empresa_id: empresa.id, chave: nf.chave, n_nf: nf.nNF, serie: nf.serie || "1",
                emit_nome: nf.emit || "", emit_cnpj: nf.emitCnpj || "", emit_uf: nf.emitUF || "", emit_cmun: nf.emitCMun || "", emit_xmun: nf.emitXMun || "",
                dest_nome: nf.dest || "", dest_cnpj: nf.destCnpj || "", dest_uf: nf.destUF || "", dest_cmun: nf.destCMun || "", dest_xmun: nf.destXMun || "",
                valor: nf.valor || 0, peso: nf.peso || 0, data_emissao: nf.data || null,
                tomador_nome: nf.tomador || "", tomador_cnpj: nf.tomadorCnpj || "", tomador_uf: nf.tomadorUF || "", tomador_cmun: nf.tomadorCMun || "", tomador_xmun: nf.tomadorXMun || "",
                mod_frete: nf.modFrete || "", status: "embarcada",
              }, { onConflict: "empresa_id,chave" });
            }
          }
          qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          setSelecionadas(new Set());
        }
      } else { console.error("[CTE-EMIT] resposta inesperada da emissao:", ret); toast.error(ret?.xMotivo || ret?.motivo || ("Resposta SEFAZ sem motivo (cStat " + (ret?.cStat || "?") + "). Retorno: " + (JSON.stringify(ret || null) || "").slice(0, 200))); }
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

  const cancelar = useMutation({
    mutationFn: async ({ chave, protocolo, ambiente }: { chave: string; protocolo?: string; ambiente?: string }) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const just = prompt("Justificativa de cancelamento (mín. 15 caracteres):", "CT-e cancelado por erro nos dados da prestação do serviço") || "";
      if (just.length < 15) throw new Error("Justificativa muito curta");
      const ret = await cancelarCteFn({ data: { empresaId: empresa.id, chave, justificativa: just, protocolo, ambiente } });
      return { ...ret, chave };
    },
    onSuccess: async (ret: any) => {
      if ((ret as any)?.sucesso) {
        toast.success("CT-e cancelado");
        if (empresa && ret?.chave) {
          const { data: doc } = await supabase.from("cte_documentos" as any).select("xml_assinado").eq("chave_acesso", ret.chave).maybeSingle();
          let xmlStr = doc?.xml_assinado || "";
          let rascunhoNfs: any[] = [];
          try { const p = JSON.parse(xmlStr); if (p.xml) xmlStr = p.xml; if (p.nfs) rascunhoNfs = p.nfs; } catch {}
          const chavesNfe = [...xmlStr.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map((m: any)=>m[1]);
          console.log("[CTE-CANCEL-REVERT] chave:", ret.chave, "chavesNfe:", chavesNfe, "rascunhoNfs:", rascunhoNfs.length);
          if (chavesNfe.length > 0) {
            const { count, error: revErr } = await supabase.from("cte_nfes_pendentes" as any).update({ status: "pendente" }).in("chave", chavesNfe).eq("empresa_id", empresa.id).select("chave", { count: "exact", head: true });
            console.log("[CTE-CANCEL-REVERT] update count:", count);
            if (revErr) toast.error(`CT-e cancelado, mas falha ao devolver NF-e: ${revErr.message}`);
            if (!count || count === 0) {
              for (const nf of rascunhoNfs) {
                if (!nf?.chave) continue;
                await supabase.from("cte_nfes_pendentes" as any).upsert({
                  empresa_id: empresa.id, chave: nf.chave, n_nf: nf.nNF, serie: nf.serie || "1",
                  emit_nome: nf.emit || "", emit_cnpj: nf.emitCnpj || "", emit_uf: nf.emitUF || "", emit_cmun: nf.emitCMun || "", emit_xmun: nf.emitXMun || "",
                  dest_nome: nf.dest || "", dest_cnpj: nf.destCnpj || "", dest_uf: nf.destUF || "", dest_cmun: nf.destCMun || "", dest_xmun: nf.destXMun || "",
                  valor: nf.valor || 0, peso: nf.peso || 0, data_emissao: nf.data || null,
                  tomador_nome: nf.tomador || "", tomador_cnpj: nf.tomadorCnpj || "", tomador_uf: nf.tomadorUF || "", tomador_cmun: nf.tomadorCMun || "", tomador_xmun: nf.tomadorXMun || "",
                  mod_frete: nf.modFrete || "", status: "pendente",
                }, { onConflict: "empresa_id,chave" });
              }
              console.log("[CTE-CANCEL-REVERT] re-inserted", rascunhoNfs.length, "NF-e from rascunho JSON");
            }
            qc.invalidateQueries({ queryKey: ["cte-nfes-pendentes", empresa.id] });
          }
        }
      } else toast.error((ret as any).xMotivo || "Falha ao cancelar");
      qc.invalidateQueries({ queryKey: ["cte-documentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const lastPreviewUrl = useRef<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewNum, setViewNum] = useState("");
  const [previewData, setPreviewData] = useState<{ xml: string; chave: string; proximo: string; ambiente: string; form: any } | null>(null);
  const percursoAplicadoKey = useRef("");
  const pularPercursoRef = useRef(false);
 const { data: percursosDB, error: percursosError } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-percursos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cte_percursos" as any).select("*").eq("empresa_id", empresa!.id).order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, any>>;
    },
    retry: false,
  });
  const percursos = percursosDB ?? [];
  const previewXml = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const chaves = selecionadas.size > 0 ? Array.from(selecionadas) : mercadorias.map(m => m.chave);

      return previewCteXmlFn({ data: { empresaId: empresa.id, input: {
        ambiente: form.ambiente,
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, tpServ: (form as any).modoEmbarque === "redespacho" ? "2" : "0", vPrest: totalPrestacao(form), vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: rntrcFinal,
        modalRod: { rntrc: rntrcFinal, veiculos: (() => { const vv = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === String(form.placaVeiculo || "").toUpperCase()); return form.placaVeiculo ? [{ placa: String(form.placaVeiculo).toUpperCase(), uf: empresa.uf || "MG", renavam: (vv as any)?.renavam || undefined }] : []; })() },
        obsGerais: (form as any).obsGerais || "", obsAnulacao: (form as any).obsAnulacao || "", obsGlobalizado: (form as any).obsGlobalizado || "",
        reducaoBase: parseFloat((form as any).reducaoBase)||0,
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        icms: { CST: form.icmsCST, vBC: totalPrestacao(form), pICMS: parseFloat(form.icmsAliq)||0, vICMS: parseFloat(form.icmsValor)||0 },
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

  // === Percursos: remetente+destino+tomador pré-salvos (autopreenchimento) ===
  const onlyDigitsPercurso = (v: any) => String(v || "").replace(/\D/g, "");
  const docsAtuais = () => {
    const sel = mercadorias.filter(m => selecionadas.has(m.chave));
    const a = ((sel.length > 0 ? sel[0] : mercadorias[0]) || {}) as any;
    return {
      remDoc: onlyDigitsPercurso(a.emitCnpj), remNome: a.emit || "",
      destDoc: onlyDigitsPercurso(a.destCnpj), destNome: a.dest || "",
      tomaDoc: onlyDigitsPercurso(form.cnpjTomador),
    };
  };
  const matchPercurso = (d: { remDoc: string; destDoc: string; tomaDoc: string }) => {
    // Conferência estrita: só aplica com CNPJ de remetente + destinatário + tomador iguais
    if (!percursos || percursos.length === 0) return null;
    if (!d.remDoc || !d.destDoc || !d.tomaDoc) return null;
    return percursos.find(r => onlyDigitsPercurso(r.rem_cnpj) === d.remDoc && onlyDigitsPercurso(r.dest_cnpj) === d.destDoc && onlyDigitsPercurso(r.toma_cnpj) === d.tomaDoc) || null;
  };
  const aplicarPercurso = (r: Record<string, any>) => {
    setForm(f => ({ ...f,
      toma: r.toma_tipo || f.toma,
      cnpjTomador: r.toma_cnpj || f.cnpjTomador, xNomeTomador: r.toma_nome || f.xNomeTomador,
      ieTomador: r.toma_ie || f.ieTomador, ufTomador: r.toma_uf || f.ufTomador,
      cMunTomador: r.toma_cmun || f.cMunTomador, xMunTomador: r.toma_xmun || f.xMunTomador,
      logradouroTomador: r.toma_logradouro || f.logradouroTomador, nroTomador: r.toma_nro || f.nroTomador,
      bairroTomador: r.toma_bairro || f.bairroTomador, cepTomador: r.toma_cep || f.cepTomador,
      foneTomador: r.toma_fone || f.foneTomador, emailTomador: r.toma_email || f.emailTomador,
      cMunIni: r.coleta_cmun || f.cMunIni, xMunIni: r.coleta_xmun || f.xMunIni, ufIni: r.coleta_uf || f.ufIni,
      cMunFim: r.entrega_cmun || f.cMunFim, xMunFim: r.entrega_xmun || f.xMunFim, ufFim: r.entrega_uf || f.ufFim,
      cfop: r.cfop || f.cfop,
      cnpjConsignatario: r.consig_cnpj || f.cnpjConsignatario, xNomeConsignatario: r.consig_nome || f.xNomeConsignatario,
      ieConsignatario: r.consig_ie || f.ieConsignatario, ufConsignatario: r.consig_uf || f.ufConsignatario,
      xMunConsignatario: r.consig_xmun || f.xMunConsignatario, cepConsignatario: r.consig_cep || f.cepConsignatario,
      logradouroConsignatario: r.consig_logradouro || f.logradouroConsignatario, nroConsignatario: r.consig_nro || f.nroConsignatario,
      bairroConsignatario: r.consig_bairro || f.bairroConsignatario,
      cnpjRedespacho: r.redesp_cnpj || f.cnpjRedespacho, xNomeRedespacho: r.redesp_nome || f.xNomeRedespacho,
      ieRedespacho: r.redesp_ie || f.ieRedespacho, ufRedespacho: r.redesp_uf || f.ufRedespacho,
      xMunRedespacho: r.redesp_xmun || f.xMunRedespacho, cepRedespacho: r.redesp_cep || f.cepRedespacho,
      logradouroRedespacho: r.redesp_logradouro || f.logradouroRedespacho, nroRedespacho: r.redesp_nro || f.nroRedespacho,
      bairroRedespacho: r.redesp_bairro || f.bairroRedespacho,
      seguradoraNome: r.seg_nome || f.seguradoraNome, apolice: r.seg_apolice || f.apolice, averbacao: r.seg_averbacao || f.averbacao,
      rctrC: r.seg_rctr_c || f.rctrC, rcfDc: r.seg_rcf_dc || f.rcfDc, segAdicional: r.seg_adicional || f.segAdicional,
      segTotal: r.seg_total || f.segTotal, segRepassar: r.seg_repassar ? "S" : f.segRepassar, segResponsavel: r.seg_responsavel || f.segResponsavel,
      distanciaKm: r.distancia_km || f.distanciaKm, duracaoHoras: r.duracao_horas || f.duracaoHoras,
      icmsCST: r.icms_cst || f.icmsCST, icmsAliq: r.icms_aliq || f.icmsAliq,
      reducaoBase: (r.reducao_base || (f as any).reducaoBase) as string, creditoOutorgado: (r.credito_outorgado || (f as any).creditoOutorgado) as string,
      pisAliq: r.pis_aliq || f.pisAliq, cofinsAliq: r.cofins_aliq || f.cofinsAliq, irAliq: r.ir_aliq || f.irAliq,
      inssAliq: r.inss_aliq || f.inssAliq, csllAliq: r.csll_aliq || f.csllAliq,

      ...(r.obs_gerais ? { obsGerais: r.obs_gerais } : {}),
    }));
 };
  // Percurso é 100% automático e silencioso: salva/atualiza a cada emissão ou rascunho
  const persistirPercursoSilencioso = async () => {
    try {
      if (!empresa) return;
    const d = docsAtuais();
    if (!d.remDoc || !d.destDoc || !d.tomaDoc || d.tomaDoc.length !== 14) return;
    const sel = mercadorias.filter(m => selecionadas.has(m.chave));
    const a = ((sel.length > 0 ? sel[0] : mercadorias[0]) || {}) as any;
    const { data: exPerc } = await supabase.from("cte_percursos" as any).select("id,codigo").eq("empresa_id", empresa.id).eq("rem_cnpj", d.remDoc).eq("dest_cnpj", d.destDoc).eq("toma_cnpj", d.tomaDoc).maybeSingle();
    let codigoPercurso = ((exPerc as any)?.codigo || "") as string;
    if (!codigoPercurso) {
      const { data: mx } = await supabase.from("cte_percursos" as any).select("codigo").eq("empresa_id", empresa.id).order("codigo", { ascending: false }).limit(1);
      const last = parseInt((((mx as any[])?.[0]?.codigo) || "0"), 10) || 0;
      codigoPercurso = String(last + 1).padStart(4, "0");
    }
    const cRemP = (contatoByDoc.get(d.remDoc) || {}) as any;
    const cDesP = (contatoByDoc.get(d.destDoc) || {}) as any;
    const nome = ((((exPerc as any)?.nome) || ((d.remNome || "Origem") + " > " + (d.destNome || "Destino"))) as string).slice(0, 80);
    const payload = {
      empresa_id: empresa.id, nome,
      rem_cnpj: d.remDoc, rem_nome: a.emit || d.remNome || "", rem_ie: a.emitIE || cRemP.ie || "", rem_uf: a.emitUF || cRemP.uf || "",
      rem_cmun: a.emitCMun || "", rem_xmun: a.emitXMun || cRemP.cidade || "", rem_logradouro: a.emitLogradouro || cRemP.logradouro || "",
      rem_nro: cRemP.numero || "", rem_bairro: a.emitBairro || cRemP.bairro || "", rem_cep: (a.emitCEP || cRemP.cep || "").replace(/\D/g, "") || "", rem_fone: a.emitFone || cRemP.telefone || "",
      dest_cnpj: d.destDoc, dest_nome: a.dest || d.destNome || "", dest_ie: form.ieDestinatario || a.destIE || cDesP.ie || "", dest_uf: a.destUF || cDesP.uf || "",
      dest_cmun: a.destCMun || "", dest_xmun: a.destXMun || cDesP.cidade || "", dest_logradouro: a.destLogradouro || cDesP.logradouro || "",
      dest_nro: cDesP.numero || "", dest_bairro: a.destBairro || cDesP.bairro || "", dest_cep: (a.destCEP || cDesP.cep || "").replace(/\D/g, "") || "", dest_fone: a.destFone || cDesP.telefone || "",
      toma_tipo: form.toma, toma_cnpj: d.tomaDoc, toma_nome: form.xNomeTomador || "", toma_ie: form.ieTomador || (((contatoByDoc.get(String(form.cnpjTomador || "").replace(/\D/g, "")) || {}) as any).ie || ""),
      toma_uf: form.ufTomador || "", toma_cmun: form.cMunTomador || "", toma_xmun: form.xMunTomador || "",
      toma_logradouro: form.logradouroTomador || "", toma_nro: form.nroTomador || "", toma_bairro: form.bairroTomador || "",
      toma_cep: form.cepTomador || "", toma_fone: form.foneTomador || "", toma_email: form.emailTomador || "",
      coleta_cmun: form.cMunIni || "", coleta_xmun: form.xMunIni || "", coleta_uf: form.ufIni || "",
      entrega_cmun: form.cMunFim || "", entrega_xmun: form.xMunFim || "", entrega_uf: form.ufFim || "",
      cfop: form.cfop || "",
      codigo: codigoPercurso,
      consig_cnpj: form.cnpjConsignatario || "", consig_nome: form.xNomeConsignatario || "", consig_ie: form.ieConsignatario || "",
      consig_uf: form.ufConsignatario || "", consig_xmun: form.xMunConsignatario || "", consig_cep: form.cepConsignatario || "",
      consig_logradouro: form.logradouroConsignatario || "", consig_nro: form.nroConsignatario || "", consig_bairro: form.bairroConsignatario || "",
      redesp_cnpj: form.cnpjRedespacho || "", redesp_nome: form.xNomeRedespacho || "", redesp_ie: form.ieRedespacho || "",
      redesp_uf: form.ufRedespacho || "", redesp_xmun: form.xMunRedespacho || "", redesp_cep: form.cepRedespacho || "",
      redesp_logradouro: form.logradouroRedespacho || "", redesp_nro: form.nroRedespacho || "", redesp_bairro: form.bairroRedespacho || "",
      seg_nome: form.seguradoraNome || "", seg_apolice: form.apolice || "", seg_averbacao: form.averbacao || "",
      seg_rctr_c: form.rctrC || "", seg_rcf_dc: form.rcfDc || "", seg_adicional: form.segAdicional || "",
      seg_total: form.segTotal || "", seg_repassar: form.segRepassar === "S", seg_responsavel: form.segResponsavel || "",
      distancia_km: form.distanciaKm || "", duracao_horas: form.duracaoHoras || "",
      icms_cst: form.icmsCST || "", icms_aliq: form.icmsAliq || "",
      reducao_base: (form as any).reducaoBase || "", credito_outorgado: (form as any).creditoOutorgado || "",
      pis_aliq: form.pisAliq || "", cofins_aliq: form.cofinsAliq || "", ir_aliq: form.irAliq || "",
      inss_aliq: form.inssAliq || "", csll_aliq: form.csllAliq || "", obs_gerais: (form as any).obsGerais || "",

    };
    for (const k of Object.keys(payload)) { if (k === "empresa_id") continue; const v = (payload as any)[k]; const vv = k.endsWith("_ie") ? limparIE(v) : v; if (typeof vv === "string") (payload as any)[k] = vv.toUpperCase(); }
    const { error } = await supabase.from("cte_percursos" as any).upsert(payload, { onConflict: "empresa_id,rem_cnpj,dest_cnpj,toma_cnpj" });
    if (error) return;
    qc.invalidateQueries({ queryKey: ["cte-percursos", empresa.id] });
    } catch (e) { console.log("[CTE-PERCURSO] save silencioso falhou:", (e as Error)?.message); }
  };
  const percursoMatch = matchPercurso(docsAtuais());
  useEffect(() => { percursoAplicadoKey.current = ""; }, [open]);
  useEffect(() => {
    if (!open || percursos.length === 0) return;
    if (pularPercursoRef.current) { pularPercursoRef.current = false; return; }
    const d = docsAtuais();
    if (!d.tomaDoc || d.tomaDoc.length !== 14) return;
    const m = matchPercurso(d);
    if (!m) return;
    const key = m.id + "|" + d.remDoc + "|" + d.destDoc + "|" + d.tomaDoc;
    if (percursoAplicadoKey.current === key) return;
    percursoAplicadoKey.current = key;
    aplicarPercurso(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.cnpjTomador, mercadorias, selecionadas, percursos]);
  const entregaSrcRef = useRef("");
  useEffect(() => {
    if (!open) return;
    const hasRed = (form.cnpjRedespacho || "").replace(/\D/g, "").length === 14;
    const sel = mercadorias.filter(m => selecionadas.has(m.chave));
    const a = ((sel[0] || mercadorias[0] || {}) as any);
    const cDstE = contatoByDoc.get(String(a.destCnpj || "").replace(/\D/g, "")) || {};
    const dx = hasRed ? (form.xMunRedespacho || "") : (a.destXMun || (cDstE as any).cidade || "");
    const du = hasRed ? (form.ufRedespacho || "") : (a.destUF || (cDstE as any).uf || "");
    const dc = hasRed ? "" : (a.destCMun || "");
    if (!dx) return;
    const sig = (hasRed ? "R" : "D") + "|" + dx + "|" + du;
    if (entregaSrcRef.current === sig) return;
    entregaSrcRef.current = sig;
    setForm(f => ({ ...f, xMunFim: dx, ufFim: du, ...(dc ? { cMunFim: dc } : {}) }));
    if (hasRed && du) {
      const mySig = sig;
      (async () => {
        try {
          const r = await fetch("https://brasilapi.com.br/api/ibge/municipios/v1/" + du);
          if (!r.ok) return;
          const arr = await r.json();
          const norm = (st: string) => (st || "").toUpperCase().normalize("NFD").replace(/[^A-Z ]/g, "").replace(/ +/g, " ").trim();
          const hit = ((arr as any[]) || []).find((mm: any) => norm(mm.nome) === norm(dx));
          if (hit && hit.codigo_ibge && entregaSrcRef.current === mySig) setForm(f => ({ ...f, cMunFim: String(hit.codigo_ibge) }));
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.cnpjRedespacho, form.xMunRedespacho, form.ufRedespacho, form.cnpjTomador, mercadorias, selecionadas, percursos, contatoByDoc]);
  // Coleta segue exclusivamente o remetente (NF-e emitente + contato) - campo travado na UI
  const coletaSrcRef = useRef("");
  useEffect(() => {
    if (!open) return;
    const sel2 = mercadorias.filter(m => selecionadas.has(m.chave));
    const b = ((sel2[0] || mercadorias[0] || {}) as any);
    if (!b.emitCnpj && !b.emitXMun) return;
    const cEmi = contatoByDoc.get(String(b.emitCnpj || "").replace(/\D/g, "")) || {};
    const cx = b.emitXMun || (cEmi as any).cidade || "";
    const cu = b.emitUF || (cEmi as any).uf || "";
    const cc = b.emitCMun || "";
    if (!cx) return;
    const sig2 = "C|" + String(b.emitCnpj || "") + "|" + cx + "|" + cu;
    if (coletaSrcRef.current === sig2) return;
    coletaSrcRef.current = sig2;
    setForm(f => ({ ...f, xMunIni: cx, ...(cu ? { ufIni: cu } : {}), ...(cc ? { cMunIni: cc } : {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mercadorias, selecionadas, percursos, contatoByDoc]);
  const renderTabelaDocs = (lista: CteDoc[], rotulo: string) => (<>
{lista.length === 0 ? (
            <EmptyState icon={Truck} title="Nenhum CT-e" description={`Nenhum CT-e ${rotulo}.`} />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead className="text-center">Número</TableHead><TableHead className="text-center">Série</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-center">Notas Fiscais</TableHead><TableHead className="text-center">Valor</TableHead><TableHead className="text-center">Chave</TableHead><TableHead className="text-center">Ações</TableHead></TableRow></TableHeader>
                <TableBody>{lista.map(d => {
                  const nNFs = (() => { try { const j = JSON.parse(d.xml_assinado || "{}"); const nn = j.nfs?.map((n: any) => n.nNF).filter(Boolean) || []; if (nn.length) return nn; } catch { } try { const chaves = [...(d.xml_assinado||"").matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m=>m[1]); if (chaves.length===0) return []; return chaves.map(ch=>ch.slice(25,34).replace(/^0+/,"") || "0"); } catch { return []; } })();
                  const isRascunho = d.status === "rascunho";
                  return (
                  <TableRow key={d.id} className={isRascunho ? "bg-muted/30" : ""}><TableCell className="font-mono">{d.numero ?? "—"}</TableCell><TableCell>{d.serie ?? "—"}</TableCell><TableCell title={d.status==="rejeitado" && d.motivo_rejeicao ? d.motivo_rejeicao : ""}><Badge variant="secondary" className={d.status==="autorizado"?"bg-emerald-500/15 text-emerald-600":d.status==="rejeitado"?"bg-destructive/15 text-destructive":d.status==="cancelado"?"bg-orange-500/15 text-orange-600":isRascunho?"bg-amber-500/15 text-amber-600":""}>{d.status}{d.status==="rejeitado" && d.motivo_rejeicao ? ` — ${d.motivo_rejeicao.slice(0,60)}` : ""}</Badge></TableCell>                  <TableCell className="text-xs">{nNFs.length > 0 ? nNFs.join(", ") : d.chave_acesso ? "1" : "—"}</TableCell><TableCell className="text-right">{brl(Number(d.valor_servico ?? 0))}</TableCell><TableCell className="font-mono text-[11px] break-all min-w-[280px] text-right pr-1" title={d.chave_acesso||""}>{d.chave_acesso ?? "—"}</TableCell><TableCell className="flex gap-1 justify-end whitespace-nowrap pl-1">
                    {isRascunho ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => editarRascunho(d)} title="Editar rascunho"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluirRascunho(d)} title="Excluir rascunho"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        {d.status === "autorizado" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-sky-600" onClick={() => visualizarPdf(d)} title="Visualizar DACTE"><Eye className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-sky-600" onClick={() => downloadXml(d)} title="Baixar XML"><FileCode className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => downloadPdf(d)} title="Baixar DACTE (PDF)"><Download className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </>
                    )}
                    {!isRascunho && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={d.status!=="autorizado"} onClick={() => d.chave_acesso && cancelar.mutate({ chave: d.chave_acesso, protocolo: d.protocolo_sefaz || undefined, ambiente: (d as any).ambiente })} title="Cancelar"><Ban className="h-3.5 w-3.5" /></Button>}
                    {!isRascunho && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => d.chave_acesso && consultar.mutate({ chave: d.chave_acesso, ambiente: (d as any).ambiente })} title="Consultar SEFAZ"><Search className="h-3.5 w-3.5" /></Button>}
                  </TableCell></TableRow>
                  );
                })}</TableBody>
              </Table>
            </Card>
          )}

  </>);

  return (
    <div className="p-6 space-y-4">
      <PageHeader eyebrow="Fiscal" title="CT-e" description="Conhecimento de Transporte Eletrônico (57) — emissão robusta estilo STM, com múltiplas NF-es por CT-e." actions={<Button size="sm" onClick={() => novoCtePreservandoFiscal()}><Plus className="mr-1 h-4 w-4" /> Novo CT-e</Button>} />

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="mb-2 flex flex-wrap">
            <TabsTrigger value="embarque" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">NF-es para embarque ({mercadorias.length})</TabsTrigger>
            <TabsTrigger value="rascunhos" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Aguardando envio ({docsByStatus.rascunhos.length})</TabsTrigger>
            <TabsTrigger value="autorizados" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Autorizados ({docsByStatus.autorizados.length})</TabsTrigger>
            <TabsTrigger value="rejeitados" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Rejeitados ({docsByStatus.rejeitados.length})</TabsTrigger>
            <TabsTrigger value="cancelados" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Cancelados ({docsByStatus.cancelados.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="embarque">
          {/* Cadastro de Mercadorias para Embarque — estilo STM */}
          <Card className="overflow-hidden border-2 border-primary/20 shadow-panel">
            <div className="bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> Cadastro de Mercadorias para Embarque</h3>
              <span className="text-xs opacity-80">{(form as any).modoEmbarque === "redespacho" ? "CT-e Redespacho • Mesmo remetente" : "CT-e Avulso • Sem Mercadoria/Percurso"}</span>
            </div>
            <CardContent className="p-3 space-y-3 bg-muted/20 overflow-visible">
              <div className="border rounded p-2 bg-background space-y-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-primary">Embarque via CT-e</Label>
                    <div className="flex flex-col gap-1 mt-1 text-xs">
                      <label className="flex items-center gap-1"><input type="radio" name="modo-embarque" checked={(form as any).modoEmbarque !== "redespacho"} onChange={() => setForm(f => ({ ...f, modoEmbarque: "avulso" }))} /> CT-e Avulso</label>
                      <label className="flex items-center gap-1"><input type="radio" name="modo-embarque" checked={(form as any).modoEmbarque === "redespacho"} onChange={() => setForm(f => ({ ...f, modoEmbarque: "redespacho" }))} /> CT-e Redespacho</label>
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
                                const red = (form as any).modoEmbarque === "redespacho";
                                const grupos = new Set(mercadorias.map(m => red ? (m.emitCnpj || m.emit) : (m.destCnpj || m.dest)));
                                if (grupos.size > 1) {
                                  toast.error(red ? "No redespacho, selecione NF-es do mesmo remetente" : "Não pode selecionar NF-es com destinos diferentes");
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
                                    const red = (form as any).modoEmbarque === "redespacho";
                                    const grupos = new Set(sel.map(x => red ? (x.emitCnpj || x.emit) : (x.destCnpj || x.dest)));
                                    if (grupos.size > 1) {
                                      toast.error(red ? "No redespacho, o CT-e exige o mesmo remetente" : "Não pode emitir o mesmo CT-e para destinos diferentes");
                                      next.delete(m.chave);
                                    } else if (red) {
                                      const chaveRem = m.emitCnpj || m.emit;
                                      const outras = mercadorias.filter(x => !next.has(x.chave) && (x.emitCnpj || x.emit) === chaveRem);
                                      if (outras.length > 0) {
                                        setConfRemetente({ nome: (m.emit || "").slice(0, 60), chaves: outras.map(x => x.chave) });
                                      }
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
                <label className="flex items-center gap-2 px-3 py-2 border rounded bg-accent text-accent-foreground cursor-pointer hover:bg-accent/70 text-xs font-medium">
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
                      const emits = new Set(sel.map(m => m.emitCnpj || m.emit));
                      const tomads = new Set(sel.map(m => m.tomadorCnpj || m.tomador));
                      if (emits.size > 1) { toast.error("Remetentes diferentes"); return; }
                      if ((form as any).modoEmbarque !== "redespacho" && dests.size > 1) { toast.error("Destinatários diferentes"); return; }
                      if (tomads.size > 1) { toast.error("Tomadores diferentes"); return; }
                      const somaV = sel.reduce((a,m)=>a+m.valor,0);
                      const somaP = sel.reduce((a,m)=>a+m.peso,0);
                      const first = sel[0] as typeof sel[0] & { modFrete?: string; tomadorUF?: string; tomadorCMun?: string; tomadorXMun?: string; emitUF?: string; emitCMun?: string; emitXMun?: string; destUF?: string; destCMun?: string; destXMun?: string };
                      const tomaByMod: Record<string,string> = { "0":"0", "1":"3", "2":"4", "3":"0", "4":"3", "9":"4" };
                      const tomaSel = (first as any).modFrete ? (tomaByMod[(first as any).modFrete] ?? "3") : "3";
                      const tomCnpjDigits = (((first as any).tomadorCnpj || first.destCnpj || "") as string).replace(/\D/g, "");
                      const cTom = contatoByDoc.get(tomCnpjDigits) || {};
                      lastLookupTomador.current = tomCnpjDigits;
                      setForm(f => ({
                        ...f,
                        toma: tomaSel,
                        cnpjTomador: (first as any).tomadorCnpj || first.destCnpj || "",
                        xNomeTomador: (first as any).tomador || first.dest || "",
                        ufTomador: (first as any).tomadorUF || cTom.uf || "",
                        cMunTomador: (first as any).tomadorCMun || "",
                        xMunTomador: (first as any).tomadorXMun || cTom.cidade || "",
                        ieTomador: (first as any).tomadorIE || cTom.ie || "",
                        logradouroTomador: (first as any).tomadorLogradouro || cTom.logradouro || "",
                        nroTomador: cTom.numero || "",
                        bairroTomador: (first as any).tomadorBairro || cTom.bairro || "",
                        cepTomador: (first as any).tomadorCEP || (cTom.cep || "").replace(/\D/g, "") || "",
                        foneTomador: cTom.telefone || "",
                        emailTomador: "",
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
                      setOpen(true);
                    }}
                  >
                    Gerar CT-e com {selecionadas.size || 0} selecionada(s)
                  </Button>
                  <Button size="sm" onClick={() => novoCtePreservandoFiscal()}><Plus className="mr-1 h-3 w-3" /> Novo CT-e avulso</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          </TabsContent>
          <AlertDialog open={!!confRemetente} onOpenChange={(o) => { if (!o) setConfRemetente(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Selecionar todas do remetente?</AlertDialogTitle>
                <AlertDialogDescription>
                  {confRemetente && `Selecionar todas as ${confRemetente.chaves.length + 1} NF-e de ${confRemetente.nome}?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => { if (confRemetente) setSelecionadas((prev) => new Set([...prev, ...confRemetente.chaves])); setConfRemetente(null); }}>
                  Selecionar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <TabsContent value="rascunhos">{renderTabelaDocs(docsByStatus.rascunhos, "aguardando envio")}</TabsContent>
          <TabsContent value="autorizados">{renderTabelaDocs(docsByStatus.autorizados, "autorizados")}</TabsContent>
          <TabsContent value="rejeitados">
            {docsByStatus.rejeitados.length > 0 && (
              <div className="mb-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={async () => { if (!empresa) return; try { await excluirRejeitadosCteFn({ data: { empresaId: empresa.id } }); toast.success("CT-e rejeitados excluídos"); qc.invalidateQueries({ queryKey: ["cte-documentos"] }); } catch(e:any) { toast.error(e.message); } }}><Trash2 className="mr-1 h-3 w-3" /> Limpar Rejeitados</Button>
              </div>
            )}
            {renderTabelaDocs(docsByStatus.rejeitados, "rejeitados")}
          </TabsContent>
          <TabsContent value="cancelados">{renderTabelaDocs(docsByStatus.cancelados, "cancelados")}</TabsContent>
        </Tabs>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> {(form as any).modoEmbarque === "redespacho" ? "Conhecimento de Transporte com Redespacho (tpServ 2)" : "Conhecimento de Transporte Avulso"}</DialogTitle>
            <p className="text-sm text-muted-foreground">Emissão de CT-e (57) — versão 4.00 via mTLS SEFAZ.</p>
          </DialogHeader>

          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="w-full justify-start gap-0 bg-muted/50 rounded-t-md">
              <TabsTrigger value="geral" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"><Settings2 className="mr-1 h-3 w-3" />Geral</TabsTrigger>
              <TabsTrigger value="seguros" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"><Truck className="mr-1 h-3 w-3" />Transporte</TabsTrigger>
              <TabsTrigger value="docs" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"><FileText className="mr-1 h-3 w-3" />Tributação e Carga</TabsTrigger>
              <TabsTrigger value="status" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"><ClipboardList className="mr-1 h-3 w-3" />Status</TabsTrigger>
              <TabsTrigger value="obs" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"><FileCode className="mr-1 h-3 w-3" />Observações</TabsTrigger>
            </TabsList>

            {/* === TAB: Geral === */}
            <TabsContent value="geral" className="mt-3 space-y-3">
              {/* Header: Ambiente, Nº, Data, Tomador, Mod/Ser + CFOP */}
              <div className="grid grid-cols-2 md:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto] gap-2 border rounded p-3 bg-muted/20">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Ambiente</Label>
                  <ToggleGroup type="single" value={form.ambiente} onValueChange={v => { if (v) setForm({...form, ambiente: v as "homologacao" | "producao"}); }} className="bg-background border rounded-md h-7 mt-0.5">
                    <ToggleGroupItem value="homologacao" className="h-6 text-[10px] px-2 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">Homologação</ToggleGroupItem>
                    <ToggleGroupItem value="producao" className="h-6 text-[10px] px-2 data-[state=on]:bg-green-600/10 data-[state=on]:text-green-700">Produção</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="w-44"><Label className="text-[10px] text-muted-foreground">N° Conhecimento</Label><Input className="h-7 text-xs font-mono bg-transparent" value="— aguardando emissão —" readOnly /></div>
                <div className="w-[136px]"><Label className="text-[10px] text-muted-foreground">Data Emissão</Label><DateInput value={form.dataEmissao} onChange={v => setForm({...form, dataEmissao: v})} className="h-7 text-xs" /></div>
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Tomador do Serviço</Label>
                  <Popover open={tomadorOpen} onOpenChange={setTomadorOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={tomadorOpen} className="h-7 text-xs justify-between w-full font-normal">
                        <span className="truncate text-left">{MOD_FRETE_OPTIONS.find(o => o.value === form.toma)?.label || "Selecione o tomador"}</span>
                        {lookingUpTomador ? <Loader2 className="ml-2 h-3 w-3 shrink-0 animate-spin" /> : <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[480px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Ou digite o CNPJ do tomador..." value={tomadorQuery} onValueChange={v => {
                          setTomadorQuery(v);
                          const digits = v.replace(/\D/g, "").slice(0, 14);
                          if (digits.length === 14 && digits !== lastLookupTomador.current) { onPickContatoTomador(digits); }
                        }} />
                        <CommandList>
                          <CommandEmpty>Nenhuma opção.</CommandEmpty>
                          <CommandGroup heading="Tipo do tomador">
                            {MOD_FRETE_OPTIONS.map(opt => (
                              <CommandItem key={opt.value} value={opt.value} onSelect={() => { aplicarTomadorPorToma(opt.value); setTomadorOpen(false); setTomadorQuery(""); }}>
                                <Check className={"mr-2 h-3 w-3 " + (form.toma === opt.value ? "opacity-100" : "opacity-0")} />
                                <span className="truncate">{opt.label}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="truncate">CNPJ: {form.cnpjTomador ? fmtCnpjInput(form.cnpjTomador) : "-"}</span>
                    <span className="inline-flex items-center gap-1 shrink-0">IE: <Input className="h-5 w-32 text-[10px] px-1 text-foreground" placeholder="ISENTO" value={form.ieTomador || ((contatoByDoc.get(String(form.cnpjTomador || "").replace(/\D/g, "")) || {}) as any).ie || ""} onChange={e=>setForm({...form,ieTomador:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,14)})} /></span>
                  </div>
                </div>
                <div><Label className="text-[10px] text-muted-foreground">Mod / Série</Label><Input className="h-7 text-xs font-mono w-[92px] text-center px-1 bg-transparent" value="57 / 001" readOnly /></div>
                <div><Label className="text-[10px] text-muted-foreground">Percurso</Label><Input className="h-7 text-xs font-mono w-[76px] text-center px-1 bg-transparent" value={percursoMatch?.codigo || "—"} readOnly title={percursoMatch?.nome || "Nenhum percurso associado"} /></div>
              </div>
              <div className="border rounded p-3 bg-muted/20">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="flex-[2_1_320px] max-w-[700px] min-w-0">
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
                      <CommandList onWheelCapture={(e) => e.stopPropagation()}>
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
                </div>
                <div className="flex-[1_1_160px] min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Coleta</Label>
                  <div className="flex gap-1">
                    <Input readOnly tabIndex={-1} className="h-7 text-xs flex-1 min-w-0 bg-transparent" placeholder="Município" value={form.xMunIni} title="Segue o remetente" />
                    <Input readOnly tabIndex={-1} title="Segue o remetente" className="h-7 text-xs w-14 text-center shrink-0 bg-transparent" placeholder="UF" value={form.ufIni} maxLength={2} />
                  </div>
                </div>
                <div className="flex-[1_1_160px] min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Entrega</Label>
                  <div className="flex gap-1">
                    <Input readOnly tabIndex={-1} className="h-7 text-xs flex-1 min-w-0 bg-transparent" placeholder="Município" value={form.xMunFim} title="Segue redespacho/destinatario" />
                    <Input readOnly tabIndex={-1} title="Segue redespacho/destinatario" className="h-7 text-xs w-14 text-center shrink-0 bg-transparent" placeholder="UF" value={form.ufFim} maxLength={2} />
                  </div>
                </div>
                </div>
              </div>

              {mercadorias.length > 0 ? (() => {
                const sel = mercadorias.filter(m => selecionadas.has(m.chave));
                const active = sel.length > 0 ? sel[0] : mercadorias[0];
                const percRem = percursoMatch && (percursoMatch.rem_cnpj || "") === (active.emitCnpj || "").replace(/\D/g, "") && percursoMatch.rem_nome ? { ie: percursoMatch.rem_ie || "", logradouro: percursoMatch.rem_logradouro || "", numero: percursoMatch.rem_nro || "", bairro: percursoMatch.rem_bairro || "", cidade: percursoMatch.rem_xmun || "", uf: percursoMatch.rem_uf || "", cep: percursoMatch.rem_cep || "", telefone: percursoMatch.rem_fone || "" } : null;
                const cEmit = contatoByDoc.get((active.emitCnpj || "").replace(/\D/g, "")) || percRem || {};
                const percDes = percursoMatch && (percursoMatch.dest_cnpj || "") === (active.destCnpj || "").replace(/\D/g, "") && percursoMatch.dest_nome ? { ie: percursoMatch.dest_ie || "", logradouro: percursoMatch.dest_logradouro || "", numero: percursoMatch.dest_nro || "", bairro: percursoMatch.dest_bairro || "", cidade: percursoMatch.dest_xmun || "", uf: percursoMatch.dest_uf || "", cep: percursoMatch.dest_cep || "", telefone: percursoMatch.dest_fone || "" } : null;
                const cDest = contatoByDoc.get((active.destCnpj || "").replace(/\D/g, "")) || percDes || {};
                const emitIE = active.emitIE || cEmit.ie || "";
                const emitLgr = active.emitLogradouro || cEmit.logradouro || "";
                const emitNro = cEmit.numero || "";
                const emitBai = active.emitBairro || cEmit.bairro || "";
                const emitCid = active.emitXMun || cEmit.cidade || "";
                const emitUF = active.emitUF || cEmit.uf || "";
                const emitCEP = active.emitCEP || (cEmit.cep || "").replace(/\D/g, "") || "";
                const emitFone = active.emitFone || cEmit.telefone || "";
                const destIE = active.destIE || cDest.ie || "";
                const destLgr = active.destLogradouro || cDest.logradouro || "";
                const destNro = cDest.numero || "";
                const destBai = active.destBairro || cDest.bairro || "";
                const destCid = active.destXMun || cDest.cidade || "";
                const destUF = active.destUF || cDest.uf || "";
                const destCEP = active.destCEP || (cDest.cep || "").replace(/\D/g, "") || "";
                const destFone = active.destFone || cDest.telefone || "";
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
                      <p className="text-muted-foreground">CNPJ: {active.emitCnpj ? active.emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"} {emitIE ? `IE: ${emitIE}` : ""}</p>
                      <p className="text-muted-foreground">{[emitLgr && `${emitLgr}${emitNro ? `, ${emitNro}` : ""}`, emitBai].filter(Boolean).join(" — ") || "—"}</p>
                      <p className="text-muted-foreground">{emitCid || "—"}-{emitUF || "—"} {emitCEP ? `CEP: ${emitCEP}` : ""}</p>
                      {emitFone && <p className="text-muted-foreground">Fone: {emitFone}</p>}
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
                      <p className="text-muted-foreground">CNPJ: {active.destCnpj ? active.destCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—"} {<span className="inline-flex items-center gap-1">IE: <Input className="h-5 w-32 text-[10px] px-1 text-foreground" placeholder="ISENTO" value={form.ieDestinatario || destIE || ((contatoByDoc.get(String(active.destCnpj || "").replace(/\D/g, "")) || {}) as any).ie || ""} onChange={e=>setForm({...form,ieDestinatario:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,14)})} /></span>}</p>
                      <p className="text-muted-foreground">{[destLgr && `${destLgr}${destNro ? `, ${destNro}` : ""}`, destBai].filter(Boolean).join(" — ") || "—"}</p>
                      <p className="text-muted-foreground">{destCid || "—"}-{destUF || "—"} {destCEP ? `CEP: ${destCEP}` : ""}</p>
                      {destFone && <p className="text-muted-foreground">Fone: {destFone}</p>}
                    </div>
                  </Card>
                </div>
                );
              })() : <p className="text-xs text-muted-foreground">Importe NF-es para preencher remetente e destinatário</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Consignatário */}
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded bg-amber-500/10 grid place-items-center"><Building2 className="h-3.5 w-3.5 text-amber-600" /></div>
                  <h5 className="text-xs font-semibold">Consignatário</h5>
                  <span className="text-[9px] text-muted-foreground hidden md:inline">opcional</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Input className="h-6 text-[10px] w-44 font-mono" placeholder="CNPJ — digite p/ buscar" value={fmtCnpjInput(form.cnpjConsignatario || "")} onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                      setForm({ ...form, cnpjConsignatario: digits });
                      if (digits.length === 14 && digits !== lastLookupConsig.current) { lastLookupConsig.current = digits; lookupConsignatario(digits); }
                    }} maxLength={18} />
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={lookingUpConsig} onClick={() => { const d = (form.cnpjConsignatario || "").replace(/\D/g, ""); if (d.length !== 14) { toast.error("CNPJ deve ter 14 dígitos"); return; } lastLookupConsig.current = d; lookupConsignatario(d); }} title="Buscar CNPJ">{lookingUpConsig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}</Button>
                    {form.cnpjConsignatario && <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => { lastLookupConsig.current = ""; setForm({ ...form, cnpjConsignatario: "", xNomeConsignatario: "", ieConsignatario: "", ufConsignatario: "", xMunConsignatario: "", cepConsignatario: "", logradouroConsignatario: "", nroConsignatario: "", bairroConsignatario: "" }); }} title="Limpar"><X className="h-3 w-3" /></Button>}
                  </div>
                </div>
                {(form.xNomeConsignatario || form.cnpjConsignatario) ? (
                  <div className="space-y-0.5 text-[10px]">
                    <p className="font-medium text-xs">{form.xNomeConsignatario || "—"}</p>
                    <p className="text-muted-foreground flex items-center gap-1 flex-wrap">CNPJ: {form.cnpjConsignatario ? fmtCnpjInput(form.cnpjConsignatario) : "—"} <span className="inline-flex items-center gap-1">IE: <Input className="h-5 w-32 text-[10px] px-1 text-foreground" placeholder="ISENTO" value={form.ieConsignatario || ((contatoByDoc.get(String(form.cnpjConsignatario || "").replace(/\D/g, "")) || {}) as any).ie || ""} onChange={e=>setForm({...form,ieConsignatario:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,14)})} /></span></p>
                    <p className="text-muted-foreground">{[form.logradouroConsignatario && `${form.logradouroConsignatario}${form.nroConsignatario ? `, ${form.nroConsignatario}` : ""}`, form.bairroConsignatario].filter(Boolean).join(" — ") || "—"}</p>
                    <p className="text-muted-foreground">{form.xMunConsignatario || "—"}-{form.ufConsignatario || "—"} {form.cepConsignatario ? `CEP: ${form.cepConsignatario}` : ""}</p>
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">Digite o CNPJ para buscar os dados automaticamente</p>}
              </Card>

              {/* Redespacho */}
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-6 w-6 rounded bg-violet-500/10 grid place-items-center"><Truck className="h-3.5 w-3.5 text-violet-600" /></div>
                  <h5 className="text-xs font-semibold">Redespacho</h5>
                  <span className="text-[9px] text-muted-foreground hidden md:inline">opcional</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Input className="h-6 text-[10px] w-44 font-mono" placeholder="CNPJ — digite p/ buscar" value={fmtCnpjInput(form.cnpjRedespacho || "")} onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                      setForm({ ...form, cnpjRedespacho: digits });
                      if (digits.length === 14 && digits !== lastLookupRedesp.current) { lastLookupRedesp.current = digits; lookupRedespacho(digits); }
                    }} maxLength={18} />
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={lookingUpRedesp} onClick={() => { const d = (form.cnpjRedespacho || "").replace(/\D/g, ""); if (d.length !== 14) { toast.error("CNPJ deve ter 14 dígitos"); return; } lastLookupRedesp.current = d; lookupRedespacho(d); }} title="Buscar CNPJ">{lookingUpRedesp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}</Button>
                    {form.cnpjRedespacho && <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => { lastLookupRedesp.current = ""; setForm({ ...form, cnpjRedespacho: "", xNomeRedespacho: "", ieRedespacho: "", ufRedespacho: "", xMunRedespacho: "", cepRedespacho: "", logradouroRedespacho: "", nroRedespacho: "", bairroRedespacho: "" }); }} title="Limpar"><X className="h-3 w-3" /></Button>}
                  </div>
                </div>
                {(form.xNomeRedespacho || form.cnpjRedespacho) ? (
                  <div className="space-y-0.5 text-[10px]">
                    <p className="font-medium text-xs">{form.xNomeRedespacho || "—"}</p>
                    <p className="text-muted-foreground flex items-center gap-1 flex-wrap">CNPJ: {form.cnpjRedespacho ? fmtCnpjInput(form.cnpjRedespacho) : "—"} <span className="inline-flex items-center gap-1">IE: <Input className="h-5 w-32 text-[10px] px-1 text-foreground" placeholder="ISENTO" value={form.ieRedespacho || ((contatoByDoc.get(String(form.cnpjRedespacho || "").replace(/\D/g, "")) || {}) as any).ie || ""} onChange={e=>setForm({...form,ieRedespacho:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,14)})} /></span></p>
                    <p className="text-muted-foreground">{[form.logradouroRedespacho && `${form.logradouroRedespacho}${form.nroRedespacho ? `, ${form.nroRedespacho}` : ""}`, form.bairroRedespacho].filter(Boolean).join(" — ") || "—"}</p>
                    <p className="text-muted-foreground">{form.xMunRedespacho || "—"}-{form.ufRedespacho || "—"} {form.cepRedespacho ? `CEP: ${form.cepRedespacho}` : ""}</p>
                  </div>
                ) : <p className="text-[10px] text-muted-foreground">Digite o CNPJ para buscar os dados automaticamente</p>}
              </Card>
              </div>
            </TabsContent>

            {/* === TAB: Doc Mercadorias === */}
            <TabsContent value="docs" className="mt-3 space-y-3">
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
                        <TableHead className="text-[10px] text-right">Qtde</TableHead>
                        <TableHead className="text-[10px] text-right">Qtde Peso</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mercadorias.length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-8">Nenhuma NF-e importada</TableCell></TableRow>
                      ) : (selecionadas.size > 0 ? mercadorias.filter(m => selecionadas.has(m.chave)) : mercadorias).map(m => (
                        <TableRow key={m.chave} className="text-[11px]" data-selected={selecionadas.has(m.chave)}>
                          <TableCell>
                            <input type="checkbox" checked={selecionadas.has(m.chave)} onChange={e => {
                              const next = new Set(selecionadas);
                              if (e.target.checked) { next.add(m.chave); const sel = mercadorias.filter(x => next.has(x.chave)); const emits = new Set(sel.map(x => x.emitCnpj || x.emit)); const dests = new Set(sel.map(x => x.destCnpj || x.dest)); const tomads = new Set(sel.map(x => x.tomadorCnpj || x.tomador)); if (emits.size > 1) { toast.error("Remetentes diferentes"); next.delete(m.chave); } else if (dests.size > 1) { toast.error("Destinatários diferentes"); next.delete(m.chave); } else if (tomads.size > 1) { toast.error("Tomadores diferentes"); next.delete(m.chave); } } else next.delete(m.chave);
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
                          <TableCell className="text-right">{Number(m.qVol || 0) > 0 ? Number(m.qVol).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"}</TableCell>
                          <TableCell className="text-right">{Number(m.peso).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right font-medium">{brl(m.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {(() => {
                  const base = selecionadas.size > 0 ? mercadorias.filter(m => selecionadas.has(m.chave)) : mercadorias;
                  const totQ = base.reduce((a, m) => a + Number(m.qVol || 0), 0);
                  const totP = base.reduce((a, m) => a + Number(m.peso || 0), 0);
                  const totV = base.reduce((a, m) => a + Number(m.valor || 0), 0);
                  return (
                    <div className="grid grid-cols-[1fr_90px_110px_130px] border-t bg-muted/40 text-xs font-semibold">
                      <div className="px-2 py-1.5">TOTAL — {base.length} NF-e(s) • VOL / KG / VALOR</div>
                      <div className="px-2 py-1.5 text-right font-mono">{totQ.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
                      <div className="px-2 py-1.5 text-right font-mono">{totP.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="px-2 py-1.5 text-right font-mono">{brl(totV)}</div>
                    </div>
                  );
                })()}
              </Card>

              {/* Tributação (fundida nesta aba) */}
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5 text-primary" /> ICMS</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">* CST</Label>
                    <Select value={form.icmsCST} onValueChange={v => setForm({ ...form, icmsCST: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">00 — Tributada integralmente</SelectItem>
                        <SelectItem value="10">10 — Tributada e com cobrança do ICMS por substituição tributária</SelectItem>
                        <SelectItem value="20">20 — Com redução de base de cálculo</SelectItem>
                        <SelectItem value="30">30 — Isenta ou não tributada e com cobrança do ICMS por substituição tributária</SelectItem>
                        <SelectItem value="40">40 — Isenta</SelectItem>
                        <SelectItem value="41">41 — Não tributada</SelectItem>
                        <SelectItem value="50">50 — Suspensão</SelectItem>
                        <SelectItem value="51">51 — Diferimento</SelectItem>
                        <SelectItem value="60">60 — ICMS cobrado anteriormente por substituição tributária</SelectItem>
                        <SelectItem value="70">70 — Com redução de base de cálculo e cobrança do ICMS por substituição tributária</SelectItem>
                        <SelectItem value="90">90 — Outras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">Redução de Base (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={(form as any).reducaoBase || "0.00"} onChange={v => setForm({ ...form, reducaoBase: v } as any)} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Alíquota ICMS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.icmsAliq} onChange={v => setForm({ ...form, icmsAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Base Cálculo (R$)</Label><MoneyInput className="h-7 text-xs bg-muted" value={totalPrestacao(form).toFixed(2)} onChange={() => {}} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Valor ICMS (R$)</Label><MoneyInput className="h-7 text-xs bg-muted" value={form.icmsValor} onChange={() => {}} placeholder="0,00" /></div>
                  <div className="md:col-span-3"><Label className="text-[10px] text-muted-foreground">Valor do crédito outorgado/presumido (R$)</Label><MoneyInput className="h-7 text-xs" value={(form as any).creditoOutorgado || "0.00"} onChange={v => setForm({ ...form, creditoOutorgado: v } as any)} placeholder="0,00" /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Digite só números — vírgula preenche automaticamente. Ponto só para milhares. Base padrão = Valor do Serviço. Redução/crédito salvos no rascunho.</p>
              </Card>
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2">Outros Impostos — Alíquotas (%)</h5>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                  <div><Label className="text-[10px] text-muted-foreground">PIS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.pisAliq} onChange={v => setForm({ ...form, pisAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">COFINS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.cofinsAliq} onChange={v => setForm({ ...form, cofinsAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">IR (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.irAliq} onChange={v => setForm({ ...form, irAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">INSS (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.inssAliq} onChange={v => setForm({ ...form, inssAliq: v })} placeholder="0,00" /></div>
                  <div><Label className="text-[10px] text-muted-foreground">CSLL (%)</Label><MoneyInput className="h-7 text-xs" prefix="" value={form.csllAliq} onChange={v => setForm({ ...form, csllAliq: v })} placeholder="0,00" /></div>
                </div>
              </Card>

            </TabsContent>

            {/* === TAB: Seguros/Veículos === */}
            <TabsContent value="seguros" className="mt-2 space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <Card className="p-2">
                  <h5 className="text-xs font-semibold mb-1">Seguro da Carga</h5>
                  <div className="space-y-1">
                                        <div className="grid grid-cols-12 gap-1">
                      <div className="col-span-5"><Label className="text-[10px] text-muted-foreground">Seguradora</Label>
                      <Popover open={seguradoraOpen} onOpenChange={setSeguradoraOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={seguradoraOpen} className="h-6 text-[10px] justify-between w-full font-normal">
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
                      </Popover></div>
                      <div className="col-span-3"><Label className="text-[10px] text-muted-foreground">Apólice</Label><Input className="h-6 text-[10px]" placeholder="Nº Apólice" value={form.apolice} onChange={e => setForm({ ...form, apolice: e.target.value })} /></div>
                    <div className="col-span-2"><Label className="text-[10px] text-muted-foreground">Responsável</Label>
                      <Select value={form.segResponsavel || "4"} onValueChange={v => setForm({ ...form, segResponsavel: v })}>
                        <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESPONSAVEL_CTE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                      <div className="col-span-2"><Label className="text-[10px] text-muted-foreground">Nº Averbação</Label><Input className="h-6 text-[10px]" placeholder="Nº Averbação" value={form.averbacao} onChange={e => setForm({ ...form, averbacao: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Base Seg.</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value={form.vCarga} readOnly /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Valor Doc.</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value={form.vCarga} readOnly /></div>
                      <div><Label className="text-[10px] text-muted-foreground">RCTR-C</Label><Input className="h-6 text-[10px]" placeholder="0.00" value={form.rctrC || ""} onChange={e => setForm({ ...form, rctrC: e.target.value })} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">RCF-DC</Label><Input className="h-6 text-[10px]" placeholder="0.00" value={form.rcfDc || ""} onChange={e => setForm({ ...form, rcfDc: e.target.value })} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">V. Adicional</Label><Input className="h-6 text-[10px]" placeholder="0.00" value={form.segAdicional || ""} onChange={e => setForm({ ...form, segAdicional: e.target.value })} /></div>
                      <div className="flex items-end gap-1"><div className="flex-1"><Label className="text-[10px] text-muted-foreground">Total Seguro</Label><Input className="h-6 text-[10px]" placeholder="0.00" value={form.segTotal || ""} onChange={e => setForm({ ...form, segTotal: e.target.value })} /></div><label className="flex items-center gap-1 text-[10px] pb-1"><input type="checkbox" checked={form.segRepassar === "S"} onChange={e => setForm({ ...form, segRepassar: e.target.checked ? "S" : "" })} /> Repassar</label></div>
                    </div>
                    
                  </div>
                </Card>

                <Card className="p-2">
                  <h5 className="text-xs font-semibold mb-1">Dados do Veículo / Motorista</h5>
                  <div className="space-y-1">
                    <div className="grid grid-cols-3 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">Nome Motorista</Label>
                      <Popover open={motoristaOpen} onOpenChange={setMotoristaOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={motoristaOpen} className="h-6 text-[10px] justify-between w-full font-normal">
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
                      <div><Label className="text-[10px] text-muted-foreground">CIOT</Label><Input className="h-6 text-[10px]" placeholder="Nº CIOT" /></div>
                      <div><Label className="text-[10px] text-muted-foreground">% Agregados</Label><Input className="h-6 text-[10px]" placeholder="0.00" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <div><Label className="text-[10px] text-muted-foreground">{"Tra\u00e7\u00e3o"}</Label>
                        <Popover open={veiculoOpen === "placaVeiculo"} onOpenChange={v => { setVeiculoOpen(v ? "placaVeiculo" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "placaVeiculo"} className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.placaVeiculo || "Selecione placa"}</span>
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
                                    <CommandItem key={v.id} value={v.placa} onSelect={() => { const tagV = (v as any).tag_pedagio || ""; setForm(f => ({ ...f, placaVeiculo: v.placa.toUpperCase(), ...(tagV ? { pedagioTag: tagV } : {}) })); setVeiculoOpen(null); setVeiculoQuery(""); }}>
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
                        {form.placaVeiculo ? (<button type="button" className="mt-0.5 text-[9px] text-muted-foreground underline" onClick={() => setForm(f => ({ ...f, placaVeiculo: "" }))}>limpar</button>) : null}
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Reboque 1</Label>
                        <Popover open={veiculoOpen === "semi1"} onOpenChange={v => { setVeiculoOpen(v ? "semi1" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "semi1"} className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.semiReboque1 || "Selecione placa"}</span>
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
                        {form.semiReboque1 ? (<button type="button" className="mt-0.5 text-[9px] text-muted-foreground underline" onClick={() => setForm(f => ({ ...f, semiReboque1: "" }))}>limpar</button>) : null}
                      </div>
                      <div><Label className="text-[10px] text-muted-foreground">Reboque 2</Label>
                        <Popover open={veiculoOpen === "semi2"} onOpenChange={v => { setVeiculoOpen(v ? "semi2" : null); if (v) setVeiculoQuery(""); }}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={veiculoOpen === "semi2"} className="h-6 text-[10px] justify-between w-full font-mono uppercase font-normal">
                              <span className="truncate">{form.semiReboque2 || "Selecione placa"}</span>
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
                        {form.semiReboque2 ? (<button type="button" className="mt-0.5 text-[9px] text-muted-foreground underline" onClick={() => setForm(f => ({ ...f, semiReboque2: "" }))}>limpar</button>) : null}
                      </div>
                    </div>
                    <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" /> Possui Segundo Motorista</label>
                  </div>
                </Card>
              </div>

              {/* Pedágio / Taxas / Despesas Acessórias (ex-aba Taxas) */}
              <Card className="p-2">
                <h5 className="text-xs font-semibold mb-1">Componentes do Frete</h5>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-1">
                  <div><Label className="text-[10px] text-muted-foreground">Valor Serviço</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.vPrest} onChange={v => setForm(f => ({ ...f, vPrest: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Adicional</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.adicionalPed} onChange={v => setForm(f => ({ ...f, adicionalPed: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Desconto</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.descontoPed} onChange={v => setForm(f => ({ ...f, descontoPed: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Outros</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.outrosPed} onChange={v => setForm(f => ({ ...f, outrosPed: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Ad Valorem</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.adValorem} onChange={v => setForm(f => ({ ...f, adValorem: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">GRIS</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.gris} onChange={v => setForm(f => ({ ...f, gris: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Taxa Coleta</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.taxaColeta} onChange={v => setForm(f => ({ ...f, taxaColeta: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Taxa Entrega</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.taxaEntrega} onChange={v => setForm(f => ({ ...f, taxaEntrega: v }))} /></div>
                                  </div>
                <p className="text-[9px] text-muted-foreground mt-1">Vale-pedágio (Lei 10.209/2001, art. 2º): não integra o frete nem a BC do ICMS e não vai no CT-e — informar no MDF-e.</p>
              </Card>

              <Card className="p-2">
                <h5 className="text-xs font-semibold mb-1">Forma de Pagamento do Pedágio</h5>
                <div className="flex flex-wrap gap-3 text-[10px]">
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" checked={pagtoSeguro(form.pedagioPagto) === "free-flow"} onChange={() => setForm({ ...form, pedagioPagto: "free-flow" })} /> Free Flow</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" checked={pagtoSeguro(form.pedagioPagto) === "tag-transportador"} onChange={() => setForm({ ...form, pedagioPagto: "tag-transportador" })} /> TAG Transportador</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" checked={pagtoSeguro(form.pedagioPagto) === "tag-tomador"} onChange={() => setForm({ ...form, pedagioPagto: "tag-tomador" })} /> TAG Tomador</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pedagio_pagto" checked={pagtoSeguro(form.pedagioPagto) === "sem-pagamento"} onChange={() => setForm({ ...form, pedagioPagto: "sem-pagamento" })} /> Sem Pagamento de Pedágio</label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-1">
                  <div><Label className="text-[10px] text-muted-foreground">Operadora</Label>
                    <Select value={form.pedagioOperadora || ""} onValueChange={v => { const op = PEDAGIO_OPERADORAS.find(o => o.nome === v); setForm({ ...form, pedagioOperadora: v, pedagioCnpj: op ? op.cnpj : form.pedagioCnpj }); }}>
                      <SelectTrigger className="h-6 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{PEDAGIO_OPERADORAS.map(o => <SelectItem key={o.nome} value={o.nome}>{o.nome}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div><Label className="text-[10px] text-muted-foreground">CNPJ Operadora</Label><Input className="h-6 text-[11px]" placeholder="00.000.000/0000-00" value={form.pedagioCnpj || ""} onChange={e => setForm({ ...form, pedagioCnpj: e.target.value })} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Vale Pedágio (R$)</Label><MoneyInput className="h-6 text-[11px] font-medium" value={form.valePedagio} onChange={v => setForm(f => ({ ...f, valePedagio: v }))} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Nº TAG</Label><Input className="h-6 text-[11px]" placeholder="Nº TAG" value={form.pedagioTag || ""} onChange={e=>setForm({...form, pedagioTag: e.target.value})} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">CNPJ Resp. Pagto</Label><Input className="h-6 text-[11px] bg-transparent" title="Sempre o CNPJ da emissora" value={form.pedagioRespCnpj || ""} readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Identificador VPO</Label><Input className="h-6 text-[11px]" value={(form as any).pedagioIdentVPO || ""} onChange={e=>setForm({...form, pedagioIdentVPO: e.target.value} as any)} /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Data Operação</Label><Input className="h-6 text-[11px] bg-transparent" title="Sempre a data de emissão" value={String(form.pedagioDataOp || "").slice(0, 10).split("-").reverse().join("/")} readOnly /></div>
                </div>
              </Card>
            </TabsContent>

            {/* === TAB: Status === */}
            <TabsContent value="status" className="mt-3 space-y-3">
              <Card className="p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">* Modal</Label>
                    <Select value="RODOVIARIO" onValueChange={() => {}}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="RODOVIARIO">RODOVIÁRIO</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">* Tomador</Label><Input className="h-7 text-xs bg-transparent dark:bg-transparent" value={{ "0": "REMETENTE", "1": "DESTINATÁRIO", "2": "OUTROS", "3": "REMETENTE", "4": "DESTINATÁRIO", "9": "OUTROS" }[form.toma] || "OUTROS"} readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">* Forma de Pagamento</Label>
                    <Select value={(form as any).formaPagamento || "Outros"} onValueChange={v => setForm({ ...form, formaPagamento: v } as any)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A Vista">À VISTA</SelectItem>
                        <SelectItem value="A Prazo">A PRAZO</SelectItem>
                        <SelectItem value="Outros">OUTROS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">* Finalidade de Emissão</Label>
                    <Select value={(form as any).finalidadeEmissao || "Normal"} onValueChange={v => setForm({ ...form, finalidadeEmissao: v } as any)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">NORMAL</SelectItem>
                        <SelectItem value="Complemento">COMPLEMENTO</SelectItem>
                        <SelectItem value="Anulacao">ANULAÇÃO</SelectItem>
                        <SelectItem value="Substituicao">SUBSTITUIÇÃO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">* Tipo de Serviço</Label>
                    <Select value={(form as any).tipoServico || "Normal"} onValueChange={v => setForm({ ...form, tipoServico: v } as any)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">NORMAL</SelectItem>
                        <SelectItem value="Subcontratacao">SUBCONTRATAÇÃO</SelectItem>
                        <SelectItem value="Redespacho">REDESPACHO</SelectItem>
                        <SelectItem value="Redespacho Intermediario">REDESPACHO INTERMEDIÁRIO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px] text-muted-foreground">* Forma de Emissão</Label>
                    <Select value={(form as any).formaEmissao || "Normal"} onValueChange={v => setForm({ ...form, formaEmissao: v } as any)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">NORMAL</SelectItem>
                        <SelectItem value="EPEC">EPEC</SelectItem>
                        <SelectItem value="FSDA">FSDA</SelectItem>
                        <SelectItem value="SVC">SVC-SP / SVC-RS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">CT-e Simplificado MG transmite sempre como Normal / Rodoviário; demais opções ficam salvas no rascunho.</p>
              </Card>
              <Card className="p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 items-center">
                  <Label className="text-[10px] text-muted-foreground">CT-e Referenciado</Label>
                  <Input className="h-6 text-[10px] font-mono" placeholder="Chave de acesso do CT-e substituído (44 dígitos)" value={(form as any).cteReferenciado || ""} onChange={e=>setForm({...form, cteReferenciado: e.target.value.replace(/\D/g, "").slice(0, 44)} as any)} maxLength={44} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 items-center">
                  <Label className="text-[10px] text-muted-foreground">Complemento / Anulação</Label>
                  <Input className="h-6 text-[10px] font-mono" placeholder="Chave do CT-e complementado/anulado (44 dígitos)" value={(form as any).chaveCompAnulacao || ""} onChange={e=>setForm({...form, chaveCompAnulacao: e.target.value.replace(/\D/g, "").slice(0, 44)} as any)} maxLength={44} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[180px_200px] gap-1 items-center">
                  <Label className="text-[10px] text-muted-foreground">Data Declaração</Label>
                  <DateInput value={(form as any).dataDeclaracao || ""} onChange={v => setForm({ ...form, dataDeclaracao: v } as any)} className="h-6 text-[10px]" />
                </div>
              </Card>
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-2">Situação do CT-e</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div><Label className="text-[10px] text-muted-foreground">Chave de Acesso</Label><Input className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent" value="— aguardando emissão —" readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Protocolo de Envio</Label><Input className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent" value="— aguardando emissão —" readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Data Hora Envio</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value="— aguardando emissão —" readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Motivo Envio</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value="— aguardando emissão —" readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Protocolo Cancelamento</Label><Input className="h-6 text-[10px] font-mono bg-transparent dark:bg-transparent" value="—" readOnly /></div>
                  <div><Label className="text-[10px] text-muted-foreground">Data Hora Cancelamento</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value="—" readOnly /></div>
                  <div className="md:col-span-2"><Label className="text-[10px] text-muted-foreground">Motivo Cancelamento</Label><Input className="h-6 text-[10px] bg-transparent dark:bg-transparent" value="—" readOnly /></div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Preenchidos automaticamente após transmissão/cancelamento.</p>
              </Card>
            </TabsContent>

            {/* === TAB: Observações === */}
            <TabsContent value="obs" className="mt-3 space-y-3">
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-1">Observações Gerais</h5>
                <Textarea className="min-h-[120px] text-xs font-mono resize-y" placeholder={"01 — \n02 — \n03 — Protocolo Pedidos:"} value={(form as any).obsGerais || ""} onChange={e=>setForm({...form, obsGerais: e.target.value} as any)} />
              </Card>
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-1">Observações CT-e Anulação/Substituição</h5>
                <Textarea className="min-h-[60px] text-xs font-mono resize-y" value={(form as any).obsAnulacao || ""} onChange={e=>setForm({...form, obsAnulacao: e.target.value} as any)} />
              </Card>
              <Card className="p-3">
                <h5 className="text-xs font-semibold mb-1">Observações CT-e Globalizado</h5>
                <Textarea className="min-h-[60px] text-xs font-mono resize-y" value={(form as any).obsGlobalizado || ""} onChange={e=>setForm({...form, obsGlobalizado: e.target.value} as any)} />
              </Card>
            </TabsContent>
          </Tabs>

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

      {/* Visor próprio de Pré-Visualização DACTE */}
      {previewOpen && previewData && (() => {
            const f = { ...form, ...previewData.form };
            const baseNfes = selecionadas.size > 0 ? mercadorias.filter(m => selecionadas.has(m.chave)) : mercadorias;
            const nFes = baseNfes.map((m: any) => ({ nNF: m.nNF || "", serie: m.serie || "1", valor: m.valor || 0, chave: m.chave || "" }));
            const first = mercadorias[0] || {} as any;
            const cRem = contatoByDoc.get(((first as any).emitCnpj || "").replace(/\D/g, "")) || {};
            const cDst = contatoByDoc.get(((first as any).destCnpj || "").replace(/\D/g, "")) || {};
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
              emitBairro: (f.emit as any)?.bairro || "",
              emitCEP: (f.emit as any)?.cep || "",
              emitFone: (f.emit as any)?.fone || "",
              emitIE: f.emit?.ie || "ISENTO",
              respEmissao: respNome,
              tomadorCnpj: f.cnpjTomador || "",
              // Manter igual a HOMOLOG_TOMADOR_NOME em sefaz-cte.ts (SEFAZ-MG exige em homologação, erro 938)
              tomadorNome: previewData.ambiente === "homologacao" ? "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : (f.xNomeTomador || ""),
              tomadorEndereco: `${(f.logradouroTomador || "").trim()}${f.nroTomador ? ", " + f.nroTomador : ""}${f.bairroTomador ? " - " + f.bairroTomador : ""}`.trim(),
              tomadorFone: f.foneTomador || "",
              tomadorCidade: f.xMunTomador || "",
              tomadorUF: f.ufTomador || "",
              remCnpj: first.emitCnpj || "",
              remNome: first.emit || "",
              remCidade: first.emitXMun || cRem.cidade || "",
              remUF: first.emitUF || cRem.uf || "",
              remEndereco: first.emitLogradouro || cRem.logradouro || "",
              remBairro: first.emitBairro || cRem.bairro || "",
              remCEP: first.emitCEP || (cRem.cep || "").replace(/\D/g, "") || "",
              remIE: first.emitIE || cRem.ie || "",
              remFone: first.emitFone || cRem.telefone || "",
              destCnpj: first.destCnpj || "",
              destNome: first.dest || "",
              destCidade: first.destXMun || cDst.cidade || "",
              destUF: first.destUF || cDst.uf || "",
              destEndereco: first.destLogradouro || cDst.logradouro || "",
              destBairro: first.destBairro || cDst.bairro || "",
              destCEP: first.destCEP || (cDst.cep || "").replace(/\D/g, "") || "",
              destIE: first.destIE || cDst.ie || "",
              destFone: first.destFone || cDst.telefone || "",
              cfop: f.cfop || "5353",
              cfopDescricao: (CFOPS_CTE.find(c => c.codigo === (f.cfop || "5353"))?.descricao || ""),
              naturezaOperacao: "TRANSPORTE INTERESTADUAL - INDUSTRIAL",
              origemCidade: f.xMunIni || "",
              origemUF: f.ufIni || "",
              destinoCidade: f.xMunFim || "",
              destinoUF: f.ufFim || "",
              valorServico: totalPrestacao({ ...emptyForm, ...(f as any) }),
              valorCarga: f.vCarga || 0,
              qtdVol: (() => { const q = baseNfes.reduce((a: number, m: any) => a + Number((m as any).qVol || 0), 0); return q > 0 ? String(q) : ""; })(),
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
              comps: ([['Frete Valor', f.vPrest], ['Adicional', (f as any).adicionalPed], ['Desconto', (f as any).descontoPed], ['Outros', (f as any).outrosPed], ['Ad Valorem', (f as any).adValorem], ['GRIS', (f as any).gris], ['Coleta', (f as any).taxaColeta], ['Entrega', (f as any).taxaEntrega]] as Array<[string, any]>).filter(([, vv]) => Number(vv) !== 0).map(([nn, vv]) => ({ nome: nn, valor: Number(vv) || 0 })),
              placa: f.placaVeiculo || "",
              placaReboque: f.placaReboque || "",
              rntrc: f.rntrc || rntrcFinal || "",
              veiculos: [f.placaVeiculo, f.placaReboque, (f as any).semiReboque1, (f as any).semiReboque2].map(p => String(p || "").toUpperCase()).filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).map(p => {
                const fv = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === p);
                return { tipo: "Própria", placa: p, renavam: (fv as any)?.renavam || "", uf: (empresa as any)?.uf || "MG", rntrc: (fv as any)?.rntrc || f.rntrc || rntrcFinal || "" };
              }).slice(0, 4),
              seguradoraNome: f.seguradoraNome || "",
              apolice: f.apolice || "",
              averbacao: f.averbacao || "",
              numeroAverbacao: f.averbacao || "",
              motoNome: f.motoristaNome || "",
              motoCPF: ((motoristas || []).find((m: any) => m.id === f.motoristaId)?.cpf || ""),
              ciot: f.ciot || "",
              segCNPJ: ((seguradoras || []).find((s: any) => s.id === f.seguradoraId)?.cnpj || ""),
              valePedagio: f.valePedagio || "",
              valePedFornCNPJ: f.pedagioCnpj || "",
              valePedComprov: (f as any).pedagioIdentVPO || f.pedagioTag || "",
              valePedRespCNPJ: (f as any).pedagioRespCnpj || "",
              obs: [(f as any).obsGerais, (f as any).obsAnulacao, (f as any).obsGlobalizado].filter(Boolean).join(" • ") || "",
              protocolo: "",
              logoDataUrl: JUVENAL_LOGO || undefined,
            });
            const url = URL.createObjectURL(pdfBlob);
            if (lastPreviewUrl.current && lastPreviewUrl.current !== url) URL.revokeObjectURL(lastPreviewUrl.current);
            lastPreviewUrl.current = url;
            return (
              <DacteViewer
                titulo="Pré-Visualização DACTE"
                subtitulo={`Nº ${previewData.proximo} • ${previewData.ambiente === "homologacao" ? "Homologação" : "Produção"} • Chave ${previewData.chave}`}
                url={url}
                nomeArquivo={`DACTE-${previewData.proximo}.pdf`}
                onClose={() => { if (lastPreviewUrl.current) { URL.revokeObjectURL(lastPreviewUrl.current); lastPreviewUrl.current = null; } setPreviewOpen(false); }}
                acoes={
                  <Button size="sm" onClick={() => { setPreviewOpen(false); emitir.mutate(); }} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
                    {emitir.isPending ? "Enviando..." : <><Truck className="mr-1 h-3.5 w-3.5" /> Enviar Doc-e</>}
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
          onClose={() => { URL.revokeObjectURL(viewUrl); setViewUrl(null); }}
        />
      )}
    </div>
  );
}
