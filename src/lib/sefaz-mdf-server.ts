/**
 * Server functions para MDF-e (Manifesto Eletrônico de Documentos Fiscais)
 * Segue o mesmo padrão de sefaz-server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { MDFE_AMBIENTE, MDFE_TP_AMB } from "@/lib/sefaz-ambiente";

const SEFAZ_URL = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
    const fromImport = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || "";
    const fromProcess = typeof process !== "undefined"
      ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "")
      : "";
    return fromImport || fromProcess;
  } catch {
    return "";
  }
})();

async function callSefazProxy(action: string, body: Record<string, unknown>) {
  if (!SEFAZ_URL) throw new Error("SEFAZ_URL não configurado");
  const res = await fetch(SEFAZ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
    },
    body: JSON.stringify({ action, ...body, ambiente: MDFE_AMBIENTE, tpAmb: MDFE_TP_AMB }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Falha na chamada SEFAZ (${res.status})`);
  }
  return res.json();
}

async function getCertAndAmbiente(empresaId: string) {
  const { buscarCertificadoAtivo } = await import("@/lib/sefaz");
  const cert = await buscarCertificadoAtivo(empresaId);
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  console.log(`[sefaz-mdf-server] empresa=${empresaId} ambiente: ${MDFE_AMBIENTE} tpAmb=${MDFE_TP_AMB}`);
  return { cert, ambiente: MDFE_AMBIENTE, supabase };
}

export const emitirMdfFn = createServerFn({ method: "POST" })
  .validator((data: {
    empresaId: string;
    xml: string;
    veiculoTracaoId?: string;
    motoristaId?: string;
    ufCarregamento: string;
    ufDescarregamento: string;
    qtdCtes: number;
    valorTotalCarga: number;
    pesoTotal: number;
    percursoUFs?: string[];
    observacoes?: string;
    infoFisco?: string;
    tipoMdf?: string;
    isTransbordo?: boolean;
    transbordo1?: string;
    transbordo2?: string;
    transbordo3?: string;
    numero?: string;
    serie?: string;
  }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("emitirMdf", data);

    const { emitirMdf, dadosDoCteVinculado, completarSegMdf, garantirContratanteMdf, garantirProdPredMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    // 698/699 (seg), 578 (contratante) e 725 (prodPred): completa com dados do CT-e.
    try {
      const dados = await dadosDoCteVinculado(supabase, data.empresaId, String(data.xml || ""));
      if (dados.seg) { const antes = String(data.xml || ""); data.xml = completarSegMdf(antes, dados.seg); if (data.xml !== antes) console.log("[mdf-debug] seg completado do CT-e:", JSON.stringify({ xSeg: dados.seg.xSeg, nApol: dados.seg.nApol, temCnpj: !!dados.seg.cnpjSeg })); }
      if (dados.contratantes.length) { const antes = String(data.xml || ""); data.xml = garantirContratanteMdf(antes, dados.contratantes); if (data.xml !== antes) console.log("[mdf-debug] contratante do CT-e:", JSON.stringify(dados.contratantes)); }
      { const antes = String(data.xml || ""); data.xml = garantirProdPredMdf(antes, dados.proPred); if (data.xml !== antes) console.log("[mdf-debug] prodPred do CT-e:", JSON.stringify(dados.proPred || "CARGA GERAL")); }
    } catch {}

    const result = await emitirMdf(cert.pfx, cert.senha, data.xml, ambiente);

    // Chaves dos documentos vinculados (para limpar rejeitados dos mesmos CT-es).
    const chavesDe = (x: string) => [...x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g), ...x.matchAll(/<chMDFe>(\d{44})<\/chMDFe>/g)].map(m => m[1]).sort();
    const limparRejeitadosIguais = async () => {
      try {
        const chavesNovo = chavesDe(String(data.xml || ""));
        if (!chavesNovo.length) return;
        const { data: rejAnt } = await supabase.from("mdf_documentos" as never).select("id,xml_assinado").eq("empresa_id", data.empresaId).eq("status", "rejeitado");
        for (const r of (rejAnt as any[]) || []) {
          const ch = chavesDe(String((r as any).xml_assinado || ""));
          if (ch.length && JSON.stringify(ch) === JSON.stringify(chavesNovo)) {
            await supabase.from("mdf_documentos" as never).delete().eq("id", (r as any).id);
          }
        }
      } catch {}
    };

    if (result.sucesso && result.chave) {
      await limparRejeitadosIguais();
      await supabase.from("mdf_documentos" as never).upsert({
        empresa_id: data.empresaId,
        chave_acesso: result.chave,
        status: "autorizado",
        numero: String((data as any).numero || String(data.xml || "").match(/<nMDF>(\d+)<\/nMDF>/)?.[1] || ""),
        serie: String((data as any).serie || String(data.xml || "").match(/<serie>(\d+)<\/serie>/)?.[1] || ""),
        protocolo_sefaz: result.protocolo || null,
        veiculo_tracao_id: data.veiculoTracaoId || null,
        motorista_id: data.motoristaId || null,
        uf_carregamento: data.ufCarregamento,
        uf_descarregamento: data.ufDescarregamento,
        qtd_cte: data.qtdCtes,
        valor_total_carga: data.valorTotalCarga,
        peso_total: data.pesoTotal,
        ambiente,
        data_autorizacao: new Date().toISOString(),
        xml_assinado: JSON.stringify({ xml: data.xml, percursoUFs: data.percursoUFs || [], observacoes: data.observacoes || "", infoFisco: data.infoFisco || "", tipoMdf: (data as any).tipoMdf || "Normal", isTransbordo: !!(data as any).isTransbordo, transbordos: [(data as any).transbordo1, (data as any).transbordo2, (data as any).transbordo3].filter(Boolean) }),
      } as never, { onConflict: "chave_acesso" });
    } else if (result.cStat) {
      const numero = data.xml.match(/<nMDF>(\d+)<\/nMDF>/)?.[1] || "";
      const serie = data.xml.match(/<serie>(\d+)<\/serie>/)?.[1] || "1";
      // Substitui rejeitado anterior com os mesmos documentos (não duplica a cada tentativa)
      const chavesDe = (x: string) => [...x.matchAll(/<chCTe>(\d{44})<\/chCTe>/g), ...x.matchAll(/<chMDFe>(\d{44})<\/chMDFe>/g)].map(m => m[1]).sort();
      try {
        const chavesNovo = chavesDe(data.xml);
        const { data: rejAnt } = await supabase.from("mdf_documentos" as never).select("id,xml_assinado").eq("empresa_id", data.empresaId).eq("status", "rejeitado");
        for (const r of (rejAnt as any[]) || []) {
          const ch = chavesDe(String((r as any).xml_assinado || ""));
          if (ch.length && JSON.stringify(ch) === JSON.stringify(chavesNovo)) {
            await supabase.from("mdf_documentos" as never).delete().eq("id", (r as any).id);
          }
        }
      } catch {}
      await supabase.from("mdf_documentos" as never).insert({
        empresa_id: data.empresaId,
        numero,
        serie,
        status: "rejeitado",
        motivo_rejeicao: `${result.cStat} - ${result.xMotivo}`,
        uf_carregamento: data.ufCarregamento,
        uf_descarregamento: data.ufDescarregamento,
        qtd_cte: data.qtdCtes,
        valor_total_carga: data.valorTotalCarga,
        peso_total: data.pesoTotal,
        ambiente,
        xml_assinado: data.xml,
      } as never);
    }

    return result;
  });

export const consultarMdfFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("consultarMdf", { empresaId: data.empresaId, chave: data.chave });

    const { consultarMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente } = await getCertAndAmbiente(data.empresaId);
    return consultarMdf(cert.pfx, cert.senha, data.chave, ambiente);
  });

export const encerrarMdfFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; cnpj: string; uf: string; protocolo: string; cMun: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("encerrarMdf", data);

    const { encerrarMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    const result = await encerrarMdf(cert.pfx, cert.senha, data.chave, ambiente, data.cnpj, data.uf, data.protocolo, data.cMun);

    // Backfill do protocolo quando recuperado automaticamente (só acontece uma vez).
    if ((result as any).protocoloUsado && !(data.protocolo || "").replace(/\D/g, "")) {
      try { await supabase.from("mdf_documentos" as never).update({ protocolo_sefaz: (result as any).protocoloUsado } as never).eq("chave_acesso", data.chave); } catch {}
    }

    if (result.sucesso) {
      await supabase.from("mdf_documentos" as never).update({ status: "encerrado", data_encerramento: new Date().toISOString() } as never).eq("chave_acesso", data.chave);
    }

    return result;
  });

export const cancelarMdfFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; justificativa: string; cnpj: string; uf: string; protocolo: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("cancelarMdf", data);

    const { cancelarMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    const result = await cancelarMdf(cert.pfx, cert.senha, data.chave, data.justificativa, ambiente, data.cnpj, data.uf, data.protocolo);

    // Backfill do protocolo quando recuperado automaticamente (só acontece uma vez).
    if ((result as any).protocoloUsado && !(data.protocolo || "").replace(/\D/g, "")) {
      try { await supabase.from("mdf_documentos" as never).update({ protocolo_sefaz: (result as any).protocoloUsado } as never).eq("chave_acesso", data.chave); } catch {}
    }

    if (result.sucesso) {
      await supabase.from("mdf_documentos" as never).update({ status: "cancelado" } as never).eq("chave_acesso", data.chave);
    }

    return result;
  });
