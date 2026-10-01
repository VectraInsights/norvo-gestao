import { createServerFn } from "@tanstack/react-start";
import { SEFAZ_AMBIENTE } from "@/lib/sefaz-ambiente";
const SEFAZ_URL = (() => { try { const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined; const a = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || ""; const b = typeof process !== "undefined" ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "") : ""; return a || b; } catch { return ""; } })();
async function callProxy(action: string, body: Record<string, unknown>) {
  const res = await fetch(SEFAZ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}` }, body: JSON.stringify({ action, ...body, ambiente: SEFAZ_AMBIENTE }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))).error);
  return res.json();
}
// Emite CIOT direto na ANTT (ETC frota própria, sem TAC). Ambiente fiscal do
// projeto é homologação — usa a base HML da ANTT (exige CNPJ+cert e placas
// cadastrados na ANTT: pef@antt.gov.br).
export const emitirCiotFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; input: any }) => d).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("anttCiotDeclarar", data);
  const { buscarCertificadoAtivo } = await import("@/lib/sefaz");
  const { declararCiotAntt } = await import("@/lib/antt-ciot");
  const cert = await buscarCertificadoAtivo(data.empresaId);
  return declararCiotAntt({
    pfx: cert.pfx,
    senha: cert.senha,
    env: "homologacao",
    certCnpj: cert.cnpj || "",
    input: data.input,
  });
});
// Diagnóstico 01+02 do DCS: situação do transportador + vínculo das placas.
export const consultarFrotaAnttFn = createServerFn({ method: "POST" }).validator(
  (d: { empresaId: string; interessadoDoc: string; transportadorDoc: string; rntrc: string; placas: string[] }) => d,
).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("anttConsultarFrota", data);
  const { buscarCertificadoAtivo } = await import("@/lib/sefaz");
  const { consultarFrotaAntt } = await import("@/lib/antt-ciot");
  const cert = await buscarCertificadoAtivo(data.empresaId);
  return consultarFrotaAntt({
    pfx: cert.pfx,
    senha: cert.senha,
    env: "homologacao",
    interessadoDoc: data.interessadoDoc,
    transportadorDoc: data.transportadorDoc,
    rntrc: data.rntrc,
    placas: data.placas,
  });
});
// Consulta CIOT gerado (endpoint 08): com declaração vinculada, volta o CIOT16.
export const consultarCiotGeradoAnttFn = createServerFn({ method: "POST" }).validator(
  (d: { empresaId: string; codigo12: string; ano?: number }) => d,
).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("anttConsultarCiot", data);
  const { buscarCertificadoAtivo } = await import("@/lib/sefaz");
  const { consultarCiotGeradoAntt } = await import("@/lib/antt-ciot");
  const cert = await buscarCertificadoAtivo(data.empresaId);
  return consultarCiotGeradoAntt({
    pfx: cert.pfx,
    senha: cert.senha,
    env: "homologacao",
    codigo12: data.codigo12,
    ano: data.ano,
  });
});
