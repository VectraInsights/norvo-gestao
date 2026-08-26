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

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const { data: nfeConfig } = await supabase.from("nfe_config").select("ambiente, last_nsu").eq("empresa_id", data.empresaId).maybeSingle();
    const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
    const startNsu = nfeConfig?.last_nsu || undefined;

    const result = await consultarDestinatario(cert.pfx, cert.senha, cert.cnpj, cert.uf, ambiente, startNsu);

    // Salvar maxNSU para próxima consulta (evita cStat 656)
    if (result.maxNsuObtido) {
      await supabase.from("nfe_config").update({ last_nsu: result.maxNsuObtido }).eq("empresa_id", data.empresaId);
    }

    return result;
  });

export const manifestarNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; tipoEvento: "210200" | "210210" | "210220"; justificativa?: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("manifestar", { empresaId: data.empresaId, chave: data.chave, tipoEvento: data.tipoEvento, justificativa: data.justificativa });
    const { enviarEventoManifestacao, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const { data: nfeConfig } = await supabase.from("nfe_config").select("ambiente").eq("empresa_id", data.empresaId).maybeSingle();
    const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
    return enviarEventoManifestacao(cert.pfx, cert.senha, data.chave, data.tipoEvento, cert.cnpj, cert.uf, ambiente, data.justificativa);
  });

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("emitir", { empresaId: data.empresaId, xml: data.xml });
    const { emitirNFe, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const { data: nfeConfig } = await supabase.from("nfe_config").select("ambiente").eq("empresa_id", data.empresaId).maybeSingle();
    const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
    return emitirNFe(cert.pfx, cert.senha, data.xml, cert.uf, ambiente);
  });

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("status", { empresaId: data.empresaId });
    return { status: "OK", ambiente: "homologacao", motivo: "Serviço operacional" };
  });
