import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Users,
  Package,
  Building2,
  AlertTriangle,
  ShoppingCart,
  FileText,
  Plus,
  ArrowRight,
} from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lazy, Suspense, useState } from "react";
import { useSelectedEmpresaId } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR, maskDoc } from "@/lib/format";

function soma30meses(d: string) {
  const dt = new Date(d + "T12:00:00");
  dt.setMonth(dt.getMonth() + 30);
  return dt.toISOString().slice(0, 10);
}
import type { ReceitaPoint } from "@/components/erp/receita-chart";

// recharts (~120KB gz) fica em chunk separado, carregado só quando o dashboard renderiza.
const ReceitaChart = lazy(() => import("@/components/erp/receita-chart"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm"
    >
      Não foi possível carregar o dashboard: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  ),
});

type Empresa = { id: string; nome_fantasia: string | null };
type EstoqueBaixoRow = {
  id: string;
  nome: string;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  unidade: string | null;
};
type ProximoReceberRow = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  contato: { nome: string | null } | null;
};
type AlertaRow = { id: string; titulo: string; mensagem: string | null };
type CnhRow = {
  id: string;
  nome: string;
  cnh_categoria: string | null;
  cnh_validade: string;
  toxico_exame: string | null;
};
type MultaAlertaRow = {
  id: string;
  placa: string;
  valor: number;
  data_vencimento: string;
  auto_infracao: string | null;
};

function friendlyEmpresaError(error: { message?: string; code?: string }) {
  if (error.code === "23505" || error.message?.toLowerCase().includes("duplicate key")) {
    return "Já existe uma empresa cadastrada com este CNPJ";
  }
  return error.message ?? "Não foi possível salvar a empresa";
}

function Dashboard() {
  const qc = useQueryClient();
  // Hooks sempre no topo: antes de qualquer return (evita erro #310 no refresh com cache frio).
  const navigate = useNavigate();

  const { data: empresas, isLoading: loadingEmp } = useQuery({
    queryKey: ["empresas", "resumo"],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id,nome_fantasia,razao_social,cnpj,created_at")
        .order("created_at")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
  const selectedId = useSelectedEmpresaId();
  const empresa = (selectedId && empresas?.find((e) => e.id === selectedId)) || empresas?.[0];

  const { data: stats, isLoading: loadingStats } = useQuery({
    enabled: !!empresa,
    queryKey: ["dashboard-stats", empresa?.id],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = hoje.slice(0, 7) + "-01";
      const inicio30 = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
      const eid = empresa!.id;
      const [rec, pag, cli, prod, vendasMes, estoqueBaixo, vendasCount, notasPend, receita30] =
        await Promise.all([
          supabase
            .from("lancamentos_financeiros")
            .select("valor,valor_pago")
            .eq("empresa_id", eid)
            .eq("tipo", "receber")
            .in("status", ["aberto", "parcial", "vencido"])
            .abortSignal(signal),
          supabase
            .from("lancamentos_financeiros")
            .select("valor,valor_pago")
            .eq("empresa_id", eid)
            .eq("tipo", "pagar")
            .in("status", ["aberto", "parcial", "vencido"])
            .abortSignal(signal),
          supabase
            .from("contatos")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", eid)
            .abortSignal(signal),
          supabase
            .from("produtos")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", eid)
            .abortSignal(signal),
          supabase
            .from("vendas")
            .select("total")
            .eq("empresa_id", eid)
            .eq("status", "faturado")
            .gte("data", inicioMes)
            .abortSignal(signal),
          supabase
            .from("produtos")
            .select("id,nome,estoque_atual,estoque_minimo,unidade")
            .eq("empresa_id", eid)
            .eq("ativo", true)
            .gt("estoque_minimo", 0)
            .abortSignal(signal),
          supabase
            .from("vendas")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", eid)
            .neq("status", "cancelado")
            .abortSignal(signal),
          supabase
            .from("notas_fiscais")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", eid)
            .eq("status", "rascunho")
            .abortSignal(signal),
          supabase
            .from("vendas")
            .select("data,total")
            .eq("empresa_id", eid)
            .eq("status", "faturado")
            .gte("data", inicio30)
            .order("data")
            .abortSignal(signal),
        ]);

      const sum = (
        rows: Array<{ valor: number | string; valor_pago: number | string | null }> | null,
      ) => (rows ?? []).reduce((s, r) => s + Number(r.valor) - Number(r.valor_pago ?? 0), 0);
      const receitaMes = (vendasMes.data ?? []).reduce((s, v) => s + Number(v.total), 0);
      const abaixo = ((estoqueBaixo.data ?? []) as EstoqueBaixoRow[]).filter(
        (p) => Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0),
      );

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
    staleTime: 30_000,
    gcTime: 5 * 60_000,
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

  const { data: cnhVencendo } = useQuery({
    enabled: !!empresa,
    queryKey: ["cnh-vencendo", empresa?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async ({ signal }) => {
      const limite = new Date(Date.now() + 31 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id,nome,cnh_categoria,cnh_validade,toxico_exame")
        .eq("empresa_id", empresa!.id)
        .eq("status", "ativo")
        .or(`cnh_validade.lte.${limite},toxico_exame.lte.${limite}`)
        .order("cnh_validade")
        .abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as unknown as CnhRow[];
      return rows.filter(
        (c) =>
          (c.cnh_validade &&
            (new Date(c.cnh_validade + "T12:00:00").getTime() - Date.now()) / 86400_000 <= 30) ||
          (c.toxico_exame &&
            soma30meses(c.toxico_exame) &&
            (new Date(soma30meses(c.toxico_exame) + "T12:00:00").getTime() - Date.now()) /
              86400_000 <=
              30),
      );
    },
  });

  const { data: multasVencendo } = useQuery({
    enabled: !!empresa,
    queryKey: ["multas-vencendo", empresa?.id],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const limite = new Date(Date.now() + 31 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("multas" as never)
        .select("id,placa,valor,data_vencimento,auto_infracao")
        .eq("empresa_id", empresa!.id)
        .in("status", ["aberta", "contestada"])
        .not("data_vencimento", "is", null)
        .lte("data_vencimento", limite)
        .order("data_vencimento")
        .abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as unknown as MultaAlertaRow[];
      return rows.filter(
        (m) => (new Date(m.data_vencimento + "T12:00:00").getTime() - Date.now()) / 86400_000 <= 30,
      );
    },
  });

  const { data: proximosReceber } = useQuery({
    enabled: !!empresa,
    queryKey: ["proximos-receber", empresa?.id],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
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
  if (!empresa) {
    return (
      <FirstEmpresa
        onCreated={async () => {
          await qc.invalidateQueries({ queryKey: ["empresas"] });
          await qc.refetchQueries({ queryKey: ["empresas"], type: "active" });
        }}
      />
    );
  }

  const atalhos = [
    { label: "Nova venda", desc: "Emita em segundos", to: "/vendas/nova", icon: ShoppingCart },
    { label: "Lançamento financeiro", desc: "Pagar ou receber", to: "/financeiro/lancamentos", icon: Wallet },
    { label: "Novo produto", desc: "Amplie o catálogo", to: "/estoque/produtos", icon: Package },
    { label: "Novo contato", desc: "Cliente ou fornecedor", to: "/cadastros/contatos", icon: Users },
  ];

  const cards = [
    {
      label: "Receita do mês",
      value: brl(stats?.receitaMes ?? 0),
      icon: ArrowUpRight,
      tone: "text-success",
    },
    {
      label: "A receber (aberto)",
      value: brl(stats?.aReceber ?? 0),
      icon: ArrowUpRight,
      tone: "text-success",
    },
    {
      label: "A pagar (aberto)",
      value: brl(stats?.aPagar ?? 0),
      icon: ArrowDownRight,
      tone: "text-destructive",
    },
    {
      label: "Saldo projetado",
      value: brl((stats?.aReceber ?? 0) - (stats?.aPagar ?? 0)),
      icon: Wallet,
      tone: "text-foreground",
    },
    {
      label: "Vendas ativas",
      value: String(stats?.vendasCount ?? 0),
      icon: ShoppingCart,
      tone: "text-foreground",
    },
    {
      label: "NF-e em rascunho",
      value: String(stats?.notasPend ?? 0),
      icon: FileText,
      tone: "text-foreground",
    },
    {
      label: "Clientes",
      value: String(stats?.clientes ?? 0),
      icon: Users,
      tone: "text-foreground",
    },
    {
      label: "Produtos",
      value: String(stats?.produtos ?? 0),
      icon: Package,
      tone: "text-foreground",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={empresa.nome_fantasia ?? "Empresa"}
        title="Dashboard"
        description="Visão geral da operação em tempo real."
      />

      <Card className="erp-surface mb-8 overflow-hidden rounded-2xl border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.04] sm:mb-10">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Ações rápidas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse as tarefas mais usadas sem navegar pelo menu.
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
              <Plus className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {atalhos.map((atalho) => {
              const Icon = atalho.icon;
              return (
                <Button
                  key={atalho.to}
                  variant="outline"
                  className="h-auto items-center justify-between gap-3 rounded-2xl bg-background px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
                  onClick={() => navigate({ to: atalho.to })}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{atalho.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{atalho.desc}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {loadingStats
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="rounded-2xl shadow-panel">
                <CardContent className="p-6">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="mt-4 h-7 w-32 rounded-lg" />
                </CardContent>
              </Card>
            ))
          : cards.map((c) => (
              <Card
                key={c.label}
                className="group rounded-2xl shadow-panel transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg"
              >
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted/70 transition-colors group-hover:bg-primary/10">
                    <c.icon className={`h-5 w-5 ${c.tone}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      {c.label}
                    </span>
                    <span className="mt-1 block truncate text-display text-[1.7rem] font-semibold leading-tight text-tabular">
                      {c.value}
                    </span>
                  </span>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:gap-6 lg:mt-12">
        <Card className="rounded-2xl shadow-panel lg:col-span-2">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Desempenho
                </p>
                <h3 className="mt-1 font-semibold tracking-tight">Receita — últimos 30 dias</h3>
              </div>
              <Badge variant="secondary">{brl(stats?.receitaMes ?? 0)}</Badge>
            </div>
            {loadingStats || !stats ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : (
              <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
                <ReceitaChart data={stats.serie} />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-panel">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Atenção
                </p>
                <h3 className="mt-1.5 text-base font-semibold tracking-tight">Alertas & estoque baixo</h3>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-warning/15">
                <AlertTriangle className="h-5 w-5 text-warning-foreground" aria-hidden="true" />
              </span>
            </div>
            {!alertas?.length &&
            !stats?.estoqueBaixo?.length &&
            !cnhVencendo?.length &&
            !multasVencendo?.length ? (
              <div className="rounded-xl bg-muted/40 px-4 py-6 text-center">
                <p className="text-sm font-medium">Nenhum alerta ativo. 🎉</p>
                <p className="mt-1 text-xs text-muted-foreground">Tudo em dia por aqui.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {cnhVencendo
                  ?.flatMap((c) => {
                    const itens: {
                      key: string;
                      tipo: string;
                      data: string;
                      dias: number;
                    }[] = [];
                    if (c.cnh_validade) {
                      itens.push({
                        key: c.id + "-cnh",
                        tipo: `CNH${c.cnh_categoria ? ` cat. ${c.cnh_categoria}` : ""}`,
                        data: c.cnh_validade,
                        dias: Math.ceil(
                          (new Date(c.cnh_validade + "T12:00:00").getTime() - Date.now()) /
                            86400_000,
                        ),
                      });
                    }
                    if (c.toxico_exame) {
                      const t = soma30meses(c.toxico_exame);
                      if (t) {
                        itens.push({
                          key: c.id + "-toxico",
                          tipo: "Toxicológico",
                          data: t,
                          dias: Math.ceil(
                            (new Date(t + "T12:00:00").getTime() - Date.now()) / 86400_000,
                          ),
                        });
                      }
                    }
                    return itens;
                  })
                  .map((a) => (
                    <li key={a.key} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
                      <span className="truncate">
                        <strong>
                          {cnhVencendo?.find((c) => c.id === a.key.split("-")[0])?.nome}
                        </strong>{" "}
                        — {a.tipo} {a.dias < 0 ? "vencida em" : "vence em"} {dateBR(a.data)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          a.dias < 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/20 text-warning-foreground"
                        }
                      >
                        {a.dias < 0 ? `${-a.dias}d atrás` : `${a.dias}d`}
                      </Badge>
                    </li>
                  ))}
                {multasVencendo?.map((m) => {
                  const dias = Math.ceil(
                    (new Date(m.data_vencimento + "T12:00:00").getTime() - Date.now()) / 86400_000,
                  );
                  return (
                    <li key={m.id} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
                      <span className="truncate">
                        <strong>{m.placa}</strong> — multa{" "}
                        {m.auto_infracao ? `auto ${m.auto_infracao}` : ""}{" "}
                        {dias < 0 ? "vencida em" : "vence em"} {dateBR(m.data_vencimento)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={
                          dias < 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/20 text-warning-foreground"
                        }
                      >
                        {dias < 0 ? `${-dias}d atrás` : `${dias}d`}
                      </Badge>
                    </li>
                  );
                })}
                {stats?.estoqueBaixo?.slice(0, 5).map((p) => (
                  <li key={p.id} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40">
                    <span className="truncate">
                      <strong>{p.nome}</strong> — estoque {Number(p.estoque_atual)}{" "}
                      {p.unidade ?? ""}
                    </span>
                    <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                      mín. {Number(p.estoque_minimo)}
                    </Badge>
                  </li>
                ))}
                {alertas?.map((a) => (
                  <li key={a.id} className="rounded-xl bg-accent/30 p-3 text-sm shadow-sm">
                    <div className="font-medium">{a.titulo}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.mensagem}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 lg:mt-6">
        <Card className="rounded-2xl shadow-panel">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold tracking-tight">Próximos recebimentos</h3>
              <Badge variant="secondary">{proximosReceber?.length ?? 0}</Badge>
            </div>
            {!proximosReceber?.length ? (
              <div className="rounded-xl bg-muted/40 px-4 py-6 text-center">
                <p className="text-sm font-medium">Sem lançamentos em aberto.</p>
                <p className="mt-1 text-xs text-muted-foreground">Novos recebimentos aparecem aqui.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {proximosReceber.map((l) => (
                  <li key={l.id} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{l.descricao}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {l.contato?.nome ?? "—"} · vence {dateBR(l.data_vencimento)}
                      </div>
                    </div>
                    <div className="shrink-0 text-tabular text-sm font-semibold">{brl(l.valor)}</div>
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
      <Skeleton className="mb-8 h-16 w-64 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="rounded-2xl shadow-panel">
            <CardContent className="p-6">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="mt-4 h-7 w-32 rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function FirstEmpresa({ onCreated }: { onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({
    cnpj: "",
    nome_fantasia: "",
    razao_social: "",
    email: "",
    telefone: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
  });
  const [lookingUp, setLookingUp] = useState(false);

  const lookupCnpj = async () => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    setLookingUp(true);
    try {
      const { data: dup } = await supabase
        .from("empresas")
        .select("id,nome_fantasia")
        .eq("cnpj", digits)
        .maybeSingle();
      if (dup) {
        toast.error(`CNPJ já cadastrado: ${dup.nome_fantasia}`);
        setLookingUp(false);
        return;
      }
    } catch {
      /* segue */
    }
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const d = await res.json();
      setForm((f) => ({
        ...f,
        cnpj: maskDoc(digits),
        razao_social: d.razao_social ?? "",
        nome_fantasia: d.nome_fantasia || d.razao_social || "",
        email: d.email ?? "",
        telefone: [d.ddd_telefone_1].filter(Boolean).join(""),
        logradouro: d.logradouro ?? "",
        numero: d.numero ?? "",
        complemento: d.complemento ?? "",
        bairro: d.bairro ?? "",
        cidade: d.municipio ?? "",
        uf: d.uf ?? "",
        cep: d.cep ?? "",
      }));
      toast.success("Dados preenchidos a partir da Receita");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  const handleCnpjKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!lookingUp && form.cnpj) lookupCnpj();
  };

  const criarMut = useMutation({
    mutationFn: async () => {
      const nome = form.nome_fantasia.trim();
      if (!nome) throw new Error("Informe o nome da empresa");
      const { data: userRes, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userRes.user) throw new Error("Sessão expirada");
      const cnpjDigits = form.cnpj.replace(/\D/g, "");
      if (cnpjDigits) {
        const { data: dup } = await supabase
          .from("empresas")
          .select("id")
          .eq("cnpj", cnpjDigits)
          .maybeSingle();
        if (dup) throw new Error("Já existe uma empresa cadastrada com este CNPJ");
      }
      const { error } = await supabase.from("empresas").insert({
        ...form,
        nome_fantasia: nome,
        cnpj: cnpjDigits || null,
        created_by: userRes.user.id,
      });
      if (error) throw new Error(friendlyEmpresaError(error));
    },
    onSuccess: async () => {
      toast.success("Empresa criada!");
      await onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    criarMut.mutate();
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Bem-vindo"
        title="Cadastre sua empresa"
        description="Informe o CNPJ para preenchermos os dados automaticamente."
      />
      <Card className="rounded-2xl shadow-panel">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">CNPJ</label>
              <div className="flex gap-2">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: maskDoc(e.target.value) })}
                  onKeyDown={handleCnpjKeyDown}
                  placeholder="00.000.000/0000-00"
                  className="h-10 rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupCnpj}
                  disabled={lookingUp || !form.cnpj}
                  className="h-10 shrink-0 rounded-xl px-4 shadow-sm"
                >
                  {lookingUp ? "..." : "Buscar"}
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">
                Nome da empresa <span className="text-destructive">*</span>
              </label>
              <Input
                required
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                placeholder="Minha Empresa Ltda"
                className="h-10 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-11 w-full rounded-xl text-base shadow-md transition-all hover:-translate-y-px hover:shadow-lg" disabled={criarMut.isPending}>
              {criarMut.isPending ? "Criando…" : "Criar empresa"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4 lg:mt-5">
        <EmptyState
          icon={Package}
          title="O que virá a seguir"
          description="Após criar a empresa você terá acesso a vendas, financeiro, estoque, fiscal e relatórios com dados reais."
        />
      </div>
    </div>
  );
}
