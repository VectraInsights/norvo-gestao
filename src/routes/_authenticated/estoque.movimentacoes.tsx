import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque/movimentacoes")({
  component: () => (
    <>
      <PageHeader eyebrow="Estoque" title="Movimentações" description="Entradas, saídas, ajustes e transferências." />
      <EmptyState
        icon={Boxes}
        title="Sem movimentações"
        description="Registre entradas de compras, ajustes de inventário e transferências entre depósitos. A tabela movimentacoes_estoque já está pronta."
      />
    </>
  ),
});
