import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** sm = h-10 toolbar padrão | xs = h-9 compacto | xxs = h-8 diálogos */
  size?: "sm" | "xs" | "xxs";
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
};

// Campo de busca padrão do ERP: ícone + input + X de limpar.
export function SearchField({
  value,
  onChange,
  placeholder,
  size = "sm",
  className,
  inputClassName,
  ariaLabel = "Buscar",
}: SearchFieldProps) {
  const height =
    size === "xxs" ? "h-8 text-[13px]" : size === "xs" ? "h-9" : "h-10";
  return (
    <div className={cn("relative flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(height, "rounded-xl pl-10 pr-10 shadow-sm", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
