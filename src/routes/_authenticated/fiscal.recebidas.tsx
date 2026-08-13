import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileDown, Search, CheckCircle2, AlertCircle, XCircle, 
  UploadCloud, FileCode, Check, ArrowRight, RefreshCw, Archive
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiscal/recebidas")({
  component: NotasRecebidas,
});

interface NotaRecebida {
  chave: string;
  emitente: string;
  cnpj: string;
  valor: number;
  data_emissao: string;
  manifesto: "pendente" | "ciencia" | "confirmada" | "desconhecida";
  situacao_sefaz: "autorizada" | "cancelada";
}

const INITIAL_RECEBIDAS: NotaRecebida[] = [
  {
    chave: "35260845997418000109550010002041921827364501",
    emitente: "Distribuidora de Papéis e Embalagens Ltda",
    cnpj: "45.997.418/0001-09",
    valor: 1450.90,
    data_emissao: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    manifesto: "pendente",
    situacao_sefaz: "autorizada"
  },
  {
    chave: "35260812345678000199550010001847121098765432",
    emitente: "Tech Connect Importadora de Equipamentos",
    cnpj: "12.345.678/0001-99",
    valor: 8900.00,
    data_emissao: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    manifesto: "ciencia",
    situacao_sefaz: "autorizada"
  },
  {
    chave: "35260898765432000188550010000958171234567890",
    emitente: "Office Depot Soluções Corporativas",
    cnpj: "98.765.432/0001-88",
    valor: 345.15,
    data_emissao: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    manifesto: "confirmada",
    situacao_sefaz: "autorizada"
  },
  {
    chave: "35260811223344000177550010000041231876543210",
    emitente: "Serviços Logísticos Rapidez",
    cnpj: "11.223.344/0001-77",
    valor: 1200.00,
    data_emissao: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    manifesto: "desconhecida",
    situacao_sefaz: "cancelada"
  }
];

function NotasRecebidas() {
  const [activeTab, setActiveTab] = useState<string>("manifesto");
  
  // Manifestação Destinatário State
  const [notas, setNotas] = useState<NotaRecebida[]>(INITIAL_RECEBIDAS);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Importação XML State
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ name: string; size: number; parsed?: boolean }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<{
    produtos: { codigo: string; nome: string; qtd: number; un: string; valor: number }[];
    total: number;
    fornecedor: string;
    contasPagarId?: string;
  } | null>(null);

  // Ações de manifestação
  const handleManifestar = (chave: string, acao: "ciencia" | "confirmada" | "desconhecida") => {
    setNotas(prev => prev.map(n => n.chave === chave ? { ...n, manifesto: acao } : n));
    
    const acoesLabels = {
      ciencia: "Ciência da Emissão",
      confirmada: "Confirmação da Operação",
      desconhecida: "Desconhecimento da Operação"
    };

    toast.success(`Manifestação '${acoesLabels[acao]}' registrada com sucesso na SEFAZ!`);
  };

  const handleSincronizarSefaz = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Consulta à SEFAZ concluída! Nenhuma nova nota fiscal emitida contra o seu CNPJ.");
    }, 1500);
  };

  // Importação XML actions
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragging(true);
    } else if (e.type === "dragleave") {
      setDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesList = Array.from(e.dataTransfer.files).map(f => ({
        name: f.name,
        size: f.size
      }));
      setSelectedFiles(filesList);
      toast.success(`${filesList.length} arquivos selecionados para importação.`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesList = Array.from(e.target.files).map(f => ({
        name: f.name,
        size: f.size
      }));
      setSelectedFiles(filesList);
      toast.success(`${filesList.length} arquivos selecionados.`);
    }
  };

  const handleProcessarImportacao = () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      // Simula a leitura e parsing do XML do fornecedor
      setImportResults({
        fornecedor: "Tech Connect Importadora de Equipamentos Ltda",
        total: 1980.00,
        produtos: [
          { codigo: "PROD00521", nome: "Teclado Mecânico RGB Wireless", qtd: 5, un: "UN", valor: 150.00 },
          { codigo: "PROD00522", nome: "Mouse Gamer Sensor Óptico 16K", qtd: 5, un: "UN", valor: 110.00 },
          { codigo: "PROD00523", nome: "Monitor 24 polegadas IPS 144Hz", qtd: 2, un: "UN", valor: 340.00 }
        ]
      });

      toast.success("XMLs importados com sucesso!");
    }, 1800);
  };

  const handleConfirmarEstoqueFinanceiro = () => {
    toast.success("Concluído: 12 itens adicionados ao estoque e parcela única no contas a pagar de R$ 1.980,00 gerada!");
    setSelectedFiles([]);
    setImportResults(null);
  };

  // Filtrar manifestações
  const filteredNotas = notas.filter(n => 
    n.emitente.toLowerCase().includes(search.toLowerCase()) || 
    n.chave.includes(search) || 
    n.cnpj.includes(search)
  );

  return (
    <>
      <PageHeader 
        eyebrow="Fiscal" 
        title="Notas Recebidas" 
        description="Consulte notas de compras emitidas contra sua empresa (SEFAZ) e faça a importação de arquivos XML." 
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/80 p-1 w-full max-w-[400px]">
          <TabsTrigger value="manifesto" className="flex-1 text-xs sm:text-sm">Manifestação Destinatário</TabsTrigger>
          <TabsTrigger value="xml" className="flex-1 text-xs sm:text-sm">Importação de XML</TabsTrigger>
        </TabsList>

        <TabsContent value="manifesto" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por emitente, CNPJ ou chave..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <Button 
              variant="outline" 
              onClick={handleSincronizarSefaz}
              disabled={isRefreshing}
              className="w-full sm:w-auto h-9"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sincronizar SEFAZ
            </Button>
          </div>

          <Card className="overflow-hidden border-muted shadow-panel bg-card/60 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground">Emitente</TableHead>
                    <TableHead className="font-semibold text-foreground">Chave de Acesso</TableHead>
                    <TableHead className="font-semibold text-foreground">Emissão</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Valor</TableHead>
                    <TableHead className="font-semibold text-foreground">Situação SEFAZ</TableHead>
                    <TableHead className="font-semibold text-foreground">Manifesto</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNotas.map((n) => {
                    const getManifestoBadge = (status: typeof n.manifesto) => {
                      switch (status) {
                        case "pendente":
                          return <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">Pendente</span>;
                        case "ciencia":
                          return <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Ciência Registrada</span>;
                        case "confirmada":
                          return <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Operação Confirmada</span>;
                        case "desconhecida":
                          return <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Desconhecida</span>;
                      }
                    };

                    const getSefazBadge = (status: typeof n.situacao_sefaz) => {
                      return status === "autorizada" ? (
                        <span className="inline-flex items-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="mr-1 h-3 w-3" /> Autorizada
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-medium text-muted-foreground line-through">
                          <XCircle className="mr-1 h-3 w-3 text-destructive" /> Cancelada
                        </span>
                      );
                    };

                    return (
                      <TableRow key={n.chave} className="transition-colors hover:bg-muted/30">
                        <TableCell className="max-w-[220px]">
                          <div className="font-medium text-foreground truncate">{n.emitente}</div>
                          <div className="text-xs text-muted-foreground">{n.cnpj}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {n.chave}
                        </TableCell>
                        <TableCell className="text-tabular text-muted-foreground">{dateBR(n.data_emissao)}</TableCell>
                        <TableCell className="text-right text-tabular font-medium text-foreground">{brl(n.valor)}</TableCell>
                        <TableCell>{getSefazBadge(n.situacao_sefaz)}</TableCell>
                        <TableCell>{getManifestoBadge(n.manifesto)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {n.manifesto === "pendente" && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                                onClick={() => handleManifestar(n.chave, "ciencia")}
                              >
                                Dar Ciência
                              </Button>
                            )}
                            {n.manifesto === "ciencia" && (
                              <>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  onClick={() => handleManifestar(n.chave, "confirmada")}
                                >
                                  Confirmar
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleManifestar(n.chave, "desconhecida")}
                                >
                                  Desconhecer
                                </Button>
                              </>
                            )}
                            {n.manifesto !== "pendente" && n.manifesto !== "ciencia" && (
                              <span className="text-xs text-muted-foreground px-3 py-1">SEFAZ Notificada</span>
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
        </TabsContent>

        <TabsContent value="xml" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle>Área de Upload</CardTitle>
                <CardDescription>
                  Arraste os arquivos XML de seus fornecedores ou clique para selecionar. Você pode importar múltiplos arquivos de uma só vez.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center transition-colors ${
                    dragging ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                  }`}
                >
                  <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium text-foreground text-center">
                    Arraste os arquivos XML aqui ou
                  </p>
                  <label className="mt-2 cursor-pointer">
                    <span className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
                      Selecionar Arquivos
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".xml"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">Apenas arquivos no formato .xml</p>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">Arquivos Selecionados:</h4>
                    <div className="max-h-[160px] overflow-y-auto border rounded-md p-2 divide-y divide-border bg-background/50">
                      {selectedFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2 text-xs">
                          <div className="flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium truncate max-w-[260px]">{file.name}</span>
                          </div>
                          <span className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleProcessarImportacao} 
                        disabled={isProcessing}
                        className="w-full sm:w-auto"
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Lendo XMLs...
                          </>
                        ) : (
                          <>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Processar XMLs
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Como funciona?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <div>
                  <h5 className="font-medium text-foreground mb-1">1. Leitura de Dados</h5>
                  <p className="text-xs">O sistema lê o XML, identifica o fornecedor, produtos e valores fiscais de tributos.</p>
                </div>
                <div>
                  <h5 className="font-medium text-foreground mb-1">2. Entrada no Estoque</h5>
                  <p className="text-xs">Se os produtos já estiverem cadastrados, o saldo de estoque é atualizado. Se não, o sistema sugere o pré-cadastro.</p>
                </div>
                <div>
                  <h5 className="font-medium text-foreground mb-1">3. Lançamento no Financeiro</h5>
                  <p className="text-xs">Uma conta a pagar é gerada automaticamente no financeiro com base nas duplicatas de cobrança do XML.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {importResults && (
            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
              <CardHeader className="bg-muted/30">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Resultado da Análise do XML</CardTitle>
                    <CardDescription className="text-foreground/80 mt-1">
                      Fornecedor: <strong className="font-semibold">{importResults.fornecedor}</strong>
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Valor Total do XML</span>
                    <div className="text-xl font-bold text-foreground">{brl(importResults.total)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Itens do XML mapeados para o estoque:</h4>
                  <div className="border rounded-md overflow-hidden bg-background/50">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Ref XML</TableHead>
                          <TableHead>Produto Mapeado</TableHead>
                          <TableHead className="text-center">Qtd</TableHead>
                          <TableHead className="text-center">UN</TableHead>
                          <TableHead className="text-right">Unitário</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResults.produtos.map((p) => (
                          <TableRow key={p.codigo} className="text-xs">
                            <TableCell className="font-mono text-muted-foreground">{p.codigo}</TableCell>
                            <TableCell className="font-medium text-foreground">{p.nome}</TableCell>
                            <TableCell className="text-center text-tabular">{p.qtd}</TableCell>
                            <TableCell className="text-center">{p.un}</TableCell>
                            <TableCell className="text-right text-tabular">{brl(p.valor)}</TableCell>
                            <TableCell className="text-right text-tabular font-medium text-foreground">{brl(p.qtd * p.valor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Estoque Pronto</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Os 3 produtos identificados já foram vinculados. 12 itens totais serão somados ao estoque atual.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
                    <Archive className="h-5 w-5 text-sky-500 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Financeiro Programado</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Será gerado 1 título a pagar para o fornecedor no valor de R$ 1.980,00 com vencimento em 30 dias.</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setImportResults(null)}>Cancelar</Button>
                  <Button onClick={handleConfirmarEstoqueFinanceiro} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Confirmar Entrada no Estoque & Financeiro
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
