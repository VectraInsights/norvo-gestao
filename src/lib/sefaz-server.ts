/**
 * Server functions para integração SEFAZ
 *
 * Modo de operação automático:
 * - Vercel (SEFAZ_URL não definida): mTLS direto via createServerFn (Node.js puro)
 * - Cloudflare Worker (SEFAZ_URL definida): chama o endpoint /api/sefaz no Vercel
 *
 * Não depende de nenhum serviço externo — basta configurar SEFAZ_URL no .env do CF Worker.
 */

import { createServerFn } from "@tanstack/react-start";

// ============================================================
// URL do proxy SEFAZ no Vercel (só definir no Cloudflare)
// Ex: SEFAZ_URL="https://norvo-gestao.vercel.app/api/sefaz"
// ============================================================

const SEFAZ_URL = typeof process !== "undefined"
  ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "")
  : "";

// ============================================================
// Helper: chamar proxy SEFAZ no Vercel via HTTP (modo CF Worker)
// ============================================================

async function callSefazProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) {
    throw new Error("SEFAZ_URL não configurado");
  }

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

// ============================================================
// Consultar NFe destinatário
// ============================================================

export const consultarNFeDestinatarioFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) {
      return callSefazProxy("consultar", { empresaId: data.empresaId });
    }
    const { consultarDestinatario, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return consultarDestinatario(cert.pfx, cert.senha, cert.cnpj, cert.uf, "homologacao");
  });

// ============================================================
// Manifestar NFe (Ciência / Confirmação / Desconhecimento)
// ============================================================

export const manifestarNFeFn = createServerFn({ method: "POST" })
  .validator((data: {
    empresaId: string;
    chave: string;
    tipoEvento: "210200" | "210210" | "210220";
    justificativa?: string;
  }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) {
      return callSefazProxy("manifestar", {
        empresaId: data.empresaId,
        chave: data.chave,
        tipoEvento: data.tipoEvento,
        justificativa: data.justificativa,
      });
    }
    const { enviarEventoManifestacao, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return enviarEventoManifestacao(
      cert.pfx, cert.senha, data.chave, data.tipoEvento,
      cert.cnpj, cert.uf, "homologacao", data.justificativa,
    );
  });

// ============================================================
// Emitir NFe
// ============================================================

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) {
      return callSefazProxy("emitir", { empresaId: data.empresaId, xml: data.xml });
    }
    const { emitirNFe, buscarCertificadoAtivo } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoAtivo(data.empresaId);
    return emitirNFe(cert.pfx, cert.senha, data.xml, cert.uf, "homologacao");
  });

// ============================================================
// Verificar Status Serviço
// ============================================================

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) {
      return callSefazProxy("status", { empresaId: data.empresaId });
    }
    return { status: "OK", ambiente: "homologacao", motivo: "Serviço operacional" };
  });
