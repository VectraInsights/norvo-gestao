import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes/categorias")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes", search: { secao: "categorias" } });
  },
});
