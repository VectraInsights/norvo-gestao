import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/erp/status-badge";

export type AuditEvent = {
  id: string;
  acao: string;
  created_at?: string;
  detalhes?: { descricao?: string; user_nome?: string; user_email?: string };
};

type AuditDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  emptyText: string;
  isLoading: boolean;
  isError: boolean;
  events: AuditEvent[];
  /** mostra data/hora ao lado do autor */
  showDate?: boolean;
  /** texto da pílula quando difere do cru */
  labelOf?: (acao: string) => string;
};

function defaultLabel(acao: string) {
  return acao === "excluir" ? "Excluiu" : acao === "alterar" ? "Alterou" : "Criou";
}

// Dialog de auditoria padrão do ERP (lista de eventos da trilha).
export function AuditDialog({
  open,
  onOpenChange,
  title,
  emptyText,
  isLoading,
  isError,
  events,
  showDate = false,
  labelOf = defaultLabel,
}: AuditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-screen w-screen flex-col m-0 max-h-none max-w-none overflow-y-auto rounded-none">
        <DialogHeader className="gap-1.5 pb-1">
          <DialogTitle className="tracking-tight">{title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Trilha indisponível no momento.</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
                <StatusBadge status={ev.acao} label={labelOf(ev.acao)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{ev.detalhes?.descricao || "—"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ev.detalhes?.user_nome || ev.detalhes?.user_email || "—"}
                    {showDate && ev.created_at ? ` · ${new Date(ev.created_at).toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
