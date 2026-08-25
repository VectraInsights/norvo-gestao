/**
 * API proxy para SEFAZ — roda no Vercel (Node.js com mTLS)
 * O Cloudflare Worker chama este endpoint porque não suporta certificados cliente.
 *
 * POST /api/sefaz { action, empresaId, ... }
 */

import { createAPIFileRoute } from "@tanstack/react-start/api";

export const Route = createAPIFileRoute("/api/sefaz")({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { action, empresaId } = body;

      if (!action || !empresaId) {
        return new Response(JSON.stringify({ error: "action e empresaId são obrigatórios" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const authHeader = request.headers.get("Authorization");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { buscarCertificadoAtivo } = await import("@/lib/sefaz");
      const cert = await buscarCertificadoAtivo(empresaId);

      const { consultarDestinatario, enviarEventoManifestacao, emitirNFe } = await import("@/lib/sefaz");

      let result: unknown;

      switch (action) {
        case "consultar":
          result = await consultarDestinatario(cert.pfx, cert.senha, cert.cnpj, cert.uf, "homologacao");
          break;
        case "manifestar": {
          const { chave, tipoEvento, justificativa } = body;
          result = await enviarEventoManifestacao(cert.pfx, cert.senha, chave, tipoEvento, cert.cnpj, cert.uf, "homologacao", justificativa);
          break;
        }
        case "emitir": {
          const { xml } = body;
          result = await emitirNFe(cert.pfx, cert.senha, xml, cert.uf, "homologacao");
          break;
        }
        default:
          return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
