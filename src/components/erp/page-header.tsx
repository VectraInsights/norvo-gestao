import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MODULE_BORDER = "border-primary";

export function PageHeader({
  title, actions,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  const borderColor = MODULE_BORDER;
  // Padrão compacto global: só o título com a linha colorida (sem eyebrow/descrição)
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
      <div className={cn("border-l-4 py-1 pl-4 sm:pl-5", borderColor)}>
        <h1 className="text-display text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
