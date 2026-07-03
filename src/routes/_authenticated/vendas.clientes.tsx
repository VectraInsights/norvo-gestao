import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TipoContato = Database["public"]["Enums"]["contato_tipo"];
type Contato = {
  id: string; nome: string; tipo: TipoContato;
  documento: string | null; email: string | null; telefone: string | null;
};

export const Route = createFileRoute("/_authenticated/vendas/clientes")({
  component: Clientes,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const emptyForm = () => ({
  nome: "", documento: "", email: "", telefone: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", observacoes: "",
  isCliente: true, isFornecedor: false,
});

function onlyDigits(s: string) { return s.replace(/\D/g, ""); }

function Clientes() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lookingUp, setLookingUp] = useState(false);

  const lookupCnpj = async () => {
    const digits = onlyDigits(form.documento);
    if (digits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
    if (!empresa) return toast.error("Empresa não selecionada");
    setLookingUp(true);
    try {
      const { data: existente } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresa.id).eq("documento", digits).maybeSingle();
      if (existente) {
        toast.error(`Já cadastrado: ${existente.nome}`);
        return;
      }
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const d = await res.json();
      setForm((f) => ({
        ...f,
        documento: digits,
        nome: d.razao_social || d.nome_fantasia || f.nome,
        email: d.email ?? f.email,
        telefone: d.ddd_telefone_1 ?? f.telefone,
        cep: d.cep ?? f.cep,
        logradouro: d.logradouro ?? f.logradouro,
        numero: d.numero ?? f.numero,
        complemento: d.complemento ?? f.complemento,
        bairro: d.bairro ?? f.bairro,
        cidade: d.municipio ?? f.cidade,
        uf: d.uf ?? f.uf,
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
    if (!lookingUp && form.documento) lookupCnpj();
  };

  const { data: contatos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<Contato[]> => {
      const { data, error } = await supabase.from("contatos")
        .select("id,nome,tipo,documento,email,telefone")
        .eq("empresa_id", empresa!.id).order("nome").abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Contato[];
    },
  });

  const criar = useMutation({
    mutationFn: async (input: ReturnType<typeof emptyForm>) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!input.isCliente && !input.isFornecedor) {
        throw new Error("Selecione ao menos um tipo: Cliente ou Fornecedor");
      }
      const tipo: TipoContato =
        input.isCliente && input.isFornecedor ? "ambos"
        : input.isCliente ? "cliente" : "fornecedor";

      const doc = onlyDigits(input.documento);
      if (doc) {
        const { data: existente, error: errBusca } = await supabase.from("contatos")
          .select("id,nome").eq("empresa_id", empresa.id).eq("documento", doc).maybeSingle();
        if (errBusca) throw errBusca;
        if (existente) throw new Error(`Já existe um contato com este CPF/CNPJ: ${existente.nome}`);
      }

      const { error } = await supabase.from("contatos").insert({
        empresa_id: empresa.id,
        nome: input.nome,
        tipo,
        documento: doc || null,
        email: input.email || null,
        telefone: input.telefone || null,
        cep: input.cep || null,
        logradouro: input.logradouro || null,
        numero: input.numero || null,
        complemento: input.complemento || null,
        bairro: input.bairro || null,
        cidade: input.cidade || null,
        uf: input.uf || null,
        observacoes: input.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setOpen(false); setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader eyebrow="Vendas & CRM" title="Clientes e fornecedores" description="Cadastro unificado de contatos."
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) setOpen(v); }}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Novo contato</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); criar.mutate(form); }} className="space-y-3">
                <div><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div>
                  <Label>Tipo *</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.isCliente} onCheckedChange={(v) => setForm({ ...form, isCliente: v === true })} />
                      Cliente
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.isFornecedor} onCheckedChange={(v) => setForm({ ...form, isFornecedor: v === true })} />
                      Fornecedor
                    </label>
                  </div>
                </div>
                <div>
                  <Label>CPF/CNPJ</Label>
                  <div className="flex gap-2">
                    <Input value={form.documento}
                      onChange={(e) => setForm({ ...form, documento: e.target.value })}
                      onKeyDown={handleCnpjKeyDown} />
                    <Button type="button" variant="outline" onClick={lookupCnpj} disabled={lookingUp || !form.documento}>
                      {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
                  <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                  <div><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></div>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending || (!form.isCliente && !form.isFornecedor)}>
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : !contatos?.length ? (
        <EmptyState icon={Users} title="Nenhum contato" description="Cadastre clientes, fornecedores e transportadoras." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead></TableRow></TableHeader>
            <TableBody>
              {contatos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{c.tipo}</TableCell>
                  <TableCell className="text-tabular">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? c.telefone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
