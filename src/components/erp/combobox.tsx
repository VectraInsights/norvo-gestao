import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

// Dropdown editável: abre a lista e filtra digitando (padrão do financeiro/contas).
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Digite para buscar...",
  emptyText = "Nenhum item encontrado.",
  disabled,
  className,
  footer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find((o) => o.value === value);
  const rotulo = (o: ComboOption) => o.label ?? "";
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQ("");
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
              <img src={sel.icone} alt="" className="h-6 w-6 rounded-lg object-contain bg-white ring-1 ring-border shrink-0" />
            )}
            <span className="truncate">{sel ? rotulo(sel) : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] overflow-hidden rounded-2xl p-0 shadow-xl" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList className="max-h-72 p-1">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${rotulo(o)} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setQ("");
                    setOpen(false);
                  }}
                  className="whitespace-nowrap rounded-lg"
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                  {o.icone && (
                    <img src={o.icone} alt="" className="mr-2 h-6 w-6 rounded-lg object-contain bg-white ring-1 ring-border shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[15px]">{rotulo(o)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}
