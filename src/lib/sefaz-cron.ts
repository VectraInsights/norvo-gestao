/**
 * Cron job SEFAZ — roda a cada 20min (00:00–07:00 BRT) via Vercel Cron.
 * Busca notas recebidas para todas as empresas com certificado ativo.
 * Pula empresa se última consulta bem-sucedida < 1h (evita cStat 656).
 */

import { createClient } from "@supabase/supabase-js";
import { SEFAZ_AMBIENTE, SEFAZ_TP_AMB } from "@/lib/sefaz-ambiente";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

export async function handleSefazCron(): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

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
  let skipped = 0;
  let errors = 0;

  for (const empresaId of empresaIds) {
    try {
      const cert = await buscarCertificadoAtivo(empresaId);

      const { data: nfeConfig } = await supabase
        .from("nfe_config")
        .select("last_nsu, last_query_at")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      const ambiente = SEFAZ_AMBIENTE;
      const startNsu = nfeConfig?.last_nsu || undefined;
      console.log(`[sefaz-cron] ${empresaId}: ambiente=${ambiente} tpAmb=${SEFAZ_TP_AMB}`);

      // Pular se última consulta < 1h (evita cStat 656)
      if (nfeConfig?.last_query_at) {
        const elapsed = Date.now() - new Date(nfeConfig.last_query_at).getTime();
        if (elapsed < COOLDOWN_MS) {
          const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
          console.log(`[sefaz-cron] ${empresaId}: pulando (cooldown, restam ~${remainingMin}min)`);
          skipped++;
          continue;
        }
      }

      const result = await consultarDestinatario(
        cert.pfx, cert.senha, cert.cnpj, cert.uf, ambiente, startNsu,
      );

      // Salvar cursor + timestamp em sucesso (138/137) e também em 656 (para avançar cursor e respeitar 1h)
      if (result.debug?.cStat === "138" || result.debug?.cStat === "137") {
        const now = new Date().toISOString();
        const update: Record<string, unknown> = { last_query_at: now };
        if (result.maxNsuObtido) {
          update.last_nsu = result.maxNsuObtido;
        }
        await supabase.from("nfe_config").update(update).eq("empresa_id", empresaId);
      } else if (result.debug?.cStat === "656") {
        // Consumo Indevido: SEFAZ manda esperar 1h e usar o ultNSU retornado
        const now = new Date().toISOString();
        const ult = (result as any).ultNSU || (result as any).maxNsuObtido || (result.debug as any).ultNSU;
        const update: Record<string, unknown> = { last_query_at: now };
        if (ult) update.last_nsu = ult;
        await supabase.from("nfe_config").update(update).eq("empresa_id", empresaId);
        console.log(`[sefaz-cron] ${empresaId}: 656 - cursor atualizado para ${ult || "(mantido)"} e cooldown 1h`);
      }

      console.log(`[sefaz-cron] ${empresaId}: ${result.notas.length} notas, cStat: ${result.debug?.cStat}`);
      processed++;

      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[sefaz-cron] Erro empresa ${empresaId}:`, err);
      errors++;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, skipped, errors }));
}
