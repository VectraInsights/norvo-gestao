import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorState } from "@/components/erp/route-error-state";

export const Route = createFileRoute("/_authenticated/fiscal/notas")({
  beforeLoad: () => {
    throw redirect({ to: "/fiscal/emitidas" });
  },
  errorComponent: RouteErrorState,
});
