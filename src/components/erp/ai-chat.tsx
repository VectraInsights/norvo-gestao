import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
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

const BTN_SIZE = 40;
const BTN_MARGIN = 12;
const PANEL_W = 380;

type XY = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function loadPos(key: string): XY | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
  } catch {}
  return null;
}

export function AIChat() {
  const { data: empresa } = useEmpresaAtual();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Posição arrastável (persistida) — botão e painel
  const [btnPos, setBtnPos] = useState<XY | null>(() => loadPos("norvo-ai-btn-pos"));
  const [panelPos, setPanelPos] = useState<XY | null>(() => loadPos("norvo-ai-panel-pos"));
  const btnDrag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const panelDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

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
    const style: CSSProperties = btnPos
      ? { left: btnPos.x, top: btnPos.y }
      : { bottom: BTN_MARGIN, right: BTN_MARGIN };
    return (
      <Button
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const cur = btnPos ?? {
            x: window.innerWidth - BTN_MARGIN - BTN_SIZE,
            y: window.innerHeight - BTN_MARGIN - BTN_SIZE,
          };
          btnDrag.current = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = btnDrag.current;
          if (!d) return;
          const nx = clamp(d.ox + e.clientX - d.sx, 0, window.innerWidth - BTN_SIZE);
          const ny = clamp(d.oy + e.clientY - d.sy, 0, window.innerHeight - BTN_SIZE);
          if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
          setBtnPos({ x: nx, y: ny });
        }}
        onPointerUp={() => {
          const d = btnDrag.current;
          btnDrag.current = null;
          if (!d) return;
          if (d.moved) {
            setBtnPos((p) => {
              if (p) { try { localStorage.setItem("norvo-ai-btn-pos", JSON.stringify(p)); } catch {} }
              return p;
            });
          } else {
            setOpen(true);
          }
        }}
        onClick={(e) => {
          // Clique sem arrastar abre; arrastar só move
          if (btnDrag.current?.moved) e.preventDefault();
        }}
        style={style}
        title="Assistente — clique para abrir, arraste para mover"
        className="fixed z-50 h-12 w-12 rounded-2xl shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-xl transition-all touch-none select-none cursor-grab active:cursor-grabbing"
        size="icon"
      >
        <MessageSquare className="h-5 w-5" />
      </Button>
    );
  }

  const panelStyle: CSSProperties = panelPos
    ? { left: panelPos.x, top: panelPos.y }
    : { bottom: BTN_MARGIN, right: BTN_MARGIN };
  return (
    <Card style={panelStyle} className="fixed z-50 w-[380px] max-w-[calc(100vw-24px)] max-h-[560px] flex flex-col overflow-hidden rounded-2xl shadow-2xl border-primary/20">
      <CardHeader
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          const cur = panelPos ?? {
            x: window.innerWidth - BTN_MARGIN - PANEL_W,
            y: window.innerHeight - BTN_MARGIN - 520,
          };
          panelDrag.current = { sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y };
        }}
        onPointerMove={(e) => {
          const d = panelDrag.current;
          if (!d) return;
          setPanelPos({
            x: clamp(d.ox + e.clientX - d.sx, 0, window.innerWidth - 100),
            y: clamp(d.oy + e.clientY - d.sy, 0, window.innerHeight - 60),
          });
        }}
        onPointerUp={() => {
          panelDrag.current = null;
          setPanelPos((p) => {
            if (p) { try { localStorage.setItem("norvo-ai-panel-pos", JSON.stringify(p)); } catch {} }
            return p;
          });
        }}
        title="Arraste para mover"
        className="flex flex-row items-center justify-between space-y-0 rounded-t-2xl p-4 bg-primary text-primary-foreground touch-none select-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary-foreground/15">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Assistente Norvo</div>
            <div className="text-[11px] opacity-80">Sempre por aqui quando precisar</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl text-primary-foreground hover:bg-primary-foreground/20"
          onClick={() => setOpen(false)}
          aria-label="Fechar assistente"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col min-h-0">
        {/* Área de mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 max-h-[360px]">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-muted-foreground text-center">
                Olá! Sou o assistente do Norvo Gestão. Como posso ajudar?
              </p>
              <div className="grid grid-cols-1 gap-2">
                {SUGESTOES.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="h-auto justify-start rounded-xl px-3.5 py-2.5 text-left text-xs font-normal shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
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
                <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-2xl rounded-bl-md bg-muted"
                }`}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="h-7 w-7 rounded-xl bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 items-start">
              <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-muted-foreground">Pensando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t bg-card p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2.5"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              className="h-10 rounded-xl text-[13px]"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-10 w-10 shrink-0 rounded-xl shadow-sm" aria-label="Enviar mensagem">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
