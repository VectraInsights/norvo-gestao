import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Send, Ban, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiscal/notas")({
  component: Notas,
});

function Notas() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();

  const { data: notas, isLoading } = useQuery({
    enabled: !!empresa, queryKey: ["notas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notas_fiscais")
        .select("*, contato:contatos(nome), venda:vendas(numero)")
        .eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: config } = useQuery({
    enabled: !!empresa, queryKey: ["nfe-config", empresa?.id],
    queryFn: async () => (await supabase.from("nfe_config").select("*").eq("empresa_id", empresa!.id).maybeSingle()).data,
  });

  const emitir = async (id: string) => {
    const { error } = await supabase.rpc("emitir_nota_fiscal", { _nf_id: id });
    if (error) return toast.error(error.message);
    toast.success("Nota autorizada (ambiente homologação)");
    qc.invalidateQueries({ queryKey: ["notas"] });
  };

  const cancelar = async (id: string) => {
    const motivo = prompt("Motivo do cancelamento (mín. 15 caracteres):");
    if (!motivo || motivo.length < 15) return toast.error("Motivo inválido");
    const { error } = await supabase.rpc("cancelar_nota_fiscal", { _nf_id: id, _motivo: motivo });
    if (error) return toast.error(error.message);
    toast.success("Nota cancelada");
    qc.invalidateQueries({ queryKey: ["notas"] });
  };

  const baixarXML = (nota: any) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe><infNFe Id="NFe${nota.chave ?? "PENDENTE"}">
    <ide><serie>${nota.serie}</serie><nNF>${nota.numero}</nNF><natOp>Venda de mercadoria</natOp></ide>
    <total><vNF>${Number(nota.valor_total ?? 0).toFixed(2)}</vNF></total>
    <infAdic><infCpl>Documento gerado em ambiente de homologação - sem valor fiscal.</infCpl></infAdic>
  </infNFe></NFe>
</nfeProc>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `NF-${nota.serie}-${nota.numero}.xml`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader eyebrow="Fiscal" title="Notas fiscais" description="Emissão em ambiente de homologação (stub). A produção requer integração com provedor homologado." />

      {config && (
        <Card className="mb-4 shadow-panel">
          <CardContent className="flex flex-wrap items-center gap-6 p-4 text-sm">
            <div><span className="text-muted-foreground">Ambiente:</span> <strong className="capitalize">{config.ambiente}</strong></div>
            <div><span className="text-muted-foreground">Série:</span> <strong>{config.serie}</strong></div>
            <div><span className="text-muted-foreground">Próximo nº:</span> <strong>{config.proximo_numero}</strong></div>
            <div><span className="text-muted-foreground">Regime:</span> <strong className="capitalize">{config.regime_tributario}</strong></div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
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
              {notas.map((n: any) => (
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
                        <Button size="sm" variant="ghost" onClick={() => emitir(n.id)}><Send className="mr-1 h-3.5 w-3.5" />Emitir</Button>
                      )}
                      {n.status === "autorizada" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => baixarXML(n)}><Download className="mr-1 h-3.5 w-3.5" />XML</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelar(n.id)}><Ban className="mr-1 h-3.5 w-3.5" />Cancelar</Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
