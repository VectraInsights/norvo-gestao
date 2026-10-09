import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes/condicoes")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "condicoes" } });
  },
});
