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

// SEFAZ-MG exige em homologação (erro 938) que a razão social do tomador seja
// literalmente este texto. Manter sincronizado com o preview em fiscal.cte.tsx.
export const HOMOLOG_TOMADOR_NOME = "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

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
  tpServ?: string;
  obs?: string;
  infCTeNorm?: { proPred?: string; xOutCat?: string };
  modalRod?: { rntrc: string; ciot?: string; veiculos?: Array<{ placa: string; uf: string; renavam?: string; rntrc?: string }> };
  chavesNFe?: string[];
  icms?: { CST: string; vBC: number; pICMS: number; vICMS: number };
  impostos?: { pisAliq?: number; cofinsAliq?: number; irAliq?: number; inssAliq?: number; csllAliq?: number };
}

export function buildCteXml(input: CteInputCompleto): { xml: string; chave: string } {
  const rntrcRaw = String(input.modalRod?.rntrc || (input as any).rntrc || "ISENTO").toUpperCase();
  let rntrcXml = rntrcRaw === "ISENTO" ? "ISENTO" : rntrcRaw.replace(/\D/g, "");
  while (rntrcXml.length > 8 && rntrcXml.startsWith("0")) rntrcXml = rntrcXml.slice(1);
  if (!/^(ISENTO|\d{8})$/.test(rntrcXml)) throw new Error(`RNTRC invalido para a SEFAZ (8 digitos ou ISENTO): ${input.modalRod?.rntrc || (input as any).rntrc || ""}`);
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
  const serie = String(parseInt(input.serie || "1", 10)); // TSerie: 0|[1-9]{1}[0-9]{0,2} - sem zeros à esquerda
  const seriePadded = serie.padStart(3,"0"); // chave exige 3 dígitos com zeros
  const nCT = String(parseInt(input.numero || "1", 10)); // TNF: [1-9]{1}[0-9]{0,8} - sem zeros à esquerda
  const nCTPadded = nCT.padStart(9,"0"); // chave exige 9 dígitos com zeros
  const cCT = String(Math.floor(Math.random()*100000000)).padStart(8,"0");
  const chave = gerarChaveCte(cUF, aamm, cnpjLimpo, "57", seriePadded, nCTPadded, "1", cCT);
  const id = `CTe${chave}`;
  const natOp = input.natOp || "PRESTACAO DE SERVICO DE TRANSPORTE";
  const toma = input.tomador.toma;
  const crt = input.emit.crt || "3";
  const xNomeToma = input.ambiente === "homologacao" ? HOMOLOG_TOMADOR_NOME : input.tomador.xNome;

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
  else if (cst === "40" || cst === "41" || cst === "45" || cst === "51") impXml = `<imp><ICMS><ICMS45><CST>${cst}</CST></ICMS45></ICMS></imp>`;
  else if (cst === "60") impXml = `<imp><ICMS><ICMS60><CST>60</CST><vBCSTRet>0.00</vBCSTRet><vICMSSTRet>0.00</vICMSSTRet><pICMSSTRet>0.00</pICMSSTRet><vCred>0.00</vCred></ICMS60></ICMS></imp>`;
  else if (cst === "90") impXml = `<imp><ICMS><ICMS90><CST>90</CST><pRedBC>0.00</pRedBC><vBC>${vBC}</vBC><pICMS>${pICMS}</pICMS><vICMS>${vICMS}</vICMS><vCred>0.00</vCred></ICMS90></ICMS></imp>`;
  else throw new Error("CST " + cst + " nao existe no CT-e (valido: 00, 20, 40, 41, 45, 51, 60, 90)");

  // IBS/CBS (reforma tributária, obrigatório desde 2026 — erro 310 se ausente).
  // Alíquotas de teste 2026 (LC 214): IBS 0,10% / CBS 0,90%, calculadas sobre a vBC.
  const vBCNum = Number(vBC);
  const vIBSUF = Math.round(vBCNum * 0.001 * 100) / 100;
  const vCBS = Math.round(vBCNum * 0.009 * 100) / 100;
  const ibsXml = `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>${vBC}</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>${vIBSUF.toFixed(2)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>${vIBSUF.toFixed(2)}</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>${vCBS.toFixed(2)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
  // NT 2026.002 (XSD oficial): no CTeSimp o <imp> termina no IBSCBS; o vTotDFe é
  // filho do <total> (vTPrest+vTRec+vTotDFe). Em 2026, vTotDFe = vTPrest.
  const vTotDFe = input.vPrest.toFixed(2);
  impXml = impXml.replace(/<\/imp>$/, `${ibsXml}</imp>`);

  // infNFe — schema exige <chNFe>, não <chave>
  const infNFeXml = (input.chavesNFe && input.chavesNFe.length > 0)
    ? input.chavesNFe.map((ch, i) => `<det nItem="${i+1}"><cMunIni>${input.cMunIni}</cMunIni><xMunIni>${input.xMunIni}</xMunIni><cMunFim>${input.cMunFim}</cMunFim><xMunFim>${input.xMunFim}</xMunFim><vPrest>${input.vPrest.toFixed(2)}</vPrest><vRec>${input.vPrest.toFixed(2)}</vRec><infNFe><chNFe>${ch.replace(/\D/g,"")}</chNFe></infNFe></det>`).join("")
    : `<det nItem="1"><cMunIni>${input.cMunIni}</cMunIni><xMunIni>${input.xMunIni}</xMunIni><cMunFim>${input.cMunFim}</cMunFim><xMunFim>${input.xMunFim}</xMunFim><vPrest>${input.vPrest.toFixed(2)}</vPrest><vRec>${input.vPrest.toFixed(2)}</vRec><infNFe><chNFe>00000000000000000000000000000000000000000000</chNFe></infNFe></det>`;

  // CTeSimp — root element <CTeSimp>, not <CTe>
  // versao goes ONLY on <infCte>, NOT on <CTeSimp> per XSD
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTeSimp xmlns="http://www.portalfiscal.inf.br/cte">
  <infCte Id="${id}" versao="4.00">
    <ide>
      <cUF>${cUF}</cUF><cCT>${cCT}</cCT><CFOP>${input.cfop}</CFOP><natOp>${natOp}</natOp><mod>57</mod><serie>${serie}</serie><nCT>${nCT}</nCT><dhEmi>${dhEmi}</dhEmi>
      <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${input.ambiente==="producao"?"1":"2"}</tpAmb><tpCTe>5</tpCTe><procEmi>0</procEmi><verProc>NORVO_1.0</verProc>
      <cMunEnv>${input.cMunEnv}</cMunEnv><xMunEnv>${input.xMunEnv}</xMunEnv><UFEnv>${input.ufEnv}</UFEnv>
      <modal>01</modal><tpServ>${input.tpServ || "0"}</tpServ>
      <UFIni>${input.ufIni}</UFIni><UFFim>${input.ufFim}</UFFim>
      <retira>1</retira>
    </ide>
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>${input.emit.ie && /^\d{2,14}$/.test(input.emit.ie) ? `<IE>${input.emit.ie}</IE>` : ""}<xNome>${input.emit.xNome}</xNome>${input.emit.xFant && input.emit.xFant.length >= 2 ? `<xFant>${input.emit.xFant}</xFant>` : ""}${enderEmit}<CRT>${crt}</CRT>
    </emit>
    <toma>
      <toma>${toma}</toma><indIEToma>${indIEToma}</indIEToma><CNPJ>${cnpjToma}</CNPJ>${indIEToma !== "9" && input.tomador.ie && input.tomador.ie !== "ISENTO" ? `<IE>${input.tomador.ie}</IE>` : ""}<xNome>${xNomeToma}</xNome>${input.tomador.fone ? `<fone>${input.tomador.fone}</fone>` : ""}<enderToma><xLgr>${(input.tomador.logradouro || "RUA").length >= 2 ? (input.tomador.logradouro || "RUA") : "RUA GERAL"}</xLgr><nro>${input.tomador.nro || "SN"}</nro><xBairro>${(input.tomador.bairro || "CENTRO").length >= 2 ? (input.tomador.bairro || "CENTRO") : "CENTRO"}</xBairro><cMun>${input.tomador.cMun}</cMun><xMun>${input.tomador.xMun}</xMun><CEP>${cepToma}</CEP><UF>${input.tomador.uf}</UF></enderToma>${input.tomador.email ? `<email>${input.tomador.email}</email>` : ""}
    </toma>
    <infCarga>
      <vCarga>${input.vCarga.toFixed(2)}</vCarga><proPred>${input.infCTeNorm?.proPred || "CARGA GERAL"}</proPred>
      <infQ><cUnid>01</cUnid><tpMed>00</tpMed><qCarga>${input.pesoKg.toFixed(4)}</qCarga></infQ>
    </infCarga>
    ${infNFeXml}
    <infModal versaoModal="4.00"><rodo><RNTRC>${rntrcXml}</RNTRC></rodo></infModal>
    ${impXml}
    <total><vTPrest>${input.vPrest.toFixed(2)}</vTPrest><vTRec>${input.vPrest.toFixed(2)}</vTRec><vTotDFe>${vTotDFe}</vTotDFe></total>
    <infRespTec><CNPJ>${cnpjLimpo}</CNPJ><xContato>SUPORTE TECNICO</xContato><email>suporte@vectrainsights.com.br</email><fone>3139952572</fone></infRespTec>
  </infCte>
  <infCTeSupl><qrCodCTe>https://${(input.ufEnv || input.emit.uf)?.toUpperCase() === "MG" ? "portalcte.fazenda.mg.gov.br/portalcte/sistema/qrcode.xhtml" : "dfeportal.svrs.rs.gov.br/cteQrCode"}?chCTe=${chave}&amp;tpAmb=${input.ambiente==="producao"?"1":"2"}</qrCodCTe></infCTeSupl>
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

// Reconciliação: a SEFAZ pode ter autorizado mesmo quando a resposta da recepção indica erro
// (timeout, resposta ilegível, duplo envio). Antes de declarar rejeição, consulta a situação real pela chave.
const sleepSefaz = (ms: number) => new Promise(r => setTimeout(r, ms));
// Repete erro de rede (sem resposta) até 3x com backoff; resposta HTTP (mesmo 500) não repete
async function sendComRetry(fn: () => Promise<string>, tentativas = 3): Promise<string> {
  let lastErr: any = new Error("Falha de rede");
  for (let i = 1; i <= tentativas; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const m = String((e as Error)?.message || e);
      if (/^CTe HTTP \d+/.test(m)) throw e;
      console.log("[CTE-SEFAZ] tentativa " + i + "/" + tentativas + " falhou: " + m);
      if (i < tentativas) await sleepSefaz(2000 * i);
    }
  }
  throw lastErr;
}

async function reconciliarEmissao(pfx: Buffer, senha: string, out: { sucesso: boolean; cStat: string; xMotivo: string; chave?: string; protocolo?: string; xmlRet?: string }, ambiente: Ambiente, uf?: string) {
  if (out.sucesso || !out.chave) return out;
  let cons: { cStat: string; xMotivo: string; xml?: string } | null = null;
  for (let i = 1; i <= 3; i++) {
    try { cons = await consultarCte(pfx, senha, out.chave, ambiente, uf); break; } catch (e) { console.log("[CTE-SEFAZ-RECONC] consulta " + i + "/3 falhou:", (e as Error)?.message); if (i < 3) await sleepSefaz(2000 * i); }
  }
  if (cons) {
    console.log("[CTE-SEFAZ-RECONC] consSit:", cons.cStat, cons.xMotivo);
    if (cons.cStat === "100") {
      const prot = cons.xml?.match(/<nProt>(\d+)<\/nProt>/)?.[1] || out.protocolo;
      return { sucesso: true, cStat: "100", xMotivo: "Autorizado o uso do CT-e (confirmado por consulta SEFAZ)", chave: out.chave, protocolo: prot, xmlRet: out.xmlRet };
    }
  }
  if (!cons) console.log("[CTE-SEFAZ-RECONC] sem resposta da SEFAZ após 3 tentativas");
  return out;
}

export async function emitirCte(pfx:Buffer, senha:string, xml:string, ambiente:Ambiente, uf?: string): Promise<{ sucesso:boolean; cStat:string; xMotivo:string; chave?:string; protocolo?:string; xmlRet?:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const xmlAss = signXml(xml, pfx, senha);
  console.log("[CTE-SEFAZ] XML ASSINADO COMPLETO:", xmlAss);
  // V4 Sinc — MOC exige GZip + Base64 no cteDadosMsg
  const compressed = zlib.gzipSync(Buffer.from(xmlAss, "utf-8"));
  const dadosBase64 = compressed.toString("base64");
  console.log("[CTE-SEFAZ] Base64 comprimido (primeiros 200):", dadosBase64.slice(0, 200));
  const isMG = uf?.toUpperCase() === "MG";
  console.log("[CTE-SEFAZ] UF:", uf, "isMG:", isMG, "ambiente:", ambiente, "endpoint:", isMG ? ep.recepcao : ep.recepcao);
  if (isMG) {
    // MG CT-e Simplificado: namespace CTeRecepcaoSimpV4
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSimpV4";
    const body=`<cteDadosMsg xmlns="${ns}">${dadosBase64}</cteDadosMsg>`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
    console.log("[CTE-SEFAZ] Envelope SOAP (tamanho):", Buffer.byteLength(envelope));
    const u=new URL(ep.recepcao);
    console.log("[CTE-SEFAZ] Endpoint URL:", ep.recepcao);
    const agent = createSefazAgent(pfx,senha);
    let ret: string;
    try {
      ret = await sendComRetry(() => new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port:443, path:u.pathname, method:"POST", agent, headers:{
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `${ns}/cteRecepcao`,
        "Content-Length": Buffer.byteLength(envelope)
      }},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{console.log("[CTE-SEFAZ] HTTP status:", res.statusCode);console.log("[CTE-SEFAZ] Resposta SEFAZ COMPLETA:", d);res.statusCode&&res.statusCode>=400?reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)):resolve(d);});});
      req.on("error",reject); req.write(envelope); req.end();
    }));
    } catch (e) {
      // Rede caiu no meio do envio (ex.: read ECONNRESET): a SEFAZ pode ter processado. Reconcilia pela chave.
      const msg = (e as Error)?.message || "Falha de rede";
      console.log("[CTE-SEFAZ] erro de rede no envio, reconciliando:", msg);
      const chN = xml.match(/Id="CTe(\d{44})"/)?.[1];
      return reconciliarEmissao(pfx, senha, { sucesso: false, cStat: "", xMotivo: msg + " (sem resposta da SEFAZ)", chave: chN, protocolo: undefined, xmlRet: "" }, ambiente, uf);
    }
    const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||""; const ch=ret.match(/<chCTe>(\d{44})<\/chCTe>/)?.[1]||xml.match(/Id="CTe(\d{44})"/)?.[1]; const prot=ret.match(/<nProt>(\d+)<\/nProt>/)?.[1]||ret.match(/<protCTe[^>]*>[\s\S]*?<nProt>(\d+)<\/nProt>/)?.[1];
    console.log("[CTE-SEFAZ-RESP] cStat:", cStat, "xMotivo:", xMotivo, "chave:", ch, "protocolo:", prot);
    return reconciliarEmissao(pfx, senha, { sucesso: cStat==="100"||cStat==="104"||cStat==="103", cStat, xMotivo, chave: ch, protocolo: prot, xmlRet: ret }, ambiente, uf);
  }
  // SVRS usa namespace v4 (CTeRecepcaoSincV4)
  const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4";
  const body=`<cteDadosMsg xmlns="${ns}">${dadosBase64}</cteDadosMsg>`;
  let ret: string;
  try {
    ret=await sendComRetry(() => soapRequest(ep.recepcao, body, `${ns}/cteRecepcao`, createSefazAgent(pfx,senha)));
  } catch (e) {
    const msg=(e as Error)?.message || "Falha de rede";
    console.log("[CTE-SEFAZ] erro de rede no envio, reconciliando:", msg);
    const chN=xml.match(/Id="CTe(\d{44})"/)?.[1];
    return reconciliarEmissao(pfx, senha, { sucesso: false, cStat: "", xMotivo: msg + " (sem resposta da SEFAZ)", chave: chN, protocolo: undefined, xmlRet: "" }, ambiente, uf);
  }
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||""; const ch=ret.match(/<chCTe>(\d{44})<\/chCTe>/)?.[1]||xml.match(/Id="CTe(\d{44})"/)?.[1]; const prot=ret.match(/<nProt>(\d+)<\/nProt>/)?.[1]||ret.match(/<protCTe[^>]*>[\s\S]*?<nProt>(\d+)<\/nProt>/)?.[1];
  return reconciliarEmissao(pfx, senha, { sucesso: cStat==="100"||cStat==="104"||cStat==="103", cStat, xMotivo, chave: ch, protocolo: prot, xmlRet: ret }, ambiente, uf);
}

export async function consultarCte(pfx:Buffer, senha:string, chave:string, ambiente:Ambiente, uf?: string): Promise<{ cStat:string; xMotivo:string; xml?:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const consSit=`<consSitCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><xServ>CONSULTAR</xServ><chCTe>${chave}</chCTe></consSitCTe>`;
  const compressed = zlib.gzipSync(Buffer.from(consSit, "utf-8"));
  const dadosBase64 = compressed.toString("base64");
  const isMG = uf?.toUpperCase() === "MG";
  if (isMG) {
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4";
    const body=`<cteDadosMsg xmlns="${ns}">${consSit}</cteDadosMsg>`; // MG consulta recebe XML puro (gzip aqui dava 225)
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

export async function consultarCtePorChave(pfx:Buffer, senha:string, chave:string, ambiente:Ambiente, cnpjAutor:string, ufAutor?: string): Promise<{ sucesso:boolean; cStat:string; xMotivo:string; chave?:string; emitCnpj?:string; emitNome?:string; emitIE?:string; dhEmi?:string; nCT?:string; serie?:string; modelo?:string }>{
  const ch = (chave || "").replace(/\D/g, "");
  if (ch.length !== 44) return { sucesso:false, cStat:"", xMotivo:"Chave deve ter 44 dígitos" };
  const url = ambiente==="producao"
    ? "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx"
    : "https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx";
  const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe";
  const tpAmb = ambiente==="producao"?"1":"2";
  const payload = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/cte"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${codigoUF(ufAutor||"MG")}</cUFAutor><CNPJ>${(cnpjAutor||"").replace(/\D/g,"")}</CNPJ><consChNFe><chCTe>${ch}</chCTe></consChNFe></distDFeInt>`;
  const body = `<cteDistDFeInteresse xmlns="${ns}"><cteDadosMsg xmlns="${ns}">${payload}</cteDadosMsg></cteDistDFeInteresse>`;
  const ret = await soapRequest(url, body, `${ns}/cteDistDFeInteresse`, createSefazAgent(pfx,senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  if (cStat !== "138") return { sucesso:false, cStat, xMotivo };
  const zipB64 = ret.match(/<docZip[^>]*>([^<]+)<\/docZip>/)?.[1] || "";
  if (!zipB64) return { sucesso:false, cStat, xMotivo: "Resposta sem documento" };
  const buf = Buffer.from(zipB64.replace(/\s/g, ""), "base64");
  let xmlDoc = "";
  try { xmlDoc = zlib.inflateSync(buf).toString("utf-8"); }
  catch { try { xmlDoc = zlib.gunzipSync(buf).toString("utf-8"); } catch { xmlDoc = buf.toString("utf-8"); } }
  const tag = (t:string) => xmlDoc.match(new RegExp(`<${t}>([^<]*)<\/${t}>`))?.[1] || "";
  const isResumo = /<resCTe[\s>]/.test(xmlDoc);
  const emitCnpj = tag("CNPJ") || tag("CPF");
  const emitNome = tag("xNome");
  const emitIE = tag("IE");
  const dhEmi = tag("dhEmi");
  // nCT/serie/modelo decodificados da chave (posições 21-34: mod 21-22, serie 23-25, nCT 26-34)
  const modelo = ch.slice(20,22), serie = String(parseInt(ch.slice(22,25),10)), nCT = String(parseInt(ch.slice(25,34),10));
  console.log("[CTE-DIST] resumo:", isResumo, "emit:", emitCnpj, emitNome, "dhEmi:", dhEmi);
  if (!emitCnpj) return { sucesso:false, cStat, xMotivo: "Documento sem emitente identificável" };
  return { sucesso:true, cStat, xMotivo, chave: ch, emitCnpj, emitNome, emitIE, dhEmi, nCT, serie, modelo };
}

export async function cancelarCte(pfx:Buffer, senha:string, chave:string, justificativa:string, ambiente:Ambiente, cnpj:string, uf?: string, protocolo?: string):Promise<{ sucesso:boolean; cStat:string; xMotivo:string }>{
  const ep=getCteEndpoints(ambiente, uf);
  const dhEvento=new Date().toISOString().replace(/\.\d{3}Z$/,"+00:00");
  const nSeq="001";
  const tpEvento="110111";
  const cOrgao = codigoUF(uf || "MG");
  const chaveFmt = chave.replace(/\D/g, "").padStart(44, "0");
  const nProtFmt = (protocolo || "0").replace(/\D/g,"").padStart(15,"0");
  const cnpjFmt = cnpj.replace(/\D/g,"").padStart(14,"0");
  const evento=`<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><infEvento Id="ID${tpEvento}${chaveFmt}${nSeq}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><CNPJ>${cnpjFmt}</CNPJ><chCTe>${chaveFmt}</chCTe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeq}</nSeqEvento><detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>${nProtFmt}</nProt><xJust>${justificativa}</xJust></evCancCTe></detEvento></infEvento></eventoCTe>`;
  console.log("[CTE-CANCEL] evento XML:", evento);
  const ass=signXml(evento, pfx, senha);
  console.log("[CTE-CANCEL] XML assinado (500 chars):", ass.slice(0, 500));
  console.log("[CTE-CANCEL] URI na assinatura:", ass.match(/URI="([^"]+)"/)?.[1] || "NAO_ENCONTRADO");
  const isMG = uf?.toUpperCase() === "MG";
  if (isMG) {
    const ns = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4";
    const body=`<cteDadosMsg xmlns="${ns}">${ass}</cteDadosMsg>`;
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
    const u=new URL(ep.recepcaoEvento);
    const agent = createSefazAgent(pfx,senha);
    let ret: string;
    try {
      ret = await new Promise<string>((resolve,reject)=>{
      const req=https.request({hostname:u.hostname, port:443, path:u.pathname, method:"POST", agent, headers:{
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": `${ns}/cteRecepcaoEvento`,
        "Content-Length": Buffer.byteLength(envelope)
      }},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>res.statusCode&&res.statusCode>=400?reject(new Error(`CTe HTTP ${res.statusCode}: ${d.slice(0,500)}`)):resolve(d));});
      req.on("error",reject); req.write(envelope); req.end();
    });
    } catch (e) {
      // Rede caiu no meio do cancelamento: confirma pela chave antes de declarar falha.
      const msg = (e as Error)?.message || "Falha de rede";
      try {
        const cons = await consultarCte(pfx, senha, chave.replace(/\D/g, ""), ambiente, uf);
        if (cons.cStat === "135" || cons.cStat === "155") return { sucesso: true, cStat: cons.cStat, xMotivo: cons.xMotivo || "Cancelamento confirmado por consulta SEFAZ" };
      } catch {}
      throw e;
    }
    console.log("[CTE-CANCEL] Resposta MG:", ret.slice(0, 1000));
    const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
    return { sucesso:cStat==="135"||cStat==="155", cStat, xMotivo };
  }
  const body=`<CTeRecepcaoEventoV4 xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4">${ass}</cteDadosMsg></CTeRecepcaoEventoV4>`;
  const ret=await soapRequest(ep.recepcaoEvento, body, "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4/cteRecepcaoEvento", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
  return { sucesso:cStat==="135"||cStat==="155", cStat, xMotivo };
}
