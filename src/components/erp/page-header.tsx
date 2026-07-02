import type { ReactNode } from "react";

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
      <div>
        {eyebrow && <p className="text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>}
        <h1 className="mt-1 text-display text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
