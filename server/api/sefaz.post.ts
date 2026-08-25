import { createError, readBody, getHeader } from "h3";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw createError({ statusCode: 500, message: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios" });
  return createClient(url, key);
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { action, empresaId } = body;

  if (!action || !empresaId) {
    throw createError({ statusCode: 400, message: "action e empresaId são obrigatórios" });
  }

  const authHeader = getHeader(event, "Authorization");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    throw createError({ statusCode: 401, message: "Não autorizado" });
  }

  const supabase = getSupabaseAdmin();

  // Buscar certificado ativo
  const { data: cert, error: certErr } = await supabase
    .from("certificados_digitais")
    .select("id, arquivo_path")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .single();

  if (certErr || !cert) {
    throw createError({ statusCode: 404, message: "Nenhum certificado ativo encontrado" });
  }

  // Download do certificado
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("certificados")
    .download(cert.arquivo_path);

  if (dlErr || !fileData) {
    throw createError({ statusCode: 500, message: "Falha ao baixar certificado" });
  }

  const pfxBytes = Buffer.from(await fileData.arrayBuffer());

  // Buscar senha
  const { data: certSenha } = await supabase
    .from("certificados_digitais")
    .select("senha_cript")
    .eq("id", cert.id)
    .single();

  if (!certSenha?.senha_cript) {
    throw createError({ statusCode: 500, message: "Senha não encontrada" });
  }

  // Buscar empresa
  const { data: empresa } = await supabase
    .from("empresas")
    .select("cnpj, uf")
    .eq("id", empresaId)
    .single();

  const senha = certSenha.senha_cript;
  const cnpj = empresa?.cnpj || "";
  const uf = empresa?.uf || "SP";

  const { consultarDestinatario, enviarEventoManifestacao, emitirNFe } = await import("@/lib/sefaz");

  switch (action) {
    case "consultar":
      return await consultarDestinatario(pfxBytes, senha, cnpj, uf, "homologacao");
    case "manifestar":
      return await enviarEventoManifestacao(pfxBytes, senha, body.chave, body.tipoEvento, cnpj, uf, "homologacao", body.justificativa);
    case "emitir":
      return await emitirNFe(pfxBytes, cert.senha_cript, body.xml, uf, "homologacao");
    default:
      throw createError({ statusCode: 400, message: `Ação desconhecida: ${action}` });
  }
});
