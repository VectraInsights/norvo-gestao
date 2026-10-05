import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MODULE_BORDER = "border-primary";

export function PageHeader({
  title, actions,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  const borderColor = MODULE_BORDER;
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
