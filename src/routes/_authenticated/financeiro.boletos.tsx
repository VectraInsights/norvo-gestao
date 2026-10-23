import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { PrimaryButton } from "@/components/erp/primary-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Check, FileText, Download, Search, Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALTURA_PAGINA } from "@/lib/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  gerarBoletoFn,
  baixarBoletoFn,
  processarRetornoCnabFn,
} from "@/lib/boleto-server";
import { DateInput } from "@/components/erp/date-input";
import { SearchField } from "@/components/erp/search-field";
import { StatusBadge } from "@/components/erp/status-badge";

export const Route = createFileRoute("/_authenticated/financeiro/boletos")({
  component: BoletosPage,
  errorComponent: () => <div>Erro ao carregar página de boletos</div>,
});

type Boleto = {
  id: string;
  nosso_numero: string;
  linha_digitavel: string;
  codigo_barras: string;
  url_pdf: string | null;
  valor: number;
  vencimento: string;
  status: string;
  id_transacao_banco: string | null;
  data_pagamento: string | null;
  valor_pago: number | null;
  observacoes: string | null;
  created_at: string;
  lancamento_id: string | null;
  cte_id: string | null;
  banco: string;
};

const emptyForm = () => ({
  lancamentoId: "",
  cteId: "",
  valor: "",
  vencimento: format(new Date(), "yyyy-MM-dd"),
  sacadoNome: "",
  sacadoDocumento: "",
  sacadoLogradouro: "",
  sacadoNumero: "",
  sacadoBairro: "",
  sacadoCidade: "",
  sacadoUf: "",
  sacadoCep: "",
  numeroDocumento: "",
  descricao: "",
});

export function BoletosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [processarOpen, setProcessarOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["boletos"] });
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
  };

  const { data: boletos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["boletos", empresa?.id],
    queryFn: async ({ signal }): Promise<Boleto[]> => {
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("boletos")
          .select("*")
          .eq("empresa_id", empresa!.id)
          .order("created_at", { ascending: false })
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as unknown as Boleto[];
    },
  });

  const { data: lancamentosOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["lancamentos-opt-boleto", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("id,descricao,valor,data_vencimento,status")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", "receber")
        .eq("status", "aberto")
        .order("descricao")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const gerarBoleto = useMutation({
    mutationFn: gerarBoletoFn,
    onSuccess: () => {
      toast.success("Boleto gerado com sucesso");
      setOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Erro ao gerar boleto: " + (err?.message || err));
    },
  });

  const baixarBoleto = useMutation({
    mutationFn: baixarBoletoFn,
    onSuccess: () => {
      toast.success("Boleto baixado");
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Erro ao baixar boleto: " + (err?.message || err));
    },
  });

  const processarRetorno = useMutation({
    mutationFn: processarRetornoCnabFn,
    onSuccess: (res: any) => {
      toast.success(`Retorno processado: ${res.processados} boleto(s)`);
      setProcessarOpen(false);
      setArquivoBase64("");
      setNomeArquivo("");
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Erro ao processar retorno: " + (err?.message || err));
    },
  });

  const statusLabel = (s: string) => {
    switch (s) {
      case "pendente": return "Pendente";
      case "pago": return "Pago";
      case "cancelado": return "Cancelado";
      case "vencido": return "Vencido";
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "pago": return "default";
      case "vencido": return "destructive";
      case "pendente": return "warning";
      default: return "secondary";
    }
  };

  if (!empresa) return <div>Selecione uma empresa</div>;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Financeiro"
        title="Boletos"
        description="Emissão e controle de boletos bancários (Itaú / Sicoob)"
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <PrimaryButton
            onClick={() => setOpen(true)}
            disabled={gerarBoleto.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Gerar boleto
          </PrimaryButton>
          <Button
            onClick={() => setProcessarOpen(true)}
            variant="outline"
            disabled={processarRetorno.isPending}
          >
            <FileText className="mr-1 h-4 w-4" /> Processar retorno CNAB
          </Button>
        </div>
        <SearchField
          value=""
          onChange={() => {}}
          placeholder="Buscar boleto…"
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : boletos && boletos.length === 0 ? (
        <EmptyState
          title="Nenhum boleto encontrado"
          description="Gere o primeiro boleto vinculado a um lançamento a receber ou CT-e."
          action={<PrimaryButton onClick={() => setOpen(true)}>Gerar boleto</PrimaryButton>}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Nosso número</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-[120px]">Vencimento</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[200px]">Linha digitável</TableHead>
                <TableHead className="w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boletos.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono font-medium">{b.nosso_numero}</TableCell>
                  <TableCell>R$ {Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>{format(new Date(b.vencimento), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusColor(b.status)}>{statusLabel(b.status)}</StatusBadge>
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[200px]">
                    {b.linha_digitavel}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {b.status === "pendente" && (
                        <Button
                          size="sm"
                          onClick={() => baixarBoleto.mutate({ boletoId: b.id, empresaId: empresa.id })}
                          disabled={baixarBoleto.isPending}
                        >
                          <Check className="mr-1 h-3 w-3" /> Baixar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (b.codigo_barras) navigator.clipboard.writeText(b.codigo_barras);
                          toast("Código de barras copiado");
                        }}
                      >
                        <Download className="mr-1 h-3 w-3" /> Copiar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Gerar boleto</DialogTitle>
            <Description>
              Vincule a um lançamento a receber existente ou crie um novo boleto avulso.
            </Description>
          </DialogHeader>
          <div className="grid gap-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Lançamento a receber</Label>
                <Select
                  value={form.lancamentoId}
                  onValueChange={(v) => setForm({ ...form, lancamentoId: v })}
                >
                  <SelectTrigger className="h-7">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum (boleto avulso)</SelectItem>
                    {lancamentosOpt?.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.descricao} — R$ {Number(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Valor *</Label>
                <Input
                  type="number"
                  className="h-7 text-xs text-left"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Vencimento *</Label>
              <DateInput
                value={form.vencimento}
                onChange={(v) => setForm({ ...form, vencimento: v })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Nº documento (CT-e / fatura)</Label>
              <Input
                className="h-7 text-xs text-left font-mono uppercase"
                value={form.numeroDocumento}
                onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Descrição</Label>
              <Textarea
                className="h-24 text-xs text-left"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wide">Sacado</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Nome *</Label>
                  <Input
                    className="h-6 text-xs text-left"
                    value={form.sacadoNome}
                    onChange={(e) => setForm({ ...form, sacadoNome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">CPF / CNPJ *</Label>
                  <Input
                    className="h-6 text-xs text-left font-mono"
                    value={form.sacadoDocumento}
                    onChange={(e) =>
                      setForm({ ...form, sacadoDocumento: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Logradouro *</Label>
                  <Input
                    className="h-6 text-xs text-left"
                    value={form.sacadoLogradouro}
                    onChange={(e) => setForm({ ...form, sacadoLogradouro: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Nº *</Label>
                  <Input
                    className="h-6 text-xs text-left"
                    value={form.sacadoNumero}
                    onChange={(e) => setForm({ ...form, sacadoNumero: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Bairro *</Label>
                  <Input
                    className="h-6 text-xs text-left"
                    value={form.sacadoBairro}
                    onChange={(e) => setForm({ ...form, sacadoBairro: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">Cidade *</Label>
                  <Input
                    className="h-6 text-xs text-left"
                    value={form.sacadoCidade}
                    onChange={(e) => setForm({ ...form, sacadoCidade: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">UF *</Label>
                  <Input
                    className="h-6 text-xs text-left uppercase"
                    value={form.sacadoUf}
                    onChange={(e) => setForm({ ...form, sacadoUf: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] text-muted-foreground">CEP *</Label>
                  <Input
                    className="h-6 text-xs text-left font-mono"
                    value={form.sacadoCep}
                    onChange={(e) =>
                      setForm({ ...form, sacadoCep: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!form.valor || Number(form.valor) <= 0) {
                  toast.error("Informe o valor");
                  return;
                }
                gerarBoleto.mutate({
                  empresaId: empresa.id,
                  lancamentoId: form.lancamentoId || undefined,
                  cteId: form.cteId || undefined,
                  valor: Number(form.valor),
                  vencimento: form.vencimento,
                  sacadoNome: form.sacadoNome,
                  sacadoDocumento: form.sacadoDocumento,
                  sacadoLogradouro: form.sacadoLogradouro,
                  sacadoNumero: form.sacadoNumero,
                  sacadoBairro: form.sacadoBairro,
                  sacadoCidade: form.sacadoCidade,
                  sacadoUf: form.sacadoUf,
                  sacadoCep: form.sacadoCep,
                  numeroDocumento: form.numeroDocumento,
                  descricao: form.descricao,
                });
              }}
              disabled={gerarBoleto.isPending}
            >
              {gerarBoleto.isPending ? "Gerando…" : "Gerar boleto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={processarOpen} onOpenChange={setProcessarOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Processar retorno CNAB</DialogTitle>
            <Description>
              Envie o arquivo de retorno (.ret) do Itaú ou Sicoob para dar baixa automática nos boletos pagos.
            </Description>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 p-3 border border-dashed rounded-lg">
              <FileText className="h-5 w-5" />
              <span>{nomeArquivo || "Nenhum arquivo selecionado"}</span>
            </div>
            <input
              type="file"
              accept=".ret,.txt,.cnab"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setNomeArquivo(file.name);
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const b64 = (ev.target?.result as string).split(",")[1];
                  setArquivoBase64(b64);
                };
                reader.readAsDataURL(file);
              }}
            />
            <Button
              className="w-full"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".ret,.txt,.cnab";
                input.onchange = (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setNomeArquivo(file.name);
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const b64 = (ev.target?.result as string).split(",")[1];
                    setArquivoBase64(b64);
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}
              disabled={processarRetorno.isPending}
            >
              {processarRetorno.isPending ? "Processando…" : "Selecionar arquivo de retorno"}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessarOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!arquivoBase64) {
                  toast.error("Selecione um arquivo");
                  return;
                }
                processarRetorno.mutate({
                  empresaId: empresa.id,
                  arquivoRetorno: arquivoBase64,
                });
              }}
              disabled={processarRetorno.isPending || !arquivoBase64}
            >
              {processarRetorno.isPending ? "Processando…" : "Processar retorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface DescriptionProps { children: React.ReactNode; }
function Description({ children }: DescriptionProps) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
