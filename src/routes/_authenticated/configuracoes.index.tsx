import { MoneyInput } from "@/components/erp/money-input";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Trash2, Plus, Pencil, Check, X, Settings2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { usePermissoes } from "@/hooks/use-permissoes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: Configuracoes,
});

function Configuracoes() {
  const { data: empresa } = useEmpresaAtual();
  const { pode, ehAdmin } = usePermissoes();
  const mostrarFiscais = pode("fiscal");

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Empresa, categorias, condições de pagamento e configuração fiscal." />
      <div className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-1">
        <Link to="/configuracoes/empresas" className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent">
          <Building2 className="h-4 w-4" /> Gerenciar empresas
        </Link>
        {mostrarFiscais && (
          <Link to="/fiscal/configuracoes" className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent">
            <Settings2 className="h-4 w-4" /> Configurações fiscais
          </Link>
        )}
        {ehAdmin && (
          <Link to="/configuracoes/usuarios" className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent">
            <ShieldCheck className="h-4 w-4" /> Usuários e acessos
          </Link>
        )}
      </div>

      {!empresa ? (
        <Card className="rounded-2xl"><CardContent className="p-8 text-center text-sm text-muted-foreground">Cadastre uma empresa primeiro.</CardContent></Card>
      ) : (
        <Tabs defaultValue="categorias">
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="categorias">Categorias financeiras</TabsTrigger>
            <TabsTrigger value="condicoes">Condições de pagamento</TabsTrigger>
            <TabsTrigger value="rntrc">RNTRC</TabsTrigger>
            <TabsTrigger value="seguradoras">Seguradoras</TabsTrigger>
            <TabsTrigger value="nfe">Configuração NF-e</TabsTrigger>
          </TabsList>
          <TabsContent value="categorias"><CategoriasTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="condicoes"><CondicoesTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="rntrc"><RntrcTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="seguradoras"><SeguradorasTab empresaId={empresa.id} /></TabsContent>
          <TabsContent value="nfe"><NFeConfigTab empresaId={empresa.id} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}

function CategoriasTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"receber" | "pagar">("pagar");

  const { data } = useQuery({
    queryKey: ["categorias", empresaId],
    queryFn: async () => (await supabase.from("categorias_financeiras").select("*").eq("empresa_id", empresaId).order("tipo").order("nome")).data ?? [],
  });

  const add = async () => {
    if (!nome) return;
    const { error } = await supabase.from("categorias_financeiras").insert({
      empresa_id: empresaId, nome, tipo,
    });
    if (error) return toast.error(error.message);
    setNome("");
    qc.invalidateQueries({ queryKey: ["categorias"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("categorias_financeiras").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categorias"] });
  };

  const tipoLabel = (t: string) => t === "receber" ? "Receita" : "Despesa";
  type Cat = { id: string; nome: string; tipo: string; parent_id: string | null };
  const all = (data ?? []) as Cat[];
  const ordered = all.filter((c) => c.tipo === tipo);

  return (
    <Card className="mt-4 rounded-2xl shadow-panel"><CardContent className="p-5 sm:p-6">
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_1fr_auto]">
        <Input placeholder="Nova categoria" value={nome} onChange={(e) => setNome(e.target.value)} className="h-10 rounded-xl" />
        <Select value={tipo} onValueChange={(v) => setTipo(v as "receber" | "pagar")}>
          <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="receber">Receita</SelectItem><SelectItem value="pagar">Despesa</SelectItem></SelectContent>
        </Select>
        <Button onClick={add} className="h-10 shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {ordered.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.nome}</TableCell>
              <TableCell className="capitalize text-muted-foreground">{tipoLabel(c.tipo)}</TableCell>
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
    <Card className="mt-4 rounded-2xl shadow-panel"><CardContent className="p-5 sm:p-6">
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Input placeholder="Ex.: 30/60/90" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-10 rounded-xl" />
        <MoneyInput placeholder="Parcelas" prefix="" decimals={0} value={form.parcelas} onChange={(v) => setForm({ ...form, parcelas: v })} className="h-10" />
        <MoneyInput placeholder="Intervalo (dias)" prefix="" decimals={0} value={form.intervalo_dias} onChange={(v) => setForm({ ...form, intervalo_dias: v })} className="h-10" />
        <Button onClick={add} className="h-10 shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button>
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
      ambiente: "homologacao", serie: String(data.serie), proximo_numero: String(data.proximo_numero),
      regime_tributario: data.regime_tributario, cnae: data.cnae ?? "", natureza_operacao: data.natureza_operacao ?? "",
    });
  }, [data]);

  const save = async () => {
    const payload = {
      empresa_id: empresaId,
      ambiente: "homologacao",
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
    <Card className="mt-4 rounded-2xl shadow-panel"><CardContent className="p-5 sm:p-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Ambiente</Label>
          <div className="flex h-10 items-center rounded-xl border bg-amber-50 px-3.5 text-sm text-amber-800 shadow-sm dark:bg-amber-950/30 dark:text-amber-200">Homologação (testes)</div>
        </div>
        <div className="grid gap-1.5">
          <Label>Regime tributário</Label>
          <Select value={form.regime_tributario} onValueChange={(v) => setForm({ ...form, regime_tributario: v })}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simples">Simples Nacional</SelectItem>
              <SelectItem value="presumido">Lucro Presumido</SelectItem>
              <SelectItem value="real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5"><Label>Série</Label><Input type="number" value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} className="h-10 rounded-xl" /></div>
        <div className="grid gap-1.5"><Label>Próximo número</Label><Input type="number" value={form.proximo_numero} onChange={(e) => setForm({ ...form, proximo_numero: e.target.value })} className="h-10 rounded-xl" /></div>
        <div className="grid gap-1.5"><Label>CNAE</Label><Input value={form.cnae} onChange={(e) => setForm({ ...form, cnae: e.target.value })} className="h-10 rounded-xl" /></div>
        <div className="grid gap-1.5"><Label>Natureza da operação</Label><Input value={form.natureza_operacao} onChange={(e) => setForm({ ...form, natureza_operacao: e.target.value })} className="h-10 rounded-xl" /></div>
      </div>
      <Button onClick={save} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">Salvar configuração</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        A emissão real de NF-e exige integração com um provedor homologado (Focus NFe, PlugNotas, Nfe.io). O ambiente atual usa um stub para simular o fluxo completo.
      </p>
    </CardContent></Card>
  );
}

function RntrcTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [rntrc, setRntrc] = useState("");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [categoria, setCategoria] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRntrc, setEditRntrc] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editCategoria, setEditCategoria] = useState("");

  const formatCnpj = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return d.slice(0, 2) + "." + d.slice(2);
    if (d.length <= 8) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5);
    if (d.length <= 12) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8);
    return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
  };

  const lookupCnpj = async (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setLookingUp(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.ok) {
        const data = await res.json();
        setNome(data.razao_social || "");
        toast.success("Nome puxado automaticamente");
      }
    } catch {}
    setLookingUp(false);
  };

  const { data } = useQuery({
    queryKey: ["rntrc_lista", empresaId],
    queryFn: async () => (await supabase.from("rntrc_lista" as never).select("*").eq("empresa_id", empresaId).order("rntrc")).data ?? [],
  });

  const add = async () => {
    if (!rntrc.trim() || !nome.trim() || !cnpj.trim()) {
      toast.error("RNTRC, nome e CNPJ são obrigatórios");
      return;
    }
    if (cnpj.replace(/\D/g, "").length !== 14) {
      toast.error("CNPJ do RNTRC precisa ter 14 dígitos");
      return;
    }
    const { error } = await supabase.from("rntrc_lista" as never).insert({ empresa_id: empresaId, rntrc: rntrc.trim().toUpperCase(), nome: nome.trim(), cnpj: cnpj.trim(), categoria: categoria || null });
    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) return toast.error("Este RNTRC já está cadastrado");
      return toast.error(error.message);
    }
    setRntrc(""); setNome(""); setCnpj(""); setCategoria("");
    qc.invalidateQueries({ queryKey: ["rntrc_lista"] });
    toast.success("RNTRC cadastrado");
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditRntrc(r.rntrc);
    setEditNome(r.nome);
    setEditCnpj(r.cnpj || "");
    setEditCategoria(r.categoria || "");
  };

  const saveEdit = async (id: string) => {
    if (!editRntrc.trim() || !editNome.trim() || !editCnpj.trim()) {
      toast.error("RNTRC, nome e CNPJ são obrigatórios");
      return;
    }
    if (editCnpj.replace(/\D/g, "").length !== 14) {
      toast.error("CNPJ do RNTRC precisa ter 14 dígitos");
      return;
    }
    const { error } = await supabase.from("rntrc_lista" as never).update({ rntrc: editRntrc.trim().toUpperCase(), nome: editNome.trim(), cnpj: editCnpj.trim(), categoria: editCategoria || null }).eq("id", id);
    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) return toast.error("Este RNTRC já está cadastrado");
      return toast.error(error.message);
    }
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["rntrc_lista"] });
    toast.success("RNTRC atualizado");
  };

  const cancelEdit = () => setEditingId(null);

  const remove = async (id: string) => {
    const { error } = await supabase.from("rntrc_lista" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rntrc_lista"] });
  };

  return (
    <Card className="mt-4 rounded-2xl shadow-panel"><CardContent className="p-5 sm:p-6">
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">RNTRCs pré-cadastrados aparecem como opções ao preencher veículos.</p>
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1.5fr_1fr_auto]">
        <Input placeholder="RNTRC *" value={rntrc} onChange={(e) => setRntrc(e.target.value.toUpperCase())} className="h-10 rounded-xl uppercase" />
        <Input
          placeholder="CNPJ *"
          value={cnpj}
          onChange={(e) => {
            const formatted = formatCnpj(e.target.value);
            setCnpj(formatted);
            const digits = formatted.replace(/\D/g, "");
            if (digits.length === 14 && !nome.trim()) lookupCnpj(formatted);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const digits = cnpj.replace(/\D/g, ""); if (digits.length === 14 && !nome.trim()) lookupCnpj(cnpj); } }}
          disabled={lookingUp}
          className="h-10 rounded-xl"
        />
        <Input placeholder="Nome / Razão Social *" value={nome} onChange={(e) => setNome(e.target.value)} className="h-10 rounded-xl" />
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ETC">ETC</SelectItem>
            <SelectItem value="TAC">TAC</SelectItem>
            <SelectItem value="CTC">CTC</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={lookingUp} className="h-10 shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>RNTRC</TableHead><TableHead>CNPJ</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data?.map((r: any) => (
            editingId === r.id ? (
              <TableRow key={r.id}>
                <TableCell><Input value={editRntrc} onChange={(e) => setEditRntrc(e.target.value.toUpperCase())} className="h-9 rounded-xl uppercase" /></TableCell>
                <TableCell><Input value={editCnpj} onChange={(e) => setEditCnpj(formatCnpj(e.target.value))} className="h-9 rounded-xl" /></TableCell>
                <TableCell><Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-9 rounded-xl" /></TableCell>
                <TableCell>
                  <Select value={editCategoria} onValueChange={setEditCategoria}>
                    <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ETC">ETC</SelectItem>
                      <SelectItem value="TAC">TAC</SelectItem>
                      <SelectItem value="CTC">CTC</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => saveEdit(r.id)}><Check className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={r.id}>
                <TableCell className="font-medium uppercase">{r.rntrc}</TableCell>
                <TableCell className="text-muted-foreground">{r.cnpj || "—"}</TableCell>
                <TableCell>{r.nome}</TableCell>
                <TableCell>{r.categoria || "—"}</TableCell>
                <TableCell className="text-right gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            )
          ))}
          {data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum RNTRC cadastrado</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function SeguradorasTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [apolice, setApolice] = useState("");
  const [averbacao, setAverbacao] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editApolice, setEditApolice] = useState("");
  const [editAverbacao, setEditAverbacao] = useState("");
  const [excluindo, setExcluindo] = useState<any | null>(null);

  const formatCnpj = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return d.slice(0, 2) + "." + d.slice(2);
    if (d.length <= 8) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5);
    if (d.length <= 12) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8);
    return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
  };

  const lookupCnpj = async (val: string, setNomeFn: (v: string) => void) => {
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 14) return;
    setLookingUp(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.ok) {
        const data = await res.json();
        setNomeFn(data.razao_social || "");
        toast.success("Nome puxado automaticamente");
      }
    } catch {}
    setLookingUp(false);
  };

  const { data } = useQuery({
    queryKey: ["seguradoras", empresaId],
    queryFn: async () => (await supabase.from("seguradoras" as never).select("*").eq("empresa_id", empresaId).order("nome")).data ?? [],
  });

  const add = async () => {
    if (!nome.trim()) return toast.error("Informe o nome da seguradora");
    const { error } = await supabase.from("seguradoras" as never).insert({ empresa_id: empresaId, nome: nome.trim(), cnpj: cnpj.replace(/\D/g, "") || null, apolice_numero: apolice.trim() || null, averbacao: averbacao.trim() || null, ativo: true });
    if (error) return toast.error(error.message);
    setNome(""); setCnpj(""); setApolice(""); setAverbacao("");
    qc.invalidateQueries({ queryKey: ["seguradoras"] });
    toast.success("Seguradora cadastrada");
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditNome(r.nome || "");
    setEditCnpj(r.cnpj || "");
    setEditApolice(r.apolice_numero || "");
    setEditAverbacao(r.averbacao || "");
  };

  const saveEdit = async (id: string) => {
    if (!editNome.trim()) return toast.error("Informe o nome da seguradora");
    const { error } = await supabase.from("seguradoras" as never).update({ nome: editNome.trim(), cnpj: editCnpj.replace(/\D/g, "") || null, apolice_numero: editApolice.trim() || null, averbacao: editAverbacao.trim() || null }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["seguradoras"] });
    toast.success("Seguradora atualizada");
  };

  const cancelEdit = () => setEditingId(null);

  const doExcluir = async () => {
    if (!excluindo) return;
    const { error } = await supabase.from("seguradoras" as never).delete().eq("id", excluindo.id);
    if (error) return toast.error(error.message);
    setExcluindo(null);
    qc.invalidateQueries({ queryKey: ["seguradoras"] });
    toast.success("Seguradora excluída");
  };

  return (
    <Card className="mt-4 rounded-2xl shadow-panel"><CardContent className="p-5 sm:p-6">
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Seguradoras e apólices aparecem como opções na aba Transporte do CT-e.</p>
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.5fr_2fr_1fr_1fr_auto]">
        <Input
          placeholder="CNPJ *"
          value={cnpj}
          onChange={(e) => {
            const formatted = formatCnpj(e.target.value);
            setCnpj(formatted);
            if (formatted.replace(/\D/g, "").length === 14) lookupCnpj(formatted, setNome);
          }}
          disabled={lookingUp}
          className="h-10 rounded-xl"
        />
        <Input placeholder="Nome / Razão Social *" value={nome} onChange={(e) => setNome(e.target.value)} className="h-10 rounded-xl" />
        <Input placeholder="Nº Apólice" value={apolice} onChange={(e) => setApolice(e.target.value)} className="h-10 rounded-xl" />
        <Input placeholder="Averbação" value={averbacao} onChange={(e) => setAverbacao(e.target.value)} className="h-10 rounded-xl" />
        <Button onClick={add} disabled={lookingUp} className="h-10 shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>CNPJ</TableHead><TableHead>Nome</TableHead><TableHead>Apólice</TableHead><TableHead>Averbação</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {data?.map((r: any) => (
            editingId === r.id ? (
              <TableRow key={r.id}>
                <TableCell><Input value={editCnpj} onChange={(e) => {
                  const formatted = formatCnpj(e.target.value);
                  setEditCnpj(formatted);
                  if (formatted.replace(/\D/g, "").length === 14) lookupCnpj(formatted, setEditNome);
                }} className="h-9 rounded-xl" /></TableCell>
                <TableCell><Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-9 rounded-xl" /></TableCell>
                <TableCell><Input value={editApolice} onChange={(e) => setEditApolice(e.target.value)} className="h-9 rounded-xl" /></TableCell>
                <TableCell><Input value={editAverbacao} onChange={(e) => setEditAverbacao(e.target.value)} className="h-9 rounded-xl" /></TableCell>
                <TableCell className="text-right gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => saveEdit(r.id)}><Check className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.cnpj ? formatCnpj(r.cnpj) : "—"}</TableCell>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell>{r.apolice_numero || "—"}</TableCell>
                <TableCell>{r.averbacao || "—"}</TableCell>
                <TableCell className="text-right gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setExcluindo(r)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            )
          ))}
          {data?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhuma seguradora cadastrada</TableCell></TableRow>}
        </TableBody>
      </Table>
      <AlertDialog open={!!excluindo} onOpenChange={(v) => { if (!v) setExcluindo(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir seguradora</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Tem certeza que deseja excluir <strong>{excluindo?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction data-acao className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doExcluir}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent></Card>
  );
}
