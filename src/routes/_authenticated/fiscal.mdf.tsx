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
import { useState } from "react";
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

type CteDoc = { id: string; numero: string | null; chave_acesso: string | null; status: string; valor_servico: number | null; peso_carga: number | null; cfop: string | null };

function MdfPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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

      <DialogNovoMdf open={open} onOpenChange={setOpen} empresaId={empresa?.id || ""} />
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

function DialogNovoMdf({ open, onOpenChange, empresaId }: { open: boolean; onOpenChange: (v: boolean) => void; empresaId: string }) {
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

  const { data: ctesDisponiveis } = useQuery({
    enabled: !!empresaId && open,
    queryKey: ["ctes-para-mdf", empresaId],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any)
        .select("id,numero,chave_acesso,status,valor_servico,peso_carga,cfop")
        .eq("empresa_id", empresaId)
        .eq("status", "autorizado")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CteDoc[];
    },
  });

  const [ctesSelecionadas, setCtesSelecionadas] = useState<Set<string>>(new Set());
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
    if (!veicTracId) { toast.error("Selecione o veículo de tração"); return }
    if (!motoristaId) { toast.error("Selecione o motorista"); return }

    const veic = veiculos?.find(v => v.id === veicTracId);
    const mot = motoristas?.find(m => m.id === motoristaId);
    if (!veic || !mot) return;

    setLoading(true);
    try {
      const ctesArr = (ctesDisponiveis || []).filter(c => ctesSelecionadas.has(c.chave_acesso || ""));
      const numero = String(Math.floor(Math.random() * 999999) + 1).padStart(9, "0");
      const input = {
        empresaId, ambiente: "homologacao" as const, serie: "1", numero,
        ufCarregamento, ufDescarregamento,
        emit: { cnpj: "", ie: "", xNome: "", uf: ufCarregamento, cMun: "", xMun: "" },
        veicTrac: { placa: veic.placa, uf: ufCarregamento, rntrc: veic.rntrc || "", tara: 0 },
        condutor: { cpf: mot.cpf || "", xNome: mot.nome },
        ctes: ctesArr.map(c => ({ chave: c.chave_acesso || "", valor: c.valor_servico || 0, pesoKG: c.peso_carga || 0 })),
        infMunCarrega: [{ cMunCarrega: "", xMunCarrega: "" }],
        valorTotalCarga: ctesArr.reduce((s, c) => s + (c.valor_servico || 0), 0),
        pesoTotalKG: ctesArr.reduce((s, c) => s + (c.peso_carga || 0), 0),
      };

      const { buildMdfXml } = await import("@/lib/sefaz-mdf");
      const { xml } = buildMdfXml(input);

      const res = await emitirMdfFn({
        data: {
          empresaId, xml, veiculoTracaoId: veicTracId, motoristaId,
          ufCarregamento, ufDescarregamento,
          qtdCtes: ctesArr.length, valorTotalCarga: input.valorTotalCarga, pesoTotal: input.pesoTotalKG,
        }
      });

      if (res.sucesso) toast.success("MDF-e emitido com sucesso!");
      else toast.error(`Erro: ${res.xMotivo}`);

      onOpenChange(false);
      setCtesSelecionadas(new Set()); setVeicTracId(""); setMotoristaId("");
      qc.invalidateQueries({ queryKey: ["mdf-documentos"] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro ao emitir MDF-e"); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo MDF-e</DialogTitle></DialogHeader>

        <Tabs defaultValue="ctes" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ctes">CT-e Vinculados</TabsTrigger>
            <TabsTrigger value="veiculo">Veículo/Motorista</TabsTrigger>
            <TabsTrigger value="rota">Rota</TabsTrigger>
          </TabsList>

          <TabsContent value="ctes" className="space-y-3">
            <p className="text-xs text-muted-foreground">Selecione os CT-e autorizados para incluir no manifesto.</p>
            {!ctesDisponiveis?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum CT-e autorizado disponível.</p>
            ) : (
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Nº</TableHead><TableHead>Chave</TableHead><TableHead>Valor</TableHead><TableHead>Peso</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {ctesDisponiveis.map(c => (
                      <TableRow key={c.id} className={ctesSelecionadas.has(c.chave_acesso || "") ? "bg-muted/50" : ""}>
                        <TableCell><input type="checkbox" checked={ctesSelecionadas.has(c.chave_acesso || "")} onChange={() => toggleCte(c.chave_acesso || "")} className="h-4 w-4" /></TableCell>
                        <TableCell className="font-mono">{c.numero ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]">{c.chave_acesso ?? "—"}</TableCell>
                        <TableCell>{c.valor_servico ? brl(c.valor_servico) : "—"}</TableCell>
                        <TableCell>{c.peso_carga ? `${num(c.peso_carga)} kg` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{ctesSelecionadas.size} CT-e selecionado(s)</p>
          </TabsContent>

          <TabsContent value="veiculo" className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Veículo de Tração *</Label>
              <Select value={veicTracId} onValueChange={setVeicTracId}>
                <SelectTrigger><SelectValue placeholder="Selecione o veículo..." /></SelectTrigger>
                <SelectContent>
                  {veiculos?.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} — {v.marca_modelo} ({v.tipo}){v.rntrc ? ` [RNTRC: ${v.rntrc}]` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motorista *</Label>
              <Select value={motoristaId} onValueChange={setMotoristaId}>
                <SelectTrigger><SelectValue placeholder="Selecione o motorista..." /></SelectTrigger>
                <SelectContent>
                  {motoristas?.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome} ({m.cpf || "s/CPF"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="rota" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">UF Carregamento</Label>
                <Select value={ufCarregamento} onValueChange={setUfCarregamento}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">UF Descarregamento</Label>
                <Select value={ufDescarregamento} onValueChange={setUfDescarregamento}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações do manifesto..." rows={2} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleEmitir} disabled={loading || !ctesSelecionadas.size || !veicTracId || !motoristaId}>
            <Send className="mr-1 h-4 w-4" /> {loading ? "Emitindo..." : "Emitir MDF-e"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
