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
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm">
      Erro: {error instanceof Error ? error.message : "erro desconhecido"}
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
        <div className="space-y-2.5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : !data?.length ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta financeira"
          description="Cadastre uma conta financeira e importe o extrato OFX para começar a conciliar."
          action={<Button asChild className="h-10 rounded-xl px-5 shadow-sm"><Link to="/financeiro/contas">Ir para Contas financeiras</Link></Button>}
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:gap-5 lg:grid-cols-3">
            <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pendentes de conciliação</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-tabular">{totalPendentes}</p>
            </Card>
            <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contas com pendências</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-tabular">{data.filter((c) => c.pendentes > 0).length}</p>
            </Card>
            <Card className="rounded-2xl p-5 shadow-panel transition-all duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo total</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight text-tabular">{brl(data.reduce((s, c) => s + Number(c.saldo_atual), 0))}</p>
            </Card>
          </div>

          <Card className="overflow-hidden rounded-2xl shadow-panel">
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
                  <TableRow key={c.id} className="transition-colors hover:bg-accent/30">
                    <TableCell className="font-medium tracking-tight">{c.nome || c.banco || "Conta"}</TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(c.saldo_atual)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-tabular">{c.conciliadas}</TableCell>
                    <TableCell className="text-right">
                      {c.pendentes > 0
                        ? <Badge variant="destructive">{c.pendentes}</Badge>
                        : <Badge variant="secondary">0</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline" className="h-9 rounded-xl px-4 shadow-sm">
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
