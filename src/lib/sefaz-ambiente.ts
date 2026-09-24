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
