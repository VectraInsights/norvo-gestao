import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes/rntrc")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "rntrc" } });
  },
});
