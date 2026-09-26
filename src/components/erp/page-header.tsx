import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const MODULE_COLORS: Record<string, string> = {
  "/financeiro":    "border-emerald-500",
  "/vendas":        "border-violet-500",
  "/estoque":       "border-amber-500",
  "/frota":         "border-orange-500",
  "/projetos":      "border-sky-500",
  "/rh":            "border-pink-500",
  "/fiscal":        "border-blue-500",
  "/configuracoes": "border-rose-500",
  "/dashboard":     "border-primary",
};

function useModuleColor() {
  const location = useLocation();
  const match = Object.entries(MODULE_COLORS).find(([prefix]) =>
    location.pathname.startsWith(prefix),
  );
  return match?.[1] ?? "border-primary";
}

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  const borderColor = useModuleColor();
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
      <div className={cn("border-l-4 pl-4", borderColor)}>
        {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-1 text-display text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
