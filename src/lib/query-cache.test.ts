/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/** localStorage falso que se comporta como o Storage do navegador (Object.keys lista as chaves). */
function criarStorage() {
  const dados: Record<string, string> = {};
  return new Proxy(dados, {
    get(target, prop) {
      if (prop === "getItem") return (k: string) => (k in target ? target[k] : null);
      if (prop === "setItem") return (k: string, v: string) => void (target[k] = String(v));
      if (prop === "removeItem") return (k: string) => void delete target[k];
      if (prop === "clear") return () => {
        for (const k of Object.keys(target)) delete target[k];
      };
      if (prop === "length") return Object.keys(target).length;
      if (prop === "key") return (i: number) => Object.keys(target)[i] ?? null;
      return Reflect.get(target, prop);
    },
    ownKeys(target) {
      return Object.keys(target);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  }) as Storage;
}

const CHAVE_CACHE = "norvo:query-cache";
const CHAVE_USUARIO = "norvo:query-cache:usuario";

let storage: Storage;

beforeEach(() => {
  vi.useFakeTimers();
  storage = criarStorage();
  (globalThis as any).window = { localStorage: storage };
  (globalThis as any).localStorage = storage;
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

async function carregarModulo() {
  return await import("./query-cache");
}

describe("cache de dados persistido no navegador", () => {
  it("no servidor nao persiste nada", async () => {
    delete (globalThis as any).window;
    const mod = await carregarModulo();
    const client = new QueryClient();
    await mod.iniciarCachePersistido(client);
    client.setQueryData(["x"], { a: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.getItem(CHAVE_CACHE)).toBeNull();
  });

  it("grava o cache e reidrata em um novo client", async () => {
    const mod = await carregarModulo();
    const client = new QueryClient();
    await mod.iniciarCachePersistido(client);
    client.setQueryData(["minha-permissao", "e1"], { role: "admin" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.getItem(CHAVE_CACHE)).toBeTruthy();

    vi.resetModules();
    const mod2 = await carregarModulo();
    const client2 = new QueryClient();
    await mod2.iniciarCachePersistido(client2);
    expect(client2.getQueryData(["minha-permissao", "e1"])).toEqual({ role: "admin" });
  });

  it("nao persiste listas pesadas (com XML)", async () => {
    const mod = await carregarModulo();
    const client = new QueryClient();
    await mod.iniciarCachePersistido(client);
    client.setQueryData(["cte-documentos", "e1"], [{ id: 1 }]);
    client.setQueryData(["financeiro-lancs", "e1"], [{ id: 2 }]);
    await vi.advanceTimersByTimeAsync(3000);
    const salvo = JSON.parse(storage.getItem(CHAVE_CACHE) || "{}");
    const chaves = (salvo.clientState?.queries || []).map((q: any) => q.queryKey[0]);
    expect(chaves).toContain("financeiro-lancs");
    expect(chaves).not.toContain("cte-documentos");
  });

  it("descarta o cache de outro usuario (navegador compartilhado)", async () => {
    storage.setItem(CHAVE_USUARIO, "usuario-antigo");
    storage.setItem(CHAVE_CACHE, JSON.stringify({ timestamp: Date.now(), buster: "v1", clientState: {} }));
    storage.setItem("sb-x-auth-token", JSON.stringify({ user: { id: "usuario-novo" } }));

    const mod = await carregarModulo();
    const client = new QueryClient();
    await mod.iniciarCachePersistido(client);
    expect(storage.getItem(CHAVE_CACHE)).toBeNull();
    expect(storage.getItem(CHAVE_USUARIO)).toBe("usuario-novo");
  });

  it("limparCachePersistido apaga o storage e o cache em memoria", async () => {
    const mod = await carregarModulo();
    const client = new QueryClient();
    await mod.iniciarCachePersistido(client);
    client.setQueryData(["x"], 1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.getItem(CHAVE_CACHE)).toBeTruthy();

    mod.limparCachePersistido(client);
    expect(storage.getItem(CHAVE_CACHE)).toBeNull();
    expect(storage.getItem(CHAVE_USUARIO)).toBeNull();
    expect(client.getQueryData(["x"])).toBeUndefined();
  });
});
