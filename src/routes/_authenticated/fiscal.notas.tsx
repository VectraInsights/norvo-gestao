import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/fiscal/notas")({
  beforeLoad: () => {
    throw redirect({ to: "/fiscal/emitidas" });
  },
});
