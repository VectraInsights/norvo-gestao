import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Tom canônico das pílulas de status do ERP. Chave = status cru; valor = classes.
// Mesma palavra, mesma cor, em todos os módulos.
const TONE: Record<string, string> = {
  // vendas / pedidos
  rascunho: "bg-muted text-muted-foreground",
  proposta: "bg-accent text-accent-foreground",
  pedido: "bg-primary/15 text-primary",
  faturado: "bg-success/15 text-success",
  faturada: "bg-success/10 text-success",
  cancelado: "bg-destructive/10 text-destructive",
  cancelada: "bg-destructive/10 text-destructive",
  // lançamentos / financeiro
  aberto: "bg-accent text-accent-foreground",
  aberta: "bg-amber-500/15 text-amber-600",
  pago: "bg-success/15 text-success",
  paga: "bg-success/15 text-success",
  parcial: "bg-warning/20 text-warning-foreground",
  vencido: "bg-destructive/15 text-destructive",
  vencida: "bg-destructive/15 text-destructive",
  lancada: "bg-primary/15 text-primary",
  descontado: "bg-success/15 text-success",
  prevista: "bg-muted text-muted-foreground",
  aprovada: "bg-primary/15 text-primary",
  // notas fiscais
  emitida: "bg-primary/15 text-primary",
  autorizada: "bg-success/15 text-success",
  autorizado: "bg-success/15 text-success",
  rejeitada: "bg-destructive/15 text-destructive",
  rejeitado: "bg-destructive/15 text-destructive",
  encerrado: "bg-muted text-muted-foreground",
  enviado: "bg-primary/10 text-primary",
  exportado: "bg-muted text-muted-foreground",
  // frota / multas
  contestada: "bg-primary/15 text-primary",
  planejada: "bg-primary/15 text-primary",
  planejado: "bg-primary/15 text-primary",
  em_transito: "bg-warning/20 text-warning-foreground",
  concluida: "bg-success/15 text-success",
  concluido: "bg-success/15 text-success",
  ativo: "bg-success/15 text-success",
  inativo: "bg-muted text-muted-foreground",
  manutencao: "bg-warning/20 text-warning-foreground",
  suspenso: "bg-amber-500/15 text-amber-600",
  pausado: "bg-amber-500/10 text-amber-600",
  aguardando: "bg-amber-500/10 text-amber-600",
  em_andamento: "bg-primary/10 text-primary",
  em_execucao: "bg-primary/10 text-primary",
  // rh
  em_gozo: "bg-success/10 text-success",
  agendada: "bg-primary/10 text-primary",
  sem_admissao: "bg-amber-500/15 text-amber-600",
  vencendo: "bg-primary/10 text-primary",
  em_dia: "bg-success/10 text-success",
  // estoque
  entrada: "bg-success/15 text-success",
  saida: "bg-destructive/10 text-destructive",
  ajuste: "bg-warning/20 text-warning-foreground",
  transferencia: "bg-primary/15 text-primary",
  A: "bg-success/15 text-success",
  B: "bg-warning/20 text-warning-foreground",
  C: "bg-muted text-muted-foreground",
  // trilha / auditoria
  criar: "bg-success/10 text-success",
  alterar: "bg-primary/10 text-primary",
  excluir: "bg-destructive/10 text-destructive",
  padrao: "bg-warning/15 text-warning-foreground",
};

type StatusBadgeProps = {
  /** chave do status (busca o tom no mapa; sem tom cai no muted) */
  status: string;
  /** texto exibido (quando difere do cru: acentos, underscores, outra língua) */
  label?: string;
  /** override total do tom (exceções de domínio — evitar) */
  tone?: string;
  icon?: ReactNode;
  className?: string;
};

// Pílula de status padrão do ERP.
export function StatusBadge({ status, label, tone, icon, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        tone ?? TONE[status] ?? "bg-muted text-muted-foreground",
        "rounded-full px-2.5 py-0.5 font-medium capitalize shadow-sm",
        className,
      )}
    >
      {icon}
      {label ?? status}
    </Badge>
  );
}
