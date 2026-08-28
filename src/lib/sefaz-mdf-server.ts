import { createServerFn } from "@tanstack/react-start";
const SEFAZ_URL = (() => {
  try { const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined; const a = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || ""; const b = typeof process !== "undefined" ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "") : ""; return a || b; } catch { return ""; }
})();
async function callProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) throw new Error("SEFAZ_URL não configurado — MDF-e fase 1");
  const res = await fetch(SEFAZ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}` }, body: JSON.stringify({ action, ...body }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))).error);
  return res.json();
}
export const emitirMdfFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; input: unknown }) => d).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("emitirMdf", data);
  return { sucesso: false, fase: 1, motivo: "MDF-e fase 1: estrutura criada, emissão na fase 2" };
});
export const encerrarMdfFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; chave: string }) => d).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("encerrarMdf", data);
  return { sucesso: false, fase: 1 };
});
export const cancelarMdfFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; chave: string; justificativa: string }) => d).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("cancelarMdf", data);
  return { sucesso: false, fase: 1 };
});
