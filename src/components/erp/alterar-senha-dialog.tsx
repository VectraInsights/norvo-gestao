import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function AlterarSenhaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: empresa } = useEmpresaAtual();
  const [nome, setNome] = useState("");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const usr = (data as any)?.user;
        let nm = (usr?.user_metadata as any)?.nome || "";
        if (!nm && empresa && usr) {
          const { data: eu } = await supabase
            .from("empresa_users" as any)
            .select("nome")
            .eq("empresa_id", (empresa as any).id)
            .eq("user_id", usr.id)
            .maybeSingle();
          nm = (eu as any)?.nome || "";
        }
        setNome(nm || "");
      } catch {}
      setAtual("");
      setNova("");
      setConfirma("");
    })();
  }, [open, (empresa as any)?.id]);

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe seu nome");
    const querSenha = !!(atual || nova || confirma);
    if (querSenha) {
      if (nova.length < 6) return toast.error("A nova senha deve ter ao menos 6 caracteres");
      if (nova !== confirma) return toast.error("As senhas não conferem");
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      const usr = (data as any)?.user;
      if (!usr) throw new Error("Sessão expirada");
      if (querSenha) {
        // Reautentica com a senha atual para trocar sem deslogar
        if (atual && usr.email) {
          const { error: errLogin } = await supabase.auth.signInWithPassword({
            email: usr.email,
            password: atual,
          });
          if (errLogin) throw new Error("Senha atual incorreta");
        }
        const { error } = await supabase.auth.updateUser({ password: nova });
        if (error) throw new Error(error.message);
      }
      const { error: metaErr } = await supabase.auth.updateUser({ data: { nome: nome.trim() } });
      if (metaErr) throw new Error(metaErr.message);
      if (empresa && usr) {
        const { error } = await supabase
          .from("empresa_users" as any)
          .update({ nome: nome.trim() })
          .eq("empresa_id", (empresa as any).id)
          .eq("user_id", usr.id);
        if (error) {
          qc.invalidateQueries({ queryKey: ["meu-nome"] });
          toast.success("Nome atualizado no login!");
          toast.info("O cadastro da empresa não pôde ser alterado — peça a um admin.");
          onOpenChange(false);
          return;
        }
      }
      qc.invalidateQueries({ queryKey: ["meu-nome"] });
      toast.success(querSenha ? "Nome e senha atualizados!" : "Nome atualizado!");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dados da conta</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="border-t pt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Preencha abaixo somente para trocar a senha.
            </p>
            <div className="grid gap-3">
              <div>
                <Label>Senha atual</Label>
                <Input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} />
              </div>
              <div>
                <Label>Nova senha</Label>
                <Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} />
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
