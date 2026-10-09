import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes/seguradoras")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "seguradoras" } });
  },
});
