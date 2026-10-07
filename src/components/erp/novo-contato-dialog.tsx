import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TipoContatoRapido = "cliente" | "fornecedor" | "ambos";

type Props = {
  empresaId: string | undefined;
  /** Quando fixo, o campo Tipo some e usa este valor */
  tipoFixo?: TipoContatoRapido;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (c: { id: string; nome: string }) => void;
};

// Cadastro rápido de contato p/ usar dentro de qualquer tela que peça
// cliente/fornecedor (rodapé "Novo ..." dos Comboboxes). O cadastro completo
// (endereço, email, IE...) continua em Vendas → Clientes e fornecedores.
export function NovoContatoDialog({ empresaId, tipoFixo, open, onOpenChange, onCriado }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoContatoRapido>(tipoFixo ?? "ambos");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome("");
      setDocumento("");
      setTelefone("");
      setTipo(tipoFixo ?? "ambos");
    }
  }, [open, tipoFixo]);

  const salvar = async () => {
    if (!empresaId) {
      toast.error("Selecione uma empresa");
      return;
    }
    const n = nome.trim();
    if (!n) {
      toast.error("Informe o nome");
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from("contatos")
        .insert({
          empresa_id: empresaId,
          nome: n,
          tipo: (tipoFixo ?? tipo) as "cliente" | "fornecedor" | "ambos",
          documento: documento.replace(/\D/g, "") || null,
          telefone: telefone.trim() || null,
        })
        .select("id,nome")
        .single();
      if (error) throw error;
      // Atualiza todas as listas de contatos (chaves variam por tela)
      await qc.invalidateQueries({
        predicate: (q) => q.queryKey.some((k) => typeof k === "string" && k.includes("contat")),
      });
      toast.success("Contato cadastrado");
      onCriado({ id: data.id, nome: data.nome });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao cadastrar contato");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader className="gap-1.5 pb-1">
          <DialogTitle className="tracking-tight">
            Novo {tipoFixo === "fornecedor" ? "fornecedor" : tipoFixo === "cliente" ? "cliente" : "contato"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome / Razão social *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void salvar();
                }
              }}
              className="h-10 rounded-xl"
              autoFocus
            />
          </div>
          {!tipoFixo && (
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContatoRapido)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="ambos">Cliente e fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>CPF/CNPJ</Label>
              <Input value={documento} onChange={(e) => setDocumento(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={() => void salvar()} disabled={salvando} className="h-10 rounded-xl px-6">
            {salvando ? "Salvando..." : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
