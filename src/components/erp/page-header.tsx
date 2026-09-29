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
  title, actions,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  const borderColor = useModuleColor();
  // Padrão compacto global: só o título com a linha colorida (sem eyebrow/descrição)
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className={cn("border-l-4 pl-4 py-0.5", borderColor)}>
        <h1 className="text-display text-3xl leading-tight md:text-4xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
