/**
 * Server functions para integração SEFAZ
 * Chamadas pelo frontend via createServerFn
 */

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// Helper: Supabase Admin (service role)
// ============================================================

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  return createClient(url, key);
}

// ============================================================
// Buscar certificado ativo da empresa
// ============================================================

export const buscarCertificadoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseAdmin();

    // 1. Buscar metadados do certificado
    const { data: cert, error: certErr } = await supabase
      .from("certificados_digitais")
      .select("id, arquivo_path, arquivo_nome, thumbprint, validade, nome")
      .eq("empresa_id", data.empresaId)
      .eq("ativo", true)
      .single();

    if (certErr || !cert) {
      throw new Error("Nenhum certificado digital ativo encontrado para esta empresa");
    }

    // 2. Download do arquivo do Storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("certificados")
      .download(cert.arquivo_path);

    if (dlErr || !fileData) {
      throw new Error("Falha ao baixar o certificado do storage");
    }

    const pfxBytes = Buffer.from(await fileData.arrayBuffer());

    // 3. Buscar senha (campo senha_cript)
    const { data: certSenha } = await supabase
      .from("certificados_digitais")
      .select("senha_cript")
      .eq("id", cert.id)
      .single();

    if (!certSenha?.senha_cript) {
      throw new Error("Senha do certificado não encontrada");
    }

    // 4. Buscar CNPJ da empresa
    const { data: empresa } = await supabase
      .from("empresas")
      .select("cnpj, uf")
      .eq("id", data.empresaId)
      .single();

    return {
      pfxBase64: pfxBytes.toString("base64"),
      senha: certSenha.senha_cript,
      thumbprint: cert.thumbprint,
      validade: cert.validade,
      nome: cert.nome,
      cnpj: empresa?.cnpj || "",
      uf: empresa?.uf || "SP",
    };
  });

// ============================================================
// Consultar NFe emitidas contra o CNPJ (Manifestação Destinatário)
// ============================================================

export const consultarNFeDestinatarioFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    // Dynamic import para não sobrecarregar o bundle do client
    const { consultarDestinatario } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoFn({ data: { empresaId: data.empresaId } });

    const pfxBytes = Buffer.from(cert.pfxBase64, "base64");
    const result = await consultarDestinatario(
      pfxBytes,
      cert.senha,
      cert.cnpj,
      cert.uf,
      "homologacao",
    );

    return result;
  });

// ============================================================
// Registrar Manifestação (Ciência / Confirmação / Desconhecimento)
// ============================================================

export const manifestarNFeFn = createServerFn({ method: "POST" })
  .validator((data: {
    empresaId: string;
    chave: string;
    tipoEvento: "210200" | "210210" | "210220";
    justificativa?: string;
  }) => data)
  .handler(async ({ data }) => {
    const { enviarEventoManifestacao } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoFn({ data: { empresaId: data.empresaId } });

    const pfxBytes = Buffer.from(cert.pfxBase64, "base64");
    const result = await enviarEventoManifestacao(
      pfxBytes,
      cert.senha,
      data.chave,
      data.tipoEvento,
      cert.cnpj,
      cert.uf,
      "homologacao",
      data.justificativa,
    );

    return result;
  });

// ============================================================
// Emitir NF-e (assinar e enviar para autorização)
// ============================================================

export const emitirNFeFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; xml: string }) => data)
  .handler(async ({ data }) => {
    const { emitirNFe } = await import("@/lib/sefaz");
    const cert = await buscarCertificadoFn({ data: { empresaId: data.empresaId } });

    const pfxBytes = Buffer.from(cert.pfxBase64, "base64");
    const result = await emitirNFe(
      pfxBytes,
      cert.senha,
      data.xml,
      cert.uf,
      "homologacao",
    );

    return result;
  });

// ============================================================
// Verificar Status do Serviço SEFAZ
// ============================================================

export const verificarStatusServicoFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string }) => data)
  .handler(async ({ data }) => {
    const cert = await buscarCertificadoFn({ data: { empresaId: data.empresaId } });
    // Por enquanto, retorna status mockado
    // TODO: implementar chamada real ao NfeStatusServico4
    return {
      status: "OK",
      uf: cert.uf,
      ambiente: "homologacao",
      motivo: "Serviço operacional",
    };
  });
