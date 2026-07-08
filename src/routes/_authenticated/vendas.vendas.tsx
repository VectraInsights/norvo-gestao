import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vendas/vendas")({
  component: VendasFaturadas,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

type Row = {
  id: string; numero: number; data: string; total: number;
  cliente: { nome: string } | null;
  condicao: { nome: string } | null;
};

function VendasFaturadas() {
  const { data: empresa } = useEmpresaAtual();
  const { data, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["vendas-faturadas", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("vendas")
        .select("id,numero,data,total,cliente:contatos(nome),condicao:condicoes_pagamento(nome)")
        .eq("empresa_id", empresa!.id)
        .eq("status", "faturado")
        .order("created_at", { ascending: false })
        .limit(200)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Vendas & CRM"
        title="Vendas"
        description="Vendas já faturadas. Para criar ou faturar uma nova venda, use Orçamentos."
      />
      {isLoading ? null : !data?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma venda faturada"
          description="Faturamento é feito a partir de um orçamento/pedido."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Condição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-tabular">
                    <Link to="/vendas/pedidos" className="text-primary hover:underline">{v.numero}</Link>
                  </TableCell>
                  <TableCell>{dateBR(v.data)}</TableCell>
                  <TableCell>{v.cliente?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.condicao?.nome ?? "—"}</TableCell>
                  <TableCell><StatusBadge status="faturado" /></TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(v.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
