import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "./financeiro.receber";

export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  component: () => <LancamentosPage tipo="pagar" />,
});
