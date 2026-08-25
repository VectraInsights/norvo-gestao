/**
 * API proxy para SEFAZ — roda no Vercel (Node.js com mTLS)
 * O Cloudflare Worker chama este endpoint porque não suporta certificados cliente.
 */

import { createAPIFileRoute } from "@tanstack/react-start/api";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  return createClient(url, key);
}

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

      // Verificar autorização via service role key
      const authHeader = request.headers.get("Authorization");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const supabase = getSupabaseAdmin();

      // 1. Buscar certificado
      const { data: cert, error: certErr } = await supabase
        .from("certificados_digitais")
        .select("id, arquivo_path, thumbprint, validade, nome")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .single();

      if (certErr || !cert) {
        return new Response(JSON.stringify({ error: "Nenhum certificado ativo encontrado" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: fileData, error: dlErr } = await supabase.storage
        .from("certificados")
        .download(cert.arquivo_path);

      if (dlErr || !fileData) {
        return new Response(JSON.stringify({ error: "Falha ao baixar certificado" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const pfxBytes = Buffer.from(await fileData.arrayBuffer());

      const { data: certSenha } = await supabase
        .from("certificados_digitais")
        .select("senha_cript")
        .eq("id", cert.id)
        .single();

      if (!certSenha?.senha_cript) {
        return new Response(JSON.stringify({ error: "Senha não encontrada" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: empresa } = await supabase
        .from("empresas")
        .select("cnpj, uf")
        .eq("id", empresaId)
        .single();

      const senha = certSenha.senha_cript;
      const cnpj = empresa?.cnpj || "";
      const uf = empresa?.uf || "SP";

      // 2. Executar ação SEFAZ (dinâmico import para tree-shaking)
      const { consultarDestinatario, enviarEventoManifestacao, emitirNFe } = await import("@/lib/sefaz");

      let result: unknown;

      switch (action) {
        case "consultar": {
          result = await consultarDestinatario(pfxBytes, senha, cnpj, uf, "homologacao");
          break;
        }
        case "manifestar": {
          const { chave, tipoEvento, justificativa } = body;
          result = await enviarEventoManifestacao(pfxBytes, senha, chave, tipoEvento, cnpj, uf, "homologacao", justificativa);
          break;
        }
        case "emitir": {
          const { xml } = body;
          result = await emitirNFe(pfxBytes, senha, xml, uf, "homologacao");
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
