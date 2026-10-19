import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { iniciarCachePersistido } from "@/lib/query-cache";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,            // SWR: voltar à tela em até 60s é instantâneo (cache)
        gcTime: 15 * 60_000,          // mantém em memória por 15min
        refetchOnWindowFocus: false,  // evita refetch agressivo ao voltar de aba
        refetchOnReconnect: "always", // atualiza após recuperar a conexão
        networkMode: "online",       // não inicia consultas enquanto offline
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

  // Navegador: guarda o cache de dados no localStorage. O F5 passa a abrir com os
  // dados na hora (reidratados antes do primeiro render) em vez de esperar o banco.
  iniciarCachePersistido(queryClient);

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
