/**
 * CT-e 4.00 — Fase 2 (emissão real)
 * Reaproveita `sefaz.ts` para mTLS e assinatura (infCte).
 * Endpoints SVRS (MG/SP/RS/etc. usam SVRS para CT-e).
 * Ref: https://www.cte.fazenda.gov.br/portal/webServices.aspx
 */
import https from "node:https";
import { createSefazAgent, signXml, buscarCertificadoAtivo } from "./sefaz";
export { buscarCertificadoAtivo };

export type Ambiente = "homologacao" | "producao";

export const CTE_ENDPOINTS = {
  homologacao: {
    recepcao: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcao/CteRecepcao.asmx",
    retRecepcao: "https://cte-homologacao.svrs.rs.gov.br/ws/cteretrecepcao/CteRetRecepcao.asmx",
    consulta: "https://cte-homologacao.svrs.rs.gov.br/ws/cteconsulta/CteConsulta.asmx",
    statusServico: "https://cte-homologacao.svrs.rs.gov.br/ws/ctestatusservico/CteStatusServico.asmx",
    recepcaoEvento: "https://cte-homologacao.svrs.rs.gov.br/ws/cterecepcaoevento/CteRecepcaoEvento.asmx",
  },
  producao: {
    recepcao: "https://cte.svrs.rs.gov.br/ws/cterecepcao/CteRecepcao.asmx",
    retRecepcao: "https://cte.svrs.rs.gov.br/ws/cteretrecepcao/CteRetRecepcao.asmx",
    consulta: "https://cte.svrs.rs.gov.br/ws/cteconsulta/CteConsulta.asmx",
    statusServico: "https://cte.svrs.rs.gov.br/ws/ctestatusservico/CteStatusServico.asmx",
    recepcaoEvento: "https://cte.svrs.rs.gov.br/ws/cterecepcaoevento/CteRecepcaoEvento.asmx",
  },
} as const;

function getCteEndpoints(ambiente: Ambiente) { return ambiente === "producao" ? CTE_ENDPOINTS.producao : CTE_ENDPOINTS.homologacao; }

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

export interface EmitenteCte { cnpj: string; ie: string; xNome: string; xFant?: string; uf: string; cMun: string; xMun: string; cep?: string; logradouro?: string; nro?: string; bairro?: string; }
export interface TomadorCte { toma: "0"|"1"|"2"|"3"|"4"; cnpj?: string; cpf?: string; ie?: string; xNome: string; uf: string; cMun: string; xMun: string; }
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
  rem?: { cnpj?:string; cpf?:string; xNome:string; uf:string; cMun:string; xMun:string; ie?:string };
  dest?: { cnpj?:string; cpf?:string; xNome:string; uf:string; cMun:string; xMun:string; ie?:string };
  tomador: TomadorCte;
  vPrest: number; vCarga: number; pesoKg: number; cfop: string;
  obs?: string;
  infCTeNorm?: { proPred?: string; xOutCat?: string };
  modalRod?: { rntrc: string; ciot?: string; veiculos?: Array<{ placa: string; uf: string; rntrc?: string }> };
}

export function buildCteXml(input: CteInputCompleto): { xml: string; chave: string } {
  const dhEmi = new Date().toISOString();
  const cUF = codigoUF(input.ufEnv || input.emit.uf);
  const aamm = dhEmi.slice(2,4) + dhEmi.slice(5,7); // AAMM
  const cnpjLimpo = input.emit.cnpj.replace(/\D/g,"").padStart(14,"0");
  const serie = input.serie.padStart(3,"0");
  const nCT = input.numero.padStart(9,"0");
  const cCT = String(Math.floor(Math.random()*100000000)).padStart(8,"0");
  const chave = gerarChaveCte(cUF, aamm, cnpjLimpo, "57", serie, nCT, "1", cCT);
  const id = `CTe${chave}`;
  const natOp = input.natOp || "PRESTACAO DE SERVICO DE TRANSPORTE";
  const tomaMap: Record<string,string> = { "0":"Remetente","1":"Expedidor","2":"Recebedor","3":"Destinatario","4":"Outros" };
  // cDV already in chave last digit
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <infCte Id="${id}" versao="4.00">
    <ide>
      <cUF>${cUF}</cUF><cCT>${cCT}</cCT><CFOP>${input.cfop}</CFOP><natOp>${natOp}</natOp><mod>57</mod><serie>${serie}</serie><nCT>${nCT}</nCT><dhEmi>${dhEmi}</dhEmi>
      <tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>${input.ambiente==="producao"?"1":"2"}</tpAmb><tpCTe>0</tpCTe><procEmi>0</procEmi><verProc>NORVO_1.0</verProc>
      <cMunEnv>${input.cMunEnv}</cMunEnv><xMunEnv>${input.xMunEnv}</xMunEnv><UFEnv>${input.ufEnv}</UFEnv>
      <modal>01</modal><tpServ>0</tpServ>
      <cMunIni>${input.cMunIni}</cMunIni><xMunIni>${input.xMunIni}</xMunIni><UFIni>${input.ufIni}</UFIni>
      <cMunFim>${input.cMunFim}</cMunFim><xMunFim>${input.xMunFim}</xMunFim><UFFim>${input.ufFim}</UFFim>
      <retira>1</retira><indIEToma>1</indIEToma>
      ${input.obs ? `<xObs>${input.obs}</xObs>` : ""}
    </ide>
    <emit><CNPJ>${cnpjLimpo}</CNPJ><IE>${input.emit.ie || "ISENTO"}</IE><xNome>${input.emit.xNome}</xNome>${input.emit.xFant ? `<xFant>${input.emit.xFant}</xFant>` : ""}<enderEmit><xLgr>${input.emit.logradouro||"RUA"}</xLgr><nro>${input.emit.nro||"SN"}</nro><xBairro>${input.emit.bairro||"CENTRO"}</xBairro><cMun>${input.emit.cMun}</cMun><xMun>${input.emit.xMun}</xMun><CEP>${(input.emit.cep||"00000000").replace(/\D/g,"")}</CEP><UF>${input.emit.uf}</UF></enderEmit></emit>
    ${input.rem ? `<rem><CNPJ>${(input.rem.cnpj||"").replace(/\D/g,"")}</CNPJ><xNome>${input.rem.xNome}</xNome><enderReme><xLgr>RUA</xLgr><nro>SN</nro><xBairro>CENTRO</xBairro><cMun>${input.rem.cMun}</cMun><xMun>${input.rem.xMun}</xMun><CEP>00000000</CEP><UF>${input.rem.uf}</UF></enderReme></rem>` : ""}
    ${input.dest ? `<dest><CNPJ>${(input.dest.cnpj||"").replace(/\D/g,"")}</CNPJ><xNome>${input.dest.xNome}</xNome><enderDest><xLgr>RUA</xLgr><nro>SN</nro><xBairro>CENTRO</xBairro><cMun>${input.dest.cMun}</cMun><xMun>${input.dest.xMun}</xMun><CEP>00000000</CEP><UF>${input.dest.uf}</UF></enderDest></dest>` : ""}
    <vPrest><vTPrest>${input.vPrest.toFixed(2)}</vTPrest><vRec>${input.vPrest.toFixed(2)}</vRec><Comp><xNome>VALOR DO FRETE</xNome><vComp>${input.vPrest.toFixed(2)}</vComp></Comp></vPrest>
    <imp><ICMS><ICMS00><CST>00</CST><vBC>${input.vPrest.toFixed(2)}</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS></imp>
    <infCTeNorm>
      <infCarga><vCarga>${input.vCarga.toFixed(2)}</vCarga><proPred>${input.infCTeNorm?.proPred || "CARGA GERAL"}</proPred><infQ><cUnid>01</cUnid><tpMed>00</tpMed><qCarga>${input.pesoKg.toFixed(3)}</qCarga></infQ></infCarga>
      <infDoc><infNFe><chave>00000000000000000000000000000000000000000000</chave></infNFe></infDoc>
      ${input.tomador.toma === "4" ? `<toma4><toma>4</toma><CNPJ>${(input.tomador.cnpj||"").replace(/\D/g,"")}</CNPJ><xNome>${input.tomador.xNome}</xNome></toma4>` : ""}
    </infCTeNorm>
    <infModal versaoModal="4.00"><rodo><RNTRC>${(input.modalRod?.rntrc||"").replace(/\D/g,"")}</RNTRC></rodo></infModal>
  </infCte>
</CTe>`;
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

export async function emitirCte(pfx:Buffer, senha:string, xml:string, ambiente:Ambiente): Promise<{ sucesso:boolean; cStat:string; xMotivo:string; chave?:string; protocolo?:string; xmlRet?:string }>{
  const ep=getCteEndpoints(ambiente);
  const xmlAss = signXml(xml, pfx, senha);
  const body=`<cteRecepcao xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcao"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcao">${xmlAss}</cteDadosMsg></cteRecepcao>`;
  const ret=await soapRequest(ep.recepcao, body, "http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcao/cteRecepcao", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||""; const ch=ret.match(/<chCTe>(\d{44})<\/chCTe>/)?.[1]||xml.match(/Id="CTe(\d{44})"/)?.[1]; const prot=ret.match(/<nProt>(\d+)<\/nProt>/)?.[1];
  return { sucesso: cStat==="103"||cStat==="104", cStat, xMotivo, chave: ch, protocolo: prot, xmlRet: ret };
}

export async function consultarCte(pfx:Buffer, senha:string, chave:string, ambiente:Ambiente): Promise<{ cStat:string; xMotivo:string; xml?:string }>{
  const ep=getCteEndpoints(ambiente);
  const body=`<cteConsultaCT xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteConsulta"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteConsulta"><consSitCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><xServ>CONSULTAR</xServ><chCTe>${chave}</chCTe></consSitCTe></cteDadosMsg></cteConsultaCT>`;
  const ret=await soapRequest(ep.consulta, body, "http://www.portalfiscal.inf.br/cte/wsdl/CteConsulta/cteConsultaCT", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
  return { cStat, xMotivo, xml: ret };
}

export async function cancelarCte(pfx:Buffer, senha:string, chave:string, justificativa:string, ambiente:Ambiente, cnpj:string):Promise<{ sucesso:boolean; cStat:string; xMotivo:string }>{
  const ep=getCteEndpoints(ambiente);
  const dhEvento=new Date().toISOString().replace(/\.\d{3}Z$/,"");
  const nSeq="1";
  const tpEvento="110111";
  const evento=`<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><infEvento Id="ID${tpEvento}${chave}${nSeq}"><cOrgao>35</cOrgao><tpAmb>${ambiente==="producao"?"1":"2"}</tpAmb><CNPJ>${cnpj.replace(/\D/g,"")}</CNPJ><chCTe>${chave}</chCTe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeq}</nSeqEvento><detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>0</nProt><xJust>${justificativa}</xJust></evCancCTe></detEvento></infEvento></eventoCTe>`;
  const ass=signXml(evento, pfx, senha);
  const body=`<cteRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcaoEvento"><cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcaoEvento">${ass}</cteDadosMsg></cteRecepcaoEvento>`;
  const ret=await soapRequest(ep.recepcaoEvento, body, "http://www.portalfiscal.inf.br/cte/wsdl/CteRecepcaoEvento/cteRecepcaoEvento", createSefazAgent(pfx,senha));
  const cStat=ret.match(/<cStat>(\d+)<\/cStat>/)?.[1]||""; const xMotivo=ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1]||"";
  return { sucesso: cStat==="135"||cStat==="155", cStat, xMotivo };
}
