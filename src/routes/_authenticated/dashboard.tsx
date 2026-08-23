import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lazy, Suspense, useState } from "react";
import { useSelectedEmpresaId } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import type { ReceitaPoint } from "@/components/erp/receita-chart";

// recharts (~120KB gz) fica em chunk separado, carregado só quando o dashboard renderiza.
const ReceitaChart = lazy(() => import("@/components/erp/receita-chart"));

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar o dashboard: {error.message}
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
type CnhRow = { id: string; nome: string; cnh_categoria: string | null; cnh_validade: string };

function friendlyEmpresaError(error: { message?: string; code?: string }) {
  if (error.code === "23505" || error.message?.toLowerCase().includes("duplicate key")) {
    return "Já existe uma empresa cadastrada com este CNPJ";
  }
  return error.message ?? "Não foi possível salvar a empresa";
}

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
  const selectedId = useSelectedEmpresaId();
  const empresa = (selectedId && empresas?.find((e) => e.id === selectedId)) || empresas?.[0];

  const { data: stats, isLoading: loadingStats } = useQuery({
    enabled: !!empresa,
    queryKey: ["dashboard-stats", empresa?.id],
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
    queryFn: async ({ signal }) => {
      const limite = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("colaboradores" as never)
        .select("id,nome,cnh_categoria,cnh_validade")
        .eq("empresa_id", empresa!.id)
        .eq("status", "ativo")
        .not("cnh_validade", "is", null)
        .lte("cnh_validade", limite)
        .order("cnh_validade")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as CnhRow[];
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingStats
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="shadow-panel">
                <CardContent className="p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-4 h-7 w-32" />
                </CardContent>
              </Card>
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
            {!alertas?.length && !stats?.estoqueBaixo?.length && !cnhVencendo?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum alerta ativo. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {cnhVencendo?.map((c) => {
                  const dias = Math.ceil(
                    (new Date(c.cnh_validade + "T12:00:00").getTime() - Date.now()) / 86400_000,
                  );
                  return (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">
                        <strong>{c.nome}</strong> — CNH
                        {c.cnh_categoria ? ` cat. ${c.cnh_categoria}` : ""}{" "}
                        {dias < 0 ? "vencida em" : "vence em"} {dateBR(c.cnh_validade)}
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
                  <li key={p.id} className="flex items-center justify-between text-sm">
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
                      <div className="text-xs text-muted-foreground">
                        {l.contato?.nome ?? "—"} · vence {dateBR(l.data_vencimento)}
                      </div>
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
          <Card key={i} className="shadow-panel">
            <CardContent className="p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-7 w-32" />
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
        cnpj: digits,
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
    <div className="mx-auto max-w-lg">
      <PageHeader
        eyebrow="Bem-vindo"
        title="Cadastre sua empresa"
        description="Informe o CNPJ para preenchermos os dados automaticamente."
      />
      <Card className="shadow-panel">
        <CardContent className="p-6">
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">CNPJ</label>
              <div className="flex gap-2">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  onKeyDown={handleCnpjKeyDown}
                  placeholder="00.000.000/0000-00"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={lookupCnpj}
                  disabled={lookingUp || !form.cnpj}
                >
                  {lookingUp ? "..." : "Buscar"}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Nome da empresa <span className="text-destructive">*</span>
              </label>
              <Input
                required
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                placeholder="Minha Empresa Ltda"
              />
            </div>
            <Button type="submit" className="w-full" disabled={criarMut.isPending}>
              {criarMut.isPending ? "Criando…" : "Criar empresa"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4">
        <EmptyState
          icon={Package}
          title="O que virá a seguir"
          description="Após criar a empresa você terá acesso a vendas, financeiro, estoque, fiscal e relatórios com dados reais."
        />
      </div>
    </div>
  );
}
