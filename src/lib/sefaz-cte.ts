/**
 * CT-e 4.00 — Fase 2 (emissão real)
 * Reaproveita `sefaz.ts` para mTLS e assinatura (infCte).
 * Endpoints SVRS (MG/SP/RS/etc. usam SVRS para CT-e).
 * Ref: https://www.cte.fazenda.gov.br/portal/webServices.aspx
 */
import https from "node:https";
import zlib from "node:zlib";
import { createSefazAgent, signXml, buscarCertificadoAtivo } from "./sefaz";
export { buscarCertificadoAtivo };

export type Ambiente = "homologacao" | "producao";

export const CTE_ENDPOINTS = {
  homologacao: {
    // SVRS V4 — usado por AC, AL, AM, BA, CE, DF, ES, GO, MA, PA, PB, PI, RJ, RN, RO, SC, SE, TO
    recepcao: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    retRecepcao: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRetRecepcao/CTeRetRecepcao.asmx",
    consulta: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeConsultaV4/CTeConsultaV4.asmx",
    statusServico: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeStatusServicoV4/CTeStatusServicoV4.asmx",
    recepcaoEvento: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    // MG tem autorizador próprio — CT-e Simplificado usa CTeRecepcaoSimpV4
    mg_recepcao: "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSimpV4",
    mg_consulta: "https://hcte.fazenda.mg.gov.br/cte/services/CTeConsultaV4",
    mg_status: "https://hcte.fazenda.mg.gov.br/cte/services/CTeStatusServicoV4",
    mg_evento: "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEventoV4",
  },
  producao: {
    recepcao: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    retRecepcao: "https://cte.svrs.rs.gov.br/ws/CTeRetRecepcao/CTeRetRecepcao.asmx",
    consulta: "https://cte.svrs.rs.gov.br/ws/CTeConsultaV4/CTeConsultaV4.asmx",
    statusServico: "https://cte.svrs.rs.gov.br/ws/CTeStatusServicoV4/CTeStatusServicoV4.asmx",
    recepcaoEvento: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    mg_recepcao: "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSimpV4",
    mg_consulta: "https://cte.fazenda.mg.gov.br/cte/services/CTeConsultaV4",
    mg_status: "https://cte.fazenda.mg.gov.br/cte/services/CTeStatusServicoV4",
    mg_evento: "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEventoV4",
  },
} as const;

function getCteEndpoints(ambiente: Ambiente, uf?: string) {
  const base = ambiente === "producao" ? CTE_ENDPOINTS.producao : CTE_ENDPOINTS.homologacao;
  // MG usa autorizador próprio
  if (uf?.toUpperCase() === "MG") {
    return {
      recepcao: (base as any).mg_recepcao,
      retRecepcao: base.retRecepcao,
      consulta: (base as any).mg_consulta,
      statusServico: (base as any).mg_status,
      recepcaoEvento: (base as any).mg_evento,
    };
  }
  return base;
}

// IBGE UF
const UF_COD: Record<string,string> = { AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",SE:"28",SP:"35",TO:"17" };
function codigoUF(uf:string){ return UF_COD[uf?.toUpperCase()] || "31"; }

function calcDV(chave43:string):string{
  let soma=0, peso=2;
  for(let i=chave43.length-1;i>=0;i--){ soma += parseInt(chave43[i])*peso; peso = peso===9?2:peso+1; }
  const resto = soma%11; const dv = resto<2?0:11-resto; return String(dv);
}

export function gerarChaveCte(cUF:string, aamm:string, cnpj:string, mod:string, serie:string, nCT:string, tpEmis:string, cCT:string):string{
  const base = `${cUF}${aamm}${cnpj.padStart(14,"0")}${mod}${serie.padStart(3,"0")}${nCT.padStart(9,"0")}${tpEmis}${cCT.padStart(8,"0")}`;
  return base + calcDV(base);
}

export interface EmitenteCte { cnpj: string; ie: string; xNome: string; xFant?: string; uf: string; cMun: string; xMun: string; cep?: string; logradouro?: string; nro?: string; bairro?: string; crt?: string; }
export interface TomadorCte { toma: "0"|"1"|"2"|"3"|"4"; cnpj?: string; cpf?: string; ie?: string; xNome: string; uf: string; cMun: string; xMun: string; cep?: string; logradouro?: string; nro?: string; bairro?: string; fone?: string; email?: string; }
export interface CteInputCompleto {
  empresaId: string;
  ambiente: Ambiente;
  serie: string;
  numero: string; // nCT
  natOp?: string;
  cMunEnv: string; xMunEnv: string; ufEnv: string;
  cMunIni: string; xMunIni: string; ufIni: string;
  cMunFim: string; xMunFim: string; ufFim: string;
  emit: EmitenteCte;
  rem?: { cnpj?:string; cpf?:string; xNome:string; uf:string; cMun:string; xMun:string; ie?:string; cep?:string; logradouro?:string; nro?:string; bairro?:string };
  dest?: { cnpj?:string; cpf?:string; xNome:string; uf:string; cMun:string; xMun:string; ie?:string; cep?:string; logradouro?:string; nro?:string; bairro?:string };
  tomador: TomadorCte;
  vPrest: number; vCarga: number; pesoKg: number; cfop: string;
  obs?: string;
  infCTeNorm?: { proPred?: string; xOutCat?: string };
  modalRod?: { rntrc: string; ciot?: string; veiculos?: Array<{ placa: string; uf: string; rntrc?: string }> };
  chavesNFe?: string[];
  icms?: { CST: string; vBC: number; pICMS: number; vICMS: number };
  impostos?: { pisAliq?: number; cofinsAliq?: number; irAliq?: number; inssAliq?: number; csllAliq?: number };
}

export function buildCteXml(input: CteInputCompleto): { xml: string; chave: string } {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset(); // minutes; negative for UTC+ (e.g. UTC-3 → +180)
  const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
  const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
  // XSD TDateTimeUTC: TZD = +hh:mm or -hh:mm
  // getTimezoneOffset: positive = west of UTC (e.g. 180 = UTC-3 → "+03:00")
  const tzSign = tzOffset <= 0 ? "+" : "-";
  const dhEmi = now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0") + "T" +
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0") + ":" +
    String(now.getSeconds()).padStart(2, "0") +
    tzSign + tzH + ":" + tzM;
  const cUF = codigoUF(input.ufEnv || input.emit.uf);
  const aamm = dhEmi.slice(2,4) + dhEmi.slice(5,7);
  const cnpjLimpo = input.emit.cnpj.replace(/\D/g,"").padStart(14,"0");
  const serie = input.serie.padStart(3,"0");
  const nCT = input.numero.padStart(9,"0");
  const cCT = String(Math.floor(Math.random()*100000000)).padStart(8,"0");
  const chave = gerarChaveCte(cUF, aamm, cnpjLimpo, "57", serie, nCT, "1", cCT);
  const id = `CTe${chave}`;
  const natOp = input.natOp || "PRESTACAO DE SERVICO DE TRANSPORTE";
  const toma = input.tomador.toma;
  const crt = input.emit.crt || "3";
  const isHmg = input.ambiente === "homologacao";
  const HOMOLOG_XNOME = "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

  // indIEToma: 1=Contribuinte, 2=Isento, 9=Nao Contribuinte
  // G024: MG NÃO aceita indIEToma=2 (Isento) → usar 9
  const indIEToma = input.tomador.ie && input.tomador.ie !== "ISENTO" ? "1" : (input.ufEnv === "MG" ? "9" : "2");

  // CT-e Simplificado (CTeSimp): <toma> é filho direto de <infCte>, não <toma3>/<toma4> em <ide>
  const cnpjToma = (input.tomador.cnpj || "").replace(/\D/g,"").padStart(14,"0");
  const cepToma = (input.tomador.cep || "00000000").replace(/\D/g,"").padStart(8,"0");
  const indIEDest = indIEToma; // same logic

  // enderEmit
  const cepEmit = (input.emit.cep || "00000000").replace(/\D/g,"").padStart(8,"0");
  const enderEmit = `<enderEmit><xLgr>${(input.emit.logradouro || "RUA").length >= 2 ? (input.emit.logradouro || "RUA") : "RUA GERAL"}</xLgr><nro>${input.emit.nro || "SN"}</nro>${input.emit.complemento ? `<xCpl>${input.emit.complemento}</xCpl>` : ""}<xBairro>${(input.emit.bairro || "CENTRO").length >= 2 ? (input.emit.bairro || "CENTRO") : "CENTRO"}</xBairro><cMun>${input.emit.cMun}</cMun><xMun>${input.emit.xMun}</xMun><CEP>${cepEmit}</CEP><UF>${input.emit.uf}</UF></enderEmit>`;

  // ICMS
  const icms = input.icms || { CST: "00", vBC: input.vPrest, pICMS: 0, vICMS: 0 };
  const cst = (icms.CST || "00").padStart(2,"0");
  const vBC = Number(icms.vBC ?? input.vPrest).toFixed(2);
  const pICMS = Number(icms.pICMS ?? 0).toFixed(2);
  const vICMS = Number(icms.vICMS ?? 0).toFixed(2);
  let impXml: string;
  if (cst === "00") impXml = `<imp><ICMS><ICMS00><CST>00</CST><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS><vICMS>${vICMS}</vICMS></ICMS00></ICMS></imp>`;
  else if (cst === "20") impXml = `<imp><ICMS><ICMS20><CST>20</CST><pRedBC>0.00</pRedBC><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS><vICMS>${vICMS}</vICMS></ICMS20></ICMS></imp>`;
  else if (cst === "45") impXml = `<imp><ICMS><ICMS45><CST>45</CST></ICMS45></ICMS></imp>`;
  else if (cst === "60") impXml = `<imp><ICMS><ICMS60><CST>60</CST><vBCSTRet>0.00</vBCSTRet><vICMSSTRet>0.00</vICMSSTRet><pICMSSTRet>0.00</pICMSSTRet><vCred>0.00</vCred></ICMS60></ICMS></imp>`;
  else impXml = `<imp><ICMS><ICMS90><CST>${cst}</CST><pRedBC>0.00</pRedBC><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS><vICMS>${vICMS}</vICMS><vCred>0.00</vCred></ICMS90></ICMS></imp>`;

  // infNFe — schema exige <chNFe>, não <chave>
  const infNFeXml = (input.chavesNFe && input.chavesNFe.length > 0)
    ? input.chavesNFe.map((ch, i) => `<det nItem="${i+1}"><cMunIni>${input.cMunIni}</cMunIni><xMunIni>${input.xMunIni}</xMunIni><cMunFim>${input.cMunFim}</cMunFim><xMunFim>${input.xMunFim}</xMunFim><vPrest>${input.vPrest.toFixed(2)}</vPrest><vRec>${input.vPrest.toFixed(2)}</vRec><infNFe><chNFe>${ch.replace(/\D/g,"")}</chNFe></infNFe></det>`).join("")
    : `<det nItem="1"><cMunIni>${input.cMunIni}</cMunIni><xMunIni>${input.xMunIni}</xMunIni><cMunFim>${input.cMunFim}</cMunFim><xMunFim>${input.xMunFim}</xMunFim><vPrest>${input.vPrest.toFixed(2)}</vPrest><vRec>${input.vPrest.toFixed(2)}</vRec><infNFe><chNFe>00000000000000000000000000000000000000000000</chNFe></infNFe></det>`;

  // CTeSimp — root element <CTeSimp>, not <CTe>
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTeSimp xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <infCte Id="${id}" versao="4.00">
    <ide>
      <cUF>${cUF}</cUF><cCT>${cCT}</cCT><CFOP>${input.cfop}</CFOP><natOp>${natOp}</natOp><mod>57</mod><serie>${serie}</serie><nCT>${nCT}</nCT><dhEmi>${dhEmi}</dhEmi>
      <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${input.ambiente==="producao"?"1":"2"}</tpAmb><tpCTe>5</tpCTe><procEmi>0</procEmi><verProc>NORVO_1.0</verProc>
      <cMunEnv>${input.cMunEnv}</cMunEnv><xMunEnv>${input.xMunEnv}</xMunEnv><UFEnv>${input.ufEnv}</UFEnv>
      <modal>01</modal><tpServ>0</tpServ>
      <UFIni>${input.ufIni}</UFIni><UFFim>${input.ufFim}</UFFim>
      <retira>1</retira>
    </ide>
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>${input.emit.ie && /^\d{2,14}$/.test(input.emit.ie) ? `<IE>${input.emit.ie}</IE>` : ""}<xNome>${input.emit.xNome}</xNome>${input.emit.xFant && input.emit.xFant.length >= 2 ? `<xFant>${input.emit.xFant}</xFant>` : ""}${enderEmit}<CRT>${crt}</CRT>
    </emit>
    <toma>
      <toma>${toma}</toma><indIEToma>${indIEToma}</indIEToma><CNPJ>${cnpjToma}</CNPJ>${indIEToma !== "9" && input.tomador.ie && input.tomador.ie !== "ISENTO" ? `<IE>${input.tomador.ie}</IE>` : ""}<xNome>${input.tomador.xNome}</xNome>
      <enderToma><xLgr>${(input.tomador.logradouro || "RUA").length >= 2 ? (input.tomador.logradouro || "RUA") : "RUA GERAL"}</xLgr><nro>${input.tomador.nro || "SN"}</nro><xBairro>${(input.tomador.bairro || "CENTRO").length >= 2 ? (input.tomador.bairro || "CENTRO") : "CENTRO"}</xBairro><cMun>${input.tomador.cMun}</cMun><xMun>${input.tomador.xMun}</xMun><CEP>${cepToma}</CEP><UF>${input.tomador.uf}</UF></enderToma>
      ${input.tomador.fone ? `<fone>${input.tomador.fone}</fone>` : ""}
      ${input.tomador.email ? `<email>${input.tomador.email}</email>` : ""}
    </toma>
    <infCarga>
      <vCarga>${input.vCarga.toFixed(2)}</vCarga><proPred>${input.infCTeNorm?.proPred || "CARGA GERAL"}</proPred>
      <infQ><cUnid>01</cUnid><tpMed>00</tpMed><qCarga>${input.pesoKg.toFixed(4)}</qCarga></infQ>
    </infCarga>
    ${infNFeXml}
    <infModal versaoModal="4.00"><rodo><RNTRC>${(input.modalRod?.rntrc||"").replace(/\D/g,"")}</RNTRC></rodo></infModal>
    ${impXml}
    <total><vTPrest>${input.vPrest.toFixed(2)}</vTPrest><vTRec>${input.vPrest.toFixed(2)}</vTRec></total>
  </infCte>
  <infCTeSupl><qrCodCTe>HTTPS://dfeportal.svrs.rs.gov.br/cteQrCode?qrcode=${chave}&amp;tpAmb=${input.ambiente==="producao"?"1":"2"}</qrCodCTe></infCTeSupl>
</CTeSimp>`;
  return { xml, chave };
}

async function soapRequest(url:string, body:string, action:string, agent?:https.Agent): Promise<string>{
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;
  const contentType = `application/soap+xml; charset=utf-8; action="${action}"`;
  if(agent){
    const u=new URL(url);
    return new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port: u.port||443, path:u.pathname, method:"POST", agent, headers:{"Content-Type":contentType,"Content-Length":Buffer.byteLength(envelope)}},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=> res.statusCode && res.statusCode>=400 ? reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)) : resolve(d));});
      req.on("error",reject); req.write(envelope); req.end();
    });
  }
  const r=await fetch(url,{method:"POST", headers:{"Content-Type":contentType}, body:envelope});
  if(!r.ok) throw new Error(`CTe HTTP ${r.status}: ${await r.text()}`);
  return r.text();
}

export async function emitirCte(pfx:Buffer, senha:string, xml:string, ambiente:Ambiente, uf?: string): Promise<{ sucesso:boolean; cStat:string; xMotivo:string; chave?:string; protocolo?:string; xmlRet?:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const xmlAss = signXml(xml, pfx, senha);
  // V4 Sinc — MOC exige GZip + Base64 no cteDadosMsg
  const compressed = zlib.gzipSync(Buffer.from(xmlAss, "utf-8"));
  const dadosBase64 = compressed.toString("base64");
  const isMG = uf?.toUpperCase() === "MG";
  if (isMG) {
    // MG CT-e Simplificado: namespace CTeRecepcaoSimpV4
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSimpV4";
    const body=`<cteDadosMsg xmlns="${ns}">${dadosBase64}</cteDadosMsg>`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
    const u=new URL(ep.recepcao);
    const agent = createSefazAgent(pfx,senha);
    const ret = await new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port:443, path:u.pathname, method:"POST", agent, headers:{
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `${ns}/cteRecepcao`,
        "Content-Length": Buffer.byteLength(envelope)
      }},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>res.statusCode&&res.statusCode>=400?reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)):resolve(d));});
      req.on("error",reject); req.write(envelope); req.end();
    });
    const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||""; const ch=ret.match(/<chCTe>(\d{44})<\/chCTe>/)?.[1]||xml.match(/Id="CTe(\d{44})"/)?.[1]; const prot=ret.match(/<nProt>(\d+)<\/nProt>/)?.[1]||ret.match(/<protCTe[^>]*>[\s\S]*?<nProt>(\d+)<\/nProt>/)?.[1];
    return { sucesso: cStat==="100"||cStat==="104"||cStat==="103", cStat, xMotivo, chave: ch, protocolo: prot, xmlRet: ret };
  }
  // SVRS usa namespace v4 (CTeRecepcaoSincV4)
  const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4";
  const body=`<cteDadosMsg xmlns="${ns}">${dadosBase64}</cteDadosMsg>`;
  const ret=await soapRequest(ep.recepcao, body, `${ns}/cteRecepcao`, createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||""; const ch=ret.match(/<chCTe>(\d{44})<\/chCTe>/)?.[1]||xml.match(/Id="CTe(\d{44})"/)?.[1]; const prot=ret.match(/<nProt>(\d+)<\/nProt>/)?.[1]||ret.match(/<protCTe[^>]*>[\s\S]*?<nProt>(\d+)<\/nProt>/)?.[1];
  return { sucesso: cStat==="100"||cStat==="104"||cStat==="103", cStat, xMotivo, chave: ch, protocolo: prot, xmlRet: ret };
}

export async function consultarCte(pfx:Buffer, senha:string, chave:string, ambiente:Ambiente, uf?: string): Promise<{ cStat:string; xMotivo:string; xml?:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const consSit=`<consSitCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><xServ>CONSULTAR</xServ><chCTe>${chave}</chCTe></consSitCTe>`;
  const compressed = zlib.gzipSync(Buffer.from(consSit, "utf-8"));
  const dadosBase64 = compressed.toString("base64");
  const isMG = uf?.toUpperCase() === "MG";
  if (isMG) {
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4";
    const body=`<cteDadosMsg xmlns="${ns}">${dadosBase64}</cteDadosMsg>`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
    const u=new URL(ep.consulta);
    const agent = createSefazAgent(pfx,senha);
    const ret = await new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port:443, path:u.pathname, method:"POST", agent, headers:{
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `${ns}/cteConsultaCT`,
        "Content-Length": Buffer.byteLength(envelope)
      }},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>res.statusCode&&res.statusCode>=400?reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)):resolve(d));});
      req.on("error",reject); req.write(envelope); req.end();
    });
    const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
    return { cStat, xMotivo, xml: ret };
  }
  const body=`<CTeConsultaV4 xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4">${dadosBase64}</cteDadosMsg></CTeConsultaV4>`;
  const ret=await soapRequest(ep.consulta, body, "http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4/cteConsultaCT", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
  return { cStat, xMotivo, xml: ret };
}

export async function cancelarCte(pfx:Buffer, senha:string, chave:string, justificativa:string, ambiente:Ambiente, cnpj:string, uf?: string):Promise<{ sucesso:boolean; cStat:string; xMotivo:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const dhEvento=new Date().toISOString().replace(/\.\d{3}Z$/,"");
  const nSeq="1";
  const tpEvento="110111";
  const cOrgao = codigoUF(uf || "SP");
  const evento=`<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><infEvento Id="ID${tpEvento}${chave}${nSeq}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><CNPJ>${cnpj.replace(/\D/g,"")}</CNPJ><chCTe>${chave}</chCTe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeq}</nSeqEvento><detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>0</nProt><xJust>${justificativa}</xJust></evCancCTe></detEvento></infEvento></eventoCTe>`;
  const ass=signXml(evento, pfx, senha);
  const isMG = uf?.toUpperCase() === "MG";
  if (isMG) {
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4";
    const body=`<cteDadosMsg xmlns="${ns}">${ass}</cteDadosMsg>`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
    const u=new URL(ep.recepcaoEvento);
    const agent = createSefazAgent(pfx,senha);
    const ret = await new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port:443, path:u.pathname, method:"POST", agent, headers:{
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `${ns}/cteRecepcaoEvento`,
        "Content-Length": Buffer.byteLength(envelope)
      }},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>res.statusCode&&res.statusCode>=400?reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)):resolve(d));});
      req.on("error",reject); req.write(envelope); req.end();
    });
    const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
    return { sucesso:cStat==="135"||cStat==="155", cStat, xMotivo };
  }
  const body=`<CTeRecepcaoEventoV4 xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4">${ass}</cteDadosMsg></CTeRecepcaoEventoV4>`;
  const ret=await soapRequest(ep.recepcaoEvento, body, "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4/cteRecepcaoEvento", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
  return { sucesso:cStat==="135"||cStat==="155", cStat, xMotivo };
}
