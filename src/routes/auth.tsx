import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import norvoLogo from "@/assets/norvo-logo.png";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const isDesktop =
  typeof window !== "undefined" &&
  ["127.0.0.1", "localhost"].includes(window.location.hostname);

export function friendlyAuthError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  const m = msg.toLowerCase();
  if (m.includes("weak_password") || m.includes("pwned"))
    return "Senha fraca ou já exposta em vazamentos conhecidos. Use uma senha mais forte: 12+ caracteres misturando letras maiúsculas, minúsculas, números e símbolos.";
  if (m.includes("rate_limit") || m.includes("too many") || m.includes("over_"))
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  if (m.includes("already exists") || m.includes("already registered"))
    return "Já existe uma conta com este email. Tente entrar ou recuperar a senha.";
  if (m.includes("invalid login credentials"))
    return "Email ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu email antes de entrar. Verifique a caixa de entrada e a pasta de spam/lixo eletrônico.";
  if (m.includes("signup") && (m.includes("not allowed") || m.includes("disabled")))
    return "Novos cadastros estão desativados neste projeto.";
  return msg || "Ocorreu um erro inesperado. Tente novamente.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleGoogle = async () => {
    if (isDesktop) {
      toast.info(
        "Entrar com Google está disponível apenas na versão web do Norvo. Neste aplicativo, use email e senha.",
        { duration: 8000 }
      );
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setLoading(false);
      toast.error(friendlyAuthError(error));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(friendlyAuthError(error));
    navigate({ to: "/dashboard", replace: true });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: nome } },
    });
    setLoading(false);
    if (error) return toast.error(friendlyAuthError(error));
    toast.success("Conta criada! Verifique seu email para confirmar.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Lado esquerdo — marca */}
      <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-foreground/10 backdrop-blur">
            <img src={norvoLogo} alt="" width={28} height={28} className="h-7 w-7" />
          </div>
          <span className="text-display text-xl">Norvo</span>
        </Link>
        <div>
          <p className="text-display text-4xl leading-tight">
            "Menos abas abertas.<br /><em>Mais decisões tomadas.</em>"
          </p>
          <p className="mt-4 text-sm text-primary-foreground/70">Gestão financeira, comercial, estoque e fiscal em um só ambiente.</p>
        </div>
        <p className="text-xs uppercase tracking-widest text-primary-foreground/60">Norvo · v0.1</p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-display text-3xl">Acesse sua conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ou crie uma nova em segundos.</p>

          <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle} disabled={loading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10v4h5.5c-.7 2-2.6 3.5-5.5 3.5A5.5 5.5 0 016.5 12 5.5 5.5 0 0112 6.5c1.4 0 2.6.5 3.6 1.4L18.4 5C16.7 3.4 14.5 2.5 12 2.5A9.5 9.5 0 002.5 12 9.5 9.5 0 0012 21.5c5.4 0 9.3-3.8 9.3-9.2 0-.7-.1-1.4-.2-2H12z"/></svg>
            Continuar com Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-3">
                <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="p1">Senha</Label><Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar
                </Button>
                <div className="text-right">
                  <Link
                    to="/recuperar"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignup} className="space-y-3">
                <div><Label htmlFor="n2">Nome completo</Label><Input id="n2" required value={nome} onChange={(e) => setNome(e.target.value)} /></div>
                <div><Label htmlFor="e2">Email</Label><Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="p2">Senha</Label><Input id="p2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-4 hover:text-foreground">← Voltar para o site</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
