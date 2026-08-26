/**
 * Cron job SEFAZ — roda 2x/dia (8h e 12h BRT) via Vercel Cron.
 * Busca notas recebidas para todas as empresas com certificado ativo.
 */

import { createClient } from "@supabase/supabase-js";

export async function handleSefazCron(): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Buscar todas as empresas com certificado ativo
  const { data: certs, error: certErr } = await supabase
    .from("certificados_digitais")
    .select("empresa_id")
    .eq("ativo", true);

  if (certErr || !certs || certs.length === 0) {
    console.log("[sefaz-cron] Nenhum certificado ativo encontrado");
    return new Response(JSON.stringify({ ok: true, processed: 0 }));
  }

  const empresaIds = [...new Set(certs.map((c) => c.empresa_id))];
  console.log("[sefaz-cron] Empresas para sincronizar:", empresaIds.length);

  const { consultarDestinatario, buscarCertificadoAtivo } = await import("@/lib/sefaz");
  let processed = 0;
  let errors = 0;

  for (const empresaId of empresaIds) {
    try {
      // Buscar certificado + dados da empresa
      const cert = await buscarCertificadoAtivo(empresaId);

      // Buscar ambiente e cursor
      const { data: nfeConfig } = await supabase
        .from("nfe_config")
        .select("ambiente, last_nsu")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
      const startNsu = nfeConfig?.last_nsu || undefined;

      const result = await consultarDestinatario(
        cert.pfx, cert.senha, cert.cnpj, cert.uf, ambiente, startNsu,
      );

      // Salvar cursor
      if (result.maxNsuObtido) {
        await supabase
          .from("nfe_config")
          .update({ last_nsu: result.maxNsuObtido })
          .eq("empresa_id", empresaId);
      }

      console.log(`[sefaz-cron] ${empresaId}: ${result.notas.length} notas, cursor: ${result.maxNsuObtido || "none"}`);
      processed++;

      // Pequena pausa entre empresas para não sobrecarregar
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[sefaz-cron] Erro empresa ${empresaId}:`, err);
      errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, errors }));
}
