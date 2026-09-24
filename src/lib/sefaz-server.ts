/**
 * Server functions para integração SEFAZ
 *
 * - Vercel (SEFAZ_URL não definida): usa createServerFn direto (mTLS funciona)
 * - Cloudflare Worker (SEFAZ_URL definida): chama /api/sefaz no Vercel via HTTP
 */

import { createServerFn } from "@tanstack/react-start";
import { SEFAZ_AMBIENTE, SEFAZ_TP_AMB } from "@/lib/sefaz-ambiente";

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

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

async function callSefazProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) throw new Error("SEFAZ_URL não configurado");
  const res = await fetch(SEFAZ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
    },
    body: JSON.stringify({ action, ...body, ambiente: SEFAZ_AMBIENTE, tpAmb: SEFAZ_TP_AMB }),
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
    const { data: nfeConfig } = await supabase.from("nfe_config").select("last_nsu, last_query_at").eq("empresa_id", data.empresaId).maybeSingle();
    const ambiente = SEFAZ_AMBIENTE;
    const startNsu = nfeConfig?.last_nsu || undefined;

    // Cooldown
    if (nfeConfig?.last_query_at) {
      const elapsed = Date.now() - new Date(nfeConfig.last_query_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return {
          notas: [],
          maxNsuObtido: startNsu,
          resetouCursor: false,
          cooldown: true,
          cooldownMinutos: remainingMin,
          debug: {
            cStat: "656",
            xMotivo: `Cooldown entre consultas — aguarde ${remainingMin} minuto(s)`,
            endpoint: "",
            tpAmb: SEFAZ_TP_AMB,
            cUFAutor: "",
            cnpj: cert.cnpj,
          },
        };
      }
    }

    // Buscar last_query_at ANTES de consultar
    const { data: configAntes } = await supabase
      .from("nfe_config")
      .select("last_query_at")
      .eq("empresa_id", data.empresaId)
      .maybeSingle();
    const lastQueryAntes = configAntes?.last_query_at;

    const result = await consultarDestinatario(cert.pfx, cert.senha, cert.cnpj, cert.uf, ambiente, startNsu);

    if (result.debug?.cStat === "138" || result.debug?.cStat === "137") {
      // Sucesso: atualizar last_query_at e last_nsu
      const now = new Date().toISOString();
      await supabase.from("nfe_config").update({ last_query_at: now }).eq("empresa_id", data.empresaId);
      if (result.maxNsuObtido) {
        await supabase.from("nfe_config").update({ last_nsu: result.maxNsuObtido }).eq("empresa_id", data.empresaId);
      }
    } else if (result.debug?.cStat === "656") {
      const now = new Date().toISOString();
      const ult = (result as any).ultNSU || (result as any).maxNsuObtido;
      const upd: Record<string, unknown> = { last_query_at: now };
      if (ult) upd.last_nsu = ult;
      await supabase.from("nfe_config").update(upd).eq("empresa_id", data.empresaId);
      (result as Record<string, unknown>).lastQueryAt = lastQueryAntes;
    }
    // outros erros: NÃO atualizar last_query_at

    return result;
  });

export const manifestarNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; tipoEvento: "210200" | "210210" | "210220"; justificativa?: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("manifestar", { empresaId: data.empresaId, chave: data.chave, tipoEvento: data.tipoEvento, justificativa: data.justificativa });
    const { enviarEventoManifestacao, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    const ambiente = SEFAZ_AMBIENTE;
    console.log(`[sefaz-server] empresa=${data.empresaId} acao=manifestar ambiente: ${ambiente} tpAmb=${SEFAZ_TP_AMB}`);
    return enviarEventoManifestacao(cert.pfx, cert.senha, data.chave, data.tipoEvento, cert.cnpj, cert.uf, ambiente, data.justificativa);
  });

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("emitir", { empresaId: data.empresaId, xml: data.xml });
    const { emitirNFe, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    const ambiente = SEFAZ_AMBIENTE;
    console.log(`[sefaz-server] empresa=${data.empresaId} acao=emitir ambiente: ${ambiente} tpAmb=${SEFAZ_TP_AMB}`);
    return emitirNFe(cert.pfx, cert.senha, data.xml, cert.uf, ambiente);
  });

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("status", { empresaId: data.empresaId });
    return { status: "OK", ambiente: "homologacao", motivo: "Serviço operacional" };
  });

export const consultarNFePorChaveFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("consultarChave", { empresaId: data.empresaId, chave: data.chave });

    const { consultarPorChave, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);

    const ambiente = SEFAZ_AMBIENTE;
    console.log(`[sefaz-server] empresa=${data.empresaId} acao=consultarChave ambiente: ${ambiente} tpAmb=${SEFAZ_TP_AMB}`);

    return consultarPorChave(cert.pfx, cert.senha, data.chave, cert.cnpj, cert.uf, ambiente);
  });
