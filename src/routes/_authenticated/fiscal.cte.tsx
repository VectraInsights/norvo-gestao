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
import { Truck, Plus, FileText, Search, Ban, UploadCloud, FileCode, UsersRound, MapPin, Package, DollarSign, Building2, Route as RouteIcon, Trash2, Filter, Calendar, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl } from "@/lib/format";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { emitirCteFn, consultarCteFn, cancelarCteFn } from "@/lib/sefaz-cte-server";

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
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [mercadorias, setMercadorias] = useState<Array<{ chave: string; nNF: string; serie: string; emit: string; emitCnpj: string; dest: string; destCnpj: string; valor: number; peso: number; data: string; tomador: string; tomadorCnpj: string }>>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [filtroEmpresa] = useState("ROSE TRANSPORTES");
  const [filtroRemetente, setFiltroRemetente] = useState("TODOS REMETENTES");
  const [filtroDestinatario, setFiltroDestinatario] = useState("TODOS OS DESTINATÁRIOS");

  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-documentos", empresa?.id],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any).select("id,numero,serie,status,valor_servico,chave_acesso,created_at,motivo_rejeicao,protocolo_sefaz").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CteDoc[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ toma: "3", cnpjTomador: "", xNomeTomador: "", ufTomador: "MG", cMunTomador: "3106200", xMunTomador: "BELO HORIZONTE", cfop: "5353", vPrest: "1000.00", vCarga: "10000.00", peso: "5000", rntrc: "", cMunEnv: "3106200", xMunEnv: "BELO HORIZONTE", ufEnv: "MG", cMunIni: "3106200", xMunIni: "BELO HORIZONTE", ufIni: "MG", cMunFim: "3550308", xMunFim: "SAO PAULO", ufFim: "SP" });

  const handleImportNFeXml = async (files: FileList | File[]) => {
    const list = Array.from(files as any as File[]);
    const xmls = list.filter(f => f.name.toLowerCase().endsWith(".xml"));
    if (xmls.length === 0) { toast.error("Selecione XMLs de NF-e"); return; }
    setIsParsing(true);
    try {
      let added = 0;
      const novas: typeof mercadorias = [];
      for (const file of xmls) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const emitCnpj = doc.querySelector("emit > CNPJ")?.textContent || "";
        const emitXNome = doc.querySelector("emit > xNome")?.textContent || "";
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
        if (mercadorias.some(m => m.chave === chaveNorm) || novas.some(m => m.chave === chaveNorm)) continue;
        const peso = pesoB ? parseFloat(pesoB) : 1000;
        const valor = parseFloat(vNF) || 0;
        // Tomador conforme XML: modFrete define quem paga o frete (0=Remetente, 1=Destinatário, 2=Terceiros)
        const modFrete = doc.querySelector("transp > modFrete")?.textContent || "";
        let tomadorNome = destXNome;
        let tomadorCnpj = destCnpj;
        let tomadorUF = destUF;
        let tomadorCMun = destCMun;
        let tomadorXMun = destXMun;
        if (modFrete === "0") {
          tomadorNome = emitXNome; tomadorCnpj = emitCnpj;
          tomadorUF = doc.querySelector("emit > enderEmit > UF")?.textContent || "";
          tomadorCMun = doc.querySelector("emit > enderEmit > cMun")?.textContent || "";
          tomadorXMun = doc.querySelector("emit > enderEmit > xMun")?.textContent || "";
        } else if (modFrete === "2") {
          // Terceiros: tenta transporta
          const transpCnpj = doc.querySelector("transp > transporta > CNPJ")?.textContent || "";
          const transpXNome = doc.querySelector("transp > transporta > xNome")?.textContent || "";
          if (transpCnpj || transpXNome) { tomadorNome = transpXNome || tomadorNome; tomadorCnpj = transpCnpj || tomadorCnpj; }
        }
        novas.push({ chave: chaveNorm, nNF, serie, emit: emitXNome, emitCnpj, dest: destXNome, destCnpj, valor, peso, data: dhEmi.slice(0,10), tomador: tomadorNome, tomadorCnpj });
        // Preenche tomador com o primeiro (se ainda vazio)
        if (added === 0 && mercadorias.length === 0 && !form.cnpjTomador) {
          setForm(f => ({ ...f, cnpjTomador: destCnpj || f.cnpjTomador, xNomeTomador: destXNome || f.xNomeTomador, ufTomador: destUF || f.ufTomador, cMunTomador: destCMun || f.cMunTomador, xMunTomador: destXMun || f.xMunTomador }));
        }
        added++;
      }
      if (novas.length > 0) {
        const merged = [...mercadorias, ...novas];
        setMercadorias(merged);
        // Não seleciona automaticamente — usuário escolhe
        const somaV = merged.reduce((a, m) => a + (m.valor || 0), 0);
        const somaP = merged.reduce((a, m) => a + (m.peso || 0), 0);
        setForm(f => ({ ...f, vCarga: somaV.toFixed(2), peso: String(somaP), vPrest: (somaV * 0.1).toFixed(2) }));
        setPrefillBanner(`${novas.length} NF-e(s) importada(s) — ${merged.length} no total (selecione quais usar)`);
        toast.success(`${novas.length} XML(s) importado(s) — selecione os que irão no CT-e`);
      } else {
        toast.info("Nenhum XML novo (chaves já importadas)");
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
        setForm(f => ({ ...f, cnpjTomador: p.destCnpj || f.cnpjTomador, xNomeTomador: p.destXNome || f.xNomeTomador, ufTomador: p.destUF || f.ufTomador, cMunTomador: p.destCMun || f.cMunTomador, xMunTomador: p.destXMun || f.xMunTomador, vCarga: p.vCarga ? String(p.vCarga) : f.vCarga, peso: p.peso ? String(p.peso) : f.peso, vPrest: p.vCarga ? (Number(p.vCarga) * 0.1).toFixed(2) : f.vPrest }));
        setPrefillBanner(p.nNF ? `NF-e ${p.nNF} → CT-e` : `NF-e → CT-e`);
        setOpen(true);
        localStorage.removeItem("prefill_cte_from_nfe");
      } catch {}
    } else if (search.fromNFe) {
      setPrefillBanner(`NF-e ${search.fromNFe.slice(0,12)}... → CT-e`);
      setOpen(true);
    }
  }, [search.fromNFe]);

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
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador },
        emit: { xNome: form.xNomeTomador, ie: "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv } as any,
        chavesNFe: chaves,
      } } });
      return ret;
    },
    onSuccess: (ret: any) => {
      if (ret.sucesso) { toast.success(`CT-e ${ret.chave} autorizado` + (ret.protocolo ? ` prot ${ret.protocolo}` : "")); setOpen(false); setMercadorias([]); }
      else toast.error(ret.xMotivo || ret.motivo || "Rejeitado");
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
      {prefillBanner && (
        <Card className="p-3 bg-sky-500/10 border-sky-500/30 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-sky-600" /> {prefillBanner}</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setPrefillBanner(null)}>×</Button>
        </Card>
      )}

      {/* Cadastro de Mercadorias para Embarque — estilo STM */}
      <Card className="overflow-hidden border-2 border-primary/20 shadow-panel">
        <div className="bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> Cadastro de Mercadorias para Embarque</h3>
          <span className="text-xs opacity-80">CT-e Avulso • Sem Mercadoria/Percurso</span>
        </div>
        <CardContent className="p-3 space-y-3 bg-muted/20 overflow-visible">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 border rounded p-2 bg-background">
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
              <div className="flex items-center gap-2 mt-1">
                <Input type="date" className="h-7 text-xs" defaultValue="2026-08-21" />
                <span className="text-xs">Até</span>
                <Input type="date" className="h-7 text-xs" defaultValue="2026-08-28" />
                <Button size="sm" variant="outline" className="h-7 text-xs"><Calendar className="h-3 w-3 mr-1" />Consulta</Button>
              </div>
            </div>
            <div className="flex items-end">
              <div className="text-xs text-muted-foreground">Qtde NF-e: <span className="font-bold text-foreground">{mercadorias.length}</span> • Peso Bruto: <span className="font-bold">{mercadorias.reduce((a,m)=>a+m.peso,0).toFixed(2)} kg</span> • Valor: <span className="font-bold">{brl(mercadorias.reduce((a,m)=>a+m.valor,0))}</span></div>
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
                          if (e.target.checked) setSelecionadas(new Set(mercadorias.map(m => m.chave)));
                          else setSelecionadas(new Set());
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Remetente</TableHead>
                    <TableHead className="text-xs">Destinatário</TableHead>
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
                    <TableRow><TableCell colSpan={11} className="text-center text-xs text-muted-foreground py-8">Nenhuma NF-e importada. Use “Importar NFes (XML)” abaixo.</TableCell></TableRow>
                  ) : (
                    mercadorias.map((m) => (
                      <TableRow key={m.chave} className="text-xs" data-selected={selecionadas.has(m.chave)}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selecionadas.has(m.chave)}
                            onChange={e => {
                              const next = new Set(selecionadas);
                              if (e.target.checked) next.add(m.chave);
                              else next.delete(m.chave);
                              setSelecionadas(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-mono">18837</TableCell>
                        <TableCell className="truncate max-w-[130px]" title={m.emit}>{m.emit}</TableCell>
                        <TableCell className="truncate max-w-[130px]" title={m.dest}>{m.dest}</TableCell>
                        <TableCell className="truncate max-w-[130px] text-amber-700" title={m.tomador}>{m.tomador || "—"}</TableCell>
                        <TableCell className="font-mono">{m.nNF}</TableCell>
                        <TableCell>{m.serie}</TableCell>
                        <TableCell>{m.data || "—"}</TableCell>
                        <TableCell className="text-right">{brl(m.valor)}</TableCell>
                        <TableCell className="text-right">{m.peso.toFixed(2)}</TableCell>
                        <TableCell className="font-mono truncate max-w-[160px]" title={m.chave}>{m.chave.slice(0,22)}...</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Listagem de Mercadorias */}
          <div className="border rounded overflow-hidden bg-background">
            <div className="bg-amber-600 text-white px-2 py-1 text-xs font-semibold">Listagem de Mercadorias</div>
            <div className="overflow-x-auto max-h-[160px]">
              <Table>
                <TableHeader><TableRow><TableHead className="text-xs">Mercadoria Genérica</TableHead><TableHead className="text-xs">NCM</TableHead><TableHead className="text-xs">Qtde</TableHead><TableHead className="text-xs">Vlr Mercadoria</TableHead></TableRow></TableHeader>
                <TableBody>
                  {mercadorias.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">Aguardando NF-es</TableCell></TableRow>
                  ) : (
                    mercadorias.map(m => (
                      <TableRow key={m.chave} className="text-xs"><TableCell>CARGA GERAL</TableCell><TableCell>0000.00.00</TableCell><TableCell>{m.peso.toFixed(2)}</TableCell><TableCell className="text-right">{brl(m.valor)}</TableCell></TableRow>
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
            <Button variant="outline" size="sm" onClick={() => { setMercadorias([]); setSelecionadas(new Set()); }} disabled={mercadorias.length===0}><Trash2 className="mr-1 h-3 w-3" /> Limpar</Button>
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
                  const first = sel[0];
                  setForm(f => ({ ...f, cnpjTomador: first.destCnpj || f.cnpjTomador, xNomeTomador: first.dest || f.xNomeTomador, vCarga: somaV.toFixed(2), peso: String(somaP), vPrest: (somaV*0.1).toFixed(2) }));
                  setPrefillBanner(`${sel.length} NF-e(s) selecionada(s) • Destino: ${first.dest} • ${brl(somaV)}`);
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
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Novo CT-e (57) — 4.00 {mercadorias.length > 0 && <Badge variant="outline" className="ml-2">{mercadorias.length} NF-e(s)</Badge>}</DialogTitle>
            <p className="text-sm text-muted-foreground">Preencha os dados do transporte. O XML será assinado e enviado à SEFAZ via mTLS. Em homologação o RNTRC pode ser fictício.</p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tomador */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded bg-primary/10 grid place-items-center"><UsersRound className="h-4 w-4 text-primary" /></div>
                <div>
                  <h4 className="text-sm font-semibold">Tomador do serviço</h4>
                  <p className="text-xs text-muted-foreground">Quem contratou o frete (toma {form.toma} — 0 Remetente, 1 Expedidor, 2 Recebedor, 3 Destinatário, 4 Outros)</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label>Tomador CNPJ *</Label><Input value={form.cnpjTomador} onChange={e=>setForm({...form,cnpjTomador:e.target.value})} placeholder="00.000.000/0000-00" /></div>
                <div className="md:col-span-2"><Label>Nome / Razão social *</Label><Input value={form.xNomeTomador} onChange={e=>setForm({...form,xNomeTomador:e.target.value})} placeholder="Nome do tomador" /></div>
                <div><Label>UF</Label><Input value={form.ufTomador} onChange={e=>setForm({...form,ufTomador:e.target.value.toUpperCase()})} maxLength={2} placeholder="MG" /></div>
                <div><Label>cMun (IBGE)</Label><Input value={form.cMunTomador} onChange={e=>setForm({...form,cMunTomador:e.target.value})} placeholder="3106200" /></div>
                <div><Label>Município</Label><Input value={form.xMunTomador} onChange={e=>setForm({...form,xMunTomador:e.target.value})} placeholder="Belo Horizonte" /></div>
              </div>
            </Card>

            {/* Rota */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded bg-sky-500/10 grid place-items-center"><RouteIcon className="h-4 w-4 text-sky-600" /></div>
                <div>
                  <h4 className="text-sm font-semibold">Rota e origem/destino</h4>
                  <p className="text-xs text-muted-foreground">Municípios de carregamento, coleta e entrega</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label><MapPin className="mr-1 h-3 w-3 inline" />cMun Env</Label><Input value={form.cMunEnv} onChange={e=>setForm({...form,cMunEnv:e.target.value})} placeholder="3106200" /></div>
                <div><Label>xMun Env</Label><Input value={form.xMunEnv} onChange={e=>setForm({...form,xMunEnv:e.target.value})} /></div>
                <div><Label>UF Env</Label><Input value={form.ufEnv} onChange={e=>setForm({...form,ufEnv:e.target.value.toUpperCase()})} /></div>
                <div><Label>cMun Ini</Label><Input value={form.cMunIni} onChange={e=>setForm({...form,cMunIni:e.target.value})} /></div>
                <div><Label>xMun Ini</Label><Input value={form.xMunIni} onChange={e=>setForm({...form,xMunIni:e.target.value})} /></div>
                <div><Label>UF Ini</Label><Input value={form.ufIni} onChange={e=>setForm({...form,ufIni:e.target.value.toUpperCase()})} /></div>
                <div><Label>cMun Fim</Label><Input value={form.cMunFim} onChange={e=>setForm({...form,cMunFim:e.target.value})} /></div>
                <div><Label>xMun Fim</Label><Input value={form.xMunFim} onChange={e=>setForm({...form,xMunFim:e.target.value})} /></div>
                <div><Label>UF Fim</Label><Input value={form.ufFim} onChange={e=>setForm({...form,ufFim:e.target.value.toUpperCase()})} /></div>
              </div>
            </Card>

            {/* Carga e valores */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded bg-amber-500/10 grid place-items-center"><Package className="h-4 w-4 text-amber-600" /></div>
                <div>
                  <h4 className="text-sm font-semibold">Carga, valores e fiscal</h4>
                  <p className="text-xs text-muted-foreground">CFOP, RNTRC e valores declarados {mercadorias.length > 0 && `• ${mercadorias.length} NF-e(s) • ${brl(Number(form.vCarga))} • ${form.peso} kg`}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label><Building2 className="mr-1 h-3 w-3 inline" />CFOP</Label><Input value={form.cfop} onChange={e=>setForm({...form,cfop:e.target.value})} placeholder="5353" /></div>
                <div><Label>RNTRC (ANTT)</Label><Input value={form.rntrc} onChange={e=>setForm({...form,rntrc:e.target.value.replace(/\D/g,"").slice(0,8)})} placeholder="8 dígitos" /></div>
                <div className="flex items-end"><p className="text-xs text-muted-foreground">Homologação aceita RNTRC fictício. Produção valida ANTT.</p></div>
                <div><Label><DollarSign className="mr-1 h-3 w-3 inline" />Valor Serviço (R$)</Label><Input value={form.vPrest} onChange={e=>setForm({...form,vPrest:e.target.value})} placeholder="1000.00" /></div>
                <div><Label>Valor Carga (R$)</Label><Input value={form.vCarga} onChange={e=>setForm({...form,vCarga:e.target.value})} placeholder="10000.00" /></div>
                <div><Label>Peso (kg)</Label><Input value={form.peso} onChange={e=>setForm({...form,peso:e.target.value})} placeholder="5000" /></div>
              </div>
              {mercadorias.length > 0 && (
                <div className="mt-3 border rounded p-2 bg-muted/30 max-h-[120px] overflow-y-auto">
                  <p className="text-xs font-medium mb-1">NF-es vinculadas ({mercadorias.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {mercadorias.map(m => (
                      <Badge key={m.chave} variant="outline" className="text-[10px] font-mono">{m.nNF} • {m.chave.slice(-8)}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
            <Button onClick={()=>emitir.mutate()} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {emitir.isPending ? "Emitindo..." : `Emitir CT-e ${mercadorias.length > 0 ? `(${mercadorias.length} NF-e)` : ""}`}
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground text-center">Chave gerada automaticamente (cUF + AAMM + CNPJ + mod 57 + série + nCT + cCT + DV). O XML será assinado com seu certificado A1 via mTLS.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
