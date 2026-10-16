import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** cor do icone (ex.: "text-success"); secundaria usa muted por padrao */
  tone?: string;
  /** "primary" = destaque h-[120px] | "secondary" = suporte h-[96px] */
  variant?: "primary" | "secondary";
  className?: string;
};

// Card de metrica padrao do ERP (dashboard; reutilizavel em resumo de modulos).
export function StatCard({ icon: Icon, label, value, tone, variant = "primary", className }: StatCardProps) {
  const secondary = variant === "secondary";
  return (
    <Card
      className={cn(
        "rounded-2xl shadow-panel transition-all duration-200 hover:-translate-y-0.5",
        secondary ? "bg-muted/30 hover:shadow-md" : "group hover:border-primary/25 hover:shadow-md",
        className,
      )}
    >
      <CardContent className={cn("flex items-center gap-3 p-4", secondary ? "h-[96px]" : "h-[120px]")}>
        <span
          className={cn(
            "grid shrink-0 place-items-center",
            secondary ? "h-8 w-8 rounded-lg bg-background shadow-sm" : "h-9 w-9 rounded-xl bg-muted/70 transition-colors group-hover:bg-primary/10",
          )}
        >
          <Icon className={cn("h-4 w-4", tone ?? (secondary ? "text-muted-foreground" : "text-primary"))} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate",
              secondary ? "text-xs text-muted-foreground" : "text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground",
            )}
          >
            {label}
          </span>
          <span className={cn("block truncate font-semibold leading-tight text-tabular", secondary ? "mt-0.5 text-xl" : "mt-1 text-2xl")}>
            {value}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const secondary = variant === "secondary";
  return (
    <Card className="rounded-2xl shadow-panel">
      <CardContent className={cn("flex items-center gap-3 p-4", secondary ? "h-[96px]" : "h-[120px]")}>
        <Skeleton className={secondary ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl"} />
        <div className="min-w-0 flex-1">
          <Skeleton className={secondary ? "h-3 w-20 rounded-full" : "h-3 w-24 rounded-full"} />
          <Skeleton className={cn("mt-2 rounded-lg", secondary ? "h-6 w-16" : "h-7 w-28")} />
        </div>
      </CardContent>
    </Card>
  );
}
