import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, Search, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSelectedEmpresaId, setSelectedEmpresaId } from "@/hooks/use-empresa";

export const Route = createFileRoute("/_authenticated/configuracoes/empresas")({
  component: EmpresasPage,
});

const emptyForm = {
  cnpj: "", nome_fantasia: "", razao_social: "", email: "", telefone: "",
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "",
};

type Empresa = typeof emptyForm & { id: string; created_by?: string; created_at?: string; updated_at?: string };

function friendlyEmpresaError(error: { message?: string; code?: string }) {
  if (error.code === "23505" || error.message?.toLowerCase().includes("duplicate key")) {
    return "Já existe uma empresa cadastrada com este CNPJ";
  }
  return error.message ?? "Não foi possível salvar a empresa";
}

function EmpresasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const { data: empresas } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error; return (data ?? []) as Empresa[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditing(empresa);
    setForm({
      cnpj: empresa.cnpj ?? "",
      nome_fantasia: empresa.nome_fantasia ?? "",
      razao_social: empresa.razao_social ?? "",
      email: empresa.email ?? "",
      telefone: empresa.telefone ?? "",
      logradouro: empresa.logradouro ?? "",
      numero: empresa.numero ?? "",
      complemento: empresa.complemento ?? "",
      bairro: empresa.bairro ?? "",
      cidade: empresa.cidade ?? "",
      uf: empresa.uf ?? "",
      cep: empresa.cep ?? "",
    });
    setOpen(true);
  };

  const lookupCnpj = async () => {
    const digits = form.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    setLookingUp(true);
    try {
      let dupQ = supabase.from("empresas").select("id,nome_fantasia").eq("cnpj", digits);
      if (editing) dupQ = dupQ.neq("id", editing.id);
      const { data: dup } = await dupQ.maybeSingle();
      if (dup) {
        toast.error(`CNPJ já cadastrado: ${dup.nome_fantasia}`);
        setLookingUp(false);
        return;
      }
    } catch { /* ignore, seguirá para busca */ }
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
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  const handleCnpjKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!lookingUp && form.cnpj) lookupCnpj();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Sessão expirada");
    const nome = form.nome_fantasia.trim();
    if (!nome) return toast.error("Informe o nome da empresa");
    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    if (cnpjDigits) {
      let dupQuery = supabase.from("empresas").select("id").eq("cnpj", cnpjDigits);
      if (editing) dupQuery = dupQuery.neq("id", editing.id);
      const { data: dup, error: dupError } = await dupQuery.maybeSingle();
      if (dupError) return toast.error(dupError.message);
      if (dup) return toast.error("Já existe uma empresa cadastrada com este CNPJ");
    }
    const payload = { ...form, nome_fantasia: nome, cnpj: cnpjDigits || null };
    const { error } = editing
      ? await supabase.from("empresas").update(payload).eq("id", editing.id)
      : await supabase.from("empresas").insert({ ...payload, created_by: u.user.id });
    if (error) return toast.error(friendlyEmpresaError(error));
    toast.success(editing ? "Empresa atualizada" : "Empresa criada");
    setOpen(false); setEditing(null); setForm(emptyForm);
    await qc.invalidateQueries({ queryKey: ["empresas"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const deleteEmpresa = async () => {
    if (!editing) return;
    const ok = window.confirm(`Excluir ${editing.nome_fantasia}? Todos os dados vinculados a esta empresa também serão removidos.`);
    if (!ok) return;
    const { error } = await supabase.from("empresas").delete().eq("id", editing.id);
    if (error) return toast.error(error.message);
    const remaining = (empresas ?? []).filter((empresa) => empresa.id !== editing.id);
    if (getSelectedEmpresaId() === editing.id && remaining[0]) setSelectedEmpresaId(remaining[0].id);
    toast.success("Empresa excluída");
    setOpen(false); setEditing(null); setForm(emptyForm);
    await qc.invalidateQueries({ queryKey: ["empresas"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Empresas" description="Empresas às quais você tem acesso."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova empresa</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label>CNPJ</Label>
                  <div className="flex gap-2">
                    <Input placeholder="00.000.000/0000-00" value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                      onKeyDown={handleCnpjKeyDown} />
                    <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.cnpj}>
                      {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div><Label>Nome da empresa <span className="text-destructive">*</span></Label><Input required value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
                <div><Label>Razão social</Label><Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                  <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                  <div><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-[1fr_80px_120px] gap-3">
                  <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                  <div><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
                  <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  {editing && (
                    <Button type="button" variant="destructive" onClick={deleteEmpresa}>
                      <Trash2 className="mr-2 h-4 w-4" />Excluir
                    </Button>
                  )}
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="overflow-hidden shadow-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Nome fantasia</TableHead><TableHead>Razão social</TableHead><TableHead>CNPJ</TableHead><TableHead>Cidade</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
          <TableBody>
            {empresas?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nome_fantasia}</TableCell>
                <TableCell className="text-muted-foreground">{e.razao_social ?? "—"}</TableCell>
                <TableCell className="text-tabular">{e.cnpj ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.cidade ? `${e.cidade}/${e.uf ?? ""}` : "—"}</TableCell>
                <TableCell className="w-10">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
