import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  // vendas
  rascunho: "bg-muted text-muted-foreground",
  proposta: "bg-accent text-accent-foreground",
  pedido: "bg-primary/15 text-primary",
  faturado: "bg-success/15 text-success",
  cancelado: "bg-destructive/10 text-destructive",
  // lançamentos
  aberto: "bg-accent text-accent-foreground",
  pago: "bg-success/15 text-success",
  parcial: "bg-warning/20 text-warning-foreground",
  vencido: "bg-destructive/15 text-destructive",
  // notas fiscais
  emitida: "bg-primary/15 text-primary",
  autorizada: "bg-success/15 text-success",
  rejeitada: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(TONE[status] ?? "bg-muted text-muted-foreground", "capitalize", className)}>
      {status}
    </Badge>
  );
}
