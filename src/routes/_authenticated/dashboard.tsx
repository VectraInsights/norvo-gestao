import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Wallet, Users, Package, FileWarning, Building2 } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
      const [rec, pag, cli, prod] = await Promise.all([
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", empresa!.id).eq("tipo", "receber").in("status", ["aberto", "parcial", "vencido"]),
        supabase.from("lancamentos_financeiros").select("valor,valor_pago").eq("empresa_id", empresa!.id).eq("tipo", "pagar").in("status", ["aberto", "parcial", "vencido"]),
        supabase.from("contatos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id),
        supabase.from("produtos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa!.id),
      ]);
      const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.valor) - Number(r.valor_pago), 0);
      return {
        aReceber: sum(rec.data),
        aPagar: sum(pag.data),
        clientes: cli.count ?? 0,
        produtos: prod.count ?? 0,
      };
    },
  });

  if (!empresa) return <FirstEmpresa onCreated={() => refetch()} />;

  const cards = [
    { label: "A receber (em aberto)", value: brl(stats?.aReceber ?? 0), icon: ArrowUpRight, tone: "text-success" },
    { label: "A pagar (em aberto)",   value: brl(stats?.aPagar ?? 0),   icon: ArrowDownRight, tone: "text-destructive" },
    { label: "Saldo projetado",        value: brl((stats?.aReceber ?? 0) - (stats?.aPagar ?? 0)), icon: Wallet, tone: "text-foreground" },
    { label: "Clientes cadastrados",   value: String(stats?.clientes ?? 0), icon: Users, tone: "text-foreground" },
    { label: "Produtos em catálogo",   value: String(stats?.produtos ?? 0), icon: Package, tone: "text-foreground" },
  ];

  return (
    <>
      <PageHeader eyebrow={empresa.nome_fantasia} title="Dashboard" description="Visão geral da operação em tempo real." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="mt-8">
        <EmptyState
          icon={FileWarning}
          title="Comece cadastrando dados"
          description="Este é o esqueleto do ERP. Adicione clientes, produtos e lançamentos para popular os relatórios."
        />
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
    toast.success("Empresa criada!");
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
    </div>
  );
}
