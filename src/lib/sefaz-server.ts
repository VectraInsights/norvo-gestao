/**
 * Server functions para integração SEFAZ
 * 
 * Modo de operação:
 * - Se SEFAZ_URL estiver configurada → chama o microserviço norvo-sefaz (Cloudflare/qualquer host)
 * - Se não → usa createServerFn local (Vercel, Node.js puro)
 * 
 * Isso permite que o mesmo código funcione em qualquer部署.
 */

import { createServerFn } from "@tanstack/react-start";

// ============================================================
// URL do microserviço SEFAZ (configurar no .env)
// Ex: SEFAZ_URL="https://norvo-sefaz.seudominio.com"
// ============================================================

const SEFAZ_URL = typeof process !== "undefined"
  ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "")
  : "";

// ============================================================
// Helper: chamar microserviço SEFAZ via HTTP
// ============================================================

async function callSefazService(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) {
    throw new Error(
      "Microserviço SEFAZ não configurado. " +
      "Configure SEFAZ_URL no .env ou deploy norvo-sefaz (ver norvo-sefaz/README.md)"
    );
  }

  const res = await fetch(`${SEFAZ_URL}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SEFAZ_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
    },
    body: JSON.stringify(body),
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
    return callSefazService("consultar", { empresaId: data.empresaId });
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
    return callSefazService("manifestar", {
      empresaId: data.empresaId,
      chave: data.chave,
      tipoEvento: data.tipoEvento,
      justificativa: data.justificativa,
    });
  });

// ============================================================
// Emitir NFe
// ============================================================

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    return callSefazService("emitir", {
      empresaId: data.empresaId,
      xml: data.xml,
    });
  });

// ============================================================
// Verificar Status Serviço
// ============================================================

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    return callSefazService("status", { empresaId: data.empresaId });
  });
