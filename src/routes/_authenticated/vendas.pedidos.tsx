import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/vendas/pedidos")({
  component: () => (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Pedidos e propostas" description="Funil de vendas com propostas, pedidos e faturamento." />
      <EmptyState
        icon={ShoppingCart}
        title="Módulo em construção"
        description="O esqueleto do fluxo de propostas → pedidos → faturamento está pronto no banco de dados (vendas / venda_itens). Podemos avançar com a UI completa em seguida."
        action={<Button variant="outline" disabled>Novo pedido (em breve)</Button>}
      />
    </>
  ),
});
