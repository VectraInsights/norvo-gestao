import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedEmpresaId } from "@/hooks/use-empresa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: empresas } = await supabase.from("empresas").select("id").limit(1);
    if (empresas && empresas.length > 0) throw redirect({ to: "/dashboard" });
  },
  component: OnboardingPage,
});

const emptyForm = {
  cnpj: "", nome_fantasia: "", razao_social: "", email: "", telefone: "", regime_tributario: "simples" as string,
};

function regimeFromBrasilApi(d: any): string {
  if (d.opcao_pelo_mei) return "mei";
  if (d.opcao_pelo_simples) return "simples";
  const arr = Array.isArray(d.regime_tributario) ? d.regime_tributario : [];
  if (arr.length > 0) {
    const sorted = [...arr].sort((a: any, b: any) => (b.ano || 0) - (a.ano || 0));
    const forma = String(sorted[0].forma_de_tributacao || "").toLowerCase();
    if (forma.includes("lucro real")) return "lucro_real";
    if (forma.includes("lucro presumido")) return "lucro_presumido";
    if (forma.includes("simples")) return "simples";
  }
  return "lucro_presumido";
}

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const lookupCnpj = async () => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    setLookingUp(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const d = await res.json();
      setForm((f) => ({
        ...f,
        cnpj: digits,
        razao_social: d.razao_social ?? f.razao_social,
        nome_fantasia: d.nome_fantasia || d.razao_social || f.nome_fantasia,
        email: d.email ?? f.email,
        telefone: [d.ddd_telefone_1].filter(Boolean).join("") || f.telefone,
        regime_tributario: regimeFromBrasilApi(d) || f.regime_tributario,
      }));
      toast.success("Dados preenchidos a partir da Receita (regime detectado)");
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome_fantasia.trim();
    if (!nome) return toast.error("Informe o nome da empresa");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada. Entre novamente.");
      const cnpjDigits = form.cnpj.replace(/\D/g, "");
      const payload = {
        nome_fantasia: nome,
        razao_social: form.razao_social.trim() || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        cnpj: cnpjDigits || null,
        regime_tributario: (form.regime_tributario as string) || "simples",
        created_by: u.user.id,
      };
      const { data: criada, error } = await supabase
        .from("empresas")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505" || error.message?.toLowerCase().includes("duplicate key")) {
          throw new Error("Já existe uma empresa cadastrada com este CNPJ");
        }
        throw new Error(error.message);
      }
      if (criada?.id) {
        setSelectedEmpresaId(criada.id);
        // cria nfe_config com regime para PIS/COFINS automático no CT-e
        await supabase.from("nfe_config").upsert({
          empresa_id: criada.id,
          regime_tributario: (form.regime_tributario as string) || "simples",
          ambiente: "homologacao",
          serie: 1,
          proximo_numero: 1,
        } as any, { onConflict: "empresa_id" });
      }
      await qc.invalidateQueries({ queryKey: ["empresas"] });
      toast.success(`Bem-vindo(a), ${nome}!`);
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Não foi possível criar a empresa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-lg shadow-panel">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_4px_16px_-4px_var(--color-primary)] ring-1 ring-primary/30">
            <Building2 className="h-7 w-7" />
          </div>
          <CardTitle className="text-display text-2xl">Bem-vindo(a) ao Norvo!</CardTitle>
          <CardDescription>
            Falta só um passo: cadastre sua primeira empresa para começar a usar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>CNPJ (opcional)</Label>
              <div className="flex gap-2">
                <Input placeholder="00.000.000/0000-00" value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
                <Button type="button" variant="outline" onClick={lookupCnpj}
                  disabled={lookingUp || !form.cnpj}
                  title="Buscar dados na Receita Federal">
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label>Nome da empresa <span className="text-destructive">*</span></Label>
              <Input required value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                placeholder="Ex.: Minha Empresa LTDA" />
            </div>
            <div>
              <Label>Razão social</Label>
              <Input value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
            </div>
            <div>
              <Label>Regime tributário <span className="text-muted-foreground text-xs">(usado p/ PIS/COFINS no CT-e)</span></Label>
              <Select value={form.regime_tributario} onValueChange={v => setForm({ ...form, regime_tributario: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples Nacional</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  <SelectItem value="mei">MEI</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Preenchido automaticamente ao buscar CNPJ. PIS 0,65%/3% (Presumido) ou 1,65%/7,6% (Real) será aplicado no CT-e.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar empresa e começar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Você poderá complementar endereço e outros dados depois em Configurações → Empresas.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
