import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,            // SWR: dados servidos do cache por 30s
        gcTime: 5 * 60_000,           // mantém em memória por 5min
        refetchOnWindowFocus: false,  // evita refetch agressivo ao voltar de aba
        retry: (failureCount, err: unknown) => {
          // não re-tenta 4xx (auth/validação); re-tenta rede/5xx até 2x
          const status = (err as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",        // pré-busca no hover/focus dos Links
    defaultPreloadStaleTime: 0,       // deixa TanStack Query controlar freshness
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  });

  return router;
};
