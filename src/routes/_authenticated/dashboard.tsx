import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Wallet, Users, Package, Building2, AlertTriangle, ShoppingCart, FileText } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: empresas, refetch } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const empresa = empresas?.[0];

  const { data: stats } = useQuery({
    enabled: !!empresa,
    queryKey: ["dashboard-stats", empresa?.id],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const [rec, pag, cli, prod, vendasMes, estoqueBaixo, vendasCount, notasPend] = await Promise.all([
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", empresa!.id).eq("tipo", "receber").in("status", ["aberto", "parcial", "vencido"]),
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", empresa!.id).eq("tipo", "pagar").in("status", ["aberto", "parcial", "vencido"]),
        supabase.from("contatos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id),
        supabase.from("produtos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id),
        supabase.from("vendas").select("total").eq("empresa_id", empresa!.id).eq("status", "faturado").gte("data", hoje.slice(0, 7) + "-01"),
        supabase.from("produtos").select("id,nome,estoque_atual,estoque_minimo,unidade").eq("empresa_id", empresa!.id).eq("ativo", true).gt("estoque_minimo", 0),
        supabase.from("vendas").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id).neq("status", "cancelado"),
        supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id).eq("status", "rascunho"),
      ]);
      const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.valor) - Number(r.valor_pago), 0);
      const receitaMes = (vendasMes.data ?? []).reduce((s, v: any) => s + Number(v.total), 0);
      const abaixo = (estoqueBaixo.data ?? []).filter((p: any) => Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0));
      return {
        aReceber: sum(rec.data),
        aPagar: sum(pag.data),
        clientes: cli.count ?? 0,
        produtos: prod.count ?? 0,
        receitaMes,
        estoqueBaixo: abaixo,
        vendasCount: vendasCount.count ?? 0,
        notasPend: notasPend.count ?? 0,
      };
    },
  });

  const { data: alertas } = useQuery({
    enabled: !!empresa, queryKey: ["alertas", empresa?.id],
    queryFn: async () => (await supabase.from("alertas").select("*").eq("empresa_id", empresa!.id).eq("lido", false).order("created_at", { ascending: false }).limit(6)).data ?? [],
  });

  const { data: proximosReceber } = useQuery({
    enabled: !!empresa, queryKey: ["proximos-receber", empresa?.id],
    queryFn: async () => (await supabase.from("lancamentos_financeiros")
      .select("id,descricao,valor,data_vencimento,contato:contatos(nome)")
      .eq("empresa_id", empresa!.id).eq("tipo", "receber").in("status", ["aberto", "parcial", "vencido"])
      .order("data_vencimento").limit(5)).data ?? [],
  });

  if (!empresa) return <FirstEmpresa onCreated={() => refetch()} />;

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
      <PageHeader eyebrow={empresa.nome_fantasia} title="Dashboard" description="Visão geral da operação em tempo real." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
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

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
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
                {proximosReceber.map((l: any) => (
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
                {stats?.estoqueBaixo?.slice(0, 5).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><strong>{p.nome}</strong> — estoque {Number(p.estoque_atual)} {p.unidade}</span>
                    <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">mín. {Number(p.estoque_minimo)}</Badge>
                  </li>
                ))}
                {alertas?.map((a: any) => (
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
    </>
  );
}

function FirstEmpresa({ onCreated }: { onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) { toast.error("Sessão expirada"); setLoading(false); return; }
    const { error } = await supabase.from("empresas").insert({
      nome_fantasia: nome, cnpj: cnpj || null, created_by: userRes.user.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Empresa criada! Categorias, condições e configuração fiscal foram provisionadas automaticamente.");
    onCreated();
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
            <Button type="submit" className="w-full" disabled={loading}>Criar empresa</Button>
          </form>
        </CardContent>
      </Card>
      <div className="mt-4">
        <EmptyState icon={Package} title="O que virá a seguir" description="Após criar a empresa você terá acesso a vendas, financeiro, estoque, fiscal e relatórios com dados reais." />
      </div>
    </div>
  );
}
