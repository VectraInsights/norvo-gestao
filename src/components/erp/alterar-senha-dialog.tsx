import { useState } from "react";
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
import { toast } from "sonner";

export function AlterarSenhaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (nova.length < 6) return toast.error("A nova senha deve ter ao menos 6 caracteres");
    if (nova !== confirma) return toast.error("As senhas não conferem");
    setSaving(true);
    try {
      // Reautentica com a senha atual para trocar sem deslogar
      if (atual) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          const { error: errLogin } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: atual,
          });
          if (errLogin) throw new Error("Senha atual incorreta");
        }
      }
      const { error } = await supabase.auth.updateUser({ password: nova });
      if (error) throw new Error(error.message);
      toast.success("Senha alterada com sucesso!");
      setAtual("");
      setNova("");
      setConfirma("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a senha");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar minha senha</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Senha atual</Label>
            <Input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} />
          </div>
          <div>
            <Label>Nova senha *</Label>
            <Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} />
          </div>
          <div>
            <Label>Confirmar nova senha *</Label>
            <Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
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
