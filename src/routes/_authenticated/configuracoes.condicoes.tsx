import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { CondicoesTab, configNavLinkCls } from "./configuracoes.index";

export const Route = createFileRoute("/_authenticated/configuracoes/condicoes")({
  component: CondicoesPage,
});

function CondicoesPage() {
  const { data: empresa } = useEmpresaAtual();

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Condições de pagamento" description="Parcelamentos usados nas vendas e cobranças." />
      <div className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-1">
        <Link to="/configuracoes" className={configNavLinkCls}>
          <ArrowLeft className="h-4 w-4" /> Todas as configurações
        </Link>
      </div>
      {!empresa ? (
        <Card className="rounded-2xl"><CardContent className="p-8 text-center text-sm text-muted-foreground">Cadastre uma empresa primeiro.</CardContent></Card>
      ) : (
        <CondicoesTab empresaId={empresa.id} />
      )}
    </>
  );
}
