import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PrimaryButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "outline" | "ghost";
  /** md = h-10 header padrão | sm = h-9 compacto | xs = h-8 mini */
  size?: "md" | "sm" | "xs";
  disabled?: boolean;
  className?: string;
};

// Botão primário padrão do ERP ("Novo X" nos headers).
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  variant = "default",
  size = "md",
  disabled,
  className,
}: PrimaryButtonProps) {
  const height =
    size === "xs"
      ? "h-8 rounded-lg px-3 text-xs"
      : size === "sm"
        ? "h-9 rounded-xl px-4 text-sm"
        : "h-10 rounded-xl px-5";
  return (
    <Button
      type={type}
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        height,
        "shrink-0 whitespace-nowrap shadow-sm transition-all hover:-translate-y-px hover:shadow-md active:scale-95",
        className,
      )}
    >
      {children}
    </Button>
  );
}
