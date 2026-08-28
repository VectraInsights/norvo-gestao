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
import { CFOPS_CTE, MOD_FRETE_OPTIONS, RESPONSAVEL_CTE_OPTIONS } from "@/lib/cfops-transporte";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/erp/date-input";

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
  const [mercadorias, setMercadorias] = useState<Array<{ chave: string; nNF: string; serie: string; emit: string; emitCnpj: string; dest: string; destCnpj: string; valor: number; peso: number; data: string; tomador: string; tomadorCnpj: string; tomadorUF: string; tomadorCMun: string; tomadorXMun: string; modFrete: string }>>([]);
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
  const [form, setForm] = useState({ toma: "3", cnpjTomador: "", xNomeTomador: "", ufTomador: "MG", cMunTomador: "3106200", xMunTomador: "BELO HORIZONTE", cfop: "5353", vPrest: "1000.00", vCarga: "10000.00", peso: "5000", rntrc: "", cMunEnv: "3106200", xMunEnv: "BELO HORIZONTE", ufEnv: "MG", cMunIni: "3106200", xMunIni: "BELO HORIZONTE", ufIni: "MG", cMunFim: "3550308", xMunFim: "SAO PAULO", ufFim: "SP", dataEmissao: new Date().toISOString().slice(0,10) });

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
        novas.push({ chave: chaveNorm, nNF, serie, emit: emitXNome, emitCnpj, dest: destXNome, destCnpj, valor, peso, data: dhEmi.slice(0,10), tomador: tomadorNome, tomadorCnpj, tomadorUF, tomadorCMun, tomadorXMun, modFrete });
        // Preenche tomador com o primeiro (se ainda vazio) — usa tomador correto pelo modFrete
        if (added === 0 && mercadorias.length === 0 && !form.cnpjTomador) {
          const tomaByMod: Record<string,string> = { "0":"0", "1":"3", "2":"4", "3":"0", "4":"3", "9":"4" };
          const tomaIni = tomaByMod[modFrete] ?? "3";
          setForm(f => ({ ...f, toma: tomaIni, cnpjTomador: tomadorCnpj || f.cnpjTomador, xNomeTomador: tomadorNome || f.xNomeTomador, ufTomador: tomadorUF || f.ufTomador, cMunTomador: tomadorCMun || f.cMunTomador, xMunTomador: tomadorXMun || f.xMunTomador }));
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
        setOpen(true);
        localStorage.removeItem("prefill_cte_from_nfe");
      } catch {}
    } else if (search.fromNFe) {
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
                        <TableCell>{m.data || "—"}</TableCell>
                        <TableCell className="text-right">{brl(m.valor)}</TableCell>
                        <TableCell className="text-right">{m.peso.toFixed(2)}</TableCell>
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
                  const first = sel[0] as typeof sel[0] & { modFrete?: string; tomadorUF?: string; tomadorCMun?: string; tomadorXMun?: string };
                  const tomaByMod: Record<string,string> = { "0":"0", "1":"3", "2":"4", "3":"0", "4":"3", "9":"4" };
                  const tomaSel = (first as any).modFrete ? (tomaByMod[(first as any).modFrete] ?? "3") : "3";
                  setForm(f => ({ ...f, toma: tomaSel, cnpjTomador: (first as any).tomadorCnpj || first.destCnpj || f.cnpjTomador, xNomeTomador: (first as any).tomador || first.dest || f.xNomeTomador, ufTomador: (first as any).tomadorUF || f.ufTomador, cMunTomador: (first as any).tomadorCMun || f.cMunTomador, xMunTomador: (first as any).tomadorXMun || f.xMunTomador, vCarga: somaV.toFixed(2), peso: String(somaP), vPrest: (somaV*0.1).toFixed(2) }));
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

          <Tabs defaultValue="tomador" className="w-full">
            <TabsList className="w-full justify-start gap-0 bg-muted/50 rounded-t-md">
              <TabsTrigger value="tomador" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><UsersRound className="mr-1 h-3 w-3" />Remetente/Destinatário</TabsTrigger>
              <TabsTrigger value="docs" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="mr-1 h-3 w-3" />Doc Mercadorias</TabsTrigger>
              <TabsTrigger value="seguros" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><Truck className="mr-1 h-3 w-3" />Seguros/Veículos</TabsTrigger>
              <TabsTrigger value="taxas" className="rounded-t-md rounded-b-none text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="mr-1 h-3 w-3" />Taxas/Despesas Acessórias</TabsTrigger>
            </TabsList>

            {/* Header: Nº Conhecimento, Data, CFOP */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded-b-md rounded-tr-md p-3 bg-muted/20">
              <div><Label className="text-[10px] text-muted-foreground">N° Conhecimento</Label><Input className="h-7 text-xs font-mono" value="— aguardando emissão —" readOnly /></div>
              <div><Label className="text-[10px] text-muted-foreground">Data Emissão</Label><DateInput value={form.dataEmissao} onChange={v => setForm({...form, dataEmissao: v})} className="h-7 text-xs" /></div>
              <div>
                <Label className="text-[10px] text-muted-foreground">CFOP Saída</Label>
                <Select value={form.cfop} onValueChange={v => setForm({...form, cfop: v})}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CFOPS_CTE.map(cf => (
                      <SelectItem key={cf.codigo} value={cf.codigo}>{cf.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                          <TableCell>{m.data || "—"}</TableCell>
                          <TableCell className="text-right">{m.peso.toFixed(2)}</TableCell>
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
                    <div><Label className="text-[10px] text-muted-foreground">Seguradora</Label><Input className="h-7 text-xs" placeholder="Ex: CHUBB SEGUROS BRASIL" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Apólice</Label><Input className="h-7 text-xs" placeholder="Nº Apólice" /></div>
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
                    <div><Label className="text-[10px] text-muted-foreground">Nº Averbação</Label><Input className="h-7 text-xs" placeholder="Nº Averbação (opcional)" /></div>
                  </div>
                </Card>

                <Card className="p-3">
                  <h5 className="text-xs font-semibold mb-2">Dados do Veículo / Motorista</h5>
                  <div className="space-y-2">
                    <div><Label className="text-[10px] text-muted-foreground">Nome Motorista</Label><Input className="h-7 text-xs" placeholder="Nome completo" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">CIOT</Label><Input className="h-7 text-xs" placeholder="Nº CIOT" /></div>
                      <div><Label className="text-[10px] text-muted-foreground">% Agregados</Label><Input className="h-7 text-xs" placeholder="0.00" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Placa Veículo</Label><Input className="h-7 text-xs font-mono uppercase" placeholder="ABC-1234" maxLength={8} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Placa Reboque</Label><Input className="h-7 text-xs font-mono uppercase" placeholder="ABC-1234" maxLength={8} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">Semi Reboque 1</Label><Input className="h-7 text-xs font-mono uppercase" placeholder="ABC-1234" maxLength={8} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">Semi Reboque 2</Label><Input className="h-7 text-xs font-mono uppercase" placeholder="ABC-1234" maxLength={8} /></div>
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
                  <div><Label className="text-[10px] text-muted-foreground">Valor Serviço</Label><Input className="h-7 text-xs font-medium" value={form.vPrest} readOnly /></div>
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
          </Tabs>

          {/* Cálculos do Serviço — Rodapé */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border rounded p-3 bg-muted/20">
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Base Cálculo ICMS</p><p className="text-xs font-mono font-medium">{brl(Number(form.vCarga))}</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Valor Serviço</p><p className="text-xs font-mono font-medium text-primary">{brl(Number(form.vPrest))}</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Total Despesas</p><p className="text-xs font-mono">R$ 0,00</p></div>
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
