import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  { value, onChange, allowNegative = false, prefix = "R$", decimals = 2, className, onFocus, onClick, onDoubleClick, ...rest },
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
  // Leva o caret p/ o fim SOMENTE se não houver seleção ativa — sem isso
  // o duplo-clique (e qualquer seleção com o mouse) era desfeito logo depois
  const keepOrEnd = (el: HTMLInputElement | null) => {
    if (!el) return;
    // Defer para após o browser posicionar o caret / aplicar a seleção
    requestAnimationFrame(() => {
      try {
        if (el.selectionStart === el.selectionEnd) el.setSelectionRange(el.value.length, el.value.length);
      } catch {}
    });
  };

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground pointer-events-none">
          {prefix}
        </span>
      )}
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn(`${prefix ? "pl-10" : ""} h-10 rounded-xl text-right text-tabular shadow-sm transition-shadow focus-visible:shadow-md`, className)}
        value={display}
        onFocus={(e) => {
          keepOrEnd(e.currentTarget);
          (onFocus as any)?.(e);
        }}
        onClick={(e) => {
          keepOrEnd(e.currentTarget);
          (onClick as any)?.(e);
        }}
        onDoubleClick={(e) => {
          // Duplo-clique seleciona o valor inteiro
          try { e.currentTarget.setSelectionRange(0, e.currentTarget.value.length); } catch {}
          (onDoubleClick as any)?.(e);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          const selIni = el.selectionStart ?? el.value.length;
          const selFim = el.selectionEnd ?? el.value.length;
          // Com seleção ativa, dígito recomeça o número do zero (apaga o
          // anterior) em vez de anexar no fim; apagar limpa o campo
          if (selFim > selIni) {
            if (/^\d$/.test(e.key)) {
              e.preventDefault();
              onChange((Number(e.key) / f).toFixed(decimals));
              moveCaretToEnd(el);
              return;
            }
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              onChange("");
              return;
            }
          }
          // Sempre manter caret no fim antes de processar a tecla — garante empurrão para esquerda
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
