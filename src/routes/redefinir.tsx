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
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="erp-surface flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Validando seu link…</p>
          <p className="text-xs text-muted-foreground">
            Aguarde enquanto confirmamos sua recuperação
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-10">
      <div className="erp-surface w-full max-w-sm rounded-2xl p-8 sm:p-10">
        <h1 className="text-display text-3xl tracking-tight">Definir nova senha</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Escolha uma senha forte com pelo menos 8 caracteres.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirma-senha">Confirmar nova senha</Label>
            <Input
              id="confirma-senha"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <Button type="submit" className="h-10 w-full rounded-xl shadow-sm transition-all hover:-translate-y-px hover:shadow-md" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </form>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link
            to="/auth"
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            ← Voltar para o login
          </Link>
        </p>
      </div>
    </main>
  );
}
