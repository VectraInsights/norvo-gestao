import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "./financeiro.receber";

export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  component: () => <LancamentosPage tipo="pagar" />,
  errorComponent: ({ error }) => (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm" role="alert">Falha: {error instanceof Error ? error.message : "erro desconhecido"}</div>
  ),
});

