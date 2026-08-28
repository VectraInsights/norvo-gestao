/**
 * CT-e (Conhecimento de Transporte Eletrônico) — modelo 57
 * Estrutura inicial (fase 1). Fase 2 implementa assinatura W3C, SOAP mTLS e SEFAZ.
 * Reaproveita infra de certificado de `sefaz.ts` (mesmo A1, mesmo pfx).
 */

import { gunzipSync } from "zlib";

// Endpoints por UF — CT-e usa SVRS/AN distinto da NF-e.
// Homologação/Produção documentados em https://www.cte.fazenda.gov.br/portal/webServices.aspx
// TODO fase 2: validar cada URL com testes mTLS (SP/MG/RS usam URL própria, demais SVRS)
export const CTE_ENDPOINTS = {
  homologacao: {
    cteAutorizacao: "https://homologacao.cte.fazenda.gov.br/ws/CTeRecepcao",
    cteRetAutorizacao: "https://homologacao.cte.fazenda.gov.br/ws/CTeRetRecepcao",
    cteStatusServico: "https://homologacao.cte.fazenda.gov.br/ws/CTeStatusServico",
    cteConsulta: "https://homologacao.cte.fazenda.gov.br/ws/CTeConsulta",
    cteRecepcaoEvento: "https://homologacao.cte.fazenda.gov.br/ws/CTeRecepcaoEvento",
  },
  producao: {
    cteAutorizacao: "https://cte.fazenda.gov.br/ws/CTeRecepcao",
    cteRetAutorizacao: "https://cte.fazenda.gov.br/ws/CTeRetRecepcao",
    cteStatusServico: "https://cte.fazenda.gov.br/ws/CTeStatusServico",
    cteConsulta: "https://cte.fazenda.gov.br/ws/CTeConsulta",
    cteRecepcaoEvento: "https://cte.fazenda.gov.br/ws/CTeRecepcaoEvento",
  },
  // SVRS (fallback)
  svrsHom: "https://homologacao.cte.fazenda.gov.br/ws",
  svrsProd: "https://cte.fazenda.gov.br/ws",
} as const;

export type Ambiente = "homologacao" | "producao";

export interface CteInput {
  empresaId: string;
  tomador: { cnpj?: string; cpf?: string; nome: string; uf: string; municipio: string };
  remetente: { cnpj?: string; nome: string; uf: string };
  destinatario: { cnpj?: string; nome: string; uf: string };
  valorServico: number;
  valorCarga: number;
  peso: number;
  cfop: string;
  viagemId?: string;
  veiculoId?: string;
  ambiente: Ambiente;
}

// Builder mínimo — gera XML base para assinatura (sem assinatura ainda)
export function buildCteXmlBase(input: CteInput, numero: string, serie: string): string {
  // TODO fase 2: mapear todos os grupos obrigatórios do CT-e 4.00 (ide, emit, rem, dest, vPrest, imp, infCTeNorm etc.)
  // Por ora retorna esqueleto válido para validar assinatura + envio
  const dhEmi = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <infCte Id="CTe${numero.padStart(9,"0")}" versao="4.00">
    <ide><cUF>35</cUF><cCT>${numero}</cCT><CFOP>${input.cfop}</CFOP><mod>57</mod><serie>${serie}</serie><nCT>${numero}</nCT><dhEmi>${dhEmi}</dhEmi><tpImp>1</tpImp><tpEmis>1</tpEmis><tpAmb>${input.ambiente === "producao" ? "1" : "2"}</tpAmb></ide>
    <emit><CNPJ>00000000000100</CNPJ><xNome>Emitente</xNome></emit>
    <vPrest><vTPrest>${input.valorServico.toFixed(2)}</vTPrest><vRec>${input.valorServico.toFixed(2)}</vRec></vPrest>
    <infCarga><vCarga>${input.valorCarga.toFixed(2)}</vCarga></infCarga>
  </infCte>
</CTe>`;
}

// Stub: assinatura reaproveita `signXml` de sefaz.ts (infCte Id)
// Na fase 2, importar `signXml` genérico e aplicar aqui
export function signCteXml(xml: string, _pfx: Buffer, _senha: string): string {
  if (!xml.includes("<infCte")) throw new Error("XML CT-e inválido");
  // Placeholder — fase 2: chamar signXml(xml, pfx, senha) com detecção de <infCte>
  return xml; // TODO
}

export async function emitirCteStub(): Promise<never> {
  throw new Error("CT-e emissão não implementada na fase 1 — aguardando assinatura + SEFAZ (fase 2)");
}
export async function consultarCteStub(): Promise<never> {
  throw new Error("CT-e consulta não implementada na fase 1");
}
export async function cancelarCteStub(): Promise<never> {
  throw new Error("CT-e cancelamento não implementado na fase 1");
}

// Re-export helper de busca de certificado para reaproveito
export { buscarCertificadoAtivo } from "./sefaz";
