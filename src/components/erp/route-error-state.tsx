import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteErrorState() {
  return (
    <main className="grid min-h-[50vh] place-items-center p-6" role="alert" aria-live="assertive">
      <section className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive" aria-hidden="true">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
        <p className="text-sm text-muted-foreground">
          Ocorreu um problema ao carregar os dados. Tente novamente ou volte mais tarde.
        </p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw data-icon="inline-start" />
          Tentar novamente
        </Button>
      </section>
    </main>
  );
}
