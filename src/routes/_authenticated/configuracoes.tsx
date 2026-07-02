import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, Settings2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Empresas, usuários e preferências." />
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/configuracoes/empresas"><Card className="shadow-panel transition hover:border-primary/40"><CardContent className="p-6">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-semibold">Empresas</h3>
          <p className="text-sm text-muted-foreground">Cadastro e dados fiscais das empresas gerenciadas.</p>
        </CardContent></Card></Link>
        <Card className="shadow-panel"><CardContent className="p-6">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">Usuários e papéis</h3>
          <p className="text-sm text-muted-foreground">Convide membros e defina permissões (em breve).</p>
        </CardContent></Card>
        <Card className="shadow-panel"><CardContent className="p-6">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">Preferências</h3>
          <p className="text-sm text-muted-foreground">Moeda, timezone e integrações (em breve).</p>
        </CardContent></Card>
      </div>
    </>
  ),
});
