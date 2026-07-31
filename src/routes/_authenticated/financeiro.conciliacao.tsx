import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link2, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro/conciliacao")({
  component: ConciliacaoPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type ContaResumo = {
  id: string; nome: string | null; banco: string | null; saldo_atual: number;
  pendentes: number; conciliadas: number;
};

function ConciliacaoPage() {
  const { data: empresa } = useEmpresaAtual();

  const { data, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["conciliacao-resumo", empresa?.id],
    queryFn: async (): Promise<ContaResumo[]> => {
      const { data: contas, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco,saldo_atual")
        .eq("empresa_id", empresa!.id).eq("ativo", true).order("nome");
      if (error) throw error;

      const { data: txs } = await supabase.from("ofx_transacoes")
        .select("conta_bancaria_id,status").limit(20000);

      return (contas ?? []).map((c) => {
        const doBanco = (txs ?? []).filter((t) => t.conta_bancaria_id === c.id);
        return {
          ...c,
          pendentes: doBanco.filter((t) => t.status !== "conciliada").length,
          conciliadas: doBanco.filter((t) => t.status === "conciliada").length,
        } as ContaResumo;
      });
    },
  });

  const totalPendentes = (data ?? []).reduce((s, c) => s + c.pendentes, 0);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Conciliação bancária"
        description="Acompanhe o que ainda falta conciliar em cada conta financeira e abra a tela de conciliação."
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data?.length ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta financeira"
          description="Cadastre uma conta financeira e importe o extrato OFX para começar a conciliar."
          action={<Button asChild><Link to="/financeiro/contas">Ir para Contas financeiras</Link></Button>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes de conciliação</p>
              <p className="mt-1 text-2xl font-semibold">{totalPendentes}</p>
            </Card>
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contas com pendências</p>
              <p className="mt-1 text-2xl font-semibold">{data.filter((c) => c.pendentes > 0).length}</p>
            </Card>
            <Card className="p-4 shadow-panel">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo total</p>
              <p className="mt-1 text-2xl font-semibold">{brl(data.reduce((s, c) => s + Number(c.saldo_atual), 0))}</p>
            </Card>
          </div>

          <Card className="shadow-panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Conciliadas</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome || c.banco || "Conta"}</TableCell>
                    <TableCell className="text-right">{brl(c.saldo_atual)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{c.conciliadas}</TableCell>
                    <TableCell className="text-right">
                      {c.pendentes > 0
                        ? <Badge variant="destructive">{c.pendentes}</Badge>
                        : <Badge variant="secondary">0</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/financeiro/contas" search={{ conciliar: c.id }}>
                          <Link2 className="mr-1.5 h-4 w-4" /> Conciliar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
