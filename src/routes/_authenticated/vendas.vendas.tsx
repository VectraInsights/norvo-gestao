import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { StatusBadge } from "@/components/erp/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["vendas-faturadas", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas para nunca cortar a lista (sem limite silencioso)
      const todas: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("vendas")
          .select("id,numero,data,total,cliente:contatos(nome),condicao:condicoes_pagamento(nome)")
          .eq("empresa_id", empresa!.id)
          .eq("status", "faturado")
          .order("created_at", { ascending: false })
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todas.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todas as unknown as Row[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return data ?? [];
    const qDig = q.replace(/\D/g, "");
    const qNum = q.replace(/^#/, "");
    return (data ?? []).filter((v) => {
      if ((v.cliente?.nome || "").toLowerCase().includes(q)) return true;
      if ((v.condicao?.nome || "").toLowerCase().includes(q)) return true;
      if (String(v.numero ?? "").includes(qNum)) return true;
      // Pesquisa por valor: "25,00" acha 25.00 (a partir de 2 dígitos)
      if (qDig.length >= 2 && Number(v.total || 0).toFixed(2).replace(/\D/g, "").includes(qDig)) return true;
      return false;
    });
  }, [data, busca]);

  return (
    <>
      <PageHeader
        eyebrow="Vendas & CRM"
        title="Vendas"
        description="Vendas já faturadas. Para criar ou faturar uma nova venda, use Orçamentos."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      {isLoading ? null : !filtrados?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma venda faturada"
          description={busca ? "Nada encontrado para a busca." : "Faturamento é feito a partir de um orçamento/pedido."}
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
              {filtrados.map((v) => (
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
