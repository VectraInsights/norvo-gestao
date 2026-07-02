import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/fiscal/notas")({
  component: () => (
    <>
      <PageHeader eyebrow="Fiscal" title="Notas fiscais" description="Emissão e consulta de NF-e, NFS-e e NFC-e." />
      <EmptyState
        icon={FileText}
        title="Integração fiscal pendente"
        description="A tabela notas_fiscais já existe. A emissão real de NF exige integração com um provedor homologado (ex.: Focus NFe, PlugNotas, Nfe.io). Podemos conectar um provedor em seguida — basta pedir."
        action={<Button variant="outline" disabled>Emitir NF-e (em breve)</Button>}
      />
    </>
  ),
});
