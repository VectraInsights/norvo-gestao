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

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

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

    // Buscar config fiscal da empresa (ambiente + last_nsu + last_query_at)
    const { data: nfeConfig } = await supabase
      .from("nfe_config")
      .select("ambiente, last_nsu, last_query_at")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
    const startNsu = nfeConfig?.last_nsu || undefined;
    console.log("[sefaz-proxy] ambiente:", ambiente, "cnpj:", cnpj, "uf:", uf, "startNsu:", startNsu || "(zero)");

    // Cooldown: verificar se já passou o tempo mínimo entre consultas
    if (action === "consultar" && nfeConfig?.last_query_at) {
      const lastQuery = new Date(nfeConfig.last_query_at).getTime();
      const elapsed = Date.now() - lastQuery;
      if (elapsed < COOLDOWN_MS) {
        const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        console.log("[sefaz-proxy] cooldown ativo, restam ~", remainingMin, "minutos");
        return json({
          notas: [],
          maxNsuObtido: startNsu,
          resetouCursor: false,
          cooldown: true,
          cooldownMinutos: remainingMin,
          debug: {
            cStat: "656",
            xMotivo: `Cooldown entre consultas — aguarde ${remainingMin} minuto(s)`,
            endpoint: "",
            tpAmb: ambiente === "producao" ? "1" : "2",
            cUFAutor: "",
            cnpj,
          },
        });
      }
    }

    // Import dinâmico de sefaz (usa node:https — só funciona no Node.js)
    const { consultarDestinatario, enviarEventoManifestacao, emitirNFe } = await import("@/lib/sefaz");

    let result: unknown;

    switch (action) {
      case "consultar": {
        // Buscar last_query_at atual ANTES de consultar
        const { data: configAntes } = await supabase
          .from("nfe_config")
          .select("last_query_at")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const lastQueryAntes = configAntes?.last_query_at;

        result = await consultarDestinatario(pfxBytes, senha, cnpj, uf, ambiente, startNsu);
        const r = result as { maxNsuObtido?: string; debug?: { cStat?: string } };

        if (r.debug?.cStat === "138" || r.debug?.cStat === "137") {
          // Sucesso: atualizar last_query_at e last_nsu
          const now = new Date().toISOString();
          await supabase.from("nfe_config").update({ last_query_at: now }).eq("empresa_id", empresaId);
          if (r.maxNsuObtido) {
            await supabase.from("nfe_config").update({ last_nsu: r.maxNsuObtido }).eq("empresa_id", empresaId);
          }
        }
        // cStat 656 ou qualquer erro: NÃO atualizar last_query_at — timer conta da última sucesso

        // Para cStat 656: enviar lastQueryAt ORIGINAL para o front calcular retry
        if (r.debug?.cStat === "656") {
          (r as Record<string, unknown>).lastQueryAt = lastQueryAntes;
        }
        break;
      }
      case "manifestar":
        result = await enviarEventoManifestacao(
          pfxBytes, senha, body.chave, body.tipoEvento, cnpj, uf, ambiente, body.justificativa,
        );
        break;
      case "emitir":
        result = await emitirNFe(pfxBytes, senha, body.xml, uf, ambiente);
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
