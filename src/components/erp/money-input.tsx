import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | number;
  onChange: (value: string) => void;
  allowNegative?: boolean;
  prefix?: string;
  decimals?: number;
};

/**
 * Auto-decimal money input: user types digits, component formats as 1.234,56.
 * Emits the raw decimal string (e.g. "1234.56" or "-1234.56") via onChange.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, allowNegative = false, prefix = "R$", decimals = 2, className, onFocus, onClick, ...rest },
  ref,
) {
  const raw = value === null || value === undefined ? "" : String(value);
  const f = Math.pow(10, decimals);
  const negative = raw.startsWith("-");
  const display = (() => {
    if (raw === "" || raw === "-") return raw;
    const n = Number(raw);
    if (isNaN(n)) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  })();

  const moveCaretToEnd = (el: HTMLInputElement | null) => {
    if (!el) return;
    const len = el.value.length;
    // Defer para após o browser posicionar o caret
    requestAnimationFrame(() => {
      try { el.setSelectionRange(len, len); } catch {}
    });
  };

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {prefix}
        </span>
      )}
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={`${prefix ? "pl-9" : ""} text-right ${className ?? ""}`}
        value={display}
        onFocus={(e) => {
          moveCaretToEnd(e.currentTarget);
          (onFocus as any)?.(e);
        }}
        onClick={(e) => {
          moveCaretToEnd(e.currentTarget);
          (onClick as any)?.(e);
        }}
        onKeyDown={(e) => {
          // Sempre manter caret no fim antes de processar a tecla — garante empurrão para esquerda
          const el = e.currentTarget as HTMLInputElement;
          if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) {
            e.preventDefault();
            moveCaretToEnd(el);
            // Re-dispara o dígito como se tivesse sido digitado no fim
            if (/^\d$/.test(e.key)) {
              const digits = (display.replace(/\D/g, "") + e.key).slice(-12);
              const val = (Number(digits) / f).toFixed(decimals);
              onChange(allowNegative && negative ? `-${val}` : val);
            } else if (e.key === "Backspace") {
              const digits = display.replace(/\D/g, "").slice(0, -1);
              if (!digits) { onChange(allowNegative && negative ? "-" : ""); }
              else {
                const val = (Number(digits) / f).toFixed(decimals);
                onChange(allowNegative && negative ? `-${val}` : val);
              }
            }
            return;
          }
          if (allowNegative && e.key === "-") {
            e.preventDefault();
            if (raw === "" || raw === "0") onChange("-");
            else if (raw === "-") onChange("");
            else onChange(negative ? raw.slice(1) : `-${raw}`);
          }
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          if (!digits) { onChange(allowNegative && negative ? "-" : ""); return; }
          const val = (Number(digits) / f).toFixed(decimals);
          onChange(allowNegative && negative ? `-${val}` : val);
          // Após formatar, garante caret no fim
          requestAnimationFrame(() => moveCaretToEnd(e.target as HTMLInputElement));
        }}
        {...rest}
      />
    </div>
  );
});
