import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "./financeiro.receber";

export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  component: () => <LancamentosPage tipo="pagar" />,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

