import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { friendlyAuthError } from "./auth";

export const Route = createFileRoute("/redefinir")({
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(friendlyAuthError(error));
    toast.success("Senha alterada com sucesso! Use a nova senha para entrar.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            Validando seu link de recuperação...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-display text-3xl">Definir nova senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha uma senha forte com pelo menos 8 caracteres.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirma-senha">Confirmar nova senha</Label>
            <Input
              id="confirma-senha"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link
            to="/auth"
            className="underline underline-offset-4 hover:text-foreground"
          >
            ← Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
