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

function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
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

    const supabase = createServiceClient();

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

    console.log("[sefaz-proxy] cert path:", cert.arquivo_path);

    // Download do certificado
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("certificados")
      .download(cert.arquivo_path);

    if (dlErr || !fileData) {
      console.error("[sefaz-proxy] storage download error:", JSON.stringify(dlErr));
      return json({ error: `Falha ao baixar certificado: ${dlErr?.message || "unknown"}` }, 500);
    }

    const pfxBytes = Buffer.from(await fileData.arrayBuffer());
    const first2 = pfxBytes.slice(0, 2).toString("hex");
    const first4 = pfxBytes.slice(0, 4).toString("hex");
    console.log("[sefaz-proxy] PFX bytes:", pfxBytes.length, "header:", first4);

    // Validação: PFX/PKCS#12 começa com SEQUENCE (30 82/80) ou OCTET STRING (04 82/80)
    if (pfxBytes.length < 100) {
      console.error("[sefaz-proxy] PFX muito pequeno — provavelmente não é um certificado válido");
      return json({ error: "Arquivo de certificado inválido (tamanho muito pequeno)" }, 500);
    }
    if (first2 !== "3082" && first2 !== "0482" && first2 !== "3080") {
      const preview = pfxBytes.slice(0, 200).toString("utf8");
      console.error("[sefaz-proxy] PFX header inesperado:", first4, "preview:", preview);
      if (preview.includes("<!") || preview.includes("<html")) {
        return json({ error: "Storage retornou HTML em vez do certificado — verifique as permissões do bucket" }, 500);
      }
      return json({ error: `Formato de certificado inválido (header: ${first4})` }, 500);
    }

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
