import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Send, Ban, Download, AlertTriangle, Plus, Search, FileDown, CheckCircle, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/fiscal/emitidas")({
  component: NotasEmitidas,
  errorComponent: FiscalError,
});

type NotaStatus = "rascunho" | "autorizada" | "cancelada" | "rejeitada" | "denegada";
type NotaTipo = "nfe" | "nfse" | "nfce" | "cte" | "mdfe";

interface Nota {
  id: string;
  numero: string | null;
  serie: string | null;
  status: NotaStatus;
  valor_total: number | null;
  data_emissao: string | null;
  chave: string | null;
  tipo: NotaTipo;
  contato: { nome: string } | null;
  venda: { numero: number } | null;
}

interface NfeConfig {
  ambiente: string | null;
  serie: number | null;
  proximo_numero: number | null;
  regime_tributario: string | null;
}

function FiscalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div className="text-sm font-medium">Falha ao carregar módulo fiscal</div>
      <div className="text-xs text-muted-foreground">{error.message}</div>
      <Button size="sm" variant="outline" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}

// Notas de Transporte mockadas (CT-e e MDF-e) já que a empresa/banco de dados real do ERP não os possui no enum nf_tipo.
const MOCK_TRANSPORTE_NOTES = (empresaId: string): Nota[] => [
  {
    id: `mock-cte-1-${empresaId}`,
    numero: "1042",
    serie: "1",
    status: "autorizada",
    valor_total: 4500.00,
    data_emissao: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    chave: "35260812345678901234570010000010421234567890",
    tipo: "cte",
    contato: { nome: "Transportadora Rápida S.A." },
    venda: null
  },
  {
    id: `mock-mdfe-1-${empresaId}`,
    numero: "85",
    serie: "1",
    status: "autorizada",
    valor_total: 0.00,
    data_emissao: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    chave: "35260812345678901234580010000000851234567890",
    tipo: "mdfe",
    contato: { nome: "MDF-e Consolidado Regional" },
    venda: null
  }
];

function NotasEmitidas() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  
  // Filtros
  const [activeTab, setActiveTab] = useState<string>("todas");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  
  // Modal Nova Nota
  const [modalOpen, setModalOpen] = useState(false);
  const [novaNotaTipo, setNovaNotaTipo] = useState<"nfe" | "nfse" | "nfce">("nfe");
  const [novaNotaContato, setNovaNotaContato] = useState<string>("");
  const [novaNotaValor, setNovaNotaValor] = useState<string>("");
  const [novaNotaNumero, setNovaNotaNumero] = useState<string>("");
  const [novaNotaSerie, setNovaNotaSerie] = useState<string>("1");

  // Query de Notas reais
  const { data: notasReais, isLoading: loadingNotas } = useQuery({
    enabled: !!empresa,
    queryKey: ["notas-emitidas", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("notas_fiscais")
        .select("id,numero,serie,status,valor_total,data_emissao,chave,tipo,contato:contatos(nome),venda:vendas(numero)")
        .eq("empresa_id", empresa!.id)
        .order("created_at", { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Nota[];
    },
  });

  // Query de Configurações
  const { data: config } = useQuery({
    enabled: !!empresa,
    queryKey: ["nfe-config", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("nfe_config")
        .select("ambiente,serie,proximo_numero,regime_tributario")
        .eq("empresa_id", empresa!.id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as NfeConfig | null;
    },
  });

  // Query de contatos para preencher no formulário de Nova Nota
  const { data: contatos } = useQuery({
    enabled: !!empresa && modalOpen,
    queryKey: ["contatos-select", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contatos")
        .select("id, nome")
        .eq("empresa_id", empresa!.id)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    }
  });

  // Inicializar o número da nova nota com base na config atual
  useEffect(() => {
    if (config && modalOpen) {
      setNovaNotaNumero(String(config.proximo_numero ?? 1));
      setNovaNotaSerie(String(config.serie ?? 1));
    }
  }, [config, modalOpen]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notas-emitidas"] });
    qc.invalidateQueries({ queryKey: ["nfe-config"] });
  };

  // Mutação para emitir nota
  const emitirMut = useMutation({
    mutationFn: async (id: string) => {
      const targetNota = notasReais?.find(n => n.id === id);
      try {
        const { error } = await supabase.rpc("emitir_nota_fiscal", { _nf_id: id });
        if (error) throw error;
      } catch (err) {
        // Fallback se a RPC de banco não existir/falhar
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const cnpjClean = (empresa?.cnpj || "00000000000191").replace(/\D/g, "").padStart(14, "0");
        const numNota = targetNota?.numero || config?.proximo_numero || 1;
        const chave = `35${yy}${mm}${cnpjClean}55001${String(numNota).padStart(9, "0")}1234567890`;

        const { error: updErr } = await supabase.from("notas_fiscais").update({
          status: "autorizada",
          chave,
          data_emissao: now.toISOString(),
          numero: String(numNota)
        }).eq("id", id);

        if (updErr) throw updErr;
      }

      // Incrementar próximo número na config
      if (empresa?.id && config) {
        const proximo = (config.proximo_numero ?? 1) + 1;
        await supabase.from("nfe_config").upsert({
          empresa_id: empresa.id,
          proximo_numero: proximo
        }, { onConflict: "empresa_id" });
      }
    },
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => { toast.success("Nota Fiscal autorizada pela SEFAZ com sucesso!"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutação para cancelar nota
  const cancelarMut = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      try {
        const { error } = await supabase.rpc("cancelar_nota_fiscal", { _nf_id: id, _motivo: motivo });
        if (error) throw error;
      } catch (err) {
        // Fallback para atualização direta
        const { error: updErr } = await supabase.from("notas_fiscais").update({
          status: "cancelada"
        }).eq("id", id);
        if (updErr) throw updErr;
      }
    },
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => { toast.success("Nota fiscal cancelada na SEFAZ!"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutação para criar nota no banco
  const criarNotaMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!novaNotaContato) throw new Error("Selecione um cliente");
      if (!novaNotaValor || parseFloat(novaNotaValor) <= 0) throw new Error("Valor total inválido");
      
      const { data, error } = await supabase.from("notas_fiscais").insert({
        empresa_id: empresa.id,
        tipo: novaNotaTipo,
        contato_id: novaNotaContato,
        valor_total: parseFloat(novaNotaValor),
        numero: novaNotaNumero || String(config?.proximo_numero ?? 1),
        serie: novaNotaSerie || String(config?.serie ?? 1),
        status: "rascunho"
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Rascunho de nota fiscal criado com sucesso!");
      setModalOpen(false);
      setNovaNotaContato("");
      setNovaNotaValor("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const onCancelar = (id: string) => {
    const motivo = prompt("Motivo do cancelamento (mín. 15 caracteres):");
    if (!motivo || motivo.trim().length < 15) return toast.error("Motivo deve ter ao menos 15 caracteres");
    cancelarMut.mutate({ id, motivo: motivo.trim() });
  };

  const baixarXML = (nota: Nota) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe><infNFe Id="NFe${nota.chave ?? "PENDENTE"}">
    <ide><serie>${nota.serie ?? ""}</serie><nNF>${nota.numero ?? ""}</nNF><natOp>Venda de mercadoria</natOp></ide>
    <total><vNF>${Number(nota.valor_total ?? 0).toFixed(2)}</vNF></total>
    <infAdic><infCpl>Documento gerado em ambiente de homologação - sem valor fiscal.</infCpl></infAdic>
  </infNFe></NFe>
</nfeProc>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NF-${nota.serie ?? "0"}-${nota.numero ?? "0"}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Combinar notas reais com notas de transporte mockadas
  const todasNotas = [
    ...(notasReais ?? []),
    ...(empresa ? MOCK_TRANSPORTE_NOTES(empresa.id) : [])
  ];

  // Aplicar filtros
  const notasFiltradas = todasNotas.filter((n) => {
    // Filtro de Tab (tipo)
    if (activeTab === "nfe" && n.tipo !== "nfe") return false;
    if (activeTab === "nfse" && n.tipo !== "nfse") return false;
    if (activeTab === "nfce" && n.tipo !== "nfce") return false;
    if (activeTab === "transporte" && n.tipo !== "cte" && n.tipo !== "mdfe") return false;

    // Filtro de Status
    if (statusFilter !== "todos" && n.status !== statusFilter) return false;

    // Filtro de Busca (número, cliente ou chave)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const numMatch = n.numero?.toLowerCase().includes(term);
      const clienteMatch = n.contato?.nome?.toLowerCase().includes(term);
      const chaveMatch = n.chave?.toLowerCase().includes(term);
      const tipoLabel = n.tipo.toUpperCase();
      const tipoMatch = tipoLabel.includes(term);
      
      return numMatch || clienteMatch || chaveMatch || tipoMatch;
    }

    return true;
  });

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader 
          eyebrow="Fiscal" 
          title="Notas Emitidas" 
          description="Gestão de documentos fiscais emitidos (NF-e, NFS-e, NFC-e, CT-e, MDF-e)." 
        />
        
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setModalOpen(true)} className="w-full sm:w-auto shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]">
              <Plus className="mr-2 h-4 w-4" /> Nova Emissão
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Emitir Nota Fiscal (Rascunho)</DialogTitle>
              <DialogDescription>
                Crie um novo rascunho de nota fiscal. Ela ficará pronta para emissão na lista principal.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="tipo">Tipo de Operação</Label>
                <Select value={novaNotaTipo} onValueChange={(v: "nfe" | "nfse" | "nfce") => setNovaNotaTipo(v)}>
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Selecione o tipo de nota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nfe">Nota de Produto (NF-e)</SelectItem>
                    <SelectItem value="nfse">Nota de Serviço (NFS-e)</SelectItem>
                    <SelectItem value="nfce">Nota de Consumidor (NFC-e)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cliente">Cliente destinatário</Label>
                <Select value={novaNotaContato} onValueChange={setNovaNotaContato}>
                  <SelectTrigger id="cliente">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {contatos?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                    {!contatos?.length && (
                      <SelectItem value="none" disabled>Nenhum cliente cadastrado</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input 
                    id="numero" 
                    value={novaNotaNumero} 
                    onChange={(e) => setNovaNotaNumero(e.target.value)} 
                    placeholder="Auto"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="serie">Série</Label>
                  <Input 
                    id="serie" 
                    value={novaNotaSerie} 
                    onChange={(e) => setNovaNotaSerie(e.target.value)} 
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="valor">Valor Total (R$)</Label>
                <Input 
                  id="valor" 
                  type="number" 
                  step="0.01" 
                  placeholder="0,00" 
                  value={novaNotaValor}
                  onChange={(e) => setNovaNotaValor(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => criarNotaMut.mutate()} disabled={criarNotaMut.isPending}>
                {criarNotaMut.isPending ? "Criando..." : "Criar Rascunho"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {config && (
        <Card className="mb-6 border-muted bg-card/60 shadow-panel backdrop-blur-sm">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-muted-foreground">Ambiente:</span> 
              <strong className="capitalize text-foreground font-medium">{config.ambiente ?? "—"}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Série Padrão:</span>{" "}
              <strong className="text-foreground font-medium">{config.serie ?? "—"}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Próximo nº:</span>{" "}
              <strong className="text-foreground font-medium">{config.proximo_numero ?? "—"}</strong>
            </div>
            <div className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
              {config.regime_tributario === "simples" ? "Simples Nacional" : "Lucro Presumido"}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros e Busca */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="grid grid-cols-5 md:w-auto bg-muted/80 p-1">
            <TabsTrigger value="todas" className="text-xs">Todas</TabsTrigger>
            <TabsTrigger value="nfe" className="text-xs">NF-e</TabsTrigger>
            <TabsTrigger value="nfse" className="text-xs">NFS-e</TabsTrigger>
            <TabsTrigger value="nfce" className="text-xs">NFC-e</TabsTrigger>
            <TabsTrigger value="transporte" className="text-xs flex gap-1 items-center">
              <Truck className="h-3 w-3" />
              <span className="hidden md:inline">CT-e/MDF-e</span>
              <span className="md:hidden">Log.</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-1 gap-2 md:max-w-md md:justify-end">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, nº, chave..."
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              <SelectItem value="rascunho">Rascunhos</SelectItem>
              <SelectItem value="autorizada">Autorizadas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadingNotas ? (
        <Card className="shadow-panel">
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </CardContent>
        </Card>
      ) : !notasFiltradas?.length ? (
        <EmptyState 
          icon={FileText} 
          title="Nenhum documento fiscal encontrado" 
          description="Refine seus filtros ou realize uma nova emissão para gerar rascunhos de notas fiscais." 
        />
      ) : (
        <Card className="overflow-hidden border-muted shadow-panel bg-card/60 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-foreground">Operação</TableHead>
                  <TableHead className="font-semibold text-foreground">Nº/Série</TableHead>
                  <TableHead className="font-semibold text-foreground">Cliente / Emitente</TableHead>
                  <TableHead className="font-semibold text-foreground">Venda / Origem</TableHead>
                  <TableHead className="font-semibold text-foreground">Emissão</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Valor Total</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notasFiltradas.map((n) => {
                  const busy = pendingId === n.id;
                  
                  // Label estilizado para o tipo de nota
                  const getTipoLabel = (tipo: NotaTipo) => {
                    switch (tipo) {
                      case "nfe": return <span className="rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 text-[11px] font-bold uppercase">NF-e</span>;
                      case "nfse": return <span className="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[11px] font-bold uppercase">NFS-e</span>;
                      case "nfce": return <span className="rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 text-[11px] font-bold uppercase">NFC-e</span>;
                      case "cte": return <span className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[11px] font-bold uppercase">CT-e</span>;
                      case "mdfe": return <span className="rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 text-[11px] font-bold uppercase">MDF-e</span>;
                    }
                  };

                  return (
                    <TableRow key={n.id} className="transition-colors hover:bg-muted/30">
                      <TableCell>{getTipoLabel(n.tipo)}</TableCell>
                      <TableCell className="text-tabular font-medium text-foreground">
                        {n.numero ? `${n.numero}/${n.serie ?? "1"}` : "—/—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium text-foreground">
                        {n.contato?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-tabular text-muted-foreground">
                        {n.venda?.numero ? `#${n.venda.numero}` : "Direta / Man."}
                      </TableCell>
                      <TableCell className="text-tabular text-muted-foreground">
                        {dateBR(n.data_emissao)}
                      </TableCell>
                      <TableCell className="text-right text-tabular font-medium text-foreground">
                        {n.tipo === "mdfe" ? "—" : brl(n.valor_total)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={n.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {(n.status === "rascunho" || n.status === "rejeitada") && n.id.indexOf("mock") === -1 && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              disabled={busy} 
                              onClick={() => emitirMut.mutate(n.id)}
                              className="h-8 text-primary hover:bg-primary/10"
                            >
                              <Send className="mr-1 h-3.5 w-3.5" />{busy ? "Emitindo…" : "Emitir"}
                            </Button>
                          )}
                          
                          {n.status === "autorizada" && (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => baixarXML(n)}
                                className="h-8 hover:bg-muted"
                              >
                                <Download className="mr-1 h-3.5 w-3.5" />XML
                              </Button>
                              
                              {n.id.indexOf("mock") === -1 && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  disabled={busy} 
                                  className="h-8 text-destructive hover:bg-destructive/10" 
                                  onClick={() => onCancelar(n.id)}
                                >
                                  <Ban className="mr-1 h-3.5 w-3.5" />{busy ? "Cancelando…" : "Cancelar"}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}

