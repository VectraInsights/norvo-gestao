import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, FileText, Search, Ban, UploadCloud, FileCode, UsersRound, MapPin, Package, DollarSign, Building2, Route as RouteIcon } from "lucide-react";
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
  const [nfeFile, setNfeFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
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

  const handleImportNFeXml = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xml")) { toast.error("Apenas XML"); return; }
    setIsParsing(true);
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");
      const destCnpj = doc.querySelector("dest > CNPJ")?.textContent || doc.querySelector("dest > CPF")?.textContent || "";
      const destXNome = doc.querySelector("dest > xNome")?.textContent || "";
      const destUF = doc.querySelector("dest > enderDest > UF")?.textContent || "";
      const destCMun = doc.querySelector("dest > enderDest > cMun")?.textContent || "";
      const destXMun = doc.querySelector("dest > enderDest > xMun")?.textContent || "";
      const vNF = doc.querySelector("total > ICMSTot > vNF")?.textContent || doc.querySelector("vNF")?.textContent || "0";
      const pesoB = doc.querySelector("transp > vol > pesoB")?.textContent || doc.querySelector("vol > pesoB")?.textContent || "";
      const nNF = doc.querySelector("ide > nNF")?.textContent || "";
      const chave = doc.querySelector("infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") || doc.querySelector("chNFe")?.textContent || "";
      const peso = pesoB ? parseFloat(pesoB) : 1000;
      const vCarga = parseFloat(vNF) || 0;
      setForm(f => ({
        ...f,
        cnpjTomador: destCnpj || f.cnpjTomador,
        xNomeTomador: destXNome || f.xNomeTomador,
        ufTomador: destUF || f.ufTomador,
        cMunTomador: destCMun || f.cMunTomador,
        xMunTomador: destXMun || f.xMunTomador,
        vCarga: vCarga ? vCarga.toFixed(2) : f.vCarga,
        peso: peso ? String(peso) : f.peso,
        vPrest: vCarga ? (vCarga * 0.1).toFixed(2) : f.vPrest,
      }));
      setPrefillBanner(chave ? `NF-e ${nNF} (${chave.slice(0,12)}...) carregada` : `NF-e ${nNF} carregada`);
      setOpen(true);
      toast.success(`XML NF-e ${nNF} importado — dados da carga preenchidos`);
    } catch (e: any) {
      toast.error("Falha ao ler XML", { description: e.message });
    } finally {
      setIsParsing(false);
      setNfeFile(null);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("prefill_cte_from_nfe");
    if (raw) {
      try {
        const p = JSON.parse(raw);
        setForm(f => ({
          ...f,
          cnpjTomador: p.destCnpj || f.cnpjTomador,
          xNomeTomador: p.destXNome || f.xNomeTomador,
          ufTomador: p.destUF || f.ufTomador,
          cMunTomador: p.destCMun || f.cMunTomador,
          xMunTomador: p.destXMun || f.xMunTomador,
          vCarga: p.vCarga ? String(p.vCarga) : f.vCarga,
          peso: p.peso ? String(p.peso) : f.peso,
          vPrest: p.vCarga ? (Number(p.vCarga) * 0.1).toFixed(2) : f.vPrest,
        }));
        setPrefillBanner(p.nNF ? `NF-e ${p.nNF} → CT-e (carga R$ ${Number(p.vCarga||0).toLocaleString("pt-BR",{minimumFractionDigits:2})})` : `NF-e ${p.fromNFe?.slice(0,12)}... → CT-e`);
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
      const ret: any = await emitirCteFn({ data: { empresaId: empresa.id, input: {
        toma: form.toma, cnpjTomador: form.cnpjTomador, xNomeTomador: form.xNomeTomador, ufTomador: form.ufTomador, cMunTomador: form.cMunTomador, xMunTomador: form.xMunTomador,
        cfop: form.cfop, vPrest: parseFloat(form.vPrest)||0, vCarga: parseFloat(form.vCarga)||0, pesoKg: parseFloat(form.peso)||0, rntrc: form.rntrc,
        cMunEnv: form.cMunEnv, xMunEnv: form.xMunEnv, ufEnv: form.ufEnv, cMunIni: form.cMunIni, xMunIni: form.xMunIni, ufIni: form.ufIni, cMunFim: form.cMunFim, xMunFim: form.xMunFim, ufFim: form.ufFim,
        serie: "1",
        tomador: { toma: form.toma as any, cnpj: form.cnpjTomador, xNome: form.xNomeTomador, uf: form.ufTomador, cMun: form.cMunTomador, xMun: form.xMunTomador },
        emit: { xNome: form.xNomeTomador, ie: "ISENTO", cMun: form.cMunEnv, xMun: form.xMunEnv } as any,
      } } });
      return ret;
    },
    onSuccess: (ret: any) => {
      if (ret.sucesso) { toast.success(`CT-e ${ret.chave} autorizado` + (ret.protocolo ? ` prot ${ret.protocolo}` : "")); setOpen(false); }
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
    <div className="p-6 space-y-6">
      <PageHeader eyebrow="Fiscal" title="CT-e" description="Conhecimento de Transporte Eletrônico (57) — fase 2: emissão, consulta e cancelamento. Reaproveita seu certificado A1." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo CT-e</Button>} />
      {prefillBanner && (
        <Card className="p-3 bg-sky-500/10 border-sky-500/30 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-sky-600" /> {prefillBanner} — dados da NF-e pré-preenchidos. Confira e emita.</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setPrefillBanner(null)}>×</Button>
        </Card>
      )}
      <Card className="p-4 bg-emerald-500/10 border-emerald-500/30 text-sm">
        <strong>Fase 2 — CT-e ativo:</strong> builder 4.00 (<code>sefaz-cte.ts</code>), assinatura <code>infCte</code>, SOAP mTLS SVRS. Em homologação teste com RNTRC fictício; em produção a SEFAZ valida IE/RNTRC e CFOP.
      </Card>
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2"><FileCode className="h-4 w-4" /> Importar NF-e (XML) para CT-e</h4>
            <p className="text-xs text-muted-foreground">Selecione o XML da NF-e que será a carga — preenche tomador, valores e peso automaticamente.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="file" accept=".xml" className="w-[260px]" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportNFeXml(f); e.currentTarget.value = ""; }} />
            {isParsing && <span className="text-xs text-muted-foreground">Lendo...</span>}
          </div>
        </div>
      </Card>
      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : !docs?.length ? (
        <EmptyState icon={Truck} title="Nenhum CT-e" description="Clique em Novo CT-e para emitir. O CT-e ficará vinculado à viagem (quando informada) e ao financeiro." />
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
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Novo CT-e (57) — 4.00</DialogTitle>
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
                  <p className="text-xs text-muted-foreground">CFOP, RNTRC e valores declarados</p>
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
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
            <Button onClick={()=>emitir.mutate()} disabled={emitir.isPending || !form.cnpjTomador || !form.xNomeTomador}>
              {emitir.isPending ? "Emitindo..." : "Emitir CT-e"}
            </Button>
          </DialogFooter>
          <p className="text-xs text-muted-foreground text-center">Chave gerada automaticamente (cUF + AAMM + CNPJ + mod 57 + série + nCT + cCT + DV). O XML será assinado com seu certificado A1 via mTLS.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
