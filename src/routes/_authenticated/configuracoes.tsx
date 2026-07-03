import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const { data: empresa } = useEmpresaAtual();

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Empresa, categorias, condições de pagamento e configuração fiscal." />
      <div className="mb-4">
        <Link to="/configuracoes/empresas" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <Building2 className="h-4 w-4" /> Gerenciar empresas
        </Link>
      </div>

      {!empresa ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Cadastre uma empresa primeiro.</CardContent></Card>
      ) : (
        <Tabs defaultValue="categorias">
          <TabsList>
            <TabsTrigger value="categorias">Categorias financeiras</TabsTrigger>
            <TabsTrigger value="condicoes">Condições de pagamento</TabsTrigger>
            <TabsTrigger value="nfe">Configuração NF-e</TabsTrigger>
          </TabsList>
          <TabsContent value="categorias"><CategoriasTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="condicoes"><CondicoesTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="nfe"><NFeConfigTab empresaId={empresa.id} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}

function CategoriasTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(""); const [tipo, setTipo] = useState<"receber" | "pagar">("pagar");

  const { data } = useQuery({
    queryKey: ["categorias", empresaId],
    queryFn: async () => (await supabase.from("categorias_financeiras").select("*").eq("empresa_id", empresaId).order("tipo").order("nome")).data ?? [],
  });

  const add = async () => {
    if (!nome) return;
    const { error } = await supabase.from("categorias_financeiras").insert({ empresa_id: empresaId, nome, tipo });
    if (error) return toast.error(error.message);
    setNome(""); qc.invalidateQueries({ queryKey: ["categorias"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("categorias_financeiras").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categorias"] });
  };

  const tipoLabel = (t: string) => t === "receber" ? "Receita" : "Despesa";

  return (
    <Card className="mt-4 shadow-panel"><CardContent className="p-4">
      <div className="mb-3 flex gap-2">
        <Input placeholder="Nova categoria" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Select value={tipo} onValueChange={(v) => setTipo(v as "receber" | "pagar")}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="receber">Receita</SelectItem><SelectItem value="pagar">Despesa</SelectItem></SelectContent>
        </Select>
        <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data?.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.nome}</TableCell>
              <TableCell className="capitalize text-muted-foreground">{c.tipo}</TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function CondicoesTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ nome: "", parcelas: "1", intervalo_dias: "30" });

  const { data } = useQuery({
    queryKey: ["condicoes", empresaId],
    queryFn: async () => (await supabase.from("condicoes_pagamento").select("*").eq("empresa_id", empresaId).order("parcelas")).data ?? [],
  });

  const add = async () => {
    if (!form.nome) return;
    const { error } = await supabase.from("condicoes_pagamento").insert({
      empresa_id: empresaId, nome: form.nome,
      parcelas: Number(form.parcelas), intervalo_dias: Number(form.intervalo_dias),
    });
    if (error) return toast.error(error.message);
    setForm({ nome: "", parcelas: "1", intervalo_dias: "30" });
    qc.invalidateQueries({ queryKey: ["condicoes"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("condicoes_pagamento").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["condicoes"] });
  };

  return (
    <Card className="mt-4 shadow-panel"><CardContent className="p-4">
      <div className="mb-3 grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
        <Input placeholder="Ex.: 30/60/90" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <Input type="number" placeholder="Parcelas" value={form.parcelas} onChange={(e) => setForm({ ...form, parcelas: e.target.value })} />
        <Input type="number" placeholder="Intervalo (dias)" value={form.intervalo_dias} onChange={(e) => setForm({ ...form, intervalo_dias: e.target.value })} />
        <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead className="text-right">Parcelas</TableHead><TableHead className="text-right">Intervalo (dias)</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data?.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.nome}</TableCell>
              <TableCell className="text-right text-tabular">{c.parcelas}</TableCell>
              <TableCell className="text-right text-tabular">{c.intervalo_dias}</TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function NFeConfigTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["nfe-config", empresaId],
    queryFn: async () => (await supabase.from("nfe_config").select("*").eq("empresa_id", empresaId).maybeSingle()).data,
  });
  const [form, setForm] = useState({ ambiente: "homologacao", serie: "1", proximo_numero: "1", regime_tributario: "simples", cnae: "", natureza_operacao: "Venda de mercadoria" });

  useEffect(() => {
    if (data) setForm({
      ambiente: data.ambiente, serie: String(data.serie), proximo_numero: String(data.proximo_numero),
      regime_tributario: data.regime_tributario, cnae: data.cnae ?? "", natureza_operacao: data.natureza_operacao ?? "",
    });
  }, [data]);

  const save = async () => {
    const payload = {
      empresa_id: empresaId,
      ambiente: form.ambiente,
      serie: Number(form.serie),
      proximo_numero: Number(form.proximo_numero),
      regime_tributario: form.regime_tributario,
      cnae: form.cnae || null,
      natureza_operacao: form.natureza_operacao || null,
    };
    const { error } = await supabase.from("nfe_config").upsert(payload, { onConflict: "empresa_id" });
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
    qc.invalidateQueries({ queryKey: ["nfe-config"] });
  };

  return (
    <Card className="mt-4 shadow-panel"><CardContent className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Ambiente</Label>
          <Select value={form.ambiente} onValueChange={(v) => setForm({ ...form, ambiente: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacao">Homologação (teste)</SelectItem>
              <SelectItem value="producao">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Regime tributário</Label>
          <Select value={form.regime_tributario} onValueChange={(v) => setForm({ ...form, regime_tributario: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simples">Simples Nacional</SelectItem>
              <SelectItem value="presumido">Lucro Presumido</SelectItem>
              <SelectItem value="real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Série</Label><Input type="number" value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
        <div><Label>Próximo número</Label><Input type="number" value={form.proximo_numero} onChange={(e) => setForm({ ...form, proximo_numero: e.target.value })} /></div>
        <div><Label>CNAE</Label><Input value={form.cnae} onChange={(e) => setForm({ ...form, cnae: e.target.value })} /></div>
        <div><Label>Natureza da operação</Label><Input value={form.natureza_operacao} onChange={(e) => setForm({ ...form, natureza_operacao: e.target.value })} /></div>
      </div>
      <Button onClick={save}>Salvar configuração</Button>
      <p className="text-xs text-muted-foreground">
        A emissão real de NF-e exige integração com um provedor homologado (Focus NFe, PlugNotas, Nfe.io). O ambiente atual usa um stub para simular o fluxo completo.
      </p>
    </CardContent></Card>
  );
}
