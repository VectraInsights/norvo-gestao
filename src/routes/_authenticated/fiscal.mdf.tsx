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
import { Route as RoadIcon, Plus, FileText, Search, Trash2, Filter, Calendar, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send, FileDown, Truck, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { emitirMdfFn, consultarMdfFn, encerrarMdfFn, cancelarMdfFn } from "@/lib/sefaz-mdf-server";
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
};

type CteDoc = { id: string; numero: string | null; serie: string | null; chave_acesso: string | null; status: string; valor_servico: number | null; peso_carga: number | null; data_autorizacao: string | null };

function MdfPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mdfPrefill, setMdfPrefill] = useState<string[] | null>(null);
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
  const [justificativa, setJustificativa] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["mdf-documentos", empresa?.id],
    queryFn: async (): Promise<MdfDoc[]> => {
      const { data, error } = await supabase.from("mdf_documentos" as any)
        .select("id,numero,serie,status,qtd_cte,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz,uf_carregamento,uf_descarregamento,valor_total_carga,peso_total,veiculo_tracao_id,motorista_id,xml_assinado,xml_protocolo")
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MdfDoc[];
    },
  });

  const statusCounts = {
    todos: (docs || []).length,
    autorizado: (docs || []).filter(d => d.status === "autorizado").length,
    rejeitado: (docs || []).filter(d => d.status === "rejeitado").length,
    cancelado: (docs || []).filter(d => d.status === "cancelado").length,
    encerrado: (docs || []).filter(d => d.status === "encerrado").length,
    rascunho: (docs || []).filter(d => d.status === "rascunho").length,
  };
  const docsFiltrados = (docs || []).filter(d => {
    if (filtroStatus !== "todos" && d.status !== filtroStatus) return false;
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
            <TabsTrigger value="todos" className="text-xs">Todos ({statusCounts.todos})</TabsTrigger>
            <TabsTrigger value="autorizado" className="text-xs">Autorizado ({statusCounts.autorizado})</TabsTrigger>
            <TabsTrigger value="rejeitado" className="text-xs">Rejeitado ({statusCounts.rejeitado})</TabsTrigger>
            <TabsTrigger value="cancelado" className="text-xs">Cancelado ({statusCounts.cancelado})</TabsTrigger>
            <TabsTrigger value="encerrado" className="text-xs">Encerrado ({statusCounts.encerrado})</TabsTrigger>
            <TabsTrigger value="rascunho" className="text-xs">Rascunho ({statusCounts.rascunho})</TabsTrigger>
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
                          <Button variant="ghost" size="sm" onClick={() => { setMdfEncerrar(d); setOpenEncerrar(true); }} title="Encerrar">
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setMdfCancelar(d); setOpenCancelar(true); }} title="Cancelar">
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {d.status === "rascunho" && (
                        <Button variant="ghost" size="sm" title="Rejeitado — ver motivo">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </Button>
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
              <EncerrarMdfButton mdf={mdfEncerrar} empresaId={empresa!.id} onSuccess={() => { setOpenEncerrar(false); setMdfEncerrar(null); qc.invalidateQueries({ queryKey: ["mdf-documentos"] }); }} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {mdfCancelar && (
        <Dialog open={openCancelar} onOpenChange={setOpenCancelar}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cancelar MDF-e #{mdfCancelar.numero}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Justificativa (obrigatória)</Label>
              <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Motivo do cancelamento..." rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpenCancelar(false); setJustificativa(""); }}>Voltar</Button>
              <Button variant="destructive" disabled={!justificativa.trim()} onClick={async () => {
                if (!empresa || !mdfCancelar.chave_acesso) return;
                try {
                  const res = await cancelarMdfFn({ data: { empresaId: empresa.id, chave: mdfCancelar.chave_acesso, justificativa: justificativa.trim(), cnpj: "", uf: mdfCancelar.uf_carregamento || "" } });
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

      <DialogNovoMdf open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMdfPrefill(null); }} empresaId={empresa?.id || ""} empresa={empresa} chavesIniciais={mdfPrefill || undefined} />
    </div>
  );
}

function EncerrarMdfButton({ mdf, empresaId, onSuccess }: { mdf: MdfDoc; empresaId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleEncerrar = async () => {
    if (!mdf.chave_acesso) return;
    setLoading(true);
    try {
      const res = await encerrarMdfFn({ data: { empresaId, chave: mdf.chave_acesso, cnpj: "", uf: mdf.uf_carregamento || "" } });
      if (res.sucesso) { toast.success("MDF-e encerrado!"); onSuccess(); }
      else toast.error(`Erro: ${res.xMotivo}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao encerrar"); }
    setLoading(false);
  };
  return <Button onClick={handleEncerrar} disabled={loading}>{loading ? "Encerrando..." : "Confirmar Encerramento"}</Button>;
}

function DialogNovoMdf({ open, onOpenChange, empresaId, empresa, chavesIniciais }: { open: boolean; onOpenChange: (v: boolean) => void; empresaId: string; empresa?: any; chavesIniciais?: string[] }) {
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
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const [ctesSelecionadas, setCtesSelecionadas] = useState<Set<string>>(new Set());
  const [percursoUFs, setPercursoUFs] = useState<string[]>(["SP"]);
  const [tracaoSel, setTracaoSel] = useState("");
  const todasTracoes = useMemo(() => { const out: string[] = []; for (const c of (ctesDisponiveis || [])) { try { const p = JSON.parse((c as any).xml_assinado || "{}"); const pl = String(p.form?.placaVeiculo || "").toUpperCase(); if (pl && !out.includes(pl)) out.push(pl); } catch {} } return out.sort(); }, [ctesDisponiveis]);
  const placasVeiculoOpts = useMemo(() => { const out: string[] = []; const REB = ["carreta", "bitrem"]; for (const v of (veiculos || [])) { if (REB.includes(String(v.tipo || "").toLowerCase().trim())) continue; const p = String(v.placa || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } for (const p of todasTracoes) if (!out.includes(p)) out.push(p); return out.sort(); }, [veiculos, todasTracoes]);
  const ctesDaTracao = useMemo(() => (ctesDisponiveis || []).filter(c => { if (!tracaoSel) return false; try { const p = JSON.parse((c as any).xml_assinado || "{}"); return String(p.form?.placaVeiculo || "").toUpperCase() === tracaoSel; } catch { return false; } }), [ctesDisponiveis, tracaoSel]);
  const [infoFisco, setInfoFisco] = useState("");
  const [respNome, setRespNome] = useState("");
  const [tipoMdf, setTipoMdf] = useState<"Normal" | "Globalizado">("Normal");
  const [serieMdf] = useState("000");
  const [isTransbordo, setIsTransbordo] = useState(false);
  const [transb1, setTransb1] = useState("");
  const [transb2, setTransb2] = useState("");
  const [transb3, setTransb3] = useState("");
  const [percursoSelIdx, setPercursoSelIdx] = useState<number | null>(null);
  // MDF-e travado em homologação (decisão 23/09/2026) — XML e transmissão sempre tpAmb=2
  const ambienteMdf = "homologacao" as const;
  useEffect(() => { if (!open) return; (async () => { try { const { data } = await supabase.auth.getUser(); const usr = (data as any)?.user; if (!usr) return; let nm = (usr?.user_metadata as any)?.nome || ""; if (!nm && empresaId) { const { data: eu } = await supabase.from("empresa_users" as any).select("nome").eq("empresa_id", empresaId).eq("user_id", usr.id).maybeSingle(); nm = (eu as any)?.nome || ""; } setRespNome(nm || ""); } catch {} })(); }, [open, empresaId]);
  useEffect(() => { if (open && chavesIniciais?.length) { setCtesSelecionadas(new Set(chavesIniciais)); setPercursoUFs(["SP"]); } }, [open]);
  useEffect(() => {
    if (!open || tracaoSel || !ctesSelecionadas.size) return;
    const first = (ctesDisponiveis || []).find(c => ctesSelecionadas.has(c.chave_acesso || ""));
    if (!first) return;
    try { const p = JSON.parse((first as any).xml_assinado || "{}"); const pl = String(p.form?.placaVeiculo || "").toUpperCase(); if (pl) setTracaoSel(pl); } catch {}
  }, [open, ctesDisponiveis, ctesSelecionadas, tracaoSel]);
  // percurso mantém última UF de descarga como último item, mas permite repetição
  useEffect(() => { if (!ufDescarregamento) return; setPercursoUFs(prev => (prev.length && prev[prev.length - 1] === ufDescarregamento) ? prev : [...prev, ufDescarregamento]); }, [ufDescarregamento]);
  // Helpers CT-e (precisam vir antes das cidades derivadas)
  const fmtData = (iso: any) => { try { const d = new Date(String(iso)); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString("pt-BR"); } catch { return "—"; } };
  const nfsDe = (c: CteDoc): string[] => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); const xml = p.xml || ""; return [...xml.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m => m[1].slice(25, 34).replace(/^0+/, "") || "0"); } catch { return []; } };
  const formDe = (c: CteDoc): Record<string, any> => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {}; } };
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
      const nova = uniq[0];
      setUfDescarregamento(nova);
      setPercursoUFs(prev => {
        if (prev.length === 1 && prev[0] === "SP") return [nova];
        if (prev.length === 0) return [nova];
        return prev;
      });
    } else if (destUfs.length) {
      const last = destUfs[destUfs.length - 1];
      if (last && last !== ufDescarregamento) setUfDescarregamento(last);
    }
  }, [ctesSelArr]);
  const reboques = useMemo(() => { const out: string[] = []; for (const f of ctesForms) for (const k of ["placaReboque", "semiReboque1", "semiReboque2"]) { const p = String(f[k] || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } return out; }, [ctesForms]);
  const motNomes = useMemo(() => { const out: Array<{ id: string; nome: string }> = []; for (const f of ctesForms) for (const k of [["motoristaId", "motoristaNome"], ["motorista2Id", "motorista2Nome"]] as const) { const nm = String(f[k[1]] || "").trim(); if (nm && !out.some(o => o.nome === nm)) out.push({ id: String(f[k[0]] || ""), nome: nm }); } return out; }, [ctesForms]);
  const cpfDe = (id: string, nome: string) => ((motoristas || []).find(m => (id && m.id === id) || m.nome === nome)?.cpf || "");
  const ciotMdf = useMemo(() => ctesForms.map(f => String(f.ciot || "").trim()).find(Boolean) || "", [ctesForms]);
  const segMdf = useMemo(() => ctesForms.find(f => String(f.seguradoraNome || "").trim()) || {}, [ctesForms]);
  const totalCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + (c.valor_servico || 0), 0), [ctesSelArr]);
  const pesoCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + (c.peso_carga || 0), 0), [ctesSelArr]);
  const veicTracInfo = useMemo(() => (veiculos || []).find(v => !!tracaoSel && String(v.placa || "").toUpperCase() === tracaoSel), [veiculos, tracaoSel]);
  const [veicTracId, setVeicTracId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");

  const toggleCte = (chave: string) => {
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
    if (!percursoUFs.length) { toast.error("Selecione ao menos 1 UF no percurso"); return; }

    const veic = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === tracaoSel);
    const mot0 = motNomes[0];
    const mot = (motoristas || []).find(m => (mot0.id && m.id === mot0.id) || m.nome === mot0.nome);

    setLoading(true);
    try {
      const ctesArr = (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || ""));
      const numero = String(Math.floor(Math.random() * 999999) + 1).padStart(9, "0");
      const input = {
        empresaId, ambiente: ambienteMdf, serie: serieMdf || "000", numero,
        ufCarregamento, ufDescarregamento,
        emit: { cnpj: "", ie: "", xNome: "", uf: ufCarregamento, cMun: "", xMun: "" },
        veicTrac: { placa: tracaoSel, uf: ufCarregamento, rntrc: (veic as any)?.rntrc || "", tara: 0 },
        reboques: reboques.slice(0, 3).map(p => ({ placa: p, uf: ufCarregamento, tara: 0 })),
        condutor: { cpf: mot?.cpf || "", xNome: mot0.nome },
        ctes: ctesArr.map(c => ({ chave: c.chave_acesso || "", valor: c.valor_servico || 0, pesoKG: c.peso_carga || 0 })),
        infMunCarrega: [{ cMunCarrega: "", xMunCarrega: "" }],
        infPercurso: percursoUFs.map(uf => ({ ufFim: uf })),
        valorTotalCarga: ctesArr.reduce((s, c) => s + (c.valor_servico || 0), 0),
        pesoTotalKG: ctesArr.reduce((s, c) => s + (c.peso_carga || 0), 0),
        tipo: (isTransbordo ? "transbordo" : "normal") as "normal" | "transbordo",
        mdfesTransbordo: [transb1, transb2, transb3].filter(k => /^\d{44}$/.test((k || "").trim())).map(k => ({ chave: k.trim() })),
      };

      const { buildMdfXml } = await import("@/lib/sefaz-mdf");
      const { xml } = buildMdfXml(input);

      const res = await emitirMdfFn({
        data: {
          empresaId, xml, veiculoTracaoId: veic?.id, motoristaId: mot?.id,
          ufCarregamento, ufDescarregamento,
          qtdCtes: ctesArr.length, valorTotalCarga: input.valorTotalCarga, pesoTotal: input.pesoTotalKG,
          percursoUFs, observacoes, infoFisco,
          tipoMdf, isTransbordo, transbordo1: transb1, transbordo2: transb2, transbordo3: transb3,
        } as any
      });

      if (res.sucesso) toast.success("MDF-e emitido com sucesso!");
      else toast.error(`Erro: ${res.xMotivo}`);

      onOpenChange(false);
      setCtesSelecionadas(new Set()); setTracaoSel(""); setUfCarregamento(""); setUfDescarregamento(""); setCidadeFimSel(""); setPercursoUFs(["SP"]); setObservacoes(""); setInfoFisco(""); setIsTransbordo(false); setTransb1(""); setTransb2(""); setTransb3(""); setTipoMdf("Normal"); setPercursoSelIdx(null);
      qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao emitir MDF-e"); }
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
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto">
        <DialogHeader><DialogTitle>Novo MDF-e <span className={"text-xs font-normal px-1.5 py-0.5 rounded " + (ambienteMdf === "homologacao" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{ambienteMdf === "homologacao" ? "Homologação" : "Produção"}</span></DialogTitle></DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border rounded-md p-2 space-y-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div><Label className="text-xs">Nome da Empresa</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={(empresa as any)?.nome_fantasia || (empresa as any)?.razao_social || "—"} /></div>
                  <div className="grid grid-cols-2 gap-1">
                    <div><Label className="text-xs">Veículo *</Label>
                      <Select value={tracaoSel} onValueChange={v => { setTracaoSel(v); setCtesSelecionadas(new Set()); }}>
                        <SelectTrigger className="h-6 w-fit max-w-full gap-1 text-[11px] font-mono [&>span]:truncate">{tracaoSel ? (<span>{tracaoSel}{veicTracInfo?.renavam ? ` • RENAVAM ${veicTracInfo.renavam}` : ""}</span>) : (<span className="text-muted-foreground">Selecione...</span>)}</SelectTrigger>
                        <SelectContent>{placasVeiculoOpts.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Reboque(s)</Label><div className="flex h-6 w-fit max-w-full items-center justify-between gap-1 whitespace-nowrap rounded-md border border-input bg-stone-200 dark:bg-muted px-3 py-2 text-[11px] shadow-sm font-mono"><span className="truncate">{reboques.length ? reboques.map(p => { const v = (veiculos || []).find(x => String(x.placa || "").toUpperCase() === p); return v?.renavam ? `${p} • RENAVAM ${v.renavam}` : p; }).join(", ") : "—"}</span></div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div><Label className="text-xs">Motorista</Label>{motNomes.length ? motNomes.map(m => (<p key={m.nome} className="text-xs truncate">{m.nome} <span className="text-muted-foreground">({cpfDe(m.id, m.nome) || "s/CPF"})</span></p>)) : (<p className="text-xs text-muted-foreground">—</p>)}</div>
                    <div><Label className="text-xs">CIOT</Label><p className="font-mono text-xs">{ciotMdf || "—"}</p></div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div>
                    <Label className="text-[10px] leading-none">Tipo MDF-e</Label>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer"><input type="radio" checked={tipoMdf === "Normal"} onChange={() => setTipoMdf("Normal")} className="h-3 w-3" /> Normal</label>
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer"><input type="radio" checked={tipoMdf === "Globalizado"} onChange={() => setTipoMdf("Globalizado")} className="h-3 w-3" /> Globalizado</label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div><label className="flex items-center gap-1 text-[11px] font-medium cursor-pointer"><input type="checkbox" checked={isTransbordo} onChange={e => setIsTransbordo(e.target.checked)} className="h-3 w-3" /> Manifesto Transbordo</label></div>
                  <div><Label className="text-xs">1º Transbordo</Label><Input className="h-6 text-[11px] font-mono" disabled={!isTransbordo} value={transb1} onChange={e => setTransb1(e.target.value)} /></div>
                  <div><Label className="text-xs">2º Transbordo</Label><Input className="h-6 text-[11px] font-mono" disabled={!isTransbordo} value={transb2} onChange={e => setTransb2(e.target.value)} /></div>
                  <div><Label className="text-xs">3º Transbordo</Label><Input className="h-6 text-[11px] font-mono" disabled={!isTransbordo} value={transb3} onChange={e => setTransb3(e.target.value)} /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_88px] gap-2">
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Início</Label><Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={cidadeIniDerivada} /></div>
                <div><Label className="text-xs whitespace-nowrap" title="UF de Início">UF</Label>
                  <Select value={ufCarregamento} onValueChange={setUfCarregamento}>
                    <SelectTrigger className="h-6 px-1 text-[11px]"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0"><Label className="text-xs whitespace-nowrap">Cidade Encerramento</Label>{cidadesFimOptions.length > 1 ? (
                  <Select value={cidadeFimSel} onValueChange={setCidadeFimSel}>
                    <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{cidadesFimOptions.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                  </Select>
                ) : (<Input className="h-6 text-[11px] bg-stone-200 dark:bg-muted" readOnly value={cidadeFimDerivada} />)}</div>
                <div><Label className="text-xs whitespace-nowrap" title="UF de Encerramento">UF</Label>
                  <Select value={ufDescarregamento} onValueChange={setUfDescarregamento}>
                    <SelectTrigger className="h-6 px-1 text-[11px]"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
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
            <div className="flex items-center justify-end gap-1 mb-1">
              <Label className="text-xs mr-auto">Conhecimentos ({ctesSelArr.length} vinculados){tracaoSel ? ` • placa ${tracaoSel}` : ""}</Label>
              <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={!tracaoSel} onClick={() => setCtesSelecionadas(new Set(ctesDaTracao.map(c => c.chave_acesso || "").filter(Boolean)))}>Marcar</Button>
              <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setCtesSelecionadas(new Set())}>Limpar</Button>
            </div>
            {ctesErro ? (
              <p className="text-sm text-destructive">Falha ao carregar CT-es: {String((ctesErro as any)?.message || ctesErro)}</p>
            ) : !ctesDisponiveis?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum CT-e autorizado disponível.</p>
            ) : (
              <div className="border rounded-md max-h-[260px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted"><TableRow>
                    <TableHead className="w-[36px]"></TableHead>
                    <TableHead>Emissão</TableHead><TableHead>CTRC</TableHead><TableHead>Série</TableHead><TableHead>Placa</TableHead><TableHead>Reboques</TableHead><TableHead>Coleta</TableHead><TableHead>UF</TableHead><TableHead>Entrega</TableHead><TableHead>UF</TableHead><TableHead>Notas Fiscais</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Peso</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {!tracaoSel && (<TableRow><TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-6">Selecione o veículo no box da empresa para listar os CT-es.</TableCell></TableRow>)}
                    {ctesDaTracao.map(c => {
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
                        <TableCell className="text-right text-xs">{c.peso_carga ? `${num(c.peso_carga)} kg` : "—"}</TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="border rounded-md p-2 grid grid-cols-2 md:grid-cols-4 gap-1">
            <div><Label className="text-xs">Valor Total Carga</Label><p className="font-mono text-xs">{brl(totalCarga)}</p></div>
            <div><Label className="text-xs">Peso Total Carga</Label><p className="font-mono text-xs">{num(pesoCarga)} kg</p></div>
            <div className="md:col-span-2"><Label className="text-xs">Responsável Emissão</Label><p className="text-xs">{respNome || "—"}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border rounded-md p-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Percurso (ordem que o motorista vai seguir) *</Label>
                <span className="text-[10px] text-muted-foreground">{percursoUFs.length} UF(s)</span>
              </div>
              <div className="flex gap-1 mt-1">
                <Select value="" onValueChange={v => { if (v) { const idx = percursoUFs.length; setPercursoUFs(prev => [...prev, v]); setPercursoSelIdx(idx); } }}>
                  <SelectTrigger className="h-6 text-[11px] flex-1"><SelectValue placeholder="Adicionar UF na ordem..." /></SelectTrigger>
                  <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={percursoSelIdx === null} onClick={() => percursoSelIdx !== null && excluirPercurso(percursoSelIdx)}>Exclui</Button>
                <div className="flex flex-col gap-0.5">
                  <Button size="sm" variant="outline" className="h-3 px-1 text-[10px] leading-none" disabled={percursoSelIdx === null || percursoSelIdx === 0} onClick={() => percursoSelIdx !== null && moverPercurso(percursoSelIdx, -1)}>▲</Button>
                  <Button size="sm" variant="outline" className="h-3 px-1 text-[10px] leading-none" disabled={percursoSelIdx === null || percursoSelIdx === percursoUFs.length - 1} onClick={() => percursoSelIdx !== null && moverPercurso(percursoSelIdx, 1)}>▼</Button>
                </div>
              </div>
              <div className="border rounded mt-2 max-h-[110px] overflow-auto">
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
              <p className="text-[10px] text-muted-foreground mt-1">Lista em ordem de passagem • clique para selecionar • ▲/▼ reordena • ✕/Exclui remove • mesma UF pode repetir.</p>
              <div className="flex flex-wrap gap-1 mt-2 border-t pt-2">
                <span className="text-[10px] text-muted-foreground w-full">Adicionar rápido (permite repetir):</span>
                {UFS.map(uf => (
                  <Button key={uf} variant="outline" size="sm" className="h-5 px-1.5 text-[10px] font-mono" onClick={() => { setPercursoUFs(prev => [...prev, uf]); setPercursoSelIdx(percursoUFs.length); }}>{uf}</Button>
                ))}
              </div>
            </div>
            <div className="border rounded-md p-2 space-y-1">
              <div><Label className="text-xs">Observação</Label><Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className="text-xs" /></div>
              <div><Label className="text-xs">Informações Adicionais Fisco</Label><Textarea value={infoFisco} onChange={e => setInfoFisco(e.target.value)} rows={2} className="text-xs" /></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleEmitir} disabled={loading || !tracaoSel || !ctesSelecionadas.size || !motNomes.length || !percursoUFs.length}>
            <Send className="mr-1 h-4 w-4" /> {loading ? "Emitindo..." : "Emitir MDF-e"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
