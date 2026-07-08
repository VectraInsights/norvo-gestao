import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";

export const Route = createFileRoute("/_authenticated/estoque/fornecedores")({
  component: Fornecedores,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

function Fornecedores() {
  const { data: empresa } = useEmpresaAtual();
  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["fornecedores", empresa?.id] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("contatos")
        .select("id,nome,tipo,documento,email,telefone")
        .eq("empresa_id", empresa!.id)
        .in("tipo", ["fornecedor", "ambos"])
        .order("nome").abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader eyebrow="Estoque" title="Fornecedores" description="Fornecedores cadastrados para compras e reposição de estoque." />
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !contatos?.length ? (
        <EmptyState icon={Users} title="Nenhum fornecedor" description="Cadastre fornecedores em Vendas & CRM › Clientes marcando o tipo Fornecedor." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-tabular">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? c.telefone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
