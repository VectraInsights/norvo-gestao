/**
 * Server functions para MDF-e (Manifesto Eletrônico de Documentos Fiscais)
 * Segue o mesmo padrão de sefaz-server.ts.
 */
import { createServerFn } from "@tanstack/react-start";

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
    body: JSON.stringify({ action, ...body }),
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
  const { data: nfeConfig } = await supabase.from("nfe_config").select("ambiente").eq("empresa_id", empresaId).maybeSingle();
  const ambiente: "homologacao" | "producao" = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
  return { cert, ambiente, supabase };
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
  }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("emitirMdf", data);

    const { emitirMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    const result = await emitirMdf(cert.pfx, cert.senha, data.xml, ambiente);

    if (result.sucesso && result.chave) {
      await supabase.from("mdf_documentos" as never).upsert({
        empresa_id: data.empresaId,
        chave_acesso: result.chave,
        status: "autorizado",
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
  .validator((data: { empresaId: string; chave: string; cnpj: string; uf: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("encerrarMdf", data);

    const { encerrarMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    const result = await encerrarMdf(cert.pfx, cert.senha, data.chave, ambiente, data.cnpj, data.uf);

    if (result.sucesso) {
      await supabase.from("mdf_documentos" as never).update({ status: "encerrado", data_encerramento: new Date().toISOString() } as never).eq("chave_acesso", data.chave);
    }

    return result;
  });

export const cancelarMdfFn = createServerFn({ method: "POST" })
  .validator((data: { empresaId: string; chave: string; justificativa: string; cnpj: string; uf: string }) => data)
  .handler(async ({ data }) => {
    if (SEFAZ_URL) return callSefazProxy("cancelarMdf", data);

    const { cancelarMdf } = await import("@/lib/sefaz-mdf");
    const { cert, ambiente, supabase } = await getCertAndAmbiente(data.empresaId);

    const result = await cancelarMdf(cert.pfx, cert.senha, data.chave, data.justificativa, ambiente, data.cnpj, data.uf);

    if (result.sucesso) {
      await supabase.from("mdf_documentos" as never).update({ status: "cancelado" } as never).eq("chave_acesso", data.chave);
    }

    return result;
  });
