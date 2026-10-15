import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MODULE_BORDER = "border-primary";

export function PageHeader({
  title, description, eyebrow, actions,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
      <div className={cn("border-l-4 py-1 pl-4 sm:pl-5", MODULE_BORDER)}>
        {eyebrow && (
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="text-display text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
