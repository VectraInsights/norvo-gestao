import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | number;
  onChange: (value: string) => void;
  allowNegative?: boolean;
  prefix?: string;
};

/**
 * Auto-decimal money input: user types digits, component formats as 1.234,56.
 * Emits the raw decimal string (e.g. "1234.56" or "-1234.56") via onChange.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, onChange, allowNegative = false, prefix = "R$", className, ...rest },
  ref,
) {
  const raw = value === null || value === undefined ? "" : String(value);
  const negative = raw.startsWith("-");
  const display = (() => {
    if (raw === "" || raw === "-") return raw;
    const n = Number(raw);
    if (isNaN(n)) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  })();

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
        className={`${prefix ? "pl-9" : ""} ${className ?? ""}`}
        value={display}
        onKeyDown={(e) => {
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
          const val = (Number(digits) / 100).toFixed(2);
          onChange(allowNegative && negative ? `-${val}` : val);
        }}
        {...rest}
      />
    </div>
  );
});
