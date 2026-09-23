/**
 * MDF-e (Manifesto Eletrônico de Documentos Fiscais) — modelo 58
 * Fase 2: XML completo 3.00, assinatura, emissão/consulta/encerramento/cancelamento via SVRS.
 * Endpoints: https://www.confaz.fazenda.gov.br/web Services
 * Ref: https://mdfe.fazenda.gov.br/portal/webServices.aspx
 */
import https from "node:https";
import { createSefazAgent, signXml, buscarCertificadoAtivo } from "./sefaz";
export { buscarCertificadoAtivo };

export type Ambiente = "homologacao" | "producao";

export const MDF_ENDPOINTS = {
  homologacao: {
    mdfRecepcao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcao/MDFeRecepcao.asmx",
    mdfRetRecepcao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRetRecepcao/MDFeRetRecepcao.asmx",
    mdfStatusServico: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
    mdfConsulta: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
    mdfRecepcaoEvento: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
    mdfDistribuicaoDFe: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
    mdfConsNaoEnc: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeConsNaoEnc/MDFeConsNaoEnc.asmx",
  },
  producao: {
    mdfRecepcao: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcao/MDFeRecepcao.asmx",
    mdfRetRecepcao: "https://mdfe.svrs.rs.gov.br/ws/MDFeRetRecepcao/MDFeRetRecepcao.asmx",
    mdfStatusServico: "https://mdfe.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
    mdfConsulta: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
    mdfRecepcaoEvento: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
    mdfDistribuicaoDFe: "https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
    mdfConsNaoEnc: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsNaoEnc/MDFeConsNaoEnc.asmx",
  },
} as const;

function getMdfEndpoints(ambiente: Ambiente) {
  return ambiente === "producao" ? MDF_ENDPOINTS.producao : MDF_ENDPOINTS.homologacao;
}

const UF_COD: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53", ES: "32",
  GO: "52", MA: "21", MG: "31", MS: "50", MT: "51", PA: "15", PB: "25", PE: "26",
  PI: "22", PR: "41", RJ: "33", RN: "24", RO: "11", RR: "14", RS: "43", SC: "42",
  SE: "28", SP: "35", TO: "17",
};
function codigoUF(uf: string) { return UF_COD[uf?.toUpperCase()] || "35"; }

function calcDV(chave43: string): string {
  let soma = 0, peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) { soma += parseInt(chave43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11; const dv = resto < 2 ? 0 : 11 - resto; return String(dv);
}

export function gerarChaveMdf(cUF: string, aamm: string, cnpj: string, serie: string, nMDF: string, cMDF: string): string {
  const base = `${cUF}${aamm}${cnpj.padStart(14, "0")}58${serie.padStart(3, "0")}${nMDF.padStart(9, "0")}1${cMDF.padStart(8, "0")}`;
  return base + calcDV(base);
}

export interface MdfInputCompleto {
  empresaId: string;
  ambiente: Ambiente;
  serie: string;
  numero: string;
  ufCarregamento: string;
  ufDescarregamento: string;
  emit: { cnpj: string; ie: string; xNome: string; uf: string; cMun: string; xMun: string };
  veicTrac: { placa: string; uf: string; rntrc: string; tara: number; capKG?: number; capM3?: number; tpRod?: string; tpCarroceria?: string; ciot?: string };
  reboques?: Array<{ placa: string; uf: string; rntrc?: string; tara: number; capKG?: number; capM3?: number; tpCarroceria?: string }>;
  condutor: { cpf: string; xNome: string };
  ctes: Array<{ chave: string; valor: number; pesoKG: number }>;
  infMunCarrega: Array<{ cMunCarrega: string; xMunCarrega: string }>;
  infMunDescarrega?: Array<{ cMunDescarga: string; xMunDescarga: string }>;
  infPercurso?: Array<{ ufFim: string }>;
  valorTotalCarga: number;
  pesoTotalKG: number;
  qtdTotalNF?: number;
  lacres?: Array<{ nLacre: string }>;
  obs?: string;
  tipo?: "normal" | "transbordo";
  mdfesTransbordo?: Array<{ chave: string }>;
}

export function buildMdfXml(input: MdfInputCompleto): { xml: string; chave: string } {
  const dhEmi = new Date().toISOString();
  const cUF = codigoUF(input.ufCarregamento);
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);
  const cnpjLimpo = input.emit.cnpj.replace(/\D/g, "").padStart(14, "0");
  const nMDF = input.numero.padStart(9, "0");
  const cMDF = String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
  const chave = gerarChaveMdf(cUF, aamm, cnpjLimpo, input.serie, input.numero, cMDF);
  const id = `MDFe${chave}`;
  const dhEmiFmt = dhEmi;
  const dhIniViagem = dhEmi;

  // infMunCarrega
  const infMunCarregaXml = input.infMunCarrega.map(m =>
    `<infMunCarrega><cMunCarrega>${m.cMunCarrega}</cMunCarrega><xMunCarrega>${m.xMunCarrega}</xMunCarrega></infMunCarrega>`
  ).join("");

  // infMunDescarrega
  const infMunDescarregaXml = (input.infMunDescarrega && input.infMunDescarrega.length > 0
    ? input.infMunDescarrega
    : [{ cMunDescarga: input.ctes[0]?.chave?.slice(0, 7) || "", xMunDescarga: "" }]
  ).map(m =>
    `<infMunDescarrega><cMunDescarga>${m.cMunDescarga}</cMunDescarga><xMunDescarga>${m.xMunDescarga}</xMunDescarga></infMunDescarrega>`
  ).join("");

  // infPercurso (UFPer) — opcional (0-25); só UFs adicionadas pelo usuário, sem fallback
  const infPercursoXml = (input.infPercurso || [])
    .map(p => String(p.ufFim || "").trim().toUpperCase())
    .filter(uf => /^[A-Z]{2}$/.test(uf))
    .map(uf => `<infPercurso><UFPer>${uf}</UFPer></infPercurso>`).join("");

  // Veículos
  const ciotNum = String(input.veicTrac.ciot || "").replace(/\D/g, "");
  const infCiotXml = ciotNum ? `<infCIOT><CIOT>${ciotNum}</CIOT><CNPJ>${cnpjLimpo}</CNPJ></infCIOT>` : "";
  const veicTracXml = `<veicTrac><placa>${input.veicTrac.placa}</placa><UF>${input.veicTrac.uf}</UF><RNTRC>${input.veicTrac.rntrc}</RNTRC><tara>${input.veicTrac.tara}</tara>${input.veicTrac.capKG ? `<capKG>${input.veicTrac.capKG}</capKG>` : ""}${input.veicTrac.capM3 ? `<capM3>${input.veicTrac.capM3}</capM3>` : ""}<tpRod>${input.veicTrac.tpRod || "0"}</tpRod><tpCarroceria>${input.veicTrac.tpCarroceria || "0"}</tpCarroceria></veicTrac>`;
  const reboquesXml = (input.reboques || []).map(r =>
    `<reboque><placa>${r.placa}</placa><UF>${r.uf}</UF>${r.rntrc ? `<RNTRC>${r.rntrc}</RNTRC>` : ""}<tara>${r.tara}</tara>${r.capKG ? `<capKG>${r.capKG}</capKG>` : ""}${r.capM3 ? `<capM3>${r.capM3}</capM3>` : ""}<tpCarroceria>${r.tpCarroceria || "0"}</tpCarroceria></reboque>`
  ).join("");

  // Condutor
  const condutorXml = `<condutor><CPF>${input.condutor.cpf.replace(/\D/g, "")}</CPF><xNome>${input.condutor.xNome}</xNome></condutor>`;

  // InfDoc (CT-e vinculados ou MDF-e de transbordo)
  const isTransbordo = input.tipo === "transbordo" && !!input.mdfesTransbordo?.length;
  const infDocXml = isTransbordo
    ? (input.mdfesTransbordo || []).map(mdf => {
        const cMunDesc = mdf.chave.slice(0, 7);
        return `<infMunDescarga><cMunDescarga>${cMunDesc}</cMunDescarga><xMunDescarga></xMunDescarga><infMDFeTransp><chMDFe>${mdf.chave}</chMDFe></infMDFeTransp></infMunDescarga>`;
      }).join("")
    : input.ctes.map(cte => {
        const cMunFim = cte.chave.slice(0, 7);
        return `<infMunDescarga><cMunDescarga>${cMunFim}</cMunDescarga><xMunDescarga></xMunDescarga><infCTe><chCTe>${cte.chave}</chCTe><infCarga><cUnid>01</cUnid><qCarga>${cte.pesoKG.toFixed(4)}</qCarga><vCarga>${cte.valor.toFixed(2)}</vCarga></infCarga></infCTe></infMunDescarga>`;
      }).join("");

  // Lacres
  const lacresXml = (input.lacres || []).map(l => `<nLacre>${l.nLacre}</nLacre>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MDFe xmlns="http://www.portalfiscal.inf.br/mdf" versao="3.00">
  <infMDFe Id="${id}" versao="3.00">
    <ide>
      <cUF>${cUF}</cUF>
      <tpAmb>${input.ambiente === "producao" ? "1" : "2"}</tpAmb>
      <tpEmis>1</tpEmis>
      <mod>58</mod>
      <serie>${input.serie}</serie>
      <nMDF>${input.numero}</nMDF>
      <cMDF>${cMDF}</cMDF>
      <dhEmi>${dhEmiFmt}</dhEmi>
      <tpProd>0</tpProd>
      <tpEmit>0</tpEmit>
      <modFrete>0</modFrete>
      <dhIniViagem>${dhIniViagem}</dhIniViagem>
      <cMunIni>${input.infMunCarrega[0]?.cMunCarrega || ""}</cMunIni>
      <UFIni>${input.ufCarregamento}</UFIni>
      <cMunFim>${input.infMunDescarrega?.[0]?.cMunDescarga || input.ctes[0]?.chave?.slice(0, 7) || ""}</cMunFim>
      <UFFim>${input.ufDescarregamento}</UFFim>
      ${infMunCarregaXml}
      ${infPercursoXml}
    </ide>
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>
      <IE>${input.emit.ie || "ISENTO"}</IE>
      <xNome>${input.emit.xNome}</xNome>
      <enderEmit>
        <xLgr>RUA</xLgr>
        <nro>SN</nro>
        <xBairro>CENTRO</xBairro>
        <cMun>${input.emit.cMun}</cMun>
        <xMun>${input.emit.xMun}</xMun>
        <CEP>00000000</CEP>
        <UF>${input.emit.uf}</UF>
      </enderEmit>
    </emit>
    <infModal versaoModal="3.00">
      <rodo>
        <infANTT>
          <RNTRC>${input.veicTrac.rntrc}</RNTRC>
          ${infCiotXml}
        </infANTT>
        ${veicTracXml}
        ${reboquesXml}
        ${condutorXml}
        ${lacresXml ? `<lacres>${lacresXml}</lacres>` : ""}
      </rodo>
    </infModal>
    <infDoc>${infDocXml}</infDoc>
    <tot>
      ${input.ctes.length > 0 ? `<qCTe>${input.ctes.length}</qCTe>` : isTransbordo ? `<qMDFe>${input.mdfesTransbordo?.length || 0}</qMDFe>` : ""}
      <vCarga>${input.valorTotalCarga.toFixed(2)}</vCarga>
      <cUnid>01</cUnid>
      <qCarga>${input.pesoTotalKG.toFixed(4)}</qCarga>
    </tot>
    <infSolicNFF />
  </infMDFe>
</MDFe>`;
  return { xml, chave };
}

async function soapRequest(url: string, body: string, action: string, agent?: https.Agent): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;
  const contentType = `application/soap+xml; charset=utf-8; action="${action}"`;
  if (agent) {
    const u = new URL(url);
    return new Promise<string>((resolve, reject) => {
      const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname, method: "POST", agent, headers: { "Content-Type": contentType, "Content-Length": Buffer.byteLength(envelope) } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => res.statusCode && res.statusCode >= 400 ? reject(new Error(`MDF-e HTTP ${res.statusCode}: ${d.slice(0, 500)}`)) : resolve(d));
      });
      req.on("error", reject); req.write(envelope); req.end();
    });
  }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": contentType }, body: envelope });
  if (!r.ok) throw new Error(`MDF-e HTTP ${r.status}: ${await r.text()}`);
  return r.text();
}

export async function emitirMdf(pfx: Buffer, senha: string, xml: string, ambiente: Ambiente): Promise<{ sucesso: boolean; cStat: string; xMotivo: string; chave?: string; protocolo?: string; xmlRet?: string }> {
  const ep = getMdfEndpoints(ambiente) as any;
  const agent = createSefazAgent(pfx, senha);
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const xmlAss = signXml(xml, pfx, senha);
  // 1. Recepcao assíncrona (MDF-e 3.00 não tem Sinc) -> cStat 103 + nRec
  const body = `<MDFeDadosMsg xmlns="http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcao">${xmlAss}</MDFeDadosMsg>`;
  const ret = await soapRequest(ep.mdfRecepcao, body, "http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcao/MDFeRecepcao", agent);
  let cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  let xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  const chave = ret.match(/<chMDFe>(\d{44})<\/chMDFe>/)?.[1] || xml.match(/Id="MDFe(\d{44})"/)?.[1];
  let protocolo = ret.match(/<protMDFe[^>]*>[\s\S]*?<nProt>(\d+)<\/nProt>/)?.[1] || ret.match(/<nProt>(\d+)<\/nProt>/)?.[1];
  let xmlRet = ret;
  const nRec = ret.match(/<nRec>(\d+)<\/nRec>/)?.[1] || "";
  // 2. Consulta recibo (RetRecepcao) até processar: 104 = lote processado, 105 = ainda processando
  if (cStat === "103" && nRec) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const consBody = `<MDFeRetRecepcaoMsg xmlns="http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRetRecepcao"><consReciMDFe versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdf"><tpAmb>${tpAmb}</tpAmb><nRec>${nRec}</nRec></consReciMDFe></MDFeRetRecepcaoMsg>`;
      let ret2 = "";
      try {
        ret2 = await soapRequest(ep.mdfRetRecepcao, consBody, "http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRetRecepcao/MDFeRetRecepcao", agent);
      } catch (e) { xMotivo = e instanceof Error ? e.message : String(e); break; }
      xmlRet = ret2;
      const cStatLote = ret2.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
      if (cStatLote === "105") continue;
      const prot = ret2.match(/<infProt>[\s\S]*?<\/infProt>/)?.[0] || "";
      cStat = prot.match(/<cStat>(\d+)<\/cStat>/)?.[1] || cStatLote;
      xMotivo = prot.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || ret2.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
      protocolo = prot.match(/<nProt>(\d+)<\/nProt>/)?.[1] || protocolo;
      break;
    }
  }
  return { sucesso: cStat === "100" || cStat === "104", cStat, xMotivo, chave, protocolo, xmlRet };
}

export async function consultarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente): Promise<{ cStat: string; xMotivo: string; xml?: string }> {
  const ep = getMdfEndpoints(ambiente);
  const body = `<MDFeConsultaMsg xmlns="http://www.portalfiscal.inf.br/mdf/wsdl/MDFeConsulta"><consSitMDFe xmlns="http://www.portalfiscal.inf.br/mdf" versao="3.00"><tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${chave}</chMDFe></consSitMDFe></MDFeConsultaMsg>`;
  const ret = await soapRequest(ep.mdfConsulta, body, "http://www.portalfiscal.inf.br/mdf/wsdl/MDFeConsulta/MDFeConsulta", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { cStat, xMotivo, xml: ret };
}

export async function encerrarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente, cnpj: string, uf: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const cOrgao = codigoUF(uf);
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdf" versao="3.00"><infEvento Id="ID110112${chave}1"><cOrgao>${cOrgao}</cOrgao><tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb><CNPJ>${cnpj.replace(/\D/g, "")}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110112</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="3.00"><evEncMDFe><descEvento>Encerramento</descEvento><nProt>0</nProt><dtEncerramento>${dhEvento.slice(0, 10)}</dtEncarramento><cMunEncerramento>${cOrgao}</cMunEncerramento><UFEncerramento>${uf}</UFEncerramento></evEncMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  const body = `<MDFeRecepcaoEventoMsg xmlns="http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcaoEvento">${ass}</MDFeRecepcaoEventoMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, "http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcaoEvento/MDFeRecepcaoEvento", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}

export async function cancelarMdf(pfx: Buffer, senha: string, chave: string, justificativa: string, ambiente: Ambiente, cnpj: string, uf: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const cOrgao = codigoUF(uf);
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdf" versao="3.00"><infEvento Id="ID110111${chave}1"><cOrgao>${cOrgao}</cOrgao><tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb><CNPJ>${cnpj.replace(/\D/g, "")}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="3.00"><evCancMDFe><descEvento>Cancelamento</descEvento><nProt>0</nProt><xJust>${justificativa}</xJust></evCancMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  const body = `<MDFeRecepcaoEventoMsg xmlns="http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcaoEvento">${ass}</MDFeRecepcaoEventoMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, "http://www.portalfiscal.inf.br/mdf/wsdl/MDFeRecepcaoEvento/MDFeRecepcaoEvento", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}
