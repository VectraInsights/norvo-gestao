import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboOption = { value: string; label: string; icone?: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  // Ação de rodapé (ex.: "Adicionar nova conta")
  footer?: { label: string; onClick: () => void };
};

const norm = (s: string) =>
  (s ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Limite de linhas renderizadas: evita travar a rolagem com listas longas
// (o usuário refina digitando na busca).
const LIMITE_ITENS = 100;

// Dropdown editável: abre a lista e filtra digitando (padrão do financeiro/contas).
// Lista nativa com rolagem própria (overscroll-contain + wheel isolado) para
// funcionar dentro de modais sem brigar com a rolagem do diálogo de trás.
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "",
  searchPlaceholder = "",
  emptyText = "Nenhum item encontrado.",
  disabled,
  className,
  footer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hl, setHl] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const sel = options.find((o) => o.value === value);
  const rotulo = (o: ComboOption) => o.label ?? "";

  const filtrados = useMemo(() => {
    const nq = norm(q);
    if (!nq) return options;
    return options.filter((o) => norm(rotulo(o)).includes(nq));
  }, [options, q]);
  const visiveis = filtrados.slice(0, LIMITE_ITENS);

  const escolher = (v: string) => {
    onChange(v);
    setQ("");
    setHl(0);
    setOpen(false);
  };

  const rolarAte = (i: number) => {
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: "nearest" });
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = Math.min(hl + 1, visiveis.length - 1);
      setHl(n);
      rolarAte(n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(hl - 1, 0);
      setHl(n);
      rolarAte(n);
    } else if (e.key === "Enter") {
      const alvo = visiveis[hl] ?? visiveis[0];
      if (alvo) {
        e.preventDefault();
        escolher(alvo.value);
      }
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQ("");
          setHl(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-10 w-full justify-between rounded-xl px-3 font-normal shadow-sm transition-all hover:shadow-md", className)}
        >
          <span className={cn("flex min-w-0 items-center gap-2 truncate text-[15px]", !sel && "text-muted-foreground")}>
            {sel?.icone && (
              <img src={sel.icone} alt="" className="h-6 w-6 rounded-lg object-contain bg-white p-0.5 ring-1 ring-border shrink-0" />
            )}
            <span className="truncate">{sel ? rotulo(sel) : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] overflow-hidden rounded-2xl p-0 shadow-xl" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHl(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="flex h-10 w-full rounded-lg bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul
          ref={listRef}
          role="listbox"
          className="max-h-72 touch-pan-y overflow-y-auto overscroll-contain p-1"
          onWheelCapture={(e) => e.stopPropagation()}
          onTouchMoveCapture={(e) => e.stopPropagation()}
        >
          {visiveis.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
          )}
          {visiveis.map((o, i) => (
            <li key={o.value} data-idx={i}>
              <button
                type="button"
                role="option"
                aria-selected={value === o.value}
                onClick={() => escolher(o.value)}
                onMouseMove={() => {
                  if (hl !== i) setHl(i);
                }}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none",
                  hl === i && "bg-accent text-accent-foreground",
                )}
              >
                <Check className={cn("mr-2 h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                {o.icone && (
                  <img src={o.icone} alt="" className="mr-2 h-6 w-6 rounded-lg object-contain bg-white p-0.5 ring-1 ring-border shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-[15px]">{rotulo(o)}</span>
              </button>
            </li>
          ))}
        </ul>
        {filtrados.length > visiveis.length && (
          <p className="border-t border-border/60 px-4 py-2 text-center text-xs text-muted-foreground">
            Mostrando {visiveis.length} de {filtrados.length} — digite para refinar.
          </p>
        )}
        {footer && (
          <button
            className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/60"
            onClick={() => {
              setOpen(false);
              footer.onClick();
            }}
          >
            <Plus className="h-3.5 w-3.5" />{footer.label}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
