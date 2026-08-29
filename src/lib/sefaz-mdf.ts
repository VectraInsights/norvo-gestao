/**
 * MDF-e (Manifesto Eletrônico de Documentos Fiscais) — modelo 58
 * Estrutura inicial (fase 1). Fase 2: assinatura + SEFAZ + encerramento.
 */

export const MDF_ENDPOINTS = {
  homologacao: {
    mdfRecepcao: "https://homologacao.mdf.fazenda.gov.br/ws/MDFeRecepcao",
    mdfRetRecepcao: "https://homologacao.mdf.fazenda.gov.br/ws/MDFeRetRecepcao",
    mdfStatusServico: "https://homologacao.mdf.fazenda.gov.br/ws/MDFeStatusServico",
    mdfConsulta: "https://homologacao.mdf.fazenda.gov.br/ws/MDFeConsulta",
    mdfRecepcaoEvento: "https://homologacao.mdf.fazenda.gov.br/ws/MDFeRecepcaoEvento",
  },
  producao: {
    mdfRecepcao: "https://mdf.fazenda.gov.br/ws/MDFeRecepcao",
    mdfRetRecepcao: "https://mdf.fazenda.gov.br/ws/MDFeRetRecepcao",
    mdfStatusServico: "https://mdf.fazenda.gov.br/ws/MDFeStatusServico",
    mdfConsulta: "https://mdf.fazenda.gov.br/ws/MDFeConsulta",
    mdfRecepcaoEvento: "https://mdf.fazenda.gov.br/ws/MDFeRecepcaoEvento",
  },
} as const;

export type Ambiente = "homologacao" | "producao";

export interface MdfInput {
  empresaId: string;
  veiculoTracaoId?: string;
  motoristaId?: string;
  ufCarregamento: string;
  ufDescarregamento: string;
  ctesChaves: string[]; // chaves de CT-e vinculadas
  ambiente: Ambiente;
}

export function buildMdfXmlBase(input: MdfInput, numero: string, serie: string): string {
  const dhEmi = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<MDFe xmlns="http://www.portalfiscal.inf.br/mdf" versao="3.00">
  <infMDFe Id="MDFe${numero.padStart(9,"0")}" versao="3.00">
    <ide><cUF>35</cUF><tpAmb>${input.ambiente === "producao" ? "1" : "2"}</tpAmb><mod>58</mod><serie>${serie}</serie><nMDF>${numero}</nMDF><dhEmi>${dhEmi}</dhEmi></ide>
    <infDoc><qCTe>${input.ctesChaves.length}</qCTe></infDoc>
  </infMDFe>
</MDFe>`;
}

export function signMdfXml(xml: string, _pfx: Buffer, _senha: string): string {
  if (!xml.includes("<infMDFe")) throw new Error("XML MDF-e inválido");
  return xml; // TODO fase 2
}
export async function emitirMdfStub(): Promise<never> { throw new Error("MDF-e emissão não implementada na fase 1"); }
export async function encerrarMdfStub(): Promise<never> { throw new Error("MDF-e encerramento não implementado na fase 1"); }
export async function cancelarMdfStub(): Promise<never> { throw new Error("MDF-e cancelamento não implementado na fase 1"); }

export { buscarCertificadoAtivo } from "./sefaz";
