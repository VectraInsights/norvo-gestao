import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes/nfe")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "nfe" } });
  },
});
