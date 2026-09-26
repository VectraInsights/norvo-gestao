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
import { Route as RoadIcon, Plus, FileText, Search, Trash2, Filter, Calendar, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send, FileDown, Truck, Users, RotateCcw, Pencil, Eye, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { emitirMdfFn, consultarMdfFn, encerrarMdfFn, cancelarMdfFn } from "@/lib/sefaz-mdf-server";
import { gerarDamdfePdf, damdfeDataDoXml } from "@/lib/damdfe-pdf";
import { MDFE_AMBIENTE } from "@/lib/sefaz-ambiente";
import { DateInput } from "@/components/erp/date-input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/fiscal/mdf")({
  component: MdfPage,
  head: () => ({ meta: [{ title: "MDF-e — Norvo" }] }),
});

type MdfDoc = {
  id: string; numero: string | null; serie: string | null; status: string;
  qtd_cte: number | null; chave_acesso: string | null; created_at: string;
  motivo_rejeicao: string | null; protocolo_sefaz: string | null;
  uf_carregamento: string | null; uf_descarregamento: string | null;
  valor_total_carga: number | null; peso_total: number | null;
  veiculo_tracao_id: string | null; motorista_id: string | null;
  xml_assinado: string | null; xml_protocolo: string | null;
  responsavel_emissao: string | null; responsavel_encerramento: string | null;
  data_encerramento: string | null;
};

type CteDoc = { id: string; numero: string | null; serie: string | null; chave_acesso: string | null; status: string; valor_servico: number | null; peso_carga: number | null; data_autorizacao: string | null };

// Vizinhança das UFs (fronteira terrestre) para validar o trajeto do percurso
const UF_VIZINHOS: Record<string, string[]> = {
  AC: ["AM", "RO"], AL: ["BA", "PE", "SE"], AM: ["AC", "RO", "MT", "PA", "RR", "AP"],
  AP: ["PA", "AM"], BA: ["SE", "AL", "PE", "PI", "TO", "GO", "MG", "ES"],
  CE: ["PI", "PE", "PB", "RN"], DF: ["GO", "MG"], ES: ["BA", "MG", "RJ"],
  GO: ["DF", "MG", "MT", "MS", "TO", "BA"], MA: ["PI", "TO", "PA"],
  MG: ["BA", "ES", "RJ", "SP", "MS", "GO", "DF"], MS: ["MG", "SP", "PR", "MT", "GO"],
  MT: ["RO", "AM", "PA", "TO", "GO", "MS"], PA: ["AP", "AM", "MT", "TO", "MA"],
  PB: ["CE", "PE", "RN"], PE: ["PB", "CE", "PI", "BA", "AL"],
  PI: ["CE", "PE", "BA", "TO", "MA"], PR: ["MS", "SP", "SC"],
  RJ: ["ES", "MG", "SP"], RN: ["CE", "PB"], RO: ["AC", "AM", "MT"],
  RR: ["AM", "PA"], RS: ["SC"], SC: ["PR", "RS"], SE: ["AL", "BA"],
  SP: ["MG", "RJ", "PR", "MS"], TO: ["MA", "PI", "BA", "GO", "MT", "PA"],
};
function distUF(a: string, b: string): number {
  if (a === b) return 0;
  const seen = new Set([a]);
  let front = [a];
  let d = 0;
  while (front.length) {
    d++;
    const next: string[] = [];
    for (const u of front) for (const v of (UF_VIZINHOS[u] || [])) {
      if (v === b) return d;
      if (!seen.has(v)) { seen.add(v); next.push(v); }
    }
    front = next;
  }
  return 99;
}

function MdfPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mdfPrefill, setMdfPrefill] = useState<string[] | null>(null);
  const [mdfDraft, setMdfDraft] = useState<{ id?: string; chaves: string[]; percursoUFs: string[]; observacoes: string; infoFisco: string; tipoMdf: "Normal" | "Globalizado"; isTransbordo: boolean; transb1: string; transb2: string; transb3: string } | null>(null);
  const [semRascunho, setSemRascunho] = useState(false);
  useEffect(() => {
    let pre: any = null;
    try { pre = JSON.parse(localStorage.getItem("prefill_mdf_from_cte") || "null"); } catch { pre = null; }
    if (pre?.chaves?.length) {
      try { localStorage.removeItem("prefill_mdf_from_cte"); } catch {}
      setMdfPrefill(pre.chaves);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openEncerrar, setOpenEncerrar] = useState(false);
  const [openCancelar, setOpenCancelar] = useState(false);
  const [mdfEncerrar, setMdfEncerrar] = useState<MdfDoc | null>(null);
  const [mdfCancelar, setMdfCancelar] = useState<MdfDoc | null>(null);
  const [mdfVer, setMdfVer] = useState<MdfDoc | null>(null);
  const [consultandoChave, setConsultandoChave] = useState("");
  const xmlDeMdf = (d: MdfDoc) => {
    const raw = String(d.xml_assinado || "");
    try { const p = JSON.parse(raw); if (p && p.xml) return String(p.xml); } catch {}
    return raw;
  };
  const baixarXmlMdf = (d: MdfDoc) => {
    const xml = xmlDeMdf(d);
    if (!xml.includes("<")) { toast.error("XML não encontrado no registro"); return; }
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.chave_acesso || "").replace(/\D/g, "") || d.numero || "0"}-mdfe.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("XML baixado");
  };
  const baixarPdfMdf = async (d: MdfDoc) => {
    try {
      const xml = xmlDeMdf(d);
      if (!xml.includes("<infMDFe")) { toast.error("XML não encontrado no registro"); return; }
      const dados = damdfeDataDoXml(xml, { protocolo: d.protocolo_sefaz || undefined, numero: d.numero, serie: d.serie, emitCep: String((empresa as any)?.cep || ""), emitFone: String((empresa as any)?.telefone || "") });
      try {
        const raw = String((d as any).xml_assinado || "");
        try { const p = JSON.parse(raw); dados.obs = String(p.observacoes || p.infoFisco || ""); } catch {}
      } catch {}
      // Enriquece docs com número do CT-e e NFes vinculadas.
      try {
        const chaves = dados.chavesCte;
        if (chaves.length) {
          const { data: rows } = await supabase.from("cte_documentos" as any).select("chave_acesso,numero,xml_assinado").in("chave_acesso", chaves);
          const byCh = new Map<string, any>();
          for (const r of (rows as any[]) || []) if ((r as any)?.chave_acesso) byCh.set((r as any).chave_acesso, r);
          dados.docs = chaves.map(ch => {
            const r = byCh.get(ch);
            let nfes = "";
            try {
              let cx = String((r as any)?.xml_assinado || "");
              try { const p = JSON.parse(cx); if (p?.xml) cx = String(p.xml); } catch {}
              nfes = [...cx.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)]
                .map(m => `${m[1].slice(25, 34).replace(/^0+/, "") || "0"}/${m[1].slice(22, 25).replace(/^0+/, "") || "0"}`)
                .join(", ");
            } catch {}
            return { numero: String((r as any)?.numero || ""), chave: ch, nfes };
          });
        }
      } catch {}
      // RNTRC/proprietário DO CADASTRO dos veículos (tração + reboques).
      try {
        const placas = [dados.placa, ...dados.reboques.map(r => r.placa)].map(p => String(p || "").toUpperCase()).filter(Boolean);
        if (placas.length && empresa) {
          const { data: vs } = await supabase.from("veiculos" as any).select("placa,rntrc,proprietario").eq("empresa_id", (empresa as any).id).in("placa", placas);
          const byPlaca = new Map<string, any>();
          for (const v of (vs as any[]) || []) if ((v as any)?.placa) byPlaca.set(String((v as any).placa).toUpperCase(), v);
          const tv = byPlaca.get(String(dados.placa || "").toUpperCase());
          if (tv) { dados.tracRntrc = String((tv as any).rntrc || ""); dados.tracProp = String((tv as any).proprietario || ""); }
          dados.reboques = dados.reboques.map(r => {
            const rv = byPlaca.get(String(r.placa || "").toUpperCase());
            return rv ? { ...r, rntrc: String((rv as any).rntrc || ""), prop: String((rv as any).proprietario || "") } : r;
          });
          // CNPJ/CPF do proprietário (coluna nova; query separada p/ não quebrar se a migration ainda não rodou).
          try {
            const { data: vd } = await supabase.from("veiculos" as any).select("placa,proprietario_doc").eq("empresa_id", (empresa as any).id).in("placa", placas);
            const byDoc = new Map<string, string>();
            for (const v of (vd as any[]) || []) if ((v as any)?.placa) byDoc.set(String((v as any).placa).toUpperCase(), String((v as any).proprietario_doc || ""));
            (dados as any).tracPropDoc = byDoc.get(String(dados.placa || "").toUpperCase()) || "";
            dados.reboques = dados.reboques.map(r => ({ ...r, propDoc: byDoc.get(String(r.placa || "").toUpperCase()) || "" }));
          } catch {}
        }
      } catch {}
      const blob = gerarDamdfePdf(dados);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(d.chave_acesso || "").replace(/\D/g, "") || d.numero || "0"}-damdfe.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DAMDFE baixado");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF"); }
  };
  const consultarMdf = async (d: MdfDoc) => {
    if (!empresa || !d.chave_acesso) return;
    setConsultandoChave(d.chave_acesso);
    try {
      const res = await consultarMdfFn({ data: { empresaId: empresa.id, chave: d.chave_acesso } });
      if (res.cStat === "100") toast.success(`Autorizado: ${res.xMotivo || ""}`);
      else toast.info(`SEFAZ: ${res.cStat} - ${res.xMotivo}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao consultar"); }
    setConsultandoChave("");
  };
  const [justificativa, setJustificativa] = useState("");
  const continuarRascunho = (d: MdfDoc) => {
    try {
      const p = JSON.parse(String((d as any).xml_assinado || "{}"));
      setMdfDraft({
        id: d.id,
        chaves: Array.isArray(p.chaves) ? p.chaves : [],
        percursoUFs: Array.isArray(p.percursoUFs) ? p.percursoUFs : [],
        observacoes: String(p.observacoes || ""),
        infoFisco: String(p.infoFisco || ""),
        tipoMdf: p.tipoMdf === "Globalizado" ? "Globalizado" : "Normal",
        isTransbordo: !!p.isTransbordo,
        transb1: String(p.transb1 || ""), transb2: String(p.transb2 || ""), transb3: String(p.transb3 || ""),
      });
      setOpen(true);
    } catch { toast.error("Rascunho ilegível"); }
  };
  const reemitir = (d: MdfDoc) => {
    const xml = String((d as any).xml_assinado || "");
    const chaves = [...xml.matchAll(/<chCTe>(\d{44})<\/chCTe>/g)].map(m => m[1]);
    const unicas = [...new Set(chaves)];
    const percurso = [...xml.matchAll(/<UFPer>([A-Z]{2})<\/UFPer>/g)].map(m => m[1]);
    const transbs = [...xml.matchAll(/<chMDFe>(\d{44})<\/chMDFe>/g)].map(m => m[1]);
    // Transbordo não tem chCTe (só chMDFe): reaproveita os manifestos origem.
    if (!unicas.length && !transbs.length) { toast.error("Sem CT-es vinculados para reaproveitar"); return; }
    const tpEmitM = xml.match(/<tpEmit>([13])<\/tpEmit>/)?.[1];
    setMdfDraft({
      chaves: unicas, percursoUFs: percurso, observacoes: "", infoFisco: "",
      tipoMdf: tpEmitM === "3" ? "Globalizado" : "Normal",
      isTransbordo: transbs.length > 0,
      transb1: transbs[0] || "", transb2: transbs[1] || "", transb3: transbs[2] || "",
    });
    setSemRascunho(true);
    setOpen(true);
  };
  const [filtroStatus, setFiltroStatus] = useState("autorizados");
  const [mdfSitTab, setMdfSitTab] = useState("abertos");
  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["mdf-documentos", empresa?.id],
    queryFn: async (): Promise<MdfDoc[]> => {
      const { data, error } = await supabase.from("mdf_documentos" as any)
        .select("id,numero,serie,status,qtd_cte,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz,uf_carregamento,uf_descarregamento,valor_total_carga,peso_total,veiculo_tracao_id,motorista_id,xml_assinado,xml_protocolo,responsavel_emissao,responsavel_encerramento,data_encerramento")
        .eq("empresa_id", empresa!.id)
        .eq("ambiente", MDFE_AMBIENTE)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MdfDoc[];
    },
  });

  const statusCounts = {
    autorizado: (docs || []).filter(d => d.status === "autorizado").length,
    rejeitado: (docs || []).filter(d => d.status === "rejeitado").length,
    cancelado: (docs || []).filter(d => d.status === "cancelado").length,
    encerrado: (docs || []).filter(d => d.status === "encerrado").length,
    rascunho: (docs || []).filter(d => d.status === "rascunho").length,
  };
  const docsFiltrados = (docs || []).filter(d => {
    if (filtroStatus === "autorizados") {
      if (d.status !== "autorizado" && d.status !== "encerrado") return false;
      if (mdfSitTab === "abertos" && d.status !== "autorizado") return false;
      if (mdfSitTab === "encerrados" && d.status !== "encerrado") return false;
    } else if (d.status !== filtroStatus) return false;
    if (periodoIni && d.created_at < periodoIni) return false;
    if (periodoFim && d.created_at > periodoFim + "T23:59:59") return false;
    return true;
  });

  const statusColor = (s: string) => {
    if (s === "autorizado") return "default";
    if (s === "encerrado") return "secondary";
    if (s === "cancelado" || s === "rejeitado") return "destructive";
    return "outline";
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Fiscal"
        title="MDF-e"
        description="Manifesto Eletrônico de Documentos Fiscais (modelo 58). Emissão, vinculação de CT-e e encerramento."
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo MDF-e
            </Button>
          </div>
        }
      />

      <Tabs value={filtroStatus} onValueChange={setFiltroStatus}>
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="rascunho" className="text-xs">Aguardando envio ({statusCounts.rascunho})</TabsTrigger>
            <TabsTrigger value="rejeitado" className="text-xs">Rejeitados ({statusCounts.rejeitado})</TabsTrigger>
            <TabsTrigger value="cancelado" className="text-xs">Cancelados ({statusCounts.cancelado})</TabsTrigger>
            <TabsTrigger value="autorizados" className="text-xs">Autorizados ({statusCounts.autorizado + statusCounts.encerrado})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <DateInput value={periodoIni} onChange={setPeriodoIni} className="w-[130px] h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <DateInput value={periodoFim} onChange={setPeriodoFim} className="w-[130px] h-8" />
            </div>
          </div>
        </div>
      </Tabs>

      {filtroStatus === "autorizados" && (
        <Tabs value={mdfSitTab} onValueChange={setMdfSitTab}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="abertos" className="text-xs">Abertos ({statusCounts.autorizado})</TabsTrigger>
            <TabsTrigger value="encerrados" className="text-xs">Encerrados ({statusCounts.encerrado})</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : !docsFiltrados.length ? (
        <EmptyState
          icon={RoadIcon}
          title="Nenhum MDF-e"
          description="Manifestos emitidos aparecerão aqui. Clique em 'Novo MDF-e' para criar um manifesto vinculando CT-e do período."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Série</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CT-e</TableHead>
                <TableHead>UF Carreg.</TableHead>
                <TableHead>Valor Carga</TableHead>
                <TableHead>Peso (kg)</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docsFiltrados.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono">{d.numero ?? "—"}</TableCell>
                  <TableCell>{d.serie ?? "1"}</TableCell>
                  <TableCell><Badge variant={statusColor(d.status)}>{d.status}</Badge></TableCell>
                  <TableCell>{d.qtd_cte ?? 0}</TableCell>
                  <TableCell>{d.uf_carregamento ?? "—"}</TableCell>
                  <TableCell>{d.valor_total_carga ? brl(d.valor_total_carga) : "—"}</TableCell>
                  <TableCell>{d.peso_total ? num(d.peso_total) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[180px]">{d.chave_acesso ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {d.status === "autorizado" && (
                        <>
                          <Button variant="ghost" size="sm" title="Visualizar" onClick={() => setMdfVer(d)}>
                            <Eye className="h-4 w-4 text-sky-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Baixar XML" onClick={() => baixarXmlMdf(d)}>
                            <Download className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Baixar PDF (DAMDFE)" onClick={() => baixarPdfMdf(d)}>
                            <FileDown className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Consultar SEFAZ" disabled={consultandoChave === d.chave_acesso} onClick={() => consultarMdf(d)}>
                            <Search className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setMdfEncerrar(d); setOpenEncerrar(true); }} title="Encerrar">
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setMdfCancelar(d); setJustificativa("ERRO DE EMISSAO DO MDF-E"); setOpenCancelar(true); }} title="Cancelar">
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {(d.status === "encerrado" || d.status === "cancelado") && (
                        <>
                          <Button variant="ghost" size="sm" title="Visualizar" onClick={() => setMdfVer(d)}>
                            <Eye className="h-4 w-4 text-sky-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Baixar XML" onClick={() => baixarXmlMdf(d)}>
                            <Download className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Baixar PDF (DAMDFE)" onClick={() => baixarPdfMdf(d)}>
                            <FileDown className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Consultar SEFAZ" disabled={consultandoChave === d.chave_acesso} onClick={() => consultarMdf(d)}>
                            <Search className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {d.status === "rejeitado" && (
                        <>
                          <Button variant="ghost" size="sm" title="Baixar XML" onClick={() => baixarXmlMdf(d)}>
                            <Download className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title={d.motivo_rejeicao ? `Rejeitado: ${d.motivo_rejeicao} — clique para tentar novamente` : "Tentar novamente"} onClick={() => reemitir(d)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Excluir rejeitado" onClick={async () => { if (!window.confirm(`Excluir MDF-e rejeitado #${d.numero || ""}?`)) return; const { error } = await supabase.from("mdf_documentos" as any).delete().eq("id", d.id); if (error) toast.error(error.message); else { toast.success("Rejeitado excluído"); qc.invalidateQueries({ queryKey: ["mdf-documentos"] }); } }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {d.status === "rascunho" && (
                        <>
                          <Button variant="ghost" size="sm" title="Continuar editando" onClick={() => continuarRascunho(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Excluir rascunho" onClick={async () => { if (!window.confirm("Excluir este rascunho?")) return; const { error } = await supabase.from("mdf_documentos" as any).delete().eq("id", d.id); if (error) toast.error(error.message); else { toast.success("Rascunho excluído"); qc.invalidateQueries({ queryKey: ["mdf-documentos"] }); } }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {mdfEncerrar && (
        <Dialog open={openEncerrar} onOpenChange={setOpenEncerrar}>
          <DialogContent>
            <DialogHeader><DialogTitle>Encerrar MDF-e #{mdfEncerrar.numero}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Confirma o encerramento do manifesto? Esta ação é irreversível.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenEncerrar(false)}>Cancelar</Button>
              <EncerrarMdfButton mdf={mdfEncerrar} empresaId={empresa!.id} cnpj={String((empresa as any)?.cnpj || "")} onSuccess={() => { setOpenEncerrar(false); setMdfEncerrar(null); qc.invalidateQueries({ queryKey: ["mdf-documentos"] }); }} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mdfCancelar && (
        <Dialog open={openCancelar} onOpenChange={setOpenCancelar}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cancelar MDF-e #{mdfCancelar.numero}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div>
                <Label>Motivo (obrigatório)</Label>
                <Select value={justificativa} onValueChange={setJustificativa}>
                  <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ERRO DE EMISSAO DO MDF-E">ERRO DE EMISSÃO DO MDF-E</SelectItem>
                    <SelectItem value="CLIENTE CANCELOU O SERVICO">CLIENTE CANCELOU O SERVIÇO</SelectItem>
                    <SelectItem value="FALTA DE ENERGIA/IMPOSSIBILIDADE TECNICA">FALTA DE ENERGIA/IMPOSSIBILIDADE TÉCNICA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpenCancelar(false); setJustificativa(""); }}>Voltar</Button>
              <Button variant="destructive" disabled={!justificativa.trim()} onClick={async () => {
                if (!empresa || !mdfCancelar.chave_acesso) return;
                try {
                  const res = await cancelarMdfFn({ data: { empresaId: empresa.id, chave: mdfCancelar.chave_acesso, justificativa: justificativa.trim(), cnpj: String((empresa as any)?.cnpj || ""), uf: mdfCancelar.uf_carregamento || "", protocolo: mdfCancelar.protocolo_sefaz || "" } });
                  if (res.sucesso) toast.success("MDF-e cancelado com sucesso!");
                  else toast.error(`Erro: ${res.xMotivo}`);
                  setOpenCancelar(false); setMdfCancelar(null); setJustificativa("");
                  qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
                } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao cancelar"); }
              }}>Confirmar Cancelamento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mdfVer && (
        <DialogVerMdf
          d={mdfVer}
          xml={xmlDeMdf(mdfVer)}
          onClose={() => setMdfVer(null)}
          onBaixarXml={() => baixarXmlMdf(mdfVer)}
          onBaixarPdf={() => baixarPdfMdf(mdfVer)}
        />
      )}

      <DialogNovoMdf open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setMdfPrefill(null); setMdfDraft(null); setSemRascunho(false); } }} empresaId={empresa?.id || ""} empresa={empresa} chavesIniciais={mdfPrefill || undefined} rascunhoInicial={mdfDraft} permiteRascunho={!semRascunho} />
    </div>
  );
}

// Visualização em tela cheia espelhando a tela de emissão (somente leitura).
function DialogVerMdf({ d, xml, onClose, onBaixarXml, onBaixarPdf }: { d: MdfDoc; xml: string; onClose: () => void; onBaixarXml: () => void; onBaixarPdf: () => void }) {
  const dd = useMemo(() => damdfeDataDoXml(xml, { protocolo: d.protocolo_sefaz || undefined, numero: d.numero, serie: d.serie }), [xml, d]);
  const infos = useMemo(() => {
    try {
      const p = JSON.parse(String((d as any).xml_assinado || "{}"));
      return { observacoes: String(p.observacoes || ""), infoFisco: String(p.infoFisco || "") };
    } catch { return { observacoes: "", infoFisco: "" }; }
  }, [d]);
  const transbs = useMemo(() => [...xml.matchAll(/<chMDFe>(\d{44})<\/chMDFe>/g)].map(m => m[1]), [xml]);
  const { data: ctesVer } = useQuery({
    enabled: dd.chavesCte.length > 0,
    queryKey: ["mdf-ver-ctes", d.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cte_documentos" as any)
        .select("chave_acesso,numero,serie,valor_servico,peso_carga,data_autorizacao")
        .in("chave_acesso", dd.chavesCte);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ chave_acesso: string | null; numero: string | null; serie: string | null; valor_servico: number | null; peso_carga: number | null; data_autorizacao: string | null }>;
    },
  });
  const ctePorChave = useMemo(() => {
    const m = new Map<string, { chave_acesso: string | null; numero: string | null; serie: string | null; valor_servico: number | null; peso_carga: number | null; data_autorizacao: string | null }>();
    for (const c of (ctesVer || [])) if (c.chave_acesso) m.set(c.chave_acesso, c);
    return m;
  }, [ctesVer]);
  const dh = String(dd.dhEmi || "");
  const dataEmi = dh.slice(8, 10) + "/" + dh.slice(5, 7) + "/" + dh.slice(0, 4);
  const horaEmi = dh.slice(11, 16);
  const tpRodLbl: Record<string, string> = { "01": "Truck", "02": "Toco", "03": "Cavalo Mecânico", "04": "VAN", "05": "Utilitário", "06": "Outros" };
  const tpCarLbl: Record<string, string> = { "00": "Não aplicável", "01": "Aberta", "02": "Fechada/Baú", "03": "Granelera", "04": "Porta Container", "05": "Sider" };
  const R = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div><Label className="text-xs">{label}</Label><Input className={"h-6 text-[11px] bg-transparent" + (mono ? " font-mono" : "")} readOnly value={value || "—"} /></div>
  );
  const percursoCompleto = [dd.ufIni, ...dd.percurso, dd.ufFim].filter(Boolean);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            MDF-e #{d.numero ?? "—"} <Badge variant={d.status === "autorizado" ? "default" : "secondary"} className="ml-1">{d.status}</Badge>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800 ml-2">Homologação (testes)</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border rounded-md p-2 space-y-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <R label="Nome da Empresa" value={dd.emitNome} />
                  <R label="Veículo" mono value={dd.placa ? `${dd.placa}${dd.renavam ? ` • RENAVAM ${dd.renavam}` : ""}` : ""} />
                  <div><Label className="text-xs">Motorista</Label><p className="text-xs truncate">{dd.condutorNome || "—"} <span className="text-muted-foreground">({dd.condutorCpf ? dd.condutorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "s/CPF"})</span></p></div>
                </div>
                <div className="space-y-1">
                  <R label="Tipo MDF-e" value={dd.tpEmit === "3" ? "Globalizado" : "Normal"} />
                  <R label="Reboque(s)" mono value={dd.reboques.map(r => r.placa).filter(Boolean).join(", ")} />
                  <div><Label className="text-xs">CIOT</Label><p className="font-mono text-xs">{dd.ciot || "—"}</p></div>
                </div>
                <div className="space-y-1">
                  <div><label className="flex items-center gap-1 text-[11px] font-medium"><input type="checkbox" checked={transbs.length > 0} readOnly className="h-3 w-3" /> Manifesto Transbordo</label></div>
                  {[0, 1, 2].map(i => (<R key={i} label={`${i + 1}º Transbordo`} mono value={transbs[i] || ""} />))}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_88px] gap-2">
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Início</Label><Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={dd.munCarrega} /></div>
                <div><Label className="text-xs whitespace-nowrap">UF</Label><Input className="h-6 px-1 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={dd.ufIni} /></div>
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Encerramento</Label><Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={dd.munDescarrega} /></div>
                <div><Label className="text-xs whitespace-nowrap">UF</Label><Input className="h-6 px-1 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={dd.ufFim} /></div>
              </div>
            </div>
            <div className="border rounded-md p-2 space-y-1">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                <R label="Nº Manifesto" mono value={d.numero || ""} />
                <R label="Série" mono value={d.serie || ""} />
                <R label="Data Emissão" value={dataEmi} />
                <R label="Hora Emissão" value={horaEmi} />
                <R label="Protocolo" mono value={d.protocolo_sefaz || ""} />
                <R label="Placa" mono value={dd.placa || ""} />
                <R label="Motorista" value={dd.condutorNome || ""} />
                <R label="Responsável Emissão" value={(d as any).responsavel_emissao || ""} />
                <R label="Data de Encerramento" value={(d as any).data_encerramento ? new Date(String((d as any).data_encerramento)).toLocaleDateString("pt-BR") : ""} />
                <R label="Responsável Encerramento" value={(d as any).responsavel_encerramento || ""} />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="space-y-1">
                  <R label="Seguradora RC-V" value={dd.xSeg} />
                  <R label="Averbação RC-V" mono value={dd.nAver} />
                  <R label="Apólice" mono value={dd.nApol} />
                </div>
                <div className="space-y-1">
                  <R label="Chave de acesso" mono value={dd.chave} />
                  <R label="CNPJ ANTT - AUTORIZADO" mono value={dd.emitCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")} />
                  <R label="Local Emissão" value={[dd.emitMun, dd.emitUF].filter(Boolean).join("/")} />
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-md p-2">
            <div className="flex items-center justify-end gap-2 mb-1">
              <Label className="text-xs mr-auto">Conhecimentos ({dd.chavesCte.length} vinculados)</Label>
              <span className="text-xs">Valor total: <strong className="font-mono">{d.valor_total_carga ? brl(d.valor_total_carga) : "—"}</strong></span>
              <span className="text-xs">Peso total: <strong className="font-mono">{d.peso_total ? `${num(d.peso_total)} kg` : "—"}</strong></span>
            </div>
            <div className="border rounded-md max-h-[260px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted"><TableRow>
                  <TableHead>Emissão</TableHead><TableHead>CTRC</TableHead><TableHead>Série</TableHead><TableHead>Chave</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Peso</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dd.chavesCte.map(ch => {
                    const c = ctePorChave.get(ch);
                    return (
                      <TableRow key={ch}>
                        <TableCell className="text-xs whitespace-nowrap">{c?.data_autorizacao ? new Date(String(c.data_autorizacao)).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c?.numero ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c?.serie ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{ch}</TableCell>
                        <TableCell className="text-right text-xs">{c?.valor_servico ? brl(c.valor_servico) : "—"}</TableCell>
                        <TableCell className="text-right text-xs">{c?.peso_carga ? `${num(c.peso_carga)} kg` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="border rounded-md p-2 md:col-span-1">
              <Label className="text-xs">Percurso ({percursoCompleto.length} UF(s))</Label>
              <div className="border rounded mt-2 max-h-[80px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0"><tr><th className="text-left px-1 py-0.5 font-semibold">#</th><th className="text-left px-1 py-0.5 font-semibold">UF</th></tr></thead>
                  <tbody>
                    {percursoCompleto.map((uf, idx) => (
                      <tr key={`${idx}-${uf}`}><td className="px-1 py-0.5 font-mono">{idx + 1}º</td><td className="px-1 py-0.5 font-mono font-bold">{uf}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-2 md:col-span-3">
              <div className="border rounded-md p-2 grid grid-cols-2 md:grid-cols-4 gap-1">
                <R label="Qtd CT-e" mono value={dd.qCte} />
                <R label="Valor carga (R$)" mono value={dd.vCarga} />
                <R label="Peso (kg)" mono value={dd.qCarga} />
                <R label="Produto predominante" value={`${dd.tpCarga} ${dd.xProd}`.trim()} />
              </div>
              <div className="border rounded-md p-2 grid grid-cols-2 gap-1">
                <R label="Contratante" value={dd.contratanteNome} />
                <R label="CNPJ/CPF contratante" mono value={dd.contratanteDoc} />
              </div>
              <div className="border rounded-md p-2 space-y-1">
                <div><Label className="text-xs">Observação</Label><Textarea value={infos.observacoes} readOnly rows={2} className="text-xs" /></div>
                <div><Label className="text-xs">Informações Adicionais Fisco</Label><Textarea value={infos.infoFisco} readOnly rows={2} className="text-xs" /></div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onBaixarXml}><Download className="mr-1 h-3.5 w-3.5" /> Baixar XML</Button>
          <Button variant="outline" onClick={onBaixarPdf}><FileDown className="mr-1 h-3.5 w-3.5" /> Baixar PDF</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function EncerrarMdfButton({ mdf, empresaId, cnpj, onSuccess }: { mdf: MdfDoc; empresaId: string; cnpj: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [openSel, setOpenSel] = useState(false);
  const [cMunSel, setCMunSel] = useState("");
  // Municípios de descarga distintos do XML (cMun + nome).
  const munOpts = useMemo(() => {
    try {
      const raw = String((mdf as any).xml_assinado || "");
      let xml = raw;
      try { const p = JSON.parse(raw); if (p?.xml) xml = String(p.xml); } catch {}
      const out: Array<{ cMun: string; xMun: string }> = [];
      for (const m of xml.matchAll(/<cMunDescarga>(\d{7})<\/cMunDescarga>\s*<xMunDescarga>([^<]*)<\/xMunDescarga>/g)) {
        if (!out.some(o => o.cMun === m[1])) out.push({ cMun: m[1], xMun: (m[2] || "").trim() });
      }
      if (!out.length) for (const m of xml.matchAll(/<cMunDescarga>(\d{7})<\/cMunDescarga>/g)) {
        if (!out.some(o => o.cMun === m[1])) out.push({ cMun: m[1], xMun: "" });
      }
      return out;
    } catch { return [] as Array<{ cMun: string; xMun: string }>; }
  }, [mdf]);
  const handleEncerrar = async (cMunOverride?: string) => {
    if (!mdf.chave_acesso) return;
    const cMun = cMunOverride || munOpts[0]?.cMun || "";
    if (!cMun) { toast.error("Município de encerramento não encontrado no MDF-e"); return; }
    setLoading(true);
    try {
      let nm = "";
      try {
        const { data } = await supabase.auth.getUser();
        const usr = (data as any)?.user;
        nm = (usr?.user_metadata as any)?.nome || "";
        if (!nm && empresaId) {
          const { data: eu } = await supabase.from("empresa_users" as any).select("nome").eq("empresa_id", empresaId).eq("user_id", usr.id).maybeSingle();
          nm = (eu as any)?.nome || "";
        }
      } catch {}
      const res = await encerrarMdfFn({ data: { empresaId, chave: mdf.chave_acesso, cnpj, uf: mdf.uf_carregamento || "", protocolo: mdf.protocolo_sefaz || "", cMun, responsavel: nm } });
      if (res.sucesso) { toast.success("MDF-e encerrado!"); onSuccess(); }
      else toast.error(`Erro: ${res.xMotivo}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao encerrar"); }
    setLoading(false);
  };
  return (<>
    <Button
      onClick={() => {
        if (munOpts.length > 1) { setCMunSel(munOpts[munOpts.length - 1].cMun); setOpenSel(true); }
        else handleEncerrar();
      }}
      disabled={loading}
    >{loading ? "Encerrando..." : "Confirmar Encerramento"}</Button>
    {openSel && (
      <Dialog open={openSel} onOpenChange={setOpenSel}>
        <DialogContent className="inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] max-w-[calc(100vw-2rem)] h-auto max-h-[90vh] p-4 gap-3">
          <DialogHeader><DialogTitle className="text-base">Onde encerrar?</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">O manifesto tem {munOpts.length} municípios de descarga. Escolha o local de encerramento.</p>
          <Select value={cMunSel} onValueChange={setCMunSel}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{munOpts.map(o => (<SelectItem key={o.cMun} value={o.cMun} className="text-xs">{o.xMun || o.cMun}</SelectItem>))}</SelectContent>
          </Select>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setOpenSel(false)}>Voltar</Button>
            <Button size="sm" onClick={() => { setOpenSel(false); handleEncerrar(cMunSel); }} disabled={!cMunSel || loading}>{loading ? "Encerrando..." : "Confirmar Encerramento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
  </>);
}

function DialogNovoMdf({ open, onOpenChange, empresaId, empresa, chavesIniciais, rascunhoInicial, permiteRascunho = true }: { open: boolean; onOpenChange: (v: boolean) => void; empresaId: string; empresa?: any; chavesIniciais?: string[]; permiteRascunho?: boolean; rascunhoInicial?: { id?: string; chaves: string[]; percursoUFs: string[]; observacoes: string; infoFisco: string; tipoMdf: "Normal" | "Globalizado"; isTransbordo: boolean; transb1: string; transb2: string; transb3: string } | null }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [ufCarregamento, setUfCarregamento] = useState("");
  const [ufDescarregamento, setUfDescarregamento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: veiculos } = useQuery({
    enabled: !!empresaId && open,
    queryKey: ["veiculos-mdf", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos" as any)
        .select("id,placa,marca_modelo,tipo,renavam,rntrc,proprietario,quantidade_eixos")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .order("placa");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; placa: string; marca_modelo: string; tipo: string; renavam: string; rntrc: string | null; proprietario: string | null; quantidade_eixos: number | null }>;
    },
  });

  const { data: motoristas } = useQuery({
    enabled: !!empresaId && open,
    queryKey: ["motoristas-mdf", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaboradores" as any)
        .select("id,nome,cpf,cargo")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .ilike("cargo", "%Motorist%")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; nome: string; cpf: string; cargo: string }>;
    },
  });

  const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  const { data: ctesDisponiveis, error: ctesErro } = useQuery({
    enabled: !!empresaId && open,
    queryKey: ["ctes-para-mdf", empresaId],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any)
        .select("id,numero,serie,chave_acesso,status,valor_servico,peso_carga,xml_assinado,data_autorizacao")
        .eq("empresa_id", empresaId)
        .eq("status", "autorizado")
        .eq("ambiente", MDFE_AMBIENTE)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const [ctesSelecionadas, setCtesSelecionadas] = useState<Set<string>>(new Set());
  // CT-es já vinculados a MDF-e ativo: não podem entrar em outro manifesto.
  const { data: mdfChaves } = useQuery({
    enabled: !!empresaId && open,
    queryKey: ["mdf-chaves-cte", empresaId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("mdf_documentos" as any)
        .select("xml_assinado").eq("empresa_id", empresaId)
        .in("status", ["autorizado", "encerrado"]).limit(200).abortSignal(signal);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data as any[]) || []) {
        const x = String((r as any)?.xml_assinado || "");
        for (const m of x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g)) set.add(m[1]);
      }
      return set;
    },
  });
  const cteVinculado = (chave?: string | null) => !!chave && !!mdfChaves?.has(chave);
  const [percursoUFs, setPercursoUFs] = useState<string[]>([]);
  const [tracaoSel, setTracaoSel] = useState("");
  const todasTracoes = useMemo(() => { const out: string[] = []; for (const c of (ctesDisponiveis || [])) { try { const p = JSON.parse((c as any).xml_assinado || "{}"); const pl = String(p.form?.placaVeiculo || "").toUpperCase(); if (pl && !out.includes(pl)) out.push(pl); } catch {} } return out.sort(); }, [ctesDisponiveis]);
  const placasVeiculoOpts = useMemo(() => { const out: string[] = []; const REB = ["carreta", "bitrem"]; for (const v of (veiculos || [])) { if (REB.includes(String(v.tipo || "").toLowerCase().trim())) continue; const p = String(v.placa || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } for (const p of todasTracoes) if (!out.includes(p)) out.push(p); return out.sort(); }, [veiculos, todasTracoes]);
  const ctesOcultosMdf = useMemo(() => (ctesDisponiveis || []).filter(c => cteVinculado(c.chave_acesso)).length, [ctesDisponiveis, mdfChaves]);
  const [infoFisco, setInfoFisco] = useState("");
  const [respNome, setRespNome] = useState("");
  const [tipoMdf, setTipoMdf] = useState<"Normal" | "Globalizado">("Normal");
  const [serieMdf] = useState("000");
  const [isTransbordo, setIsTransbordo] = useState(false);
  // Manifestos encerrados da tração selecionada (só truck/cavalo: tracaoSel
  // nunca é carreta) para os dropdowns de transbordo.
  const { data: mdfsEncerrados } = useQuery({
    enabled: !!empresaId && open && isTransbordo,
    queryKey: ["mdf-encerrados", empresaId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("mdf_documentos" as any)
        .select("chave_acesso,numero,veiculo_tracao_id,motorista_id,xml_assinado").eq("empresa_id", empresaId)
        .eq("status", "encerrado").order("created_at", { ascending: false }).limit(100).abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ chave_acesso: string | null; numero: string | null; veiculo_tracao_id: string | null; motorista_id: string | null; xml_assinado: string | null }>;
      const motIds = [...new Set(rows.map(r => String(r.motorista_id || "")).filter(Boolean))];
      let motMap = new Map<string, string>();
      if (motIds.length) {
        try {
          const { data: mots } = await supabase.from("colaboradores" as any).select("id,nome").in("id", motIds).abortSignal(signal);
          motMap = new Map(((mots as any[]) || []).map(m => [String((m as any).id), String((m as any).nome || "")]));
        } catch {}
      }
      return rows.map(r => ({ ...r, motoristaNome: motMap.get(String(r.motorista_id || "")) || "" }));
    },
  });
  // Resumo do manifesto origem p/ o dropdown (nº, emissão, carga, descarga, veículo).
  const infoTransb = (xmlRaw: string | null) => {
    let xml = String(xmlRaw || "");
    try { const p = JSON.parse(xml); if (p?.xml) xml = String(p.xml); } catch {}
    const dh = xml.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1] || "";
    const data = /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10).split("-").reverse().join("/") : "";
    const munCar = xml.match(/<xMunCarrega>([^<]*)<\/xMunCarrega>/)?.[1]?.trim() || "";
    const ufIni = xml.match(/<UFIni>([^<]*)<\/UFIni>/)?.[1]?.trim() || "";
    const descs = [...xml.matchAll(/<xMunDescarga>([^<]*)<\/xMunDescarga>/g)].map(m => m[1].trim()).filter(Boolean);
    const ufFim = xml.match(/<UFFim>([^<]*)<\/UFFim>/)?.[1]?.trim() || "";
    const rebs = [...xml.matchAll(/<veicReboque>[\s\S]*?<placa>([^<]+)<\/placa>/g)].map(m => m[1].trim().toUpperCase()).filter(Boolean);
    return { data, munCar, ufIni, munDesc: descs.length ? descs[descs.length - 1] : "", ufFim, rebs: [...new Set(rebs)] };
  };
  const transbOpts = useMemo(() => {
    const tv = (veiculos || []).find(v => !!tracaoSel && String(v.placa || "").toUpperCase() === tracaoSel);
    if (!tv) return [];
    return (mdfsEncerrados || [])
      .filter(m => m.veiculo_tracao_id && m.veiculo_tracao_id === (tv as any).id && m.chave_acesso)
      .map(m => {
        const t = infoTransb((m as any).xml_assinado);
        const v = (veiculos || []).find(x => String((x as any).id) === String((m as any).veiculo_tracao_id));
        const veic = v ? String((v as any).placa || "").toUpperCase() : "";
        const mot = String((m as any).motoristaNome || "").toUpperCase();
        const reb = t.rebs.length ? " + " + t.rebs.join(" + ") : "";
        const label = `#${m.numero ?? "?"}${t.data ? " · " + t.data : ""}${t.munCar ? ` · ${t.munCar}${t.ufIni ? "/" + t.ufIni : ""}` : ""}${t.munDesc ? ` → ${t.munDesc}${t.ufFim ? "/" + t.ufFim : ""}` : ""}${veic ? " · " + veic + reb : ""}${mot ? " · " + mot : ""}`;
        return { chave: m.chave_acesso as string, label };
      });
  }, [mdfsEncerrados, veiculos, tracaoSel]);
  const TransbSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="min-w-0"><Label className="text-xs whitespace-nowrap">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={!isTransbordo}>
        <SelectTrigger className="h-6 text-[11px] font-mono"><SelectValue placeholder={transbOpts.length ? "Selecione..." : "Sem encerrados p/ tração"} /></SelectTrigger>
        <SelectContent>{transbOpts.map(o => (<SelectItem key={o.chave} value={o.chave} className="font-mono text-[11px]" title={o.chave}>{o.label}</SelectItem>))}</SelectContent>
      </Select>
    </div>
  );
  const [transb1, setTransb1] = useState("");
  const [transb2, setTransb2] = useState("");
  const [transb3, setTransb3] = useState("");
  // Chaves dos manifestos de transbordo selecionados: seus CT-es são a
  // única origem válida da nova carga (exceção legítima ao bloqueio).
  // 647: infMDFeTransp (referenciar outro MDF-e) só vale p/ modal aquaviário.
  // No rodoviário, transbordo = MDF-e NORMAL com os CT-es do manifesto origem
  // (a seleção por manifesto origem segue como localizador).
  const transbSel = useMemo(() => [...new Set([transb1, transb2, transb3].map(s => String(s || "").trim()).filter(k => /^\d{44}$/.test(k)))], [transb1, transb2, transb3]);
  const { data: transbCtes } = useQuery({
    enabled: !!empresaId && open && transbSel.length > 0,
    queryKey: ["mdf-transbordo-ctes", empresaId, ...[...transbSel].sort()],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("mdf_documentos" as any)
        .select("xml_assinado").eq("empresa_id", empresaId).in("chave_acesso", transbSel).abortSignal(signal);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data as any[]) || []) {
        const x = String((r as any)?.xml_assinado || "");
        for (const m of x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g)) set.add(m[1]);
      }
      return set;
    },
  });
  const transbAtivo = isTransbordo ? transbCtes : null;
  // Bloqueado = em MDF-e ativo, exceto CT-e vindo do transbordo selecionado.
  const cteBloqueado = (chave?: string | null) => !!chave && cteVinculado(chave) && !(transbAtivo?.has(chave));
  // Reenvio de transbordo: marca automaticamente os CT-es do manifesto origem
  // (uma vez por seleção; desmarcar manualmente é respeitado).
  const transbAutoRef = useRef("");
  useEffect(() => {
    if (!open || !isTransbordo || !transbAtivo || !transbAtivo.size) return;
    if (ctesSelecionadas.size) return;
    const k = [...transbSel].sort().join(",");
    if (transbAutoRef.current === k) return;
    transbAutoRef.current = k;
    setCtesSelecionadas(new Set([...transbAtivo]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isTransbordo, transbAtivo]);
  // Relação: com transbordo selecionado, SÓ os CT-es dele; senão, os da
  // tração exceto vinculados.
  const ctesDaTracao = useMemo(() => (ctesDisponiveis || []).filter(c => {
    if (transbAtivo && transbAtivo.size > 0) return !!c.chave_acesso && transbAtivo.has(c.chave_acesso);
    if (!tracaoSel) return false;
    if (cteBloqueado(c.chave_acesso)) return false;
    try { const p = JSON.parse((c as any).xml_assinado || "{}"); return String(p.form?.placaVeiculo || "").toUpperCase() === tracaoSel; } catch { return false; }
  }), [ctesDisponiveis, tracaoSel, mdfChaves, transbAtivo]);
  const [percursoSelIdx, setPercursoSelIdx] = useState<number | null>(null);
  // Validação G060/SEFAZ 663: vizinhos ou iguais = percurso vazio; senão, cadeia completa com divisas em ordem
  const errosPercurso = useMemo(() => {
    const errs: string[] = [];
    const ini = (ufCarregamento || "").toUpperCase();
    const fim = (ufDescarregamento || "").toUpperCase();
    if (!ini || !fim) return errs;
    const d = distUF(ini, fim);
    if (d <= 1) {
      if (percursoUFs.length) errs.push(`Origem e destino ${d === 0 ? "são o mesmo estado" : "fazem divisa"} — percurso deve ficar vazio (SEFAZ 663).`);
      return errs;
    }
    if (!percursoUFs.length) { errs.push(`Informe as UFs de passagem entre ${ini} e ${fim} (SEFAZ 663).`); return errs; }
    const rota = [ini, ...percursoUFs.map(u => String(u || "").toUpperCase()), fim];
    for (let i = 0; i < rota.length - 1; i++) {
      const a = rota[i], b = rota[i + 1];
      if (a !== b && !(UF_VIZINHOS[a] || []).includes(b)) errs.push(`Trecho ${a} → ${b} sem divisa — ordem incorreta (SEFAZ 663).`);
    }
    percursoUFs.forEach(u => {
      const uu = String(u || "").toUpperCase();
      if (uu === ini || uu === fim) errs.push(`Não repita ${uu} (início/fim) no percurso.`);
      else if (distUF(ini, uu) + distUF(uu, fim) > d + 1) errs.push(`${uu} está fora do trajeto ${ini} → ${fim}.`);
    });
    return [...new Set(errs)];
  }, [ufCarregamento, ufDescarregamento, percursoUFs]);
  // MDF-e travado em homologação (decisão 23/09/2026) — XML e transmissão sempre tpAmb=2
  const ambienteMdf = MDFE_AMBIENTE;
  useEffect(() => { if (!open) return; (async () => { try { const { data } = await supabase.auth.getUser(); const usr = (data as any)?.user; if (!usr) return; let nm = (usr?.user_metadata as any)?.nome || ""; if (!nm && empresaId) { const { data: eu } = await supabase.from("empresa_users" as any).select("nome").eq("empresa_id", empresaId).eq("user_id", usr.id).maybeSingle(); nm = (eu as any)?.nome || ""; } setRespNome(nm || ""); } catch {} })(); }, [open, empresaId]);
  useEffect(() => { if (open && chavesIniciais?.length) { setCtesSelecionadas(new Set(chavesIniciais)); setPercursoUFs([]); } }, [open]);
  // Ao fechar (ESC/X/voltar), limpa tudo da memória para o próximo manifesto.
  useEffect(() => {
    if (open) return;
    setCtesSelecionadas(new Set()); setTracaoSel(""); setUfCarregamento(""); setUfDescarregamento("");
    setCidadeFimSel(""); setPercursoUFs([]); setObservacoes(""); setInfoFisco(""); setIsTransbordo(false);
    setTransb1(""); setTransb2(""); setTransb3(""); setTipoMdf("Normal"); setPercursoSelIdx(null);
    setMotoristaId(""); setVeicTracId("");
    transbAutoRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open || !rascunhoInicial) return;
    setCtesSelecionadas(new Set(rascunhoInicial.chaves || []));
    setPercursoUFs(rascunhoInicial.percursoUFs || []);
    setObservacoes(rascunhoInicial.observacoes || "");
    setInfoFisco(rascunhoInicial.infoFisco || "");
    setTipoMdf(rascunhoInicial.tipoMdf === "Globalizado" ? "Globalizado" : "Normal");
    setIsTransbordo(!!rascunhoInicial.isTransbordo);
    setTransb1(rascunhoInicial.transb1 || ""); setTransb2(rascunhoInicial.transb2 || ""); setTransb3(rascunhoInicial.transb3 || "");
    setPercursoSelIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Percurso: só UFs entre início e fim, adicionadas pelo usuário — CT-e nunca entra na lista
  useEffect(() => {
    if (!open || tracaoSel || !ctesSelecionadas.size) return;
    const first = (ctesDisponiveis || []).find(c => ctesSelecionadas.has(c.chave_acesso || ""));
    if (!first) return;
    try { const p = JSON.parse((first as any).xml_assinado || "{}"); const pl = String(p.form?.placaVeiculo || "").toUpperCase(); if (pl) setTracaoSel(pl); } catch {}
  }, [open, ctesDisponiveis, ctesSelecionadas, tracaoSel]);
  // Helpers CT-e (precisam vir antes das cidades derivadas)
  const fmtData = (iso: any) => { try { const d = new Date(String(iso)); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString("pt-BR"); } catch { return "—"; } };
  const nfsDe = (c: CteDoc): string[] => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); const xml = p.xml || ""; return [...xml.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m => m[1].slice(25, 34).replace(/^0+/, "") || "0"); } catch { return []; } };
  const formDe = (c: CteDoc): Record<string, any> => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {}; } };
  const pesoDe = (c: CteDoc): number => c.peso_carga || parseFloat(formDe(c).peso as any) || 0;
  const [sortCte, setSortCte] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const valCte = (c: CteDoc, key: string): string | number => {
    const f = formDe(c);
    switch (key) {
      case "emissao": return c.data_autorizacao || "";
      case "ctrc": return Number(c.numero) || 0;
      case "serie": return String((c as any).serie || "1");
      case "placa": return String(f.placaVeiculo || "").toUpperCase();
      case "reboques": return [f.placaReboque, f.semiReboque1, f.semiReboque2].map(x => String(x || "").toUpperCase()).filter(Boolean).join(", ");
      case "coleta": return String(f.xMunIni || "");
      case "ufIni": return String(f.ufIni || "");
      case "entrega": return String(f.xMunFim || "");
      case "ufFim": return String(f.ufFim || "");
      case "nfs": return nfsDe(c).join(", ");
      case "valor": return c.valor_servico || 0;
      case "peso": return pesoDe(c);
      default: return "";
    }
  };
  const ctesOrdenados = useMemo(() => {
    const arr = [...ctesDaTracao];
    if (!sortCte) return arr;
    arr.sort((a, b) => {
      const va = valCte(a, sortCte.key); const vb = valCte(b, sortCte.key);
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return r * sortCte.dir;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctesDaTracao, sortCte]);
  const thCte = (label: string, key: string, right?: boolean) => (
    <TableHead key={key} onClick={() => setSortCte(prev => (!prev || prev.key !== key ? { key, dir: 1 } : prev.dir === 1 ? { key, dir: -1 } : null))} className={(right ? "text-right " : "") + "cursor-pointer select-none whitespace-nowrap"} title="Clique para ordenar">{label}{sortCte?.key === key ? (sortCte.dir === 1 ? " ▲" : " ▼") : ""}</TableHead>
  );
  const todasMarcadas = ctesDaTracao.length > 0 && ctesDaTracao.filter(c => !cteBloqueado(c.chave_acesso)).every(c => ctesSelecionadas.has(c.chave_acesso || ""));
  const toggleTodas = () => {
    setCtesSelecionadas(prev => {
      const next = new Set(prev);
      if (todasMarcadas) { for (const c of ctesDaTracao) next.delete(c.chave_acesso || ""); }
      else { for (const c of ctesDaTracao) if (c.chave_acesso && !cteBloqueado(c.chave_acesso)) next.add(c.chave_acesso); }
      return next;
    });
  };
  const ctesSelArr = useMemo(() => (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || "")), [ctesDisponiveis, ctesSelecionadas]);
  const ctesForms = useMemo(() => (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || "")).map(c => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {} as Record<string, any>; } }), [ctesDisponiveis, ctesSelecionadas]);
  // Cidades derivadas + opções de encerramento (deve ser um dos destinos)
  const cidadeIniDerivada = useMemo(() => {
    if (ctesSelArr.length) {
      const f = formDe(ctesSelArr[0]);
      return f.xMunIni || (f as any).xMunCarrega || "";
    }
    return "";
  }, [ctesSelArr]);
  const cidadesFimOptions = useMemo(() => [...new Set(ctesSelArr.map(c => formDe(c).xMunFim).filter(Boolean) as string[])], [ctesSelArr]);
  const [cidadeFimSel, setCidadeFimSel] = useState("");
  useEffect(() => {
    if (!cidadesFimOptions.length) { if (cidadeFimSel) setCidadeFimSel(""); return; }
    if (!cidadeFimSel || !cidadesFimOptions.includes(cidadeFimSel)) {
      setCidadeFimSel(cidadesFimOptions[cidadesFimOptions.length - 1]);
    }
  }, [cidadesFimOptions]);
  const cidadeFimDerivada = cidadeFimSel || (cidadesFimOptions[cidadesFimOptions.length - 1] || "");
  useEffect(() => {
    if (!ctesSelArr.length) { setUfCarregamento(""); setUfDescarregamento(""); return; }
    const first = formDe(ctesSelArr[0]);
    const ufIni = first.ufIni || (first as any).UFIni || first.ufCarregamento;
    if (ufIni && ufIni !== ufCarregamento) setUfCarregamento(ufIni);
    const destUfs = ctesSelArr.map(c => formDe(c).ufFim).filter(Boolean) as string[];
    const uniq = [...new Set(destUfs)];
    if (uniq.length === 1 && uniq[0] !== ufDescarregamento) {
      setUfDescarregamento(uniq[0]);
    } else if (destUfs.length) {
      const last = destUfs[destUfs.length - 1];
      if (last && last !== ufDescarregamento) setUfDescarregamento(last);
    }
  }, [ctesSelArr]);
  const reboques = useMemo(() => { const out: string[] = []; for (const f of ctesForms) for (const k of ["placaReboque", "semiReboque1", "semiReboque2"]) { const p = String(f[k] || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } return out; }, [ctesForms]);
  const motNomes = useMemo(() => { const out: Array<{ id: string; nome: string }> = []; for (const f of ctesForms) for (const k of [["motoristaId", "motoristaNome"], ["motorista2Id", "motorista2Nome"]] as const) { const nm = String(f[k[1]] || "").trim(); if (nm && !out.some(o => o.nome === nm)) out.push({ id: String(f[k[0]] || ""), nome: nm }); } return out; }, [ctesForms]);
  const cpfDe = (id: string, nome: string) => ((motoristas || []).find(m => (id && m.id === id) || m.nome === nome)?.cpf || "");
  // CNPJ da seguradora p/ o infSeg (699): no transbordo não há chCTe no XML
  // e o servidor não completa; resolve aqui pelo nome (mesma regra do servidor).
  const segComCnpj = async (s: { xSeg: string; nApol: string; nAver: string; cnpjSeg?: string }) => {
    let cnpjSeg = String(s.cnpjSeg || "").replace(/\D/g, "");
    try {
      if (!/^\d{14}$/.test(cnpjSeg) && s.xSeg && empresaId) {
        const { data: sg } = await supabase.from("seguradoras" as any).select("cnpj").eq("empresa_id", empresaId).ilike("nome", s.xSeg).limit(1);
        cnpjSeg = String(((sg as any[])?.[0] as any)?.cnpj || "").replace(/\D/g, "");
      }
    } catch {}
    return { ...s, cnpjSeg: /^\d{14}$/.test(cnpjSeg) ? cnpjSeg : undefined };
  };
  const ciotMdf = useMemo(() => ctesForms.map(f => String(f.ciot || "").trim()).find(Boolean) || "", [ctesForms]);
  const segMdf = useMemo(() => ctesForms.find(f => String(f.seguradoraNome || "").trim()) || {}, [ctesForms]);
  const totalCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + (c.valor_servico || 0), 0), [ctesSelArr]);
  const pesoCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + pesoDe(c), 0), [ctesSelArr]);
  const veicTracInfo = useMemo(() => (veiculos || []).find(v => !!tracaoSel && String(v.placa || "").toUpperCase() === tracaoSel), [veiculos, tracaoSel]);
  const [veicTracId, setVeicTracId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");

  const toggleCte = (chave: string) => {
    if (cteBloqueado(chave)) { toast.error("CT-e já vinculado a um MDF-e ativo"); return; }
    setCtesSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  };

  const handleEmitir = async () => {
    if (!ctesSelecionadas.size) { toast.error("Selecione pelo menos 1 CT-e"); return; }
    if (!tracaoSel) { toast.error("Selecione o veículo"); return; }
    if (!motNomes.length) { toast.error("CT-es sem motorista"); return; }
    if (!ufCarregamento || !ufDescarregamento) { toast.error("Percurso incompleto: UF de início/encerramento vêm dos CT-es"); return; }
    if (errosPercurso.length) { toast.error(errosPercurso[0]); return; }
    const _firstCheck = (() => { try { const p = JSON.parse((ctesSelArr[0] as any)?.xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {} as Record<string, any>; } })();
    if (!String(_firstCheck.cMunIni || "").trim()) { toast.error("CT-e sem município de coleta (cMunIni) — complete no CT-e"); return; }

    const veic = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === tracaoSel);
    const mot0 = motNomes[0];
    const mot = (motoristas || []).find(m => (mot0.id && m.id === mot0.id) || m.nome === mot0.nome);

    setLoading(true);
    try {
      const bloqueados = [...ctesSelecionadas].filter(c => cteBloqueado(c));
      if (bloqueados.length) { toast.error("CT-e já vinculado a um MDF-e ativo — remova da seleção"); setLoading(false); return; }
      const ctesArr = (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || ""));
      const numero = String(Math.floor(Math.random() * 999999) + 1).padStart(9, "0");
      const firstForm = formDe(ctesArr[0]);
      const tpRodDe = (t?: string | null) => { const s = String(t || "").toLowerCase(); if (s.includes("cavalo")) return "03"; if (s.includes("truck")) return "01"; if (s.includes("toco")) return "02"; if (s.includes("van") || s.includes("furg")) return "04"; if (s.includes("utilit")) return "05"; return "06"; };
      const renavamDe = (placa: string) => (veiculos || []).find(v => String(v.placa || "").toUpperCase() === String(placa || "").toUpperCase())?.renavam || undefined;
      const { buildMdfXml, extrairContratantesDoCte } = await import("@/lib/sefaz-mdf");
      // Tomadores + produto predominante direto do XML assinado dos CT-es (578/725).
      const contratantesMdf: Array<{ xNome?: string; cnpj?: string; cpf?: string }> = [];
      let proPredMdf = "";
      for (const c of ctesArr) {
        try {
          const p = JSON.parse((c as any).xml_assinado || "{}");
          const cteXml = String(p.xml || "");
          for (const t of extrairContratantesDoCte(cteXml)) {
            if (!contratantesMdf.some(o => (o.cnpj || o.cpf || o.xNome) === (t.cnpj || t.cpf || t.xNome))) contratantesMdf.push(t);
          }
          if (!proPredMdf) proPredMdf = (cteXml.match(/<proPred>([^<]{1,120})<\/proPred>/)?.[1] || "").trim();
        } catch {}
      }
      // cMun do EMITENTE (empresa): resolve IBGE pela cidade/UF do cadastro;
      // fallback para o município de coleta quando a lookup falhar.
      let emitCMun = "";
      try {
        const empUF = String((empresa as any)?.uf || "").toUpperCase();
        const empXMun = String((empresa as any)?.cidade || "");
        if (empUF && empXMun) {
          const rI = await fetch("https://brasilapi.com.br/api/ibge/municipios/v1/" + empUF);
          if (rI.ok) {
            const arr = await rI.json();
            const norm = (s: string) => (s || "").toUpperCase().normalize("NFD").replace(/[^A-Z ]/g, "").replace(/ +/g, " ").trim();
            const hit = ((arr as any[]) || []).find((mm: any) => norm(mm.nome) === norm(empXMun));
            if (hit?.codigo_ibge) emitCMun = String(hit.codigo_ibge);
          }
        }
      } catch {}
      if (!emitCMun) emitCMun = String(firstForm.cMunIni || "");
      // Seguro do transbordo: herda o bloco <seg> completo do manifesto origem
      // (mesma carga/apólice); completa com os CT-es quando ausente.
      const segOrigem = await (async () => {
        const chaves = [transb1, transb2, transb3].filter(k => /^\d{44}$/.test((k || "").trim())).map(k => k.trim());
        if (!isTransbordo || !chaves.length) return null as null | { xSeg: string; cnpjSeg: string; nApol: string; nAver: string };
        const { data: rows } = await supabase.from("mdf_documentos" as any).select("chave_acesso,xml_assinado").in("chave_acesso", chaves);
        for (const ch of chaves) {
          const raw = String(((rows as any[]) || []).find(r => String((r as any).chave_acesso || "") === ch)?.xml_assinado || "");
          let xml = raw;
          try { const p = JSON.parse(raw); if (p?.xml) xml = String(p.xml); } catch {}
          const segBlock = xml.match(/<seg>([\s\S]*?)<\/seg>/)?.[1] || "";
          if (!segBlock) continue;
          const infSegBlock = segBlock.match(/<infSeg>([\s\S]*?)<\/infSeg>/)?.[1] || "";
          const got = {
            xSeg: (infSegBlock.match(/<xSeg>([^<]*)<\/xSeg>/)?.[1] || "").trim(),
            cnpjSeg: (infSegBlock.match(/<CNPJ>(\d{14})<\/CNPJ>/)?.[1] || "").replace(/\D/g, ""),
            nApol: (segBlock.match(/<nApol>([^<]*)<\/nApol>/)?.[1] || "").trim(),
            nAver: (segBlock.match(/<nAver>([^<]*)<\/nAver>/)?.[1] || "").trim(),
          };
          if (got.xSeg || got.nApol) return got;
        }
        return null;
      })();
      const segForm = { xSeg: String((segMdf as any).seguradoraNome || ""), nApol: String((segMdf as any).apolice || ""), nAver: String((segMdf as any).averbacao || "") };
      const input = {
        empresaId, ambiente: ambienteMdf, serie: serieMdf || "000", numero,
        ufCarregamento, ufDescarregamento,
        emit: (() => {
          // enderEmit é o endereço do EMITENTE (empresa), nunca do remetente/coleta.
          const empUF = String((empresa as any)?.uf || "").toUpperCase();
          const empXMun = String((empresa as any)?.cidade || "");
          return { cnpj: String((empresa as any)?.cnpj || ""), ie: String((empresa as any)?.ie || ""), xNome: String((empresa as any)?.razao_social || (empresa as any)?.nome_fantasia || ""), uf: empUF || ufCarregamento, cMun: emitCMun, xMun: empXMun || String(firstForm.xMunIni || ""), logradouro: String((empresa as any)?.logradouro || ""), nro: String((empresa as any)?.numero || ""), bairro: String((empresa as any)?.bairro || "") };
        })(),
        veicTrac: { placa: tracaoSel, uf: ufCarregamento, rntrc: (veic as any)?.rntrc || "", tara: 0, renavam: (veic as any)?.renavam || undefined, tpRod: tpRodDe((veic as any)?.tipo), ciot: ciotMdf || undefined },
        reboques: reboques.slice(0, 3).map(p => ({ placa: p, uf: ufCarregamento, tara: 0, renavam: renavamDe(p) })),
        condutor: { cpf: mot?.cpf || "", xNome: mot0.nome },
        ctes: ctesArr.map(c => { const f = formDe(c); return { chave: c.chave_acesso || "", valor: c.valor_servico || 0, pesoKG: pesoDe(c), cMunDescarga: String(f.cMunFim || ""), xMunDescarga: String(f.xMunFim || "") }; }),
        infMunCarrega: [{ cMunCarrega: String(firstForm.cMunIni || ""), xMunCarrega: String(firstForm.xMunIni || "") }],
        infPercurso: percursoUFs.map(uf => ({ ufFim: uf })),
        valorTotalCarga: ctesArr.reduce((s, c) => s + (c.valor_servico || 0), 0),
        pesoTotalKG: ctesArr.reduce((s, c) => s + pesoDe(c), 0),
        // 647: rodoviário nunca referencia outro MDF-e (só aquaviário pode);
        // transbordo rodoviário sai como MDF-e normal com os CT-es.
        tipo: "normal" as "normal" | "transbordo",
        tpEmit: tipoMdf === "Globalizado" ? "3" : "1",
        seg: await segComCnpj({
          xSeg: segForm.xSeg || segOrigem?.xSeg || "",
          nApol: segForm.nApol || segOrigem?.nApol || "",
          nAver: segForm.nAver || segOrigem?.nAver || "",
          cnpjSeg: segOrigem?.cnpjSeg || "",
        }),
        contratantes: contratantesMdf,
        prodPred: { xProd: proPredMdf },
        mdfesTransbordo: await (async () => {
          // Municípios de descarga reais do manifesto origem (do XML dele);
          // xMun ausente é resolvido via IBGE, senão a emissão aborta (215).
          const chaves = [transb1, transb2, transb3].filter(k => /^\d{44}$/.test((k || "").trim())).map(k => k.trim());
          if (!chaves.length) return [];
          const { data: rows } = await supabase.from("mdf_documentos" as any).select("chave_acesso,xml_assinado").in("chave_acesso", chaves);
          const byCh = new Map<string, string>();
          for (const r of (rows as any[]) || []) byCh.set(String((r as any).chave_acesso || ""), String((r as any).xml_assinado || ""));
          const out: Array<{ chave: string; cMun: string; xMun: string }> = [];
          for (const ch of chaves) {
            let xml = byCh.get(ch) || "";
            try { const p = JSON.parse(xml); if (p?.xml) xml = String(p.xml); } catch {}
            for (const b of xml.matchAll(/<infMunDescarga>([\s\S]*?)<\/infMunDescarga>/g)) {
              const cMun = b[1].match(/<cMunDescarga>(\d{7})<\/cMunDescarga>/)?.[1] || "";
              let xMun = b[1].match(/<xMunDescarga>([^<]*)<\/xMunDescarga>/)?.[1]?.trim() || "";
              if (cMun && !xMun) {
                try {
                  const rI = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${cMun}`);
                  if (rI.ok) xMun = String((await rI.json())?.nome || "").trim();
                } catch {}
              }
              if (cMun) out.push({ chave: ch, cMun, xMun });
            }
          }
          return out;
        })(),
      };

      const { xml } = buildMdfXml(input);

      const res = await emitirMdfFn({
        data: {
          empresaId, xml, numero, serie: serieMdf, responsavel: respNome, veiculoTracaoId: veic?.id, motoristaId: mot?.id,
          ufCarregamento, ufDescarregamento,
          qtdCtes: ctesArr.length, valorTotalCarga: input.valorTotalCarga, pesoTotal: input.pesoTotalKG,
          percursoUFs, observacoes, infoFisco,
          tipoMdf, isTransbordo, transbordo1: transb1, transbordo2: transb2, transbordo3: transb3,
        } as any
      });

      if (res.sucesso) {
        toast.success("MDF-e emitido com sucesso!");
      }
      else toast.error(`Erro ${res.cStat}: ${res.xMotivo}`);
      if ((res.sucesso || res.cStat) && rascunhoInicial?.id) {
        try { await supabase.from("mdf_documentos" as any).delete().eq("id", rascunhoInicial.id); } catch {}
      }

      onOpenChange(false);
      setCtesSelecionadas(new Set()); setTracaoSel(""); setUfCarregamento(""); setUfDescarregamento(""); setCidadeFimSel(""); setPercursoUFs([]); setObservacoes(""); setInfoFisco(""); setIsTransbordo(false); setTransb1(""); setTransb2(""); setTransb3(""); setTipoMdf("Normal"); setPercursoSelIdx(null);
      qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao emitir MDF-e"); }
    setLoading(false);
  };

  const handleSalvarRascunho = async () => {
    if (!ctesSelecionadas.size) { toast.error("Selecione pelo menos 1 CT-e"); return; }
    if ([...ctesSelecionadas].some(c => cteBloqueado(c))) { toast.error("CT-e já vinculado a um MDF-e ativo — remova da seleção"); return; }
    if (!empresaId) return;
    const veic = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === tracaoSel);
    setLoading(true);
    try {
      const ctesArr = (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || ""));
      const chaves = [...ctesSelecionadas];
      const payload = {
        empresa_id: empresaId, status: "rascunho", serie: serieMdf || "000",
        qtd_cte: ctesArr.length, valor_total_carga: totalCarga, peso_total: pesoCarga,
        uf_carregamento: ufCarregamento || null, uf_descarregamento: ufDescarregamento || null,
        veiculo_tracao_id: (veic as any)?.id || null, ambiente: ambienteMdf,
        xml_assinado: JSON.stringify({ rascunho: true, chaves, percursoUFs, observacoes, infoFisco, tipoMdf, isTransbordo, transb1, transb2, transb3 }),
      } as any;
      if (rascunhoInicial?.id) {
        const { error } = await supabase.from("mdf_documentos" as any).update(payload).eq("id", rascunhoInicial.id);
        if (error) throw error;
      } else {
        try {
          const { data: outros } = await supabase.from("mdf_documentos" as any).select("id,xml_assinado").eq("empresa_id", empresaId).eq("status", "rascunho");
          for (const r of (outros as any[]) || []) {
            try {
              const p = JSON.parse(String((r as any).xml_assinado || "{}"));
              const ch = [...new Set([...(Array.isArray(p.chaves) ? p.chaves : [])])].sort();
              if (ch.length && JSON.stringify(ch) === JSON.stringify([...chaves].sort())) {
                await supabase.from("mdf_documentos" as any).delete().eq("id", (r as any).id);
              }
            } catch {}
          }
        } catch {}
        const { error } = await supabase.from("mdf_documentos" as any).insert(payload);
        if (error) throw error;
      }
      toast.success("Rascunho salvo!");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao salvar rascunho"); }
    setLoading(false);
  };

  const moverPercurso = (idx: number, dir: -1 | 1) => {
    setPercursoUFs(prev => {
      const n = [...prev]; const j = idx + dir;
      if (j < 0 || j >= n.length) return prev;
      const tmp = n[idx]; n[idx] = n[j]; n[j] = tmp;
      setPercursoSelIdx(j);
      return n;
    });
  };
  const excluirPercurso = (idx: number) => {
    setPercursoUFs(prev => prev.filter((_, i) => i !== idx));
    setPercursoSelIdx(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-hidden" style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", height: "100vh", overflow: "hidden" }}>
        <DialogHeader className="shrink-0" style={{ flexShrink: 0 }}><DialogTitle>Novo MDF-e <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">Homologação (testes)</span><span className="ml-2 align-middle font-mono text-[10px] font-normal text-muted-foreground" title="Revisão da tela">ui-29</span></DialogTitle></DialogHeader>

        <div className="min-h-0" style={{ minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto auto minmax(0,1fr)", gap: "8px" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border rounded-md p-2 space-y-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div><Label className="text-xs">Nome da Empresa</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={(empresa as any)?.nome_fantasia || (empresa as any)?.razao_social || "—"} /></div>
                  <div><Label className="text-xs">Veículo *</Label>
                    <Select value={tracaoSel} onValueChange={v => { setTracaoSel(v); setCtesSelecionadas(new Set()); }}>
                      <SelectTrigger className="h-6 w-fit max-w-full gap-1 text-[11px] font-mono [&>span]:truncate">{tracaoSel ? (<span>{tracaoSel}{veicTracInfo?.renavam ? ` • RENAVAM ${veicTracInfo.renavam}` : ""}</span>) : (<span className="text-muted-foreground">Selecione...</span>)}</SelectTrigger>
                      <SelectContent>{placasVeiculoOpts.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Motorista</Label>{motNomes.length ? motNomes.map(m => (<p key={m.nome} className="text-xs truncate">{m.nome} <span className="text-muted-foreground">({cpfDe(m.id, m.nome) || "s/CPF"})</span></p>)) : (<p className="text-xs text-muted-foreground">—</p>)}</div>
                </div>
                <div className="space-y-1">
                  <div>
                    <Label className="text-[10px] leading-none">Tipo MDF-e</Label>
                    <div className="flex gap-2 items-center mt-0.5">
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer"><input type="radio" checked={tipoMdf === "Normal"} onChange={() => setTipoMdf("Normal")} className="h-3 w-3" /> Normal</label>
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer"><input type="radio" checked={tipoMdf === "Globalizado"} onChange={() => setTipoMdf("Globalizado")} className="h-3 w-3" /> Globalizado</label>
                    </div>
                  </div>
                  <div><Label className="text-xs">Reboque(s)</Label><div className="flex h-6 w-fit max-w-full items-center justify-between gap-1 whitespace-nowrap rounded-md border border-input bg-stone-200 dark:bg-muted px-3 py-2 text-[11px] shadow-sm font-mono"><span className="truncate">{reboques.length ? reboques.map(p => { const v = (veiculos || []).find(x => String(x.placa || "").toUpperCase() === p); return v?.renavam ? `${p} • RENAVAM ${v.renavam}` : p; }).join(", ") : "—"}</span></div></div>
                  <div><Label className="text-xs">CIOT</Label><p className="font-mono text-xs">{ciotMdf || "—"}</p></div>
                </div>
                <div className="space-y-1">
                  <div><label className="flex items-center gap-1 text-[11px] font-medium cursor-pointer"><input type="checkbox" checked={isTransbordo} onChange={e => setIsTransbordo(e.target.checked)} className="h-3 w-3" /> Manifesto Transbordo</label></div>
                  <TransbSelect label="1º Transbordo" value={transb1} onChange={setTransb1} />
                  <TransbSelect label="2º Transbordo" value={transb2} onChange={setTransb2} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)_170px] gap-2">
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Início</Label><Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={cidadeIniDerivada} /></div>
                <div><Label className="text-xs whitespace-nowrap" title="UF de Início">UF Início</Label>
                  <Select value={ufCarregamento} onValueChange={setUfCarregamento}>
                    <SelectTrigger className="h-6 px-1 text-[11px] font-mono"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf} className="font-mono">{uf}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Encerramento</Label>{cidadesFimOptions.length > 1 ? (
                  <Select value={cidadeFimSel} onValueChange={setCidadeFimSel}>
                    <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{cidadesFimOptions.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                  </Select>
                ) : (<Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={cidadeFimDerivada} />)}</div>
                <div><Label className="text-xs whitespace-nowrap" title="UF de Encerramento">UF Encerramento</Label>
                  <Select value={ufDescarregamento} onValueChange={setUfDescarregamento}>
                    <SelectTrigger className="h-6 px-1 text-[11px] font-mono"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf} className="font-mono">{uf}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="border rounded-md p-2 space-y-1">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                <div><Label className="text-xs">Nº Manifesto</Label><Input className="h-6 text-[11px] font-mono bg-muted" readOnly value="—" placeholder="auto" /></div>
                <div><Label className="text-xs">Série</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value={serieMdf} /></div>
                <div><Label className="text-xs">Data Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={new Date().toLocaleDateString("pt-BR")} /></div>
                <div><Label className="text-xs">Hora Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} /></div>
                <div><Label className="text-xs">Responsável Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={respNome || ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="space-y-1">
                  <div><Label className="text-xs">Seguradora RC-V</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={String((segMdf as any).seguradoraNome || "")} /></div>
                  <div><Label className="text-xs">Averbação RC-V</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value={String((segMdf as any).averbacao || "")} /></div>
                  <div><Label className="text-xs">Apólice</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value={String((segMdf as any).apolice || "")} /></div>
                </div>
                <div className="space-y-1">
                  <div><Label className="text-xs">Chave de acesso</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value="" /></div>
                  <div><Label className="text-xs">CNPJ ANTT - AUTORIZADO</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value={String((empresa as any)?.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || "—"} /></div>
                  <div><Label className="text-xs">Local Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={[ (empresa as any)?.cidade, (empresa as any)?.uf ].filter(Boolean).join("/") || "—"} /></div>
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-md p-2">
            <div className="flex items-center justify-end gap-2 mb-1">
              <Label className="text-xs mr-auto">Conhecimentos ({ctesSelArr.length} vinculados){tracaoSel ? ` • placa ${tracaoSel}` : ""}</Label>
              <span className="text-xs">Valor total: <strong className="font-mono">{brl(totalCarga)}</strong></span>
              <span className="text-xs">Peso total: <strong className="font-mono">{num(pesoCarga)} kg</strong></span>
              <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={!tracaoSel} onClick={() => setCtesSelecionadas(new Set(ctesDaTracao.filter(c => !cteBloqueado(c.chave_acesso)).map(c => c.chave_acesso || "").filter(Boolean)))}>Marcar</Button>
              <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setCtesSelecionadas(new Set())}>Limpar</Button>
              {ctesOcultosMdf > 0 && !(transbAtivo && transbAtivo.size > 0) && <span className="text-[10px] text-muted-foreground self-center">{ctesOcultosMdf} CT-e(s) já em MDF-e oculto(s)</span>}
            </div>
            {ctesErro ? (
              <p className="text-sm text-destructive">Falha ao carregar CT-es: {String((ctesErro as any)?.message || ctesErro)}</p>
            ) : !ctesDisponiveis?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum CT-e autorizado disponível.</p>
            ) : (
              <div className="border rounded-md max-h-[160px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted"><TableRow>
                    <TableHead className="w-[36px]"><input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} className="h-4 w-4" title="Selecionar todos" /></TableHead>
                    {thCte("Emissão", "emissao")}{thCte("CTRC", "ctrc")}{thCte("Série", "serie")}{thCte("Placa", "placa")}{thCte("Reboques", "reboques")}{thCte("Coleta", "coleta")}{thCte("UF", "ufIni")}{thCte("Entrega", "entrega")}{thCte("UF", "ufFim")}{thCte("Notas Fiscais", "nfs")}{thCte("Valor", "valor", true)}{thCte("Peso", "peso", true)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {!tracaoSel && (<TableRow><TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-6">Selecione o veículo no box da empresa para listar os CT-es.</TableCell></TableRow>)}
                    {ctesOrdenados.map(c => {
                      const f = formDe(c);
                      const reb = [f.placaReboque, f.semiReboque1, f.semiReboque2].map(x => String(x || "").toUpperCase()).filter(Boolean).join(", ");
                      return (
                      <TableRow key={c.id} className={ctesSelecionadas.has(c.chave_acesso || "") ? "bg-muted/50" : ""}>
                        <TableCell><input type="checkbox" checked={ctesSelecionadas.has(c.chave_acesso || "")} onChange={() => toggleCte(c.chave_acesso || "")} className="h-4 w-4" /></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtData(c.data_autorizacao)}</TableCell>
                        <TableCell className="font-mono text-xs">{c.numero ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{(c as any).serie ?? "1"}</TableCell>
                        <TableCell className="font-mono text-xs">{String(f.placaVeiculo || "—").toUpperCase()}</TableCell>
                        <TableCell className="font-mono text-xs">{reb || "—"}</TableCell>
                        <TableCell className="text-xs">{f.xMunIni || "—"}</TableCell>
                        <TableCell className="text-xs">{f.ufIni || "—"}</TableCell>
                        <TableCell className="text-xs">{f.xMunFim || "—"}</TableCell>
                        <TableCell className="text-xs">{f.ufFim || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{nfsDe(c).join(", ") || "—"}</TableCell>
                        <TableCell className="text-right text-xs">{c.valor_servico ? brl(c.valor_servico) : "—"}</TableCell>
                        <TableCell className="text-right text-xs">{pesoDe(c) ? `${num(pesoDe(c))} kg` : "—"}</TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-10 gap-2 items-stretch min-h-0 h-full" style={{ minHeight: 0, overflow: "hidden" }}>
            <div className="border rounded-md p-2 md:col-span-2 min-w-0 overflow-hidden h-full flex flex-col" style={{ height: "100%" }}>
              <div className="flex items-center justify-between gap-1 flex-wrap shrink-0">
                <Label className="text-xs">Percurso *</Label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{percursoUFs.length} UF(s)</span>
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={percursoSelIdx === null} onClick={() => percursoSelIdx !== null && excluirPercurso(percursoSelIdx)}>Exclui</Button>
                  <div className="flex flex-col gap-0.5">
                    <Button size="sm" variant="outline" className="h-3 px-1 text-[10px] leading-none" disabled={percursoSelIdx === null || percursoSelIdx === 0} onClick={() => percursoSelIdx !== null && moverPercurso(percursoSelIdx, -1)}>▲</Button>
                    <Button size="sm" variant="outline" className="h-3 px-1 text-[10px] leading-none" disabled={percursoSelIdx === null || percursoSelIdx === percursoUFs.length - 1} onClick={() => percursoSelIdx !== null && moverPercurso(percursoSelIdx, 1)}>▼</Button>
                  </div>
                </div>
              </div>
              <div className="border rounded mt-2 flex-1 min-h-0 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0"><tr><th className="text-left px-1 py-0.5 font-semibold">#</th><th className="text-left px-1 py-0.5 font-semibold">UF</th><th className="text-left px-1 py-0.5 font-semibold">Ações</th></tr></thead>
                  <tbody>
                    {percursoUFs.length === 0 ? (<tr><td colSpan={3} className="text-center text-muted-foreground py-2">Nenhuma UF. Adicione na ordem do trajeto (repetir é permitido).</td></tr>) : percursoUFs.map((uf, idx) => (
                      <tr key={`${idx}-${uf}`} className={"cursor-pointer " + (percursoSelIdx === idx ? "bg-primary/10" : "hover:bg-muted/50")} onClick={() => setPercursoSelIdx(idx)}>
                        <td className="px-1 py-0.5 font-mono">{idx + 1}º</td><td className="px-1 py-0.5 font-mono font-bold">{uf}</td><td className="px-1 py-0.5"><Button variant="ghost" size="sm" className="h-4 px-1 text-[10px]" onClick={e => { e.stopPropagation(); excluirPercurso(idx); }}>✕</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!!errosPercurso.length && (
                <div className="mt-1 border border-destructive/50 bg-destructive/10 rounded p-1.5 shrink-0">
                  {errosPercurso.map(e => (<p key={e} className="text-[11px] text-destructive">⚠ {e}</p>))}
                </div>
              )}
            </div>
            <div className="border rounded-md p-2 md:col-span-1 h-full flex flex-col" style={{ height: "100%" }}>
              <span className="text-[10px] text-muted-foreground shrink-0">Adicionar UF:</span>
              <div className="grid grid-cols-6 gap-0.5 mt-1 content-start">
                {UFS.map(uf => (
                  <Button key={uf} variant="outline" size="sm" className="h-[18px] px-0 text-[9px] font-mono leading-none" onClick={() => { setPercursoUFs(prev => [...prev, uf]); setPercursoSelIdx(percursoUFs.length); }}>{uf}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-7 flex flex-col" style={{ height: "100%" }}>
              <div className="border rounded-md p-2 space-y-1 flex-1 flex flex-col justify-between">
                <div><Label className="text-xs">Observação</Label><Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className="text-xs min-h-[36px] py-1" /></div>
                <div><Label className="text-xs">Informações Adicionais Fisco</Label><Textarea value={infoFisco} onChange={e => setInfoFisco(e.target.value)} rows={2} className="text-xs min-h-[36px] py-1" /></div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 mt-0" style={{ flexShrink: 0, marginTop: 0 }}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {permiteRascunho && (
          <Button variant="secondary" onClick={handleSalvarRascunho} disabled={loading || !ctesSelecionadas.size}>
            {loading ? "Salvando..." : "Salvar Rascunho"}
          </Button>
          )}
          <Button onClick={handleEmitir} disabled={loading || !tracaoSel || !ctesSelecionadas.size || !motNomes.length || !ufCarregamento || !ufDescarregamento || !!errosPercurso.length}>
            <Send className="mr-1 h-4 w-4" /> {loading ? "Emitindo..." : "Emitir MDF-e"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
