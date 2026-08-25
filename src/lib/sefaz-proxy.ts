/**
 * Handler do proxy SEFAZ — roda no Vercel (Node.js com mTLS).
 * Chamado pelo src/server.ts quando a request é POST /api/sefaz.
 * Não usa h3/Nitro — apenas Web standard APIs (Request/Response).
 */

import { createClient } from "@supabase/supabase-js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleSefazProxy(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Não autorizado" }, 401);
    }

    const body = await request.json();
    const { action, empresaId } = body;

    if (!action || !empresaId) {
      return json({ error: "action e empresaId são obrigatórios" }, 400);
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return json({ error: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios" }, 500);
    }
    const supabase = createClient(url, key);

    // Buscar certificado ativo
    const { data: cert, error: certErr } = await supabase
      .from("certificados_digitais")
      .select("id, arquivo_path, senha_cript")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .single();

    if (certErr || !cert) {
      return json({ error: "Nenhum certificado ativo encontrado" }, 404);
    }

    // Download do certificado
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("certificados")
      .download(cert.arquivo_path);

    if (dlErr || !fileData) {
      return json({ error: "Falha ao baixar certificado" }, 500);
    }

    const pfxBytes = Buffer.from(await fileData.arrayBuffer());
    const senha = cert.senha_cript;

    if (!senha) {
      return json({ error: "Senha do certificado não encontrada" }, 500);
    }

    // Buscar empresa
    const { data: empresa } = await supabase
      .from("empresas")
      .select("cnpj, uf")
      .eq("id", empresaId)
      .single();

    const cnpj = empresa?.cnpj || "";
    const uf = empresa?.uf || "SP";

    // Import dinâmico de sefaz (usa node:https — só funciona no Node.js)
    const { consultarDestinatario, enviarEventoManifestacao, emitirNFe } = await import("@/lib/sefaz");

    let result: unknown;

    switch (action) {
      case "consultar":
        result = await consultarDestinatario(pfxBytes, senha, cnpj, uf, "homologacao");
        break;
      case "manifestar":
        result = await enviarEventoManifestacao(
          pfxBytes, senha, body.chave, body.tipoEvento, cnpj, uf, "homologacao", body.justificativa,
        );
        break;
      case "emitir":
        result = await emitirNFe(pfxBytes, senha, body.xml, uf, "homologacao");
        break;
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("[sefaz-proxy]", err);
    return json({ error: String(err) }, 500);
  }
}
