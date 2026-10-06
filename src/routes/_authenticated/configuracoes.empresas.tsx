import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Search, Trash2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSelectedEmpresaId, setSelectedEmpresaId } from "@/hooks/use-empresa";
import { maskDoc } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/configuracoes/empresas")({
  component: EmpresasPage,
});

const emptyForm = {
  cnpj: "", nome_fantasia: "", razao_social: "", email: "", telefone: "",
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "",
  regime_tributario: "simples",
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
  const [busca, setBusca] = useState("");
  const [confirmExcluir, setConfirmExcluir] = useState(false);

  const { data: empresas } = useQuery({
    queryKey: ["empresas", "lista"],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id,created_by,created_at,updated_at,cnpj,nome_fantasia,razao_social,email,telefone,logradouro,numero,complemento,bairro,cidade,uf,cep,regime_tributario").order("created_at").limit(100);
      if (error) throw error; return (data ?? []) as Empresa[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (empresas ?? []).filter((e) => {
      if (!q) return true;
      return (e.nome_fantasia || "").toLowerCase().includes(q)
        || (e.razao_social || "").toLowerCase().includes(q)
        || (e.cnpj || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
        || (e.cidade || "").toLowerCase().includes(q);
    });
  }, [empresas, busca]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditing(empresa);
    setForm({
      cnpj: maskDoc(empresa.cnpj ?? ""),
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
      regime_tributario: (empresa as any).regime_tributario ?? "simples",
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
        regime_tributario: regimeFromBrasilApi(d),
      }));
      toast.success("Dados preenchidos a partir da Receita (regime detectado)");
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
    let targetId: string | null = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase.from("empresas").update(payload).eq("id", editing.id);
      if (error) return toast.error(friendlyEmpresaError(error));
    } else {
      const { data: inserted, error } = await supabase.from("empresas").insert({ ...payload, created_by: u.user.id }).select("id").single();
      if (error) return toast.error(friendlyEmpresaError(error));
      targetId = (inserted as any)?.id ?? null;
    }
    // sincroniza regime para nfe_config (usado no CT-e para PIS/COFINS)
    try {
      if (targetId) {
        await supabase.from("nfe_config").upsert({ empresa_id: targetId, regime_tributario: (form as any).regime_tributario || "simples" } as any, { onConflict: "empresa_id" });
      }
    } catch {}
    toast.success(editing ? "Empresa atualizada" : "Empresa criada");
    setOpen(false); setEditing(null); setForm(emptyForm);
    await qc.invalidateQueries({ queryKey: ["empresas"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    await qc.invalidateQueries({ queryKey: ["nfe-config"] });
  };

  const deleteEmpresa = async () => {
    if (!editing) return;
    const { error } = await supabase.from("empresas").delete().eq("id", editing.id);
    if (error) return toast.error(error.message);
    const remaining = (empresas ?? []).filter((empresa) => empresa.id !== editing.id);
    if (getSelectedEmpresaId() === editing.id && remaining[0]) setSelectedEmpresaId(remaining[0].id);
    toast.success("Empresa excluída");
    setConfirmExcluir(false);
    setOpen(false); setEditing(null); setForm(emptyForm);
    await qc.invalidateQueries({ queryKey: ["empresas"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Empresas" description="Empresas às quais você tem acesso." />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por nome, CNPJ ou cidade..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
            <DialogTrigger asChild><Button onClick={openNew} className="h-10 shrink-0 whitespace-nowrap rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"><Plus className="mr-1.5 h-4 w-4" />Nova empresa</Button></DialogTrigger>
            <DialogContent className="sm:max-w-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:max-h-[90vh] sm:w-full">
              <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-1.5">
                  <Label>CNPJ</Label>
                  <div className="flex gap-2">
                    <Input placeholder="00.000.000/0000-00" value={form.cnpj} className="h-10 rounded-xl"
                      onChange={(e) => setForm({ ...form, cnpj: maskDoc(e.target.value) })}
                      onKeyDown={handleCnpjKeyDown} />
                    <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.cnpj} className="h-10 w-10 shrink-0 rounded-xl shadow-sm">
                      {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5"><Label>Nome da empresa <span className="text-destructive">*</span></Label><Input required value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} className="h-10 rounded-xl" /></div>
                <div className="grid gap-1.5"><Label>Razão social</Label><Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} className="h-10 rounded-xl" /></div>
                <div className="grid gap-1.5"><Label>Regime tributário</Label>
                  <Select value={(form as any).regime_tributario} onValueChange={v => setForm({ ...form, regime_tributario: v } as any)}>
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simples">Simples Nacional</SelectItem>
                      <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                      <SelectItem value="lucro_real">Lucro Real</SelectItem>
                      <SelectItem value="mei">MEI</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">Usado para PIS/COFINS automático no CT-e.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl" /></div>
                  <div className="grid gap-1.5"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="h-10 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px]">
                  <div className="grid gap-1.5"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="h-10 rounded-xl" /></div>
                  <div className="grid gap-1.5"><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="h-10 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="h-10 rounded-xl" /></div>
                  <div className="grid gap-1.5"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="h-10 rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_80px_120px]">
                  <div className="grid gap-1.5"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="h-10 rounded-xl" /></div>
                  <div className="grid gap-1.5"><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="h-10 rounded-xl" /></div>
                  <div className="grid gap-1.5"><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="h-10 rounded-xl" /></div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  {editing && (
                    <Button type="button" variant="destructive" onClick={() => setConfirmExcluir(true)} className="h-10 rounded-xl px-5">
                      <Trash2 className="mr-2 h-4 w-4" />Excluir
                    </Button>
                  )}
                  <Button type="submit" className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirmExcluir} onOpenChange={setConfirmExcluir}>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader className="gap-1.5">
                <AlertDialogTitle className="tracking-tight">Excluir {editing?.nome_fantasia}?</AlertDialogTitle>
                <AlertDialogDescription className="leading-relaxed">
                  Esta ação é crítica e irreversível: todos os dados vinculados a esta empresa também serão removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction data-acao className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteEmpresa}>
                  Excluir empresa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <Card className="overflow-hidden rounded-2xl shadow-panel">
        <Table>
          <TableHeader><TableRow><TableHead>Nome fantasia</TableHead><TableHead>Razão social</TableHead><TableHead>CNPJ</TableHead><TableHead>Cidade</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
          <TableBody>
            {filtrados.map((e) => (
              <TableRow key={e.id} className="transition-colors hover:bg-accent/30">
                <TableCell className="font-medium">{e.nome_fantasia}</TableCell>
                <TableCell className="text-muted-foreground">{e.razao_social ?? "—"}</TableCell>
                <TableCell className="text-tabular">{e.cnpj ? maskDoc(e.cnpj) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.cidade ? `${e.cidade}/${e.uf ?? ""}` : "—"}</TableCell>
                <TableCell className="w-12">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Editar" onClick={() => openEdit(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
