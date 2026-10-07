import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type TipoContatoRapido = "cliente" | "fornecedor" | "ambos";

type Props = {
  empresaId: string | undefined;
  /** Quando fixo, o campo Tipo some e usa este valor */
  tipoFixo?: TipoContatoRapido;
  /** Título personalizado (ex.: "Novo credor" mantendo tipo fornecedor) */
  titulo?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (c: { id: string; nome: string }) => void;
};

const emptyForm = () => ({
  nome: "", documento: "", email: "", telefone: "", ie: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", observacoes: "",
  isCliente: true, isFornecedor: false,
});

// Cadastro de contato em tela cheia, com os dados completos (mesmos campos de
// Vendas → Clientes e fornecedores), p/ usar dentro de qualquer tela que peça
// cliente/fornecedor (rodapé "Novo ..." dos Comboboxes).
export function NovoContatoDialog({ empresaId, tipoFixo, titulo, open, onOpenChange, onCriado }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [lookingUp, setLookingUp] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...emptyForm(),
        isCliente: !tipoFixo || tipoFixo === "cliente" || tipoFixo === "ambos",
        isFornecedor: !tipoFixo || tipoFixo === "fornecedor" || tipoFixo === "ambos",
      });
    }
  }, [open, tipoFixo]);

  const lookupCnpj = async () => {
    const digits = form.documento.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    if (!empresaId) {
      toast.error("Empresa não selecionada");
      return;
    }
    setLookingUp(true);
    try {
      const { data: existente } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresaId).eq("documento", digits).maybeSingle();
      if (existente) {
        toast.error(`Já cadastrado: ${(existente as { nome: string }).nome}`);
        return;
      }
      let d: any = null;
      for (const url of [
        `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
        `https://receitaws.com.br/v1/cnpj/${digits}`,
      ]) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) { d = await res.json(); break; }
        } catch { /* tenta próxima */ }
      }
      if (!d || d.status === "ERROR") throw new Error("CNPJ não encontrado nas APIs públicas");
      setForm((f) => ({
        ...f,
        documento: digits,
        nome: d.razao_social || d.nome || d.nome_fantasia || f.nome,
        email: d.email || f.email,
        telefone: d.ddd_telefone_1 || d.telefone || d.phone || f.telefone,
        cep: String(d.cep ?? d.zip ?? f.cep ?? "").replace(/\D/g, "") || f.cep,
        logradouro: d.logradouro || d.street || f.logradouro,
        numero: String(d.numero ?? d.number ?? f.numero ?? "") || f.numero,
        complemento: d.complemento || f.complemento,
        bairro: d.bairro || d.district || f.bairro,
        cidade: d.municipio || d.city || f.cidade,
        uf: d.uf || d.state || f.uf,
      }));
      toast.success("Dados preenchidos a partir da Receita");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao consultar CNPJ");
    } finally {
      setLookingUp(false);
    }
  };

  const salvar = async () => {
    if (!empresaId) {
      toast.error("Selecione uma empresa");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    if (!form.isCliente && !form.isFornecedor) {
      toast.error("Selecione ao menos um tipo: Cliente ou Fornecedor");
      return;
    }
    const tipo: TipoContatoRapido =
      form.isCliente && form.isFornecedor ? "ambos"
      : form.isCliente ? "cliente" : "fornecedor";
    setSalvando(true);
    try {
      const doc = form.documento.replace(/\D/g, "");
      if (doc) {
        const { data: existente } = await supabase.from("contatos")
          .select("id,nome").eq("empresa_id", empresaId).eq("documento", doc).maybeSingle();
        if (existente) throw new Error(`Já existe um contato com este CPF/CNPJ: ${(existente as { nome: string }).nome}`);
      }
      const { data, error } = await supabase.from("contatos").insert({
        empresa_id: empresaId,
        nome: form.nome.trim(),
        tipo,
        documento: doc || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        ie: form.ie.trim() || null,
        cep: form.cep.trim() || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        observacoes: form.observacoes.trim() || null,
      }).select("id,nome").single();
      if (error) throw error;
      // Atualiza todas as listas de contatos (chaves variam por tela)
      await qc.invalidateQueries({
        predicate: (q) => q.queryKey.some((k) => typeof k === "string" && k.includes("contat")),
      });
      toast.success("Contato cadastrado");
      onCriado({ id: (data as { id: string }).id, nome: (data as { nome: string }).nome });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao cadastrar contato");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none max-h-none rounded-none p-6 overflow-y-auto sm:p-8">
        <DialogHeader className="gap-1.5 pb-1">
          <DialogTitle className="tracking-tight">
            {titulo ?? (tipoFixo === "fornecedor" ? "Novo fornecedor" : tipoFixo === "cliente" ? "Novo cliente" : "Novo contato")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>CPF/CNPJ</Label>
            <div className="flex gap-2">
              <Input
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!lookingUp && form.documento) void lookupCnpj();
                }}
                className="h-10 rounded-xl"
              />
              <Button
                type="button" variant="outline" onClick={() => void lookupCnpj()}
                disabled={lookingUp || !form.documento} className="h-10 rounded-xl"
                title="Buscar dados na Receita"
              >
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div><Label>Nome / Razão social *</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>IE</Label><Input value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value })} placeholder="ISENTO" className="h-10 rounded-xl" /></div>
          </div>
          {!tipoFixo && (
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
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="h-10 rounded-xl" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="h-10 rounded-xl" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="h-10 rounded-xl" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="h-10 rounded-xl" /></div>
            <div><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="h-10 rounded-xl" /></div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="rounded-xl" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl">Cancelar</Button>
          <Button
            onClick={() => void salvar()}
            disabled={salvando || (!form.isCliente && !form.isFornecedor)}
            className="h-10 rounded-xl px-6"
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
