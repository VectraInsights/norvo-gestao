import {
  persistQueryClient,
  type PersistedClient,
  type Persister,
} from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Cache de dados do TanStack Query persistido no navegador (localStorage).
 *
 * Antes: o cache vivia só na memória — um F5 limpava tudo e cada tela esperava
 * a resposta do Supabase antes de pintar. Agora o cache é gravado no navegador e
 * reidratado no boot: a tela abre com os dados na hora e a atualização contra o
 * banco acontece em segundo plano.
 *
 * Travas de segurança:
 *  - `maxAge`: nada mais velho que 10 min entra na tela (o resto é descartado).
 *  - `buster`: ao subir uma versão nova do app o cache antigo é jogado fora.
 *  - troca de usuário: navegador compartilhado não herda o cache de outro usuário.
 *  - logout: o cache é apagado (memória + localStorage).
 *  - consultas com payload grande (listas com XML) nunca são persistidas.
 */

const CHAVE_CACHE = "norvo:query-cache";
const CHAVE_USUARIO = "norvo:query-cache:usuario";
const BUSTER = "v1";

/** Teto de idade do cache restaurado (ms). */
export const IDADE_MAXIMA_CACHE = 10 * 60 * 1000;
/** Debounce da gravação: evita serializar o cache inteiro a cada mudança. */
const DEBOUNCE_GRAVACAO = 1500;
/** Tamanho máximo do payload persistido (localStorage tem ~5MB). */
const TAMANHO_MAXIMO = 2 * 1024 * 1024;
/** Consultas pesadas (listas com XML assinado) ficam de fora do cache persistido. */
const CHAVES_IGNORADAS = ["cte-documentos", "mdf-documentos"];

let promessaRestauracao: Promise<void> | undefined;
let iniciado = false;

/** Id do usuario logado, lido da sessao guardada pelo Supabase no localStorage. */
function usuarioArmazenado(): string | null {
  try {
    for (const chave of Object.keys(window.localStorage)) {
      if (!chave.includes("auth-token")) continue;
      const bruto = window.localStorage.getItem(chave);
      if (!bruto) continue;
      const parsed = JSON.parse(bruto);
      const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (id) return String(id);
    }
  } catch {
    /* storage bloqueado/indisponivel */
  }
  return null;
}

function criarPersister(): Persister {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolverPendente: (() => void) | null = null;

  return {
    persistClient: (client) =>
      new Promise<void>((resolve) => {
        if (timer) clearTimeout(timer);
        // A gravacao anterior foi adiada: resolve para nao deixar promessa pendente.
        resolverPendente?.();
        resolverPendente = resolve;
        timer = setTimeout(() => {
          timer = null;
          try {
            const payload = JSON.stringify(client);
            if (payload.length > TAMANHO_MAXIMO) {
              // Cache grande demais: descarta o que estava guardado.
              window.localStorage.removeItem(CHAVE_CACHE);
            } else {
              window.localStorage.setItem(CHAVE_CACHE, payload);
            }
          } catch {
            // Cota estourada ou storage bloqueado: descarta o cache persistido.
            try {
              window.localStorage.removeItem(CHAVE_CACHE);
            } catch {
              /* nada a fazer */
            }
          }
          const resolver = resolverPendente;
          resolverPendente = null;
          resolver?.();
        }, DEBOUNCE_GRAVACAO);
      }),
    restoreClient: () => {
      try {
        const bruto = window.localStorage.getItem(CHAVE_CACHE);
        if (!bruto) return Promise.resolve(undefined);
        return Promise.resolve(JSON.parse(bruto) as PersistedClient);
      } catch {
        return Promise.resolve(undefined);
      }
    },
    removeClient: () => {
      try {
        window.localStorage.removeItem(CHAVE_CACHE);
      } catch {
        /* nada a fazer */
      }
      return Promise.resolve();
    },
  };
}

/**
 * Liga a persistencia do cache no navegador. Deve ser chamada uma vez, logo apos
 * criar o QueryClient. No servidor e no-op.
 */
export function iniciarCachePersistido(queryClient: QueryClient): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (iniciado) return promessaRestauracao ?? Promise.resolve();
  iniciado = true;
  try {
    // Navegador compartilhado: cache de outro usuario nao pode ser reaproveitado.
    const usuario = usuarioArmazenado();
    const anterior = window.localStorage.getItem(CHAVE_USUARIO);
    if (anterior && usuario && anterior !== usuario) {
      window.localStorage.removeItem(CHAVE_CACHE);
    }
    if (usuario) window.localStorage.setItem(CHAVE_USUARIO, usuario);

    const persister = criarPersister();
    const [, promessa] = persistQueryClient({
      queryClient,
      persister,
      maxAge: IDADE_MAXIMA_CACHE,
      buster: BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") return false;
          const nome = String(query.queryKey[0] ?? "");
          return !CHAVES_IGNORADAS.includes(nome);
        },
      },
    });
    promessaRestauracao = promessa;
    return promessa;
  } catch (e) {
    console.warn("[query-cache] persistencia indisponivel", e);
    return Promise.resolve();
  }
}

/** Apaga o cache persistido (logout / troca de usuario). */
export function limparCachePersistido(queryClient?: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE_CACHE);
    window.localStorage.removeItem(CHAVE_USUARIO);
  } catch {
    /* nada a fazer */
  }
  try {
    queryClient?.clear();
  } catch {
    /* nada a fazer */
  }
}
