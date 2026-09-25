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

// Produto predominante (XSD: tpCarga 01-11 obrigatório, xProd 1-120
// obrigatório, NCM 2 ou 8 dígitos opcional). Padrão: 05/CARGA GERAL.
export function montarProdPredXml(prod?: { tpCarga?: string; xProd?: string; ncm?: string }): string {
  const tpCarga = /^(0[1-9]|1[01])$/.test(String(prod?.tpCarga || "").trim()) ? String(prod!.tpCarga).trim() : "05";
  const xProd = String(prod?.xProd || "").trim().slice(0, 120) || "CARGA GERAL";
  const ncm = String(prod?.ncm || "").replace(/\D/g, "");
  const ncmXml = (/^\d{8}$/.test(ncm) || /^\d{2}$/.test(ncm)) ? `<NCM>${ncm}</NCM>` : "";
  return `<prodPred><tpCarga>${tpCarga}</tpCarga><xProd>${xProd}</xProd>${ncmXml}</prodPred>`;
}

// Garante <prodPred> após </seg> (ou </infDoc>) — para XML de front antigo.
export function garantirProdPredMdf(xml: string, xProd?: string): string {
  if (/<prodPred[\s>]/.test(xml)) return xml;
  const add = montarProdPredXml({ xProd });
  if (/<\/seg>/.test(xml)) return xml.replace(/<\/seg>/, `</seg>${add}`);
  if (xml.includes("</infDoc>")) return xml.replace(/<\/infDoc>/, `</infDoc>${add}`);
  return xml;
}

export interface MdfSeguro {
  xSeg?: string;
  cnpjSeg?: string;
  nApol?: string;
  nAver?: string;
}

// Monta <seg> conforme XSD (infResp/respSeg obrigatório; infSeg só com CNPJ
// válido pois o CNPJ é obrigatório dentro dele; nApol/nAver opcionais).
// Para tpEmit 1/3 (prestador) emite mesmo sem dados (rejeição 698).
// Regra F92/699 exige o grupo completo: responsável + seguradora + apólice + averbação.
// nAver: em HOMOLOGAÇÃO usa valor fictício quando ausente (ambiente de testes);
// em PRODUÇÃO aborta com mensagem clara (averbação fictícia seria fraude).
export function montarSegXml(seg: MdfSeguro | undefined, tpEmit: string, cnpjEmit?: string, homolog?: boolean): string {
  const segIn = seg || {};
  const precisaSeg = tpEmit === "1" || tpEmit === "3";
  const xSeg = String(segIn.xSeg || "").trim().slice(0, 30);
  const cnpjSeg = String(segIn.cnpjSeg || "").replace(/\D/g, "");
  // Apólice: remove separadores (ex. 3794.26.01.0659.0000020 → 19 dígitos)
  // para caber no limite de 20 do XSD sem truncar o número real.
  const nApolRaw = String(segIn.nApol || "").trim();
  const nApol = (nApolRaw.replace(/[\s.\-/]/g, "") || nApolRaw).slice(0, 20);
  let nAver = String(segIn.nAver || "").trim().slice(0, 40);
  if (!nAver && precisaSeg) {
    if (homolog) { nAver = "9999999999"; console.log("[mdf-debug] nAver ficticia de homologacao aplicada"); }
    else throw new Error("Averbação do seguro (nAver) não informada no CT-e nem no cadastro da seguradora — preencha para emitir o MDF-e");
  }
  if (!precisaSeg && !xSeg && !nApol && !nAver) return "";
  const cnpjResp = String(cnpjEmit || "").replace(/\D/g, "");
  const infRespXml = `<infResp><respSeg>1</respSeg>${/^\d{14}$/.test(cnpjResp) ? `<CNPJ>${cnpjResp}</CNPJ>` : ""}</infResp>`;
  const infSegXml = (xSeg && /^\d{14}$/.test(cnpjSeg)) ? `<infSeg><xSeg>${xSeg}</xSeg><CNPJ>${cnpjSeg}</CNPJ></infSeg>` : "";
  return `<seg>${infRespXml}${infSegXml}${nApol ? `<nApol>${nApol}</nApol>` : ""}${nAver ? `<nAver>${nAver}</nAver>` : ""}</seg>`;
}

// Garante <seg> no XML (para XML de front antigo): injeta após </infDoc>.
export function garantirSegMdf(xml: string, seg: MdfSeguro | undefined): string {
  if (/<seg[\s>]/.test(xml)) return xml;
  const tpEmit = xml.match(/<tpEmit>([^<]*)<\/tpEmit>/)?.[1] || "";
  const segXml = montarSegXml(seg, tpEmit);
  if (!segXml || !xml.includes("</infDoc>")) return xml;
  return xml.replace(/<\/infDoc>/, `</infDoc>${segXml}`);
}

// Puxa seguradora/apólice/averbação do CT-e vinculado (cte_documentos) +
// CNPJ da seguradora (tabela seguradoras) para completar o infSeg (699).
export async function segDoCteVinculado(supa: { from(t: string): any }, empresaId: string, xml: string): Promise<MdfSeguro | null> {
  const dados = await dadosDoCteVinculado(supa, empresaId, xml);
  return dados.seg;
}

// Busca única: seguro + tomadores + produto predominante dos CT-es vinculados.
export async function dadosDoCteVinculado(supa: { from(t: string): any }, empresaId: string, xml: string): Promise<{ seg: MdfSeguro | null; contratantes: MdfContratante[]; proPred: string }> {
  const contratantes: MdfContratante[] = [];
  let proPred = "";
  try {
    const chaves = [...String(xml).matchAll(/<chCTe>(\d{44})<\/chCTe>/g)].map(m => m[1]);
    if (!chaves.length) return { seg: null, contratantes, proPred };
    const { data: rows } = await supa.from("cte_documentos").select("xml_assinado").eq("empresa_id", empresaId).in("chave_acesso", chaves).limit(10);
    let seg: MdfSeguro | null = null;
    for (const r of (rows as any[]) || []) {
      const raw = String((r as any)?.xml_assinado || "");
      // Tomadores + produto predominante do XML assinado do CT-e (578/725).
      try {
        let cteXml = raw;
        try { const p = JSON.parse(raw); if (p && p.xml) cteXml = String(p.xml); } catch {}
        for (const t of extrairContratantesDoCte(cteXml)) {
          if (!contratantes.some(o => (o.cnpj || o.cpf || o.xNome) === (t.cnpj || t.cpf || t.xNome))) contratantes.push(t);
        }
        if (!proPred) proPred = (cteXml.match(/<proPred>([^<]{1,120})<\/proPred>/)?.[1] || "").trim();
      } catch {}
      if (seg) continue;
      let f: any = {};
      try { f = JSON.parse(raw).form || {}; } catch {}
      const xSeg = String(f.seguradoraNome || "").trim();
      const nApol = String(f.apolice || "").trim();
      const nAver = String(f.averbacao || "").trim();
      if (xSeg || nApol || nAver) {
        let cnpjSeg = "";
        let averbCad = "";
        try {
          if (xSeg) {
            const { data: sg } = await supa.from("seguradoras").select("cnpj,averbacao").eq("empresa_id", empresaId).ilike("nome", xSeg).limit(1);
            cnpjSeg = String((sg as any[])?.[0]?.cnpj || "").replace(/\D/g, "");
            averbCad = String((sg as any[])?.[0]?.averbacao || "").trim();
          }
        } catch {}
        // Averbação: do CT-e; se vazia, do cadastro da seguradora (mesmo
        // fallback que o CT-e usa ao preencher a apólice).
        seg = { xSeg, cnpjSeg, nApol, nAver: nAver || averbCad };
      }
      if (seg) continue;
      const mSeg = raw.match(/<xSeg>([^<]{1,30})<\/xSeg>/);
      const mApol = raw.match(/<nApol>([^<]{1,20})<\/nApol>/);
      const mAver = raw.match(/<nAver>([^<]{1,40})<\/nAver>/);
      if (mSeg || mApol) seg = { xSeg: (mSeg?.[1] || "").trim(), nApol: (mApol?.[1] || "").trim(), nAver: (mAver?.[1] || "").trim() };
    }
    return { seg, contratantes, proPred };
  } catch {}
  return { seg: null, contratantes, proPred };
}

// Completa o <seg> reconstruindo o grupo com os dados do CT-e
// (responsável + seguradora + apólice + averbação — regra F92/699).
export function completarSegMdf(xml: string, seg: MdfSeguro | undefined): string {
  const cnpjEmit = (xml.match(/<emit><CNPJ>(\d{14})<\/CNPJ>/)?.[1] || "").replace(/\D/g, "");
  const tpEmit = xml.match(/<tpEmit>([^<]*)<\/tpEmit>/)?.[1] || "";
  const homolog = /<tpAmb>2<\/tpAmb>/.test(xml);
  const full = montarSegXml(seg, tpEmit, cnpjEmit, homolog);
  if (!full) return xml;
  if (/<seg>[\s\S]*?<\/seg>/.test(xml)) return xml.replace(/<seg>[\s\S]*?<\/seg>/, full);
  if (xml.includes("</infDoc>")) return xml.replace(/<\/infDoc>/, `</infDoc>${full}`);
  return xml;
}

export interface MdfContratante {
  xNome?: string;
  cnpj?: string;
  cpf?: string;
}

// Extrai o tomador do CT-e assinado — CTeSimp (<toma> filho de <infCte>),
// CT-e normal toma4 direto, ou toma03 0-3 via remetente/expedidor/
// recebedor/destinatário — rejeição 578.
export function extrairContratantesDoCte(cteXml: string): MdfContratante[] {
  const out: MdfContratante[] = [];
  const push = (xNome: string, doc: string) => {
    const d = String(doc || "").replace(/\D/g, "");
    const nome = String(xNome || "").trim().slice(0, 60);
    if (d.length === 14) { if (!out.some(o => o.cnpj === d)) out.push({ xNome: nome, cnpj: d }); }
    else if (d.length === 11) { if (!out.some(o => o.cpf === d)) out.push({ xNome: nome, cpf: d }); }
    else if (nome.length >= 2) { if (!out.some(o => o.xNome === nome)) out.push({ xNome: nome }); }
  };
  const grupo = (tag: string) => cteXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "";
  const docNomeDe = (frag: string) => ({
    doc: frag.match(/<(CNPJ|CPF)>([^<]+)<\/\1>/)?.[2] || "",
    nome: frag.match(/<xNome>([^<]+)<\/xNome>/)?.[1] || "",
  });
  const t4 = grupo("toma4");
  if (t4) {
    const { doc, nome } = docNomeDe(t4);
    push(nome, doc);
    return out;
  }
  // CTeSimp: <toma><toma>3</toma><indIEToma>…</indIEToma><CNPJ>…<xNome>…
  const simp = cteXml.match(/<toma>\s*<toma>([0-4])<\/toma>([\s\S]*?)<\/toma>/);
  if (simp) {
    const { doc, nome } = docNomeDe(simp[2]);
    push(nome, doc);
    return out;
  }
  {
    const tipo = grupo("toma03").match(/<toma>([0-3])<\/toma>/)?.[1] || "3";
    const tag = tipo === "0" ? "rem" : tipo === "1" ? "exped" : tipo === "2" ? "receb" : "dest";
    const { doc, nome } = docNomeDe(grupo(tag));
    push(nome, doc);
    return out;
  }
}

// Garante <infContratante> no infANTT (para XML de front antigo).
export function garantirContratanteMdf(xml: string, list: MdfContratante[]): string {
  if (/<infContratante[\s>]/.test(xml) || !list.length || !xml.includes("</infANTT>")) return xml;
  const add = list.map(c => {
    const nome = String(c.xNome || "").trim().slice(0, 60);
    const doc = /^\d{14}$/.test(String(c.cnpj || "").replace(/\D/g, "")) ? `<CNPJ>${String(c.cnpj).replace(/\D/g, "")}</CNPJ>`
      : /^\d{11}$/.test(String(c.cpf || "").replace(/\D/g, "")) ? `<CPF>${String(c.cpf).replace(/\D/g, "")}</CPF>` : "";
    return `<infContratante>${nome.length >= 2 ? `<xNome>${nome}</xNome>` : ""}${doc}</infContratante>`;
  }).join("");
  return add ? xml.replace(/<\/infANTT>/, `${add}</infANTT>`) : xml;
}

export interface MdfInputCompleto {
  empresaId: string;
  ambiente: Ambiente;
  serie: string;
  numero: string;
  ufCarregamento: string;
  ufDescarregamento: string;
  emit: { cnpj: string; ie: string; xNome: string; uf: string; cMun: string; xMun: string; logradouro?: string; nro?: string; bairro?: string };
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
  seg?: { xSeg?: string; cnpjSeg?: string; nApol?: string; nAver?: string };
  contratantes?: Array<{ xNome?: string; cnpj?: string; cpf?: string }>;
  prodPred?: { tpCarga?: string; xProd?: string; ncm?: string };
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
  // RNTRC: TRNTRC exige 8 dígitos — remove zero(s) à esquerda como no CT-e.
  let rntrcXml = String(input.veicTrac.rntrc || "").replace(/\D/g, "");
  while (rntrcXml.length > 8 && rntrcXml.startsWith("0")) rntrcXml = rntrcXml.slice(1);
  if (!/^\d{8}$/.test(rntrcXml)) throw new Error(`RNTRC invalido para a SEFAZ (8 digitos): ${input.veicTrac.rntrc || ""}`);
  const infCiotXml = ciotNum ? `<infCIOT><CIOT>${ciotNum}</CIOT><CNPJ>${cnpjLimpo}</CNPJ></infCIOT>` : "";
  // Contratantes (tomadores — rejeição 578; ordem XSD: xNome, CNPJ/CPF).
  const contratantesXml = (input.contratantes || []).map(c => {
    const nome = String(c.xNome || "").trim().slice(0, 60);
    const doc = /^\d{14}$/.test(String(c.cnpj || "").replace(/\D/g, "")) ? `<CNPJ>${String(c.cnpj).replace(/\D/g, "")}</CNPJ>`
      : /^\d{11}$/.test(String(c.cpf || "").replace(/\D/g, "")) ? `<CPF>${String(c.cpf).replace(/\D/g, "")}</CPF>` : "";
    return `<infContratante>${nome.length >= 2 ? `<xNome>${nome}</xNome>` : ""}${doc}</infContratante>`;
  }).join("");
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

  // Produto predominante (filho de infMDFe, entre seg e tot; rejeição 725
  // exige para o rodoviário). tpCarga 05 = Carga Geral (padrão).
  const prodPredXml = montarProdPredXml(input.prodPred);

  // Seguro da carga (filho de infMDFe, entre infDoc e tot; XSD mdfeTiposBasico_v3.00).
  // Rejeição 698 exige seg para prestador no rodoviário (tpEmit 1/3) —
  // dados puxados do CT-e vinculado (seguradora/apólice/averbação).
  const segXml = montarSegXml(input.seg, tpEmit, cnpjLimpo, MDFE_TP_AMB === "2");

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
        <xLgr>${String(input.emit.logradouro || "").trim().length >= 2 ? String(input.emit.logradouro).trim().slice(0, 60) : "RUA"}</xLgr>
        <nro>${String(input.emit.nro || "").trim() || "SN"}</nro>
        <xBairro>${String(input.emit.bairro || "").trim().length >= 2 ? String(input.emit.bairro).trim().slice(0, 60) : "CENTRO"}</xBairro>
        <cMun>${input.emit.cMun}</cMun>
        <xMun>${input.emit.xMun}</xMun>
        <UF>${input.emit.uf}</UF>
      </enderEmit>
    </emit>
    <infModal versaoModal="3.00">
      <rodo>
        <infANTT>
          <RNTRC>${rntrcXml}</RNTRC>
          ${infCiotXml}
          ${contratantesXml}
        </infANTT>
        ${veicTracXml}
        ${reboquesXml}
      </rodo>
    </infModal>
    <infDoc>${infDocXml}</infDoc>
    ${segXml}
    ${prodPredXml}
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
  const BUILD = "034-qr-antes-signature";
  const ep = getMdfEndpoints(ambiente);
  const agent = createSefazAgent(pfx, senha);
  const nsSinc = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc";
  const cUF = xml.match(/Id="MDFe(\d{2})/)?.[1] || "31";
  const cabec = `<mdfeCabecMsg xmlns="${nsSinc}"><cUF>${cUF}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg>`;
  // A declaração XML é removida ANTES da assinatura. Depois disso, xmlAss
  // é transportado sem qualquer replace/trim; os mesmos bytes UTF-8 vão para o gzip.
  // Sem xmlns redundante em <infModal>: C14N padrão omite declaração
  // redundante em não-ápice, então o digest cobre os bytes sem ele —
  // exatamente o que é enviado.
  // Regex: remove xmlns redundante de <infModal> (C14N padrão omite declaração
  // redundante em não-ápice; mantê-la quebra o digest na SEFAZ).
  // Sanitização de transporte (vale para XML montado por qualquer front,
  // inclusive versões antigas): TRNTRC exige 8 dígitos — remove zero(s)
  // à esquerda; RNTRC inválido aborta antes de assinar.
  // 698: o <seg> vem do builder (front novo puxa do CT-e) ou do backfill
  // no servidor (segDoCteVinculado); aqui só sanitização de transporte.
  const xmlSanitizado = xml.replace(/<RNTRC>(\d+)<\/RNTRC>/g, (_m, d: string) => {
    let x = String(d);
    while (x.length > 8 && x.startsWith("0")) x = x.slice(1);
    if (!/^\d{8}$/.test(x)) throw new Error(`RNTRC invalido para a SEFAZ (8 digitos): ${d}`);
    return `<RNTRC>${x}</RNTRC>`;
  });
  const xmlForSignature = xmlSanitizado
    .replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, "")
    .replace(/<infModal([^>]*)>/g, (_m, attrs: string) => {
      const cleaned = String(attrs).replace(/\s+xmlns="[^"]*"/g, "");
      return `<infModal${cleaned}>`;
    });
  console.log("[mdf-debug] infModal tag:", xmlForSignature.match(/<infModal[^>]*>/)?.[0] || "(ausente)");
  // 480: QR Code obrigatório — ordem XSD: infMDFe, infMDFeSupl, Signature
  // (como na NF-e/CT-e). Fora da área do digest (Reference cobre só o
  // infMDFe), então pode entrar antes de assinar; a Signature é anexada depois.
  const chaveQr = xmlForSignature.match(/Id="MDFe(\d{44})"/)?.[1] || "";
  const qrCod = `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${chaveQr}&amp;tpAmb=${MDFE_TP_AMB}`;
  const xmlComQr = /<infMDFeSupl[\s>]/.test(xmlForSignature) || !/<\/infMDFe>\s*<\/MDFe>/.test(xmlForSignature)
    ? xmlForSignature
    : xmlForSignature.replace(/<\/infMDFe>\s*<\/MDFe>/, `</infMDFe><infMDFeSupl><qrCodMDFe>${qrCod}</qrCodMDFe></infMDFeSupl></MDFe>`);
  const xmlAss = signMdfXml(xmlComQr, pfx, senha);
  // Invariância: xmlAss segue direto ao envelope, sem replaces
  // pós-assinatura; sem xmlns redundante em <infModal>.
  const signedMdfXml = xmlAss;
  console.log("[mdf-debug] infMDFeSupl:", /<infMDFeSupl>/.test(signedMdfXml) ? "presente" : "AUSENTE");
  const referenceUri = signedMdfXml.match(/<Reference URI="([^"]+)"/)?.[1] || "";
  const signedXmlBytes = Buffer.byteLength(signedMdfXml, "utf8");
  console.log(`[mdf-debug] XML final assinado: ${signedXmlBytes} bytes UTF-8; infModal:`, xmlAss.match(/<infModal[^>]*>/)?.[0] || "(ausente)");
  console.log("[mdf-debug] Signature:", xmlAss.match(/<Signature[\s\S]*<\/Signature>/)?.[0] || "(não encontrado)");
  // D03/599: diagnóstico somente leitura; não altera o XML assinado.
  const wsAbre = [...xmlAss.matchAll(/<([^<>\s/][^<>]{0,40})>\s+</g)].map(m => m[1]);
  const wsFecha = [...xmlAss.matchAll(/>\s+<\/([^<>]+)>/g)].map(m => "/" + m[1]);
  console.log(`[mdf-debug] BUILD=${BUILD} ambiente=${MDFE_AMBIENTE} tpAmb=${MDFE_TP_AMB} reference=${referenceUri} c14n=${XML_INCLUSIVE_C14N} signedXmlUtf8Bytes=${signedXmlBytes} WS-check após-abertura=[${wsAbre.slice(0, 12).join(",")}] antes-fecho=[${wsFecha.slice(0, 12).join(",")}]`);
  // Sincrono (ACBr): mdfeDadosMsg = base64(gzip(<MDFe>...</MDFe>)) puro, sem enviMDFe/idLote.
  // signedMdfXml (com infMDFeSupl) segue intacto ao gzip/envelope.
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

// Recupera o protocolo de autorização via consulta (quando o registro
// local está sem protocolo, o cancelamento/encerramento o exige).
export async function protocoloDoMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente): Promise<string> {
  try {
    const cons = await consultarMdf(pfx, senha, chave, ambiente);
    return cons.xml?.match(/<nProt>(\d{15})<\/nProt>/)?.[1] || "";
  } catch { return ""; }
}

export async function consultarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente): Promise<{ cStat: string; xMotivo: string; xml?: string }> {  const ep = getMdfEndpoints(ambiente);
  const body = `<MDFeConsultaMsg xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta"><consSitMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><tpAmb>${MDFE_TP_AMB}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${chave}</chMDFe></consSitMDFe></MDFeConsultaMsg>`;
  const ret = await soapRequest(ep.mdfConsulta, body, "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta/MDFeConsulta", createSefazAgent(pfx, senha));
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { cStat, xMotivo, xml: ret };
}

export async function encerrarMdf(pfx: Buffer, senha: string, chave: string, ambiente: Ambiente, cnpj: string, uf: string, protocolo: string, cMun: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const dhEvento = `${agora.getUTCFullYear()}-${p2(agora.getUTCMonth() + 1)}-${p2(agora.getUTCDate())}T${p2(agora.getUTCHours())}:${p2(agora.getUTCMinutes())}:${p2(agora.getUTCSeconds())}-03:00`;
  const cOrgao = codigoUF(uf);
  const cnpjFmt = cnpj.replace(/\D/g, "").padStart(14, "0");
  let nProtFmt = String(protocolo || "").replace(/\D/g, "").padStart(15, "0");
  const cMunFmt = String(cMun || "").replace(/\D/g, "");
  if (!/^\d{14}$/.test(cnpjFmt)) throw new Error("CNPJ do emitente inválido para o evento de encerramento");
  if (/^0+$/.test(nProtFmt)) {
    nProtFmt = (await protocoloDoMdf(pfx, senha, chave, ambiente)).replace(/\D/g, "");
    if (nProtFmt) console.log("[mdf-debug] protocolo recuperado via consulta para encerrar");
  }
  if (!/^\d{15}$/.test(nProtFmt)) throw new Error("Protocolo de autorização não encontrado para encerrar o MDF-e");
  if (!/^\d{7}$/.test(cMunFmt)) throw new Error("Município de encerramento não encontrado no MDF-e");
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><infEvento Id="ID110112${chave}01"><cOrgao>${cOrgao}</cOrgao><tpAmb>${MDFE_TP_AMB}</tpAmb><CNPJ>${cnpjFmt}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110112</tpEvento><nSeqEvento>01</nSeqEvento><detEvento versaoEvento="3.00"><evEncMDFe><descEvento>Encerramento</descEvento><nProt>${nProtFmt}</nProt><dtEncerramento>${dhEvento.slice(0, 10)}</dtEncerramento><cMunEncerramento>${cMunFmt}</cMunEncerramento><UFEncerramento>${uf}</UFEncerramento></evEncMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  console.log("[mdf-debug] evento encerramento com Signature:", /<Signature[\s>]/.test(ass));
  // Todos os WS do MDF-e trafegam via mdfeDadosMsg (MOC DF-e).
  const nsEvt = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento";
  const cabec = `<mdfeCabecMsg xmlns="${nsEvt}"><cUF>${cOrgao}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg>`;
  const body = `<mdfeDadosMsg xmlns="${nsEvt}">${ass}</mdfeDadosMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, `${nsEvt}/mdfeRecepcaoEvento`, createSefazAgent(pfx, senha), cabec);
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}

export async function cancelarMdf(pfx: Buffer, senha: string, chave: string, justificativa: string, ambiente: Ambiente, cnpj: string, uf: string, protocolo: string): Promise<{ sucesso: boolean; cStat: string; xMotivo: string }> {
  const ep = getMdfEndpoints(ambiente);
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const dhEvento = `${agora.getUTCFullYear()}-${p2(agora.getUTCMonth() + 1)}-${p2(agora.getUTCDate())}T${p2(agora.getUTCHours())}:${p2(agora.getUTCMinutes())}:${p2(agora.getUTCSeconds())}-03:00`;
  const cOrgao = codigoUF(uf);
  const cnpjFmt = cnpj.replace(/\D/g, "").padStart(14, "0");
  let nProtFmt = String(protocolo || "").replace(/\D/g, "").padStart(15, "0");
  const xJustFmt = String(justificativa || "").trim().slice(0, 255);
  if (!/^\d{14}$/.test(cnpjFmt)) throw new Error("CNPJ do emitente inválido para o evento de cancelamento");
  if (/^0+$/.test(nProtFmt)) {
    nProtFmt = (await protocoloDoMdf(pfx, senha, chave, ambiente)).replace(/\D/g, "");
    if (nProtFmt) console.log("[mdf-debug] protocolo recuperado via consulta para cancelar");
  }
  if (!/^\d{15}$/.test(nProtFmt)) throw new Error("Protocolo de autorização não encontrado para cancelar o MDF-e");
  if (xJustFmt.length < 15) throw new Error("Justificativa do cancelamento deve ter ao menos 15 caracteres");
  const evento = `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00"><infEvento Id="ID110111${chave}01"><cOrgao>${cOrgao}</cOrgao><tpAmb>${MDFE_TP_AMB}</tpAmb><CNPJ>${cnpjFmt}</CNPJ><chMDFe>${chave}</chMDFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>01</nSeqEvento><detEvento versaoEvento="3.00"><evCancMDFe><descEvento>Cancelamento</descEvento><nProt>${nProtFmt}</nProt><xJust>${xJustFmt}</xJust></evCancMDFe></detEvento></infEvento></eventoMDFe>`;
  const ass = signXml(evento, pfx, senha);
  console.log("[mdf-debug] evento cancelamento com Signature:", /<Signature[\s>]/.test(ass));
  console.log("[mdf-debug] evento xml:", evento);
  // Todos os WS do MDF-e trafegam via mdfeDadosMsg (MOC DF-e).
  const nsEvt = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento";
  const cabec = `<mdfeCabecMsg xmlns="${nsEvt}"><cUF>${cOrgao}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg>`;
  const body = `<mdfeDadosMsg xmlns="${nsEvt}">${ass}</mdfeDadosMsg>`;
  const ret = await soapRequest(ep.mdfRecepcaoEvento, body, `${nsEvt}/mdfeRecepcaoEvento`, createSefazAgent(pfx, senha), cabec);
  const cStat = ret.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = ret.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  return { sucesso: cStat === "135" || cStat === "155", cStat, xMotivo };
}
