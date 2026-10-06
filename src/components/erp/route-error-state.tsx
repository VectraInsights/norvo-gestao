import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteErrorState({ error }: { error?: unknown }) {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    <main className="grid min-h-[50vh] place-items-center p-6" role="alert" aria-live="assertive">
      <section className="erp-surface flex w-full max-w-md flex-col items-center gap-3 p-8 text-center sm:p-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive shadow-sm" aria-hidden="true">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar esta página</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Ocorreu um problema ao carregar os dados. Tente novamente ou volte mais tarde.
        </p>
        {msg && (
          <p className="max-w-full break-words rounded-xl border bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {msg}
          </p>
        )}
        <Button type="button" variant="outline" className="mt-1 h-10 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md" onClick={() => window.location.reload()}>
          <RefreshCw data-icon="inline-start" />
          Tentar novamente
        </Button>
      </section>
    </main>
  );
}
