import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from "recharts";
import { 
  BarChart3, FileSpreadsheet, Download, Calendar, 
  ArrowUpRight, Landmark, FileText, Ban 
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/fiscal/relatorios")({
  component: RelatoriosFiscais,
});

// Mock dados para gráficos
const DADOS_FATURAMENTO_MENSAL = [
  { mes: "Mar/26", nfe: 32000, nfse: 12000, nfce: 5400 },
  { mes: "Abr/26", nfe: 38000, nfse: 15400, nfce: 6200 },
  { mes: "Mai/26", nfe: 45000, nfse: 14200, nfce: 7100 },
  { mes: "Jun/26", nfe: 42000, nfse: 18000, nfce: 5900 },
  { mes: "Jul/26", nfe: 51200, nfse: 19500, nfce: 8300 },
  { mes: "Ago/26", nfe: 56700, nfse: 21300, nfce: 9500 }
];

const DADOS_IMPOSTOS = [
  { name: "ICMS (Produto)", value: 6804.00, color: "#0ea5e9" },
  { name: "ISS (Serviço)", value: 1065.00, color: "#f59e0b" },
  { name: "PIS/COFINS", value: 3270.50, color: "#8b5cf6" },
  { name: "CSLL / IRPJ Retido", value: 1680.00, color: "#ec4899" }
];

const DADOS_RESUMO_TABELA = [
  { tipo: "Notas de Produto (NF-e)", quantidade: 48, faturamento: 56700.00, impostos: 10074.50 },
  { tipo: "Notas de Serviço (NFS-e)", quantidade: 14, faturamento: 21300.00, impostos: 2745.00 },
  { tipo: "Notas do Consumidor (NFC-e)", quantidade: 124, faturamento: 9500.00, impostos: 0.00 },
  { tipo: "Conhecimento de Transporte (CT-e)", quantidade: 2, faturamento: 4500.00, impostos: 360.00 }
];

function RelatoriosFiscais() {
  const [periodo, setPeriodo] = useState("08-2026");

  // Exportar para Excel usando XLSX real!
  const handleExportExcel = () => {
    // 1. Criar dados estruturados para a planilha
    const faturamentoData = DADOS_FATURAMENTO_MENSAL.map(d => ({
      Mês: d.mes,
      "Faturamento NF-e (Produto)": d.nfe,
      "Faturamento NFS-e (Serviço)": d.nfse,
      "Faturamento NFC-e (Consumidor)": d.nfce,
      "Faturamento Total": d.nfe + d.nfse + d.nfce
    }));

    const impostosData = DADOS_IMPOSTOS.map(i => ({
      Imposto: i.name,
      "Valor Retido / Declarado": i.value
    }));

    const resumoGeral = DADOS_RESUMO_TABELA.map(r => ({
      "Tipo de Operação": r.tipo,
      "Quantidade Emitida": r.quantidade,
      "Faturamento Bruto": r.faturamento,
      "Total Impostos Estimados": r.impostos
    }));

    // 2. Criar workbook e sheets
    const workbook = XLSX.utils.book_new();
    
    const wsResumo = XLSX.utils.json_to_sheet(resumoGeral);
    const wsMensal = XLSX.utils.json_to_sheet(faturamentoData);
    const wsImpostos = XLSX.utils.json_to_sheet(impostosData);

    XLSX.utils.book_append_sheet(workbook, wsResumo, "Resumo Fiscal");
    XLSX.utils.book_append_sheet(workbook, wsMensal, "Histórico Faturamento");
    XLSX.utils.book_append_sheet(workbook, wsImpostos, "Tributação");

    // 3. Salvar arquivo
    XLSX.writeFile(workbook, `Relatorio_Fiscal_${periodo}.xlsx`);
    toast.success("Relatório fiscal Excel gerado e baixado com sucesso!");
  };

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader 
          eyebrow="Fiscal" 
          title="Relatórios Fiscais" 
          description="Acompanhe o faturamento fiscal mensal da sua empresa, impostos declarados e notas fiscais emitidas." 
        />
        
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[160px] bg-card">
              <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="08-2026">Agosto / 2026</SelectItem>
              <SelectItem value="07-2026">Julho / 2026</SelectItem>
              <SelectItem value="06-2026">Junho / 2026</SelectItem>
              <SelectItem value="05-2026">Maio / 2026</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleExportExcel} variant="outline" className="shadow-sm">
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar XLS
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Faturamento Fiscal</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{brl(92000.00)}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Faturamento bruto declarado em notas emitidas
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Tributos Estimados</CardTitle>
            <Landmark className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{brl(12820.00)}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Total de impostos declarados e retidos (alíquota média ~13.9%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Notas Autorizadas</CardTitle>
            <FileText className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">188</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Documentos autorizados com sucesso na SEFAZ
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Canceladas / Inutilizadas</CardTitle>
            <Ban className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">3</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Notas fiscais canceladas ou números inutilizados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader>
            <CardTitle>Histórico de Faturamento Fiscal</CardTitle>
            <CardDescription>Evolução mensal do faturamento bruto por tipo de operação (últimos 6 meses).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DADOS_FATURAMENTO_MENSAL} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `R$ ${v / 1000}k`} />
                  <Tooltip 
                    formatter={(v: number) => brl(v)}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                  />
                  <Legend verticalAlign="top" height={36} iconSize={12} iconType="rect" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="nfe" name="Produto (NF-e)" fill="#0ea5e9" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="nfse" name="Serviço (NFS-e)" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="nfce" name="Consumidor (NFC-e)" fill="#8b5cf6" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
          <CardHeader>
            <CardTitle>Distribuição de Impostos</CardTitle>
            <CardDescription>Resumo dos principais impostos declarados e retidos no mês.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-60 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={DADOS_IMPOSTOS}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {DADOS_IMPOSTOS.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(v: number) => brl(v)}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="w-full space-y-2 mt-4">
              {DADOS_IMPOSTOS.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="text-muted-foreground">{item.name}</span>
                  </div>
                  <strong className="text-foreground font-semibold">{brl(item.value)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Detalhada */}
      <Card className="mt-6 border-muted bg-card/60 backdrop-blur-sm shadow-panel overflow-hidden">
        <CardHeader className="border-b border-muted">
          <CardTitle>Faturamento Fiscal Detalhado por Tipo de Emissão</CardTitle>
          <CardDescription>Resumo consolidade das operações no período selecionado.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="font-semibold text-foreground">Tipo de Documento Fiscal</TableHead>
                <TableHead className="text-center font-semibold text-foreground">Quantidade Emitida</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Faturamento Declarado</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Impostos Estimados / Retidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DADOS_RESUMO_TABELA.map((r, i) => (
                <TableRow key={i} className="transition-colors hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">{r.tipo}</TableCell>
                  <TableCell className="text-center text-tabular font-medium text-foreground">{r.quantidade}</TableCell>
                  <TableCell className="text-right text-tabular font-medium text-foreground">{brl(r.faturamento)}</TableCell>
                  <TableCell className="text-right text-tabular font-medium text-sky-600 dark:text-sky-400">
                    {r.impostos > 0 ? brl(r.impostos) : "Isento / Simples"}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-bold border-t-2 border-muted hover:bg-muted/40">
                <TableCell className="text-foreground">Total Consolidado</TableCell>
                <TableCell className="text-center text-tabular text-foreground">
                  {DADOS_RESUMO_TABELA.reduce((sum, r) => sum + r.quantidade, 0)}
                </TableCell>
                <TableCell className="text-right text-tabular text-foreground">
                  {brl(DADOS_RESUMO_TABELA.reduce((sum, r) => sum + r.faturamento, 0))}
                </TableCell>
                <TableCell className="text-right text-tabular text-sky-600 dark:text-sky-400">
                  {brl(DADOS_RESUMO_TABELA.reduce((sum, r) => sum + r.impostos, 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
