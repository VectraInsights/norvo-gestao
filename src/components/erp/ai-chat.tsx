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
        className="fixed z-50 h-10 w-10 rounded-full shadow-md bg-primary text-primary-foreground hover:bg-primary/90 touch-none select-none cursor-grab active:cursor-grabbing"
        size="icon"
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
    );
  }

  const panelStyle: CSSProperties = panelPos
    ? { left: panelPos.x, top: panelPos.y }
    : { bottom: BTN_MARGIN, right: BTN_MARGIN };
  return (
    <Card style={panelStyle} className="fixed z-50 w-[380px] max-w-[calc(100vw-24px)] max-h-[520px] flex flex-col shadow-2xl border-primary/20">
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
        className="flex flex-row items-center justify-between space-y-0 p-3 bg-primary text-primary-foreground rounded-t-lg touch-none select-none cursor-grab active:cursor-grabbing"
      >
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
