import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { friendlyAuthError } from "./auth";

export const Route = createFileRoute("/recuperar")({
  component: RecuperarSenha,
});

function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/redefinir",
    });
    setLoading(false);
    if (error) return toast.error(friendlyAuthError(error));
    setSent(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-10">
      <div className="erp-surface w-full max-w-sm rounded-2xl p-8 sm:p-10">
        <h1 className="text-display text-3xl tracking-tight">Recuperar senha</h1>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 shadow-sm">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <MailCheck className="h-4 w-4" />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Se existir uma conta para <strong className="text-foreground">{email}</strong>, você receberá
                um link para definir uma nova senha. Verifique também a caixa de
                spam.
              </p>
            </div>
            <Button asChild variant="outline" className="h-10 w-full rounded-xl shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
              <Link to="/auth">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Informe seu email e enviaremos um link para você criar uma nova
              senha.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email-rec">Email</Label>
                <Input
                  id="email-rec"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <Button type="submit" className="h-10 w-full rounded-xl shadow-sm transition-all hover:-translate-y-px hover:shadow-md" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link de recuperação
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
          </>
        )}
      </div>
    </main>
  );
}
