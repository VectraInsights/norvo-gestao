/**
 * Ambiente fiscal global do ambiente de testes.
 *
 * O sistema ainda está em homologação. Este é o único valor usado pelo
 * runtime para NF-e, CT-e e MDF-e; configurações de banco/UI não podem
 * reativar produção durante os testes.
 */
export const SEFAZ_AMBIENTE = "homologacao" as const;
export const SEFAZ_TP_AMB = "2" as const;
export const MDFE_AMBIENTE = SEFAZ_AMBIENTE;
export const MDFE_TP_AMB = SEFAZ_TP_AMB;
export const MDFE_SVRS_HOMOLOGACAO_HOST = "mdfe-homologacao.svrs.rs.gov.br" as const;

export function assertSefazAmbiente(ambiente: string): void {
  if (ambiente !== SEFAZ_AMBIENTE) {
    throw new Error(
      `Operação fiscal bloqueada fora de ${SEFAZ_AMBIENTE}: recebido ${ambiente || "(vazio)"}`,
    );
  }
}

export function assertSefazXmlAmbiente(xml: string): void {
  const tpAmbValues = [...xml.matchAll(/<tpAmb>\s*(\d+)\s*<\/tpAmb>/g)].map((match) => match[1]);
  if (tpAmbValues.length === 0 || tpAmbValues.some((value) => value !== SEFAZ_TP_AMB)) {
    throw new Error(
      `Operação fiscal bloqueada: XML com tpAmb=${tpAmbValues.join(",") || "(ausente)"}; esperado=${SEFAZ_TP_AMB}`,
    );
  }
}

export const assertMdfAmbiente = assertSefazAmbiente;
export const assertMdfXmlAmbiente = assertSefazXmlAmbiente;

// Mascara documentos em log (CNPJ/CPF/chave): dados sensíveis não vão p/ stdout.
export function maskDoc(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11) return "***.***.***-" + d.slice(-2);
  if (d.length === 14) return d.slice(0, 2) + ".***.***/****-" + d.slice(-2);
  if (d.length === 44) return d.slice(0, 8) + "…" + d.slice(-4);
  return d ? "***" : "";
}

// Traduz retorno SEFAZ p/ mensagem amigável (sem HTML nem dump técnico).
// Códigos de transporte têm texto próprio; rejeição de negócio preserva o
// motivo da SEFAZ (limpo); falha de rede vira texto curto.
const CSTAT_AMIGAVEL: Record<string, string> = {
  "100": "Autorizado o uso do CT-e",
  "101": "Cancelamento homologado",
  "104": "Lote processado",
  "105": "Lote em processamento",
  "110": "Uso denegado",
  "135": "Evento registrado e vinculado",
  "155": "Cancelamento homologado",
  "217": "CT-e não consta na base da SEFAZ",
  "225": "Falha no schema do XML — confira os dados e reenvie",
};
export function erroSefazAmigavel(cStat: unknown, xMotivo: unknown): string {
  const cod = String(cStat || "").replace(/\D/g, "");
  let msg = String(xMotivo || "");
  // Resposta HTTP/HTML crua (ex. 404): não mostra tag na tela
  if (/<html|<!DOCTYPE|HTTP \d{3}|CTe HTTP \d+:/i.test(msg)) {
    const http = msg.match(/HTTP (\d{3})/)?.[1] || "";
    return http
      ? `Falha de comunicação com a SEFAZ (HTTP ${http}) — tente de novo`
      : "Falha de comunicação com a SEFAZ — tente de novo";
  }
  msg = msg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  if (CSTAT_AMIGAVEL[cod] && (cod === "225" || !msg)) return `[${cod}] ${CSTAT_AMIGAVEL[cod]}`;
  if (msg) return cod ? `[${cod}] ${msg}` : msg;
  return cod ? `[${cod}] Rejeitado pela SEFAZ` : "Falha ao comunicar com a SEFAZ";
}
