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

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="autorizado">Autorizado</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
              <SelectItem value="rejeitado">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <DateInput value={periodoIni} onChange={setPeriodoIni} className="w-[130px] h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <DateInput value={periodoFim} onChange={setPeriodoFim} className="w-[130px] h-8" />
        </div>
      </div>

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
  const [ufCarregamento, setUfCarregamento] = useState("MG");
  const [ufDescarregamento, setUfDescarregamento] = useState("SP");
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
  const [infoFisco, setInfoFisco] = useState("");
  const [respNome, setRespNome] = useState("");
  useEffect(() => { if (!open) return; (async () => { try { const { data } = await supabase.auth.getUser(); const usr = (data as any)?.user; if (!usr) return; let nm = (usr?.user_metadata as any)?.nome || ""; if (!nm && empresaId) { const { data: eu } = await supabase.from("empresa_users" as any).select("nome").eq("empresa_id", empresaId).eq("user_id", usr.id).maybeSingle(); nm = (eu as any)?.nome || ""; } setRespNome(nm || ""); } catch {} })(); }, [open, empresaId]);
  useEffect(() => { if (open && chavesIniciais?.length) { setCtesSelecionadas(new Set(chavesIniciais)); setPercursoUFs(["SP"]); } }, [open]);
  useEffect(() => { setPercursoUFs(prev => prev.includes(ufDescarregamento) ? prev : [...prev, ufDescarregamento]); }, [ufDescarregamento]);
  // Tudo vem dos CT-es: trações, reboques e motoristas (1º + 2º) dos forms salvos
  const ctesForms = useMemo(() => (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || "")).map(c => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {} as Record<string, any>; } }), [ctesDisponiveis, ctesSelecionadas]);
  const tracoes = useMemo(() => { const out: string[] = []; for (const f of ctesForms) { const p = String(f.placaVeiculo || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } return out; }, [ctesForms]);
  const reboques = useMemo(() => { const out: string[] = []; for (const f of ctesForms) for (const k of ["placaReboque", "semiReboque1", "semiReboque2"]) { const p = String(f[k] || "").toUpperCase(); if (p && !out.includes(p)) out.push(p); } return out; }, [ctesForms]);
  const motNomes = useMemo(() => { const out: Array<{ id: string; nome: string }> = []; for (const f of ctesForms) for (const k of [["motoristaId", "motoristaNome"], ["motorista2Id", "motorista2Nome"]] as const) { const nm = String(f[k[1]] || "").trim(); if (nm && !out.some(o => o.nome === nm)) out.push({ id: String(f[k[0]] || ""), nome: nm }); } return out; }, [ctesForms]);
  const cpfDe = (id: string, nome: string) => ((motoristas || []).find(m => (id && m.id === id) || m.nome === nome)?.cpf || "");
  const ciotMdf = useMemo(() => ctesForms.map(f => String(f.ciot || "").trim()).find(Boolean) || "", [ctesForms]);
  const segMdf = useMemo(() => ctesForms.find(f => String(f.seguradoraNome || "").trim()) || {}, [ctesForms]);
  const ctesSelArr = useMemo(() => (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || "")), [ctesDisponiveis, ctesSelecionadas]);
  const totalCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + (c.valor_servico || 0), 0), [ctesSelArr]);
  const pesoCarga = useMemo(() => ctesSelArr.reduce((s, c) => s + (c.peso_carga || 0), 0), [ctesSelArr]);
  const veicTracInfo = useMemo(() => (veiculos || []).find(v => tracoes.length && String(v.placa || "").toUpperCase() === tracoes[0]), [veiculos, tracoes]);
  const fmtData = (iso: any) => { try { const d = new Date(String(iso)); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString("pt-BR"); } catch { return "—"; } };
  const nfsDe = (c: CteDoc): string[] => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); const xml = p.xml || ""; return [...xml.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m => m[1].slice(25, 34).replace(/^0+/, "") || "0"); } catch { return []; } };
  const formDe = (c: CteDoc): Record<string, any> => { try { const p = JSON.parse((c as any).xml_assinado || "{}"); return (p.form || {}) as Record<string, any>; } catch { return {}; } };
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
    if (!tracoes.length) { toast.error("CT-es sem veículo de tração"); return; }
    if (!motNomes.length) { toast.error("CT-es sem motorista"); return; }
    if (!percursoUFs.length) { toast.error("Selecione ao menos 1 UF no percurso"); return; }

    const veic = (veiculos || []).find(v => String(v.placa || "").toUpperCase() === tracoes[0]);
    const mot0 = motNomes[0];
    const mot = (motoristas || []).find(m => (mot0.id && m.id === mot0.id) || m.nome === mot0.nome);

    setLoading(true);
    try {
      const ctesArr = (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || ""));
      const numero = String(Math.floor(Math.random() * 999999) + 1).padStart(9, "0");
      const input = {
        empresaId, ambiente: "homologacao" as const, serie: "1", numero,
        ufCarregamento, ufDescarregamento,
        emit: { cnpj: "", ie: "", xNome: "", uf: ufCarregamento, cMun: "", xMun: "" },
        veicTrac: { placa: tracoes[0], uf: ufCarregamento, rntrc: (veic as any)?.rntrc || "", tara: 0 },
        reboques: reboques.slice(0, 3).map(p => ({ placa: p, uf: ufCarregamento, tara: 0 })),
        condutor: { cpf: mot?.cpf || "", xNome: mot0.nome },
        ctes: ctesArr.map(c => ({ chave: c.chave_acesso || "", valor: c.valor_servico || 0, pesoKG: c.peso_carga || 0 })),
        infMunCarrega: [{ cMunCarrega: "", xMunCarrega: "" }],
        infPercurso: percursoUFs.map(uf => ({ ufFim: uf })),
        valorTotalCarga: ctesArr.reduce((s, c) => s + (c.valor_servico || 0), 0),
        pesoTotalKG: ctesArr.reduce((s, c) => s + (c.peso_carga || 0), 0),
      };

      const { buildMdfXml } = await import("@/lib/sefaz-mdf");
      const { xml } = buildMdfXml(input);

      const res = await emitirMdfFn({
        data: {
          empresaId, xml, veiculoTracaoId: veic?.id, motoristaId: mot?.id,
          ufCarregamento, ufDescarregamento,
          qtdCtes: ctesArr.length, valorTotalCarga: input.valorTotalCarga, pesoTotal: input.pesoTotalKG,
          percursoUFs, observacoes, infoFisco,
        }
      });

      if (res.sucesso) toast.success("MDF-e emitido com sucesso!");
      else toast.error(`Erro: ${res.xMotivo}`);

      onOpenChange(false);
      setCtesSelecionadas(new Set()); setPercursoUFs(["SP"]); setObservacoes(""); setInfoFisco("");
      qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao emitir MDF-e"); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto">
        <DialogHeader><DialogTitle>Novo MDF-e</DialogTitle></DialogHeader>

        <div className="space-y-2">
          <div className="border rounded-md p-2">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-1">
              <div className="md:col-span-2"><Label className="text-xs">Empresa</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={(empresa as any)?.nome_fantasia || (empresa as any)?.razao_social || "—"} /></div>
              <div><Label className="text-xs">CNPJ</Label><Input className="h-6 text-[11px] font-mono bg-transparent" readOnly value={String((empresa as any)?.cnpj || "").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || "—"} /></div>
              <div><Label className="text-xs">Tipo MDF-e</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value="Normal" /></div>
              <div><Label className="text-xs">Data Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={new Date().toLocaleDateString("pt-BR")} /></div>
              <div><Label className="text-xs">Situação</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value="Novo" /></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-1">
              <div><Label className="text-xs">UF Carregamento</Label>
                <Select value={ufCarregamento} onValueChange={setUfCarregamento}>
                  <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">UF Descarregamento</Label>
                <Select value={ufDescarregamento} onValueChange={setUfDescarregamento}>
                  <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{UFS.map(uf => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label className="text-xs">Local Emissão</Label><Input className="h-6 text-[11px] bg-transparent" readOnly value={[ (empresa as any)?.cidade, (empresa as any)?.uf ].filter(Boolean).join("/") || "—"} /></div>
            </div>
          </div>

          <div className="border rounded-md p-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
              <div><Label className="text-xs">Tração</Label><p className="font-mono text-xs">{tracoes[0] || "—"}{veicTracInfo?.renavam ? ` • RENAVAM ${veicTracInfo.renavam}` : ""}</p></div>
              <div><Label className="text-xs">Reboques</Label><p className="font-mono text-xs">{reboques.join(", ") || "—"}</p></div>
              <div><Label className="text-xs">CIOT</Label><p className="font-mono text-xs">{ciotMdf || "—"}</p></div>
              <div><Label className="text-xs">Tipo Frota</Label><p className="text-xs">{veicTracInfo ? `${veicTracInfo.marca_modelo || ""} / ${veicTracInfo.tipo || ""}`.trim() || "—" : "—"}</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-1">
              <div><Label className="text-xs">Seguradora</Label><p className="text-xs">{String((segMdf as any).seguradoraNome || "—")}</p></div>
              <div><Label className="text-xs">Apólice</Label><p className="font-mono text-xs">{String((segMdf as any).apolice || "—")}</p></div>
              <div><Label className="text-xs">Averbação</Label><p className="font-mono text-xs">{String((segMdf as any).averbacao || "—")}</p></div>
            </div>
            {!ctesSelecionadas.size && <p className="text-xs text-muted-foreground mt-1">Veículo, CIOT e seguro vêm dos CT-es vinculados abaixo.</p>}
          </div>

          <div className="border rounded-md p-2">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Conhecimentos ({ctesSelArr.length} vinculados)</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setCtesSelecionadas(new Set((ctesDisponiveis || []).map(c => c.chave_acesso || "").filter(Boolean)))}>Marcar</Button>
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setCtesSelecionadas(new Set())}>Limpar</Button>
              </div>
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
                    {ctesDisponiveis.map(c => {
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="border rounded-md p-2">
              <Label className="text-xs">Motoristas</Label>
              {motNomes.length ? motNomes.map(m => (<p key={m.nome} className="text-xs">{m.nome} <span className="text-muted-foreground">({cpfDe(m.id, m.nome) || "s/CPF"})</span></p>)) : (<p className="text-xs text-muted-foreground">—</p>)}
            </div>
            <div className="border rounded-md p-2">
              <Label className="text-xs">Percurso (UFs) *</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {UFS.map(uf => (
                  <label key={uf} className={"inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded border cursor-pointer " + (percursoUFs.includes(uf) ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted")}>
                    <input type="checkbox" checked={percursoUFs.includes(uf)} onChange={() => setPercursoUFs(prev => prev.includes(uf) ? prev.filter(x => x !== uf) : [...prev, uf])} className="h-3 w-3" /> {uf}
                  </label>
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
          <Button onClick={handleEmitir} disabled={loading || !ctesSelecionadas.size || !tracoes.length || !motNomes.length || !percursoUFs.length}>
            <Send className="mr-1 h-4 w-4" /> {loading ? "Emitindo..." : "Emitir MDF-e"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
