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
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-display text-3xl">Recuperar senha</h1>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Se existir uma conta para <strong>{email}</strong>, você receberá
                um link para definir uma nova senha. Verifique também a caixa de
                spam.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe seu email e enviaremos um link para você criar uma nova
              senha.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <Label htmlFor="email-rec">Email</Label>
                <Input
                  id="email-rec"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link de recuperação
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
          </>
        )}
      </div>
    </main>
  );
}
