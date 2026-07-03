import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowUpRight, Wallet, Users, Package,
  Building2, AlertTriangle, ShoppingCart, FileText,
} from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import type { ReceitaPoint } from "@/components/erp/receita-chart";

// recharts (~120KB gz) fica em chunk separado, carregado só quando o dashboard renderiza.
const ReceitaChart = lazy(() => import("@/components/erp/receita-chart"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Não foi possível carregar o dashboard: {error.message}
    </div>
  ),
});

type Empresa = { id: string; nome_fantasia: string | null };
type EstoqueBaixoRow = {
  id: string; nome: string;
  estoque_atual: number | null; estoque_minimo: number | null; unidade: string | null;
};
type ProximoReceberRow = {
  id: string; descricao: string; valor: number; data_vencimento: string;
  contato: { nome: string | null } | null;
};
type AlertaRow = { id: string; titulo: string; mensagem: string | null };

function Dashboard() {
  const qc = useQueryClient();

  const { data: empresas, isLoading: loadingEmp } = useQuery({
    queryKey: ["empresas"],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id,nome_fantasia")
        .order("created_at")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
  const empresa = empresas?.[0];

  const { data: stats, isLoading: loadingStats } = useQuery({
    enabled: !!empresa,
    queryKey: ["dashboard-stats", empresa?.id],
    queryFn: async ({ signal }) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = hoje.slice(0, 7) + "-01";
      const inicio30 = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
      const eid = empresa!.id;
      const [rec, pag, cli, prod, vendasMes, estoqueBaixo, vendasCount, notasPend, receita30] = await Promise.all([
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", eid).eq("tipo", "receber").in("status", ["aberto", "parcial", "vencido"]).abortSignal(signal),
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", eid).eq("tipo", "pagar").in("status", ["aberto", "parcial", "vencido"]).abortSignal(signal),
        supabase.from("contatos").select("id", { count: "exact", head: true }).eq("empresa_id", eid).abortSignal(signal),
        supabase.from("produtos").select("id", { count: "exact", head: true }).eq("empresa_id", eid).abortSignal(signal),
        supabase.from("vendas").select("total").eq("empresa_id", eid).eq("status", "faturado").gte("data", inicioMes).abortSignal(signal),
        supabase.from("produtos").select("id,nome,estoque_atual,estoque_minimo,unidade").eq("empresa_id", eid).eq("ativo", true).gt("estoque_minimo", 0).abortSignal(signal),
        supabase.from("vendas").select("id", { count: "exact", head: true }).eq("empresa_id", eid).neq("status", "cancelado").abortSignal(signal),
        supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("empresa_id", eid).eq("status", "rascunho").abortSignal(signal),
        supabase.from("vendas").select("data,total").eq("empresa_id", eid).eq("status", "faturado").gte("data", inicio30).order("data").abortSignal(signal),
      ]);

      const sum = (rows: Array<{ valor: number | string; valor_pago: number | string | null }> | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.valor) - Number(r.valor_pago ?? 0), 0);
      const receitaMes = (vendasMes.data ?? []).reduce((s, v) => s + Number(v.total), 0);
      const abaixo = ((estoqueBaixo.data ?? []) as EstoqueBaixoRow[])
        .filter((p) => Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0));

      // agrupa vendas por dia para o gráfico
      const bucket = new Map<string, number>();
      for (const v of (receita30.data ?? []) as Array<{ data: string; total: number | string }>) {
        const k = String(v.data).slice(0, 10);
        bucket.set(k, (bucket.get(k) ?? 0) + Number(v.total));
      }
      const serie: ReceitaPoint[] = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10);
        return { data: d.slice(5), total: bucket.get(d) ?? 0 };
      });

      return {
        aReceber: sum(rec.data),
        aPagar: sum(pag.data),
        clientes: cli.count ?? 0,
        produtos: prod.count ?? 0,
        receitaMes,
        estoqueBaixo: abaixo,
        vendasCount: vendasCount.count ?? 0,
        notasPend: notasPend.count ?? 0,
        serie,
      };
    },
  });

  const { data: alertas } = useQuery({
    enabled: !!empresa,
    queryKey: ["alertas", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("alertas")
        .select("id,titulo,mensagem")
        .eq("empresa_id", empresa!.id)
        .eq("lido", false)
        .order("created_at", { ascending: false })
        .limit(6)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as AlertaRow[];
    },
  });

  const { data: proximosReceber } = useQuery({
    enabled: !!empresa,
    queryKey: ["proximos-receber", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("id,descricao,valor,data_vencimento,contato:contatos(nome)")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", "receber")
        .in("status", ["aberto", "parcial", "vencido"])
        .order("data_vencimento")
        .limit(5)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as ProximoReceberRow[];
    },
  });

  if (loadingEmp) return <DashboardSkeleton />;
  if (!empresa) return <FirstEmpresa onCreated={() => qc.invalidateQueries({ queryKey: ["empresas"] })} />;

  const cards = [
    { label: "Receita do mês", value: brl(stats?.receitaMes ?? 0), icon: ArrowUpRight, tone: "text-success" },
    { label: "A receber (aberto)", value: brl(stats?.aReceber ?? 0), icon: ArrowUpRight, tone: "text-success" },
    { label: "A pagar (aberto)", value: brl(stats?.aPagar ?? 0), icon: ArrowDownRight, tone: "text-destructive" },
    { label: "Saldo projetado", value: brl((stats?.aReceber ?? 0) - (stats?.aPagar ?? 0)), icon: Wallet, tone: "text-foreground" },
    { label: "Vendas ativas", value: String(stats?.vendasCount ?? 0), icon: ShoppingCart, tone: "text-foreground" },
    { label: "NF-e em rascunho", value: String(stats?.notasPend ?? 0), icon: FileText, tone: "text-foreground" },
    { label: "Clientes", value: String(stats?.clientes ?? 0), icon: Users, tone: "text-foreground" },
    { label: "Produtos", value: String(stats?.produtos ?? 0), icon: Package, tone: "text-foreground" },
  ];

  return (
    <>
      <PageHeader eyebrow={empresa.nome_fantasia ?? "Empresa"} title="Dashboard" description="Visão geral da operação em tempo real." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingStats
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="shadow-panel"><CardContent className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-7 w-32" /></CardContent></Card>
            ))
          : cards.map((c) => (
              <Card key={c.label} className="shadow-panel">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs uppercase tracking-wider">{c.label}</span>
                    <c.icon className={`h-4 w-4 ${c.tone}`} />
                  </div>
                  <div className="mt-3 text-display text-2xl text-tabular">{c.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-panel lg:col-span-2">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Receita — últimos 30 dias</h3>
              <Badge variant="secondary">{brl(stats?.receitaMes ?? 0)}</Badge>
            </div>
            {loadingStats || !stats ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <Suspense fallback={<Skeleton className="h-56 w-full" />}>
                <ReceitaChart data={stats.serie} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Alertas & estoque baixo</h3>
              <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            </div>
            {!alertas?.length && !stats?.estoqueBaixo?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum alerta ativo. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {stats?.estoqueBaixo?.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><strong>{p.nome}</strong> — estoque {Number(p.estoque_atual)} {p.unidade ?? ""}</span>
                    <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">mín. {Number(p.estoque_minimo)}</Badge>
                  </li>
                ))}
                {alertas?.map((a) => (
                  <li key={a.id} className="rounded-md bg-accent/30 p-2 text-sm">
                    <div className="font-medium">{a.titulo}</div>
                    <div className="text-xs text-muted-foreground">{a.mensagem}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card className="shadow-panel">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Próximos recebimentos</h3>
              <Badge variant="secondary">{proximosReceber?.length ?? 0}</Badge>
            </div>
            {!proximosReceber?.length ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos em aberto.</p>
            ) : (
              <ul className="divide-y">
                {proximosReceber.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{l.descricao}</div>
                      <div className="text-xs text-muted-foreground">{l.contato?.nome ?? "—"} · vence {dateBR(l.data_vencimento)}</div>
                    </div>
                    <div className="text-tabular text-sm font-medium">{brl(l.valor)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="mb-8 h-16 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="shadow-panel"><CardContent className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-7 w-32" /></CardContent></Card>
        ))}
      </div>
    </>
  );
}

function FirstEmpresa({ onCreated }: { onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");

  const criarMut = useMutation({
    mutationFn: async () => {
      const trimmed = nome.trim();
      if (!trimmed) throw new Error("Nome é obrigatório");
      const { data: userRes, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userRes.user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("empresas").insert({
        nome_fantasia: trimmed,
        cnpj: cnpj.trim() || null,
        created_by: userRes.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa criada! Categorias, condições e configuração fiscal foram provisionadas automaticamente.");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    criarMut.mutate();
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader eyebrow="Bem-vindo" title="Cadastre sua empresa" description="Para começar, crie a primeira empresa desta conta." />
      <Card className="shadow-panel">
        <CardContent className="p-6">
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome fantasia</label>
              <Input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Minha Empresa Ltda" />
            </div>
            <div>
              <label className="text-sm font-medium">CNPJ (opcional)</label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <Button type="submit" className="w-full" disabled={criarMut.isPending}>
              {criarMut.isPending ? "Criando…" : "Criar empresa"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4">
        <EmptyState icon={Package} title="O que virá a seguir" description="Após criar a empresa você terá acesso a vendas, financeiro, estoque, fiscal e relatórios com dados reais." />
      </div>
    </div>
  );
}
