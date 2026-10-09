import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Handshake, Mail, Download, Archive, Check, 
  Send, Calendar, AlertCircle, RefreshCw, FileText
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiscal/contador")({
  component: PainelContador,
});

interface LogEnvio {
  id: string;
  data: string;
  periodo: string;
  destinatario: string;
  tamanho: string;
  documentos: string[];
  status: "enviado" | "baixado";
}

const HISTORICO_INICIAL: LogEnvio[] = [
  {
    id: "log-1",
    data: new Date(2026, 7, 2, 9, 30).toISOString(),
    periodo: "Julho / 2026",
    destinatario: "contabilidade@norvoassociados.com.br",
    tamanho: "3.4 MB",
    documentos: ["NF-e (42)", "NFS-e (12)", "XMLs Entrada (18)"],
    status: "enviado"
  },
  {
    id: "log-2",
    data: new Date(2026, 6, 3, 14, 15).toISOString(),
    periodo: "Junho / 2026",
    destinatario: "contabilidade@norvoassociados.com.br",
    tamanho: "2.9 MB",
    documentos: ["NF-e (38)", "NFS-e (15)", "XMLs Entrada (14)"],
    status: "enviado"
  },
  {
    id: "log-3",
    data: new Date(2026, 5, 5, 16, 45).toISOString(),
    periodo: "Maio / 2026",
    destinatario: "Apenas Exportação Local",
    tamanho: "4.1 MB",
    documentos: ["NF-e (45)", "NFS-e (14)", "NFC-e (124)"],
    status: "baixado"
  }
];

function PainelContador() {
  const [periodo, setPeriodo] = useState("08-2026");
  const [emailContador, setEmailContador] = useState("contabilidade@norvoassociados.com.br");
  const [mensagem, setMensagem] = useState("Olá, segue em anexo o pacote com os arquivos XML das notas emitidas, recebidas e os relatórios fiscais consolidados do mês.");
  const [assunto, setAssunto] = useState("Fechamento Fiscal Norvo - Período 08/2026");

  // Checkboxes de Documentos
  const [exportNfe, setExportNfe] = useState(true);
  const [exportNfse, setExportNfse] = useState(true);
  const [exportNfce, setExportNfce] = useState(false);
  const [exportEntradas, setExportEntradas] = useState(true);
  const [exportRelatorios, setExportRelatorios] = useState(true);

  // States de Ações
  const [historico, setHistorico] = useState<LogEnvio[]>(HISTORICO_INICIAL);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const getPeriodoLabel = (val: string) => {
    switch (val) {
      case "08-2026": return "Agosto / 2026";
      case "07-2026": return "Julho / 2026";
      case "06-2026": return "Junho / 2026";
      default: return val;
    }
  };

  // Simular geração do ZIP
  const handleBaixarZip = () => {
    if (!exportNfe && !exportNfse && !exportNfce && !exportEntradas && !exportRelatorios) {
      return toast.error("Selecione ao menos um tipo de documento para exportar.");
    }
    
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      
      // Simula download de arquivo zip
      const blob = new Blob(["conteudo do zip fiscal de homologacao"], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fechamento_fiscal_${periodo}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      // Salvar no histórico
      const novoLog: LogEnvio = {
        id: `log-${Date.now()}`,
        data: new Date().toISOString(),
        periodo: getPeriodoLabel(periodo),
        destinatario: "Exportação Local (Baixado)",
        tamanho: "1.8 MB",
        documentos: [
          exportNfe ? "NF-e (56)" : "",
          exportNfse ? "NFS-e (21)" : "",
          exportNfce ? "NFC-e (95)" : "",
          exportEntradas ? "XMLs Entrada (12)" : "",
          exportRelatorios ? "Relatórios" : ""
        ].filter(Boolean),
        status: "baixado"
      };

      setHistorico(prev => [novoLog, ...prev]);
      toast.success("Arquivo ZIP de fechamento fiscal gerado e baixado com sucesso!");
    }, 1500);
  };

  // Simular envio de e-mail
  const handleEnviarEmail = () => {
    if (!emailContador.trim()) {
      return toast.error("Por favor, digite o e-mail do contador.");
    }
    if (!exportNfe && !exportNfse && !exportNfce && !exportEntradas && !exportRelatorios) {
      return toast.error("Selecione ao menos um tipo de documento para enviar.");
    }

    setSending(true);
    setTimeout(() => {
      setSending(false);

      // Salvar no histórico
      const novoLog: LogEnvio = {
        id: `log-${Date.now()}`,
        data: new Date().toISOString(),
        periodo: getPeriodoLabel(periodo),
        destinatario: emailContador,
        tamanho: "3.9 MB",
        documentos: [
          exportNfe ? "NF-e (56)" : "",
          exportNfse ? "NFS-e (21)" : "",
          exportNfce ? "NFC-e (95)" : "",
          exportEntradas ? "XMLs Entrada (12)" : "",
          exportRelatorios ? "Relatórios" : ""
        ].filter(Boolean),
        status: "enviado"
      };

      setHistorico(prev => [novoLog, ...prev]);
      toast.success(`E-mail com o pacote fiscal enviado com sucesso para ${emailContador}!`);
    }, 2000);
  };

  return (
    <>
      <PageHeader 
        eyebrow="Gestão Fiscal" 
        title="Painel do Contador" 
        description="Facilite o trabalho da sua contabilidade exportando XMLs e relatórios de forma organizada." 
      />

      <div className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-3 lg:gap-5">
        {/* Painel de Configuração de Exportação */}
        <Card className="rounded-2xl lg:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold tracking-tight">Configuração do Fechamento Fiscal</CardTitle>
            <CardDescription className="leading-relaxed">Selecione o período e os documentos fiscais que farão parte do pacote de exportação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="periodo">Período de Referência</Label>
                <Select value={periodo} onValueChange={(v) => {
                  setPeriodo(v);
                  setAssunto(`Fechamento Fiscal Norvo - Período ${v.replace("-", "/")}`);
                }}>
                  <SelectTrigger id="periodo" className="h-10 rounded-xl bg-background shadow-sm">
                    <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="08-2026">Agosto / 2026 (Período Atual)</SelectItem>
                    <SelectItem value="07-2026">Julho / 2026</SelectItem>
                    <SelectItem value="06-2026">Junho / 2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Checklist de Documentos */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">Documentos a Incluir no Pacote</Label>
              <div className="grid gap-1 rounded-2xl border border-border bg-background/50 p-3 sm:p-4">
                <div className="flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-accent/40">
                  <Checkbox 
                    id="nfe" 
                    checked={exportNfe} 
                    onCheckedChange={(checked) => setExportNfe(!!checked)} 
                  />
                  <Label htmlFor="nfe" className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                    <span>Notas Fiscais de Produto Emitidas (NF-e)</span>
                    <span className="text-xs font-normal text-muted-foreground">Inclui XML e PDF das notas de venda e compra de mercadoria</span>
                  </Label>
                </div>
                
                <div className="flex items-center gap-3 rounded-lg border-t px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <Checkbox 
                    id="nfse" 
                    checked={exportNfse} 
                    onCheckedChange={(checked) => setExportNfse(!!checked)} 
                  />
                  <Label htmlFor="nfse" className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                    <span>Notas Fiscais de Serviço Emitidas (NFS-e)</span>
                    <span className="text-xs font-normal text-muted-foreground">Inclui os arquivos de serviços prestados e tomados</span>
                  </Label>
                </div>

                <div className="flex items-center gap-3 rounded-lg border-t px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <Checkbox 
                    id="nfce" 
                    checked={exportNfce} 
                    onCheckedChange={(checked) => setExportNfce(!!checked)} 
                  />
                  <Label htmlFor="nfce" className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                    <span>Notas Fiscais de Consumidor (NFC-e / SAT)</span>
                    <span className="text-xs font-normal text-muted-foreground">Cupons fiscais emitidos em frente de caixa</span>
                  </Label>
                </div>

                <div className="flex items-center gap-3 rounded-lg border-t px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <Checkbox 
                    id="entradas" 
                    checked={exportEntradas} 
                    onCheckedChange={(checked) => setExportEntradas(!!checked)} 
                  />
                  <Label htmlFor="entradas" className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                    <span>XMLs de Entrada (Notas de Compra)</span>
                    <span className="text-xs font-normal text-muted-foreground">Documentos emitidos por fornecedores contra sua empresa</span>
                  </Label>
                </div>

                <div className="flex items-center gap-3 rounded-lg border-t px-2 py-2.5 transition-colors hover:bg-accent/40">
                  <Checkbox 
                    id="relatorios" 
                    checked={exportRelatorios} 
                    onCheckedChange={(checked) => setExportRelatorios(!!checked)} 
                  />
                  <Label htmlFor="relatorios" className="text-xs sm:text-sm font-medium leading-none cursor-pointer flex flex-col gap-1">
                    <span>Relatório de Faturamento Consolidado</span>
                    <span className="text-xs font-normal text-muted-foreground">Planilhas com totais de faturamento e impostos retidos</span>
                  </Label>
                </div>
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="flex justify-end gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleBaixarZip}
                disabled={downloading}
                className="h-10 w-full rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md sm:w-auto"
              >
                {downloading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Compactando...
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 h-4 w-4" />
                    Exportar ZIP Local
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Envio direto para o contador */}
        <Card className="rounded-2xl border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold tracking-tight">Envio para o Contador</CardTitle>
            <CardDescription className="leading-relaxed">Encaminhe o link do pacote compactado diretamente por e-mail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-mail do Contador</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  value={emailContador}
                  onChange={(e) => setEmailContador(e.target.value)}
                 
                  className="h-10 rounded-xl pl-10"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="assunto">Assunto</Label>
              <Input 
                id="assunto" 
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea 
                id="mensagem" 
                rows={4}
                className="resize-none rounded-xl leading-relaxed text-xs"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-primary/10 bg-primary/5 p-3.5 text-xs leading-relaxed text-primary shadow-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>O contador receberá um e-mail com acesso seguro para baixar o pacote de XMLs e relatórios.</span>
            </div>

            <Button 
              onClick={handleEnviarEmail} 
              disabled={sending}
              className="h-11 w-full rounded-xl text-base shadow-md transition-all hover:-translate-y-px hover:shadow-lg"
            >
              {sending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Enviando Fechamento...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Fechamento
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Fechamentos Fiscais */}
      <Card className="mt-6 rounded-2xl sm:mt-8 border-muted bg-card/60 backdrop-blur-sm shadow-panel overflow-hidden">
        <CardHeader className="border-b border-muted pb-4">
          <CardTitle className="tracking-tight">Histórico de Fechamentos e Exportações Fiscais</CardTitle>
          <CardDescription className="leading-relaxed">Acompanhe o registro de tudo que foi gerado e enviado para a sua contabilidade.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Data/Hora</TableHead>
                <TableHead className="font-semibold text-foreground">Período Fiscal</TableHead>
                <TableHead className="font-semibold text-foreground">Destino / Canal</TableHead>
                <TableHead className="font-semibold text-foreground">Documentos Incluídos</TableHead>
                <TableHead className="font-semibold text-foreground">Tamanho</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((log) => {
                const getStatusBadge = (status: typeof log.status) => {
                  return status === "enviado" ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Check className="mr-1 h-3 w-3" /> Enviado
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <Download className="mr-1 h-3 w-3" /> Exportado Local
                    </span>
                  );
                };

                return (
                  <TableRow key={log.id} className="transition-colors hover:bg-accent/30">
                    <TableCell className="text-tabular text-muted-foreground">{dateBR(log.data)}</TableCell>
                    <TableCell className="font-semibold text-foreground">{log.periodo}</TableCell>
                    <TableCell className="font-medium text-foreground truncate max-w-[200px]">
                      {log.destinatario}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {log.documentos.map((doc, idx) => (
                          <span key={idx} className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground font-medium">
                            {doc}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-tabular text-muted-foreground">{log.tamanho}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-accent" onClick={() => toast.success("Iniciando download do pacote histórico...")}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
