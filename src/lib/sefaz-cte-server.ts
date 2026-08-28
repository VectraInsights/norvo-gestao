/**
 * Server functions CT-e — fase 1 (stub)
 * Mesma estratégia de `sefaz-server.ts`: se SEFAZ_URL existe (CF) vai via proxy Vercel.
 */
import { createServerFn } from "@tanstack/react-start";

const SEFAZ_URL = (() => {
  try {
    // @ts-ignore
    const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
    const fromImport = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || "";
    const fromProcess = typeof process !== "undefined" ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "") : "";
    return fromImport || fromProcess;
  } catch { return ""; }
})();

async function callProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) throw new Error("SEFAZ_URL não configurado — CT-e fase 1");
  const res = await fetch(SEFAZ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}` },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))).error);
  return res.json();
}

export const emitirCteFn = createServerFn({ method: "POST" })
  .validator((d: { empresaId: string; input: unknown }) => d)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callProxy("emitirCte", { empresaId: data.empresaId, input: data.input });
    // Fase 1: sem SEFAZ — salva rascunho local
    return { sucesso: false, fase: 1, motivo: "CT-e fase 1: estrutura criada, emissão SEFAZ na fase 2" };
  });

export const consultarCteFn = createServerFn({ method: "POST" })
  .validator((d: { empresaId: string; chave: string }) => d)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callProxy("consultarCte", data);
    return { status: "rascunho", fase: 1 };
  });

export const cancelarCteFn = createServerFn({ method: "POST" })
  .validator((d: { empresaId: string; chave: string; justificativa: string }) => d)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callProxy("cancelarCte", data);
    return { sucesso: false, fase: 1 };
  });
