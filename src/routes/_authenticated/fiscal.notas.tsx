import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Send, Ban, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/fiscal/notas")({
  component: Notas,
  errorComponent: FiscalError,
});

type NotaStatus = "rascunho" | "autorizada" | "cancelada" | "rejeitada" | "denegada";

interface Nota {
  id: string;
  numero: string | null;
  serie: string | null;
  status: NotaStatus;
  valor_total: number | null;
  data_emissao: string | null;
  chave: string | null;
  tipo: string | null;
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

function Notas() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: notas, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["notas", empresa?.id],
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notas"] });
    qc.invalidateQueries({ queryKey: ["nfe-config"] });
  };

  const emitirMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("emitir_nota_fiscal", { _nf_id: id });
      if (error) throw error;
    },
    onMutate: (id) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => { toast.success("Nota autorizada (homologação)"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMut = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("cancelar_nota_fiscal", { _nf_id: id, _motivo: motivo });
      if (error) throw error;
    },
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: () => { toast.success("Nota cancelada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
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

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Notas fiscais" description="Emissão em ambiente de homologação (stub). A produção requer integração com provedor homologado." />

      {config && (
        <Card className="mb-4 shadow-panel">
          <CardContent className="flex flex-wrap items-center gap-6 p-4 text-sm">
            <div><span className="text-muted-foreground">Ambiente:</span> <strong className="capitalize">{config.ambiente ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Série:</span> <strong>{config.serie ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Próximo nº:</span> <strong>{config.proximo_numero ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Regime:</span> <strong className="capitalize">{config.regime_tributario ?? "—"}</strong></div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card className="shadow-panel">
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent>
        </Card>
      ) : !notas?.length ? (
        <EmptyState icon={FileText} title="Nenhuma nota" description="Ao faturar uma venda, a nota fiscal é criada automaticamente aqui em rascunho." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº/Série</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map((n) => {
                const busy = pendingId === n.id;
                return (
                  <TableRow key={n.id}>
                    <TableCell className="text-tabular font-medium">{n.numero}/{n.serie}</TableCell>
                    <TableCell>{n.contato?.nome ?? "—"}</TableCell>
                    <TableCell className="text-tabular text-muted-foreground">{n.venda?.numero ? `#${n.venda.numero}` : "—"}</TableCell>
                    <TableCell className="text-tabular">{dateBR(n.data_emissao)}</TableCell>
                    <TableCell className="text-right text-tabular">{brl(n.valor_total)}</TableCell>
                    <TableCell><StatusBadge status={n.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(n.status === "rascunho" || n.status === "rejeitada") && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => emitirMut.mutate(n.id)}>
                            <Send className="mr-1 h-3.5 w-3.5" />{busy ? "Emitindo…" : "Emitir"}
                          </Button>
                        )}
                        {n.status === "autorizada" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => baixarXML(n)}><Download className="mr-1 h-3.5 w-3.5" />XML</Button>
                            <Button size="sm" variant="ghost" disabled={busy} className="text-destructive" onClick={() => onCancelar(n.id)}>
                              <Ban className="mr-1 h-3.5 w-3.5" />{busy ? "Cancelando…" : "Cancelar"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
