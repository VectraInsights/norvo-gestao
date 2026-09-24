/**
 * MDF-e (Manifesto EletrÃ´nico de Documentos Fiscais) â€” modelo 58
 * Fase 2: XML completo 3.00, assinatura, emissÃ£o/consulta/encerramento/cancelamento via SVRS.
 * Endpoints: https://www.confaz.fazenda.gov.br/web Services
 * Ref: https://mdfe.fazenda.gov.br/portal/webServices.aspx
 */
import https from "node:https";
import zlib from "node:zlib";
import { createSefazAgent, signMdfXml, signXml, buscarCertificadoAtivo, XML_INCLUSIVE_C14N } from "./sefaz";
import {
  MDFE_AMBIENTE,
  MDFE_SVRS_HOMOLOGACAO_HOST,
  MDFE_TP_AMB,
  assertMdfAmbiente,
  assertMdfXmlAmbiente,
} from "./sefaz-ambiente";
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
    mdfRecepcaoSinc: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
  },
  producao: {
    mdfRecepcao: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcao/MDFeRecepcao.asmx",
    mdfRetRecepcao: "https://mdfe.svrs.rs.gov.br/ws/MDFeRetRecepcao/MDFeRetRecepcao.asmx",
    mdfStatusServico: "https://mdfe.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
    mdfConsulta: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
    mdfRecepcaoEvento: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
    mdfDistribuicaoDFe: "https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
    mdfConsNaoEnc: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsNaoEnc/MDFeConsNaoEnc.asmx",
    mdfRecepcaoSinc: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
  },
} as const;

function getMdfEndpoints(ambiente: Ambiente) {
  assertMdfAmbiente(ambiente);
  return MDF_ENDPOINTS[MDFE_AMBIENTE];
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
  veicTrac: { placa: string; uf: string; rntrc: string; tara: number; capKG?: number; capM3?: number; tpRod?: string; tpCarroceria?: string; ciot?: string; renavam?: string };
  reboques?: Array<{ placa: string; uf: string; tara: number; renavam?: string; capKG?: number; capM3?: number; tpCarroceria?: string }>;
  condutor: { cpf: string; xNome: string };
  ctes: Array<{ chave: string; valor: number; pesoKG: number; cMunDescarga?: string; xMunDescarga?: string }>;
  infMunCarrega: Array<{ cMunCarrega: string; xMunCarrega: string }>;
  infMunDescarrega?: Array<{ cMunDescarga: string; xMunDescarga: string }>;
  infPercurso?: Array<{ ufFim: string }>;
  valorTotalCarga: number;
  pesoTotalKG: number;
  qtdTotalNF?: number;
  lacres?: Array<{ nLacre: string }>;
  obs?: string;
  tipo?: "normal" | "transbordo";
  tpEmit?: string;
  mdfesTransbordo?: Array<{ chave: string }>;
}

export function buildMdfXml(input: MdfInputCompleto): { xml: string; chave: string } {
  assertMdfAmbiente(input.ambiente);
  // TDateTimeUTC: AAAA-MM-DDTHH:MM:SS-03:00 (sem millis, sem Z; servidor roda em UTC)
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const dhFmt = `${agora.getUTCFullYear()}-${p2(agora.getUTCMonth() + 1)}-${p2(agora.getUTCDate())}T${p2(agora.getUTCHours())}:${p2(agora.getUTCMinutes())}:${p2(agora.getUTCSeconds())}-03:00`;
  const cUF = codigoUF(input.ufCarregamento);
  const aamm = dhFmt.slice(2, 4) + dhFmt.slice(5, 7);
  const cnpjLimpo = input.emit.cnpj.replace(/\D/g, "").padStart(14, "0");
  const serieTag = String(input.serie).replace(/^0+/, "") || "0";
  const numeroTag = String(parseInt(input.numero, 10) || 0);
  const nMDF = input.numero.padStart(9, "0");
  const cMDF = String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
  const chave = gerarChaveMdf(cUF, aamm, cnpjLimpo, input.serie, input.numero, cMDF);
  const id = `MDFe${chave}`;
  const cDV = chave.slice(-1);
  const tpEmit = input.tpEmit || "1";

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

  // infPercurso (UFPer) â€” opcional (0-25); sÃ³ UFs adicionadas pelo usuÃ¡rio, sem fallback
  const infPercursoXml = (input.infPercurso || [])
    .map(p => String(p.ufFim || "").trim().toUpperCase())
    .filter(uf => /^[A-Z]{2}$/.test(uf))
    .map(uf => `<infPercurso><UFPer>${uf}</UFPer></infPercurso>`).join("");

  // VeÃ­culos
  const ciotNum = String(input.veicTrac.ciot || "").replace(/\D/g, "");
  const infCiotXml = ciotNum ? `<infCIOT><CIOT>${ciotNum}</CIOT><CNPJ>${cnpjLimpo}</CNPJ></infCIOT>` : "";
  // Condutor (ordem XSD: xNome, CPF)
  const condutorXml = `<condutor><xNome>${input.condutor.xNome}</xNome><CPF>${input.condutor.cpf.replace(/\D/g, "")}</CPF></condutor>`;
  const veicTracXml = `<veicTracao><placa>${input.veicTrac.placa}</placa>${input.veicTrac.renavam ? `<RENAVAM>${input.veicTrac.renavam}</RENAVAM>` : ""}<tara>${input.veicTrac.tara}</tara>${input.veicTrac.capKG ? `<capKG>${input.veicTrac.capKG}</capKG>` : ""}${input.veicTrac.capM3 ? `<capM3>${input.veicTrac.capM3}</capM3>` : ""}${condutorXml}<tpRod>${input.veicTrac.tpRod || "06"}</tpRod><tpCar>${input.veicTrac.tpCarroceria || "00"}</tpCar><UF>${input.veicTrac.uf}</UF></veicTracao>`;
  const reboquesXml = (input.reboques || []).map(r =>
    `<veicReboque><placa>${r.placa}</placa>${r.renavam ? `<RENAVAM>${r.renavam}</RENAVAM>` : ""}<tara>${r.tara}</tara><capKG>${r.capKG ?? 0}</capKG>${r.capM3 ? `<capM3>${r.capM3}</capM3>` : ""}<tpCar>${r.tpCarroceria || "00"}</tpCar><UF>${r.uf}</UF></veicReboque>`
  ).join("");

  // InfDoc (CT-e vinculados ou MDF-e de transbordo)
  const isTransbordo = input.tipo === "transbordo" && !!input.mdfesTransbordo?.length;
  const infDocXml = isTransbordo
    ? (input.mdfesTransbordo || []).map(mdf => {
        const cMunDesc = mdf.chave.slice(0, 7);
        return `<infMunDescarga><cMunDescarga>${cMunDesc}</cMunDescarga><xMunDescarga></xMunDescarga><infMDFeTransp><chMDFe>${mdf.chave}</chMDFe></infMDFeTransp></infMunDescarga>`;
      }).join("")
    : (() => {
        const grupos = new Map<string, { cMun: string; xMun: string; chaves: string[] }>();
        for (const cte of input.ctes) {
          const cMun = (cte.cMunDescarga || "").replace(/\D/g, "") || cte.chave.slice(0, 7);
          const xMun = cte.xMunDescarga || "";
          const k = `${cMun}|${xMun}`;
          if (!grupos.has(k)) grupos.set(k, { cMun, xMun, chaves: [] });
          grupos.get(k)!.chaves.push(cte.chave);
        }
        return [...grupos.values()].map(g =>
          `<infMunDescarga><cMunDescarga>${g.cMun}</cMunDescarga><xMunDescarga>${g.xMun}</xMunDescarga>${g.chaves.map(ch => `<infCTe><chCTe>${ch}</chCTe></infCTe>`).join("")}</infMunDescarga>`
        ).join("");
      })();

  // Lacres
  const lacresXml = (input.lacres || []).map(l => `<nLacre>${l.nLacre}</nLacre>`).join("");

  const raw = `<?xml version="1.0" encoding="UTF-8"?>
<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">
  <infMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" Id="${id}" versao="3.00">
    <ide>
      <cUF>${cUF}</cUF>
      <tpAmb>${MDFE_TP_AMB}</tpAmb>
      <tpEmit>${tpEmit}</tpEmit>
      <mod>58</mod>
      <serie>${serieTag}</serie>
      <nMDF>${numeroTag}</nMDF>
      <cMDF>${cMDF}</cMDF>
      <cDV>${cDV}</cDV>
      <modal>1</modal>
      <dhEmi>${dhFmt}</dhEmi>
      <tpEmis>1</tpEmis>
      <procEmi>0</procEmi>
      <verProc>Norvo 1.0</verProc>
      <UFIni>${input.ufCarregamento}</UFIni>
      <UFFim>${input.ufDescarregamento}</UFFim>
      ${infMunCarregaXml}
      ${infPercursoXml}
      <dhIniViagem>${dhFmt}</dhIniViagem>
    </ide>
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>
      ${/^\d{2,14}$/.test(input.emit.ie || "") ? `<IE>${input.emit.ie}</IE>` : ""}
      <xNome>${input.emit.xNome}</xNome>
      <enderEmit>
        <xLgr>RUA</xLgr>
        <nro>SN</nro>
        <xBairro>CENTRO</xBairro>
        <cMun>${input.emit.cMun}</cMun>
        <xMun>${input.emit.xMun}</xMun>
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
      </rodo>
    </infModal>
    <infDoc>${infDocXml}</infDoc>
    <tot>
      ${input.ctes.length > 0 ? `<qCTe>${input.ctes.length}</qCTe>` : isTransbordo ? `<qMDFe>${input.mdfesTransbordo?.length || 0}</qMDFe>` : ""}
      <vCarga>${input.valorTotalCarga.toFixed(2)}</vCarga>
      <cUnid>01</cUnid>
      <qCarga>${input.pesoTotalKG.toFixed(4)}</qCarga>
    </tot>
    ${lacresXml ? `<lacres>${lacresXml}</lacres>` : ""}
  </infMDFe>
</MDFe>`;
  // D03/cStat 599: sem caracteres de edição (LF/CR/TAB/espaço) entre tags — antes de assinar
  // + trim dentro dos textos (bordas de valores vindos do cadastro/CT-e)
  const xml = raw.replace(/>\s+</g, "><").replace(/>([^<>]*)</g, (_m, t: string) => `>${t.trim()}<`).trim();
  return { xml, chave };
}

function decodeMdfXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractMdfResponseTags(responseBody: string, tag: "cStat" | "xMotivo"): string[] {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, "gi");
  return [...responseBody.matchAll(pattern)]
    .map((match) => decodeMdfXmlText(match[1] || ""))
    .filter(Boolean);
}

function logMdfResponse(responseBody: string): void {
  const cStat = extractMdfResponseTags(responseBody, "cStat");
  const xMotivo = extractMdfResponseTags(responseBody, "xMotivo");
  console.log(`[mdf-debug] ResponseBody=${responseBody || "(vazio)"}`);
  console.log(`[mdf-debug] resposta SEFAZ cStat=${cStat.join(",") || "(ausente)"} xMotivo=${xMotivo.join(" | ") || "(ausente)"}`);
}

async function soapRequest(url: string, body: string, action: string, agent?: https.Agent, headerXml?: string): Promise<string> {
  const u = new URL(url);
  if (u.hostname !== MDFE_SVRS_HOMOLOGACAO_HOST) {
    throw new Error(`MDF-e bloqueado: endpoint ${u.hostname} não é ${MDFE_SVRS_HOMOLOGACAO_HOST}`);
  }
  const tpAmb = body.match(/<tpAmb>\s*(\d+)\s*<\/tpAmb>/)?.[1] || MDFE_TP_AMB;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header>${headerXml || ""}</soap12:Header><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;
  const envelopeBytes = Buffer.from(envelope, "utf8");
  const contentType = `application/soap+xml; charset=utf-8; action="${action}"`;
  if (agent) {
    return new Promise<string>((resolve, reject) => {
      const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname, method: "POST", agent, headers: { "Content-Type": contentType, "Content-Length": envelopeBytes.length } }, res => {
        let d = ""; res.on("data", c => d += c);
        res.on("end", () => {
          console.log(`[mdf-debug] ambiente=${MDFE_AMBIENTE} tpAmb=${tpAmb} POST ${u.hostname}${u.pathname} action=${action} status=${res.statusCode} reqBytes=${envelopeBytes.length} respBytes=${d.length} respHeaders=${JSON.stringify(res.headers)}`);
          logMdfResponse(d);
          res.statusCode && res.statusCode >= 400 ? reject(new Error(`MDF-e HTTP ${res.statusCode}: ${d.slice(0, 2000)}`)) : resolve(d);
        });
      });
      req.on("error", reject); req.write(envelopeBytes); req.end();
    });
  }
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": contentType }, body: envelopeBytes });
  const responseText = await r.text();
  console.log(`[mdf-debug] ambiente=${MDFE_AMBIENTE} tpAmb=${tpAmb} POST ${u.hostname}${u.pathname} action=${action} status=${r.status} reqBytes=${envelopeBytes.length} respBytes=${responseText.length} respHeaders=${JSON.stringify(Object.fromEntries(r.headers))}`);
  logMdfResponse(responseText);
  if (!r.ok) throw new Error(`MDF-e HTTP ${r.status}: ${responseText.slice(0, 2000)}`);
  return responseText;
}

export async function emitirMdf(pfx: Buffer, senha: string, xml: string, ambiente: Ambiente): Promise<{ sucesso: boolean; cStat: string; xMotivo: string; chave?: string; protocolo?: string; xmlRet?: string }> {
  assertMdfAmbiente(ambiente);
  assertMdfXmlAmbiente(xml);
  const BUILD = "006-inclusive-c14n-utf8-immutable";
  const ep = getMdfEndpoints(ambiente);
  const agent = createSefazAgent(pfx, senha);
  const nsSinc = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc";
  const cUF = xml.match(/Id="MDFe(\d{2})/)?.[1] || "31";
  const cabec = `<mdfeCabecMsg xmlns="${nsSinc}"><cUF>${cUF}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg>`;
  // A declaração XML é removida ANTES da assinatura. Depois disso, xmlAss
  // é transportado sem qualquer replace/trim; os mesmos bytes UTF-8 vão para o gzip.
  const xmlForSignature = xml.replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, "");
  const xmlAss = signMdfXml(xmlForSignature, pfx, senha);
  const referenceUri = xmlAss.match(/<Reference URI="([^"]+)"/)?.[1] || "";
  const signedXmlBytes = Buffer.byteLength(xmlAss, "utf8");
  // D03/599: diagnóstico somente leitura; não altera o XML assinado.
  const wsAbre = [...xmlAss.matchAll(/<([^<>\s/][^<>]{0,40})>\s+</g)].map(m => m[1]);
  const wsFecha = [...xmlAss.matchAll(/>\s+<\/([^<>]+)>/g)].map(m => "/" + m[1]);
  console.log(`[mdf-debug] BUILD=${BUILD} ambiente=${MDFE_AMBIENTE} tpAmb=${MDFE_TP_AMB} reference=${referenceUri} c14n=${XML_INCLUSIVE_C14N} signedXmlUtf8Bytes=${signedXmlBytes} WS-check após-abertura=[${wsAbre.slice(0, 12).join(",")}] antes-fecho=[${wsFecha.slice(0, 12).join(",")}]`);
  // Sincrono (ACBr): mdfeDadosMsg = base64(gzip(<MDFe>...</MDFe>)) puro, sem enviMDFe/idLote.
  // xmlAss é a string exata devolvida pelo assinador; não a reescreva aqui.
  const signedMdfXml = xmlAss;
  const mdfeXmlBytes = Buffer.from(signedMdfXml, "utf8");
  const compactada = zlib.gzipSync(mdfeXmlBytes);
  const compactadaB64 = compactada.toString("base64");
  console.log(`[mdf-debug] transporte XML preservado: xmlBytes=${mdfeXmlBytes.length} gzipBytes=${compactada.length} base64Bytes=${compactadaB64.length}`);
  const body = `<mdfeDadosMsg xmlns="${nsSinc}">${compactadaB64}</mdfeDadosMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoSinc, body, `${nsSinc}/mdfeRecepcao`, agent, cabec);
  const prot = ret.match(/<infProt>[\s\S]*?<\/infProt>/)?.[0] || "";
  const cStatProt = prot.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivoProt = prot.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  const cStat = cStatProt || ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = xMotivoProt || ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  const chave = ret.match(/<chMDFe>(\d{44})<\/chMDFe>/)?.[1] || xml.match(/Id="MDFe(\d{44})"/)?.[1];
  const protocolo = prot.match(/<nProt>(\d+)<\/nProt>/)?.[1];
  return { sucesso: cStat === "100", cStat, xMotivo, chave, protocolo, xmlRet: ret };
}

export async function consultarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente): Promise<{ cStat: string; xMotivo: string; xml?: string }> {
  const ep = getMdfEndpoints(ambiente);
  const body = `<MDFeConsultaMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta"><consSitMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><tpAmb>${MDFE_TP_AMB}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${chave}</chMDFe></consSitMDFe></MDFeConsultaMsg>`;
  const ret = await soapRequest(ep.mdfConsulta, body, "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta/MDFeConsulta", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { cStat, xMotivo, xml: ret };
}

export async function encerrarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente, cnpj: string, uf: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const cOrgao = codigoUF(uf);
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><infEvento Id="ID110112${chave}1"><cOrgao>${cOrgao}</cOrgao><tpAmb>${MDFE_TP_AMB}</tpAmb><CNPJ>${cnpj.replace(/\D/g, "")}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110112</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="3.00"><evEncMDFe><descEvento>Encerramento</descEvento><nProt>0</nProt><dtEncerramento>${dhEvento.slice(0, 10)}</dtEncarramento><cMunEncerramento>${cOrgao}</cMunEncerramento><UFEncerramento>${uf}</UFEncerramento></evEncMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  const body = `<MDFeRecepcaoEventoMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento">${ass}</MDFeRecepcaoEventoMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/MDFeRecepcaoEvento", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}

export async function cancelarMdf(pfx: Buffer, senha: string, chave: string, justificativa: string, ambiente: Ambiente, cnpj: string, uf: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const cOrgao = codigoUF(uf);
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><infEvento Id="ID110111${chave}1"><cOrgao>${cOrgao}</cOrgao><tpAmb>${MDFE_TP_AMB}</tpAmb><CNPJ>${cnpj.replace(/\D/g, "")}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="3.00"><evCancMDFe><descEvento>Cancelamento</descEvento><nProt>0</nProt><xJust>${justificativa}</xJust></evCancMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  const body = `<MDFeRecepcaoEventoMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento">${ass}</MDFeRecepcaoEventoMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento/MDFeRecepcaoEvento", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}
