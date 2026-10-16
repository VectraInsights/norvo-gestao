import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorState } from "@/components/erp/route-error-state";
import { LancamentosPage } from "./financeiro.receber";

export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  component: () => <LancamentosPage tipo="pagar" />,
  errorComponent: RouteErrorState
});

