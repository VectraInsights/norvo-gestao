/**
 * Server functions para integração SEFAZ
 *
 * - Vercel (SEFAZ_URL não definida): usa createServerFn direto (mTLS funciona)
 * - Cloudflare Worker (SEFAZ_URL definida): chama /api/sefaz no Vercel via HTTP
 */

import { createServerFn } from "@tanstack/react-start";

const SEFAZ_URL = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
    const fromImport = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || "";
    const fromProcess = typeof process !== "undefined"
      ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "")
      : "";
    return fromImport || fromProcess;
  } catch {
    return "";
  }
})();

async function callSefazProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) throw new Error("SEFAZ_URL não configurado");
  const res = await fetch(SEFAZ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Falha na chamada SEFAZ (${res.status})`);
  }
  return res.json();
}

export const consultarNFeDestinatarioFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("consultar", { empresaId: data.empresaId });
    const { consultarDestinatario, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return consultarDestinatario(cert.pfx, cert.senha, cert.cnpj, cert.uf, "homologacao");
  });

export const manifestarNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; tipoEvento: "210200" | "210210" | "210220"; justificativa?: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("manifestar", { empresaId: data.empresaId, chave: data.chave, tipoEvento: data.tipoEvento, justificativa: data.justificativa });
    const { enviarEventoManifestacao, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return enviarEventoManifestacao(cert.pfx, cert.senha, data.chave, data.tipoEvento, cert.cnpj, cert.uf, "homologacao", data.justificativa);
  });

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("emitir", { empresaId: data.empresaId, xml: data.xml });
    const { emitirNFe, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return emitirNFe(cert.pfx, cert.senha, data.xml, cert.uf, "homologacao");
  });

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("status", { empresaId: data.empresaId });
    return { status: "OK", ambiente: "homologacao", motivo: "Serviço operacional" };
  });
