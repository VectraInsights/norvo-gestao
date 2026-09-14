import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEmpresaAtual } from "@/hooks/use-empresa";

type Message = { role: "user" | "assistant"; content: string };

const SUGESTOES = [
  "Quanto tenho de contas a pagar vencidas?",
  "Listar veículos da frota",
  "Resumo financeiro do mês",
  "Quais motoristas estão ativos?",
];

export function AIChat() {
  const { data: empresa } = useEmpresaAtual();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading || !empresa) return;
    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    const all = [...messages, userMsg];
    setMessages(all);
    setLoading(true);

    try {
      // VITE_AI_URL aponta para o Worker (chat roda no binding AI nativo).
      // Vazio = mesma origem (quando o app é servido pelo próprio Worker).
      const aiBase = (import.meta as any).env?.VITE_AI_URL || "";
      const res = await fetch(`${aiBase}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: all.map(m => ({ role: m.role, content: m.content })),
          empresaId: empresa.id,
        }),
      });
      const data = await res.json();
      setMessages([...all, { role: "assistant", content: data.reply || data.error || "Erro ao obter resposta." }]);
    } catch (e) {
      setMessages([...all, { role: "assistant", content: "Erro de conexão. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
        size="icon"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[520px] flex flex-col shadow-2xl border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <span className="text-sm font-semibold">Assistente Norvo</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col min-h-0">
        {/* Área de mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 max-h-[340px]">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                Olá! Sou o assistente do Norvo Gestão. Como posso ajudar?
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {SUGESTOES.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="h-auto py-2 px-3 text-xs text-left justify-start font-normal"
                    onClick={() => send(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-start">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-muted-foreground">Pensando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              className="text-xs"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0 h-9 w-9">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
