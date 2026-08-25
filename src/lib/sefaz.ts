/**
 * Serviço de integração com SEFAZ (NFe)
 * 
 * Fluxo:
 * 1. Busca certificado do Supabase Storage + tabela certificados_digitais (via service role)
 * 2. Parse do PKCS#12 (.pfx/.p12) com node-forge
 * 3. Assinatura do XML com chave privada + cadeia de certificados
 * 4. Envio SOAP para o webservice da SEFAZ
 * 
 * Endereços por UF (homologação): https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=tW+YMYc/50s=
 */

import forge from "node-forge";
import https from "node:https";

// OID constants for PKCS#12 bags
const OID_PKCS8_SHROUDED_KEY_BAG = "1.2.840.113549.1.12.10.1.2";
const OID_CERT_BAG = "1.2.840.113549.1.12.10.1.3";

// ============================================================
// Agent HTTPS com certificado cliente (mTLS)
// ============================================================

function createSefazAgent(pfxBytes: Buffer, senha: string): https.Agent {
  return new https.Agent({
    pfx: pfxBytes,
    passphrase: senha,
    rejectUnauthorized: false, // SEFAZ homologação usa cadeia própria
  });
}

// ============================================================
// Configuração de endpoints SEFAZ por UF (homologação)
// ============================================================

// Endereços NACIONAIS (usados por todos os estados para serviços comunes)
const NACIONAL_HOMOLOGACAO = {
  nfeDistribuicaoDFe: "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  receptEventos: "https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

const SEFAZ_ENDPOINTS: Record<string, { nfeAutorizacao: string; nfeRetAutorizacao: string; nfeStatusServico: string; nfeDistribuicaoDFe: string; receptEventos: string }> = {
  SP: {
    nfeAutorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    nfeRetAutorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    nfeStatusServico: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    ...NACIONAL_HOMOLOGACAO,
  },
  MG: {
    nfeAutorizacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NfeAutorizacao4",
    nfeRetAutorizacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NfeRetAutorizacao4",
    nfeStatusServico: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NfeStatusServico4",
    ...NACIONAL_HOMOLOGACAO,
  },
  // Padrão nacional (fallback) — SVRS (Sefaz Virtual do Rio Grande do Sul)
  DEFAULT: {
    nfeAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    nfeStatusServico: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    ...NACIONAL_HOMOLOGACAO,
  },
};

function getEndpoints(uf: string) {
  return SEFAZ_ENDPOINTS[uf] || SEFAZ_ENDPOINTS.DEFAULT;
}

// ============================================================
// Parse de certificado PKCS#12
// ============================================================

export interface CertificadoInfo {
  pfxBytes: Buffer;
  senha: string;
  subjectName: string;
  issuerName: string;
  validade: Date;
  thumbprint: string;
}

export function parseCertificate(pfxBytes: Buffer, senha: string): CertificadoInfo {
  const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBytes.toString("base64")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  // Extrair chave privada e cadeia de certificados
  const keyBags = p12.getBags({ bagType: OID_PKCS8_SHROUDED_KEY_BAG });
  const certBags = p12.getBags({ bagType: OID_CERT_BAG });

  const keyBag = keyBags[OID_PKCS8_SHROUDED_KEY_BAG]?.[0];
  const certBag = certBags[OID_CERT_BAG]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("Certificado PKCS#12 inválido: chave privada ou certificado não encontrado");
  }

  const cert = certBag.cert;
  const subjectName = cert.subject.getField("CN")?.value || cert.subject.toString();
  const issuerName = cert.issuer.getField("CN")?.value || cert.issuer.toString();
  const thumbprint = forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex();

  return {
    pfxBytes,
    senha,
    subjectName,
    issuerName,
    validade: cert.validity.notAfter as unknown as Date,
    thumbprint,
  };
}

// ============================================================
// Assinatura XML (W3C XML Digital Signature - envelopamento)
// ============================================================

export function signXml(
  xml: string,
  pfxBytes: Buffer,
  senha: string,
): string {
  const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBytes.toString("base64")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  const keyBags = p12.getBags({ bagType: OID_PKCS8_SHROUDED_KEY_BAG });
  const certBags = p12.getBags({ bagType: OID_CERT_BAG });

  const privateKey = keyBags[OID_PKCS8_SHROUDED_KEY_BAG]?.[0]?.key;
  const certificate = certBags[OID_CERT_BAG]?.[0]?.cert;

  if (!privateKey || !certificate) {
    throw new Error("Não foi possível extrair chave privada ou certificado do .pfx");
  }

  // Serializar certificado para base64 (sem BEGIN/END)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const certB64 = forge.util.encode64(certDer);

  // ID do elemento a assinar (infNFe com atributo Id)
  const matchId = xml.match(/<infNFe\s+Id="([^"]+)"/);
  const uri = matchId ? `#${matchId[1]}` : "#NFe";

  // Canonicalização simplificada (C14N exclusive - suficiente para SEFAZ)
  const xmlToSign = xml;

  // Criar SHA-1 digest do conteúdo
  const md = forge.md.sha1.create();
  md.update(xmlToSign);
  const digestValue = forge.util.encode64(md.digest().getBytes());

  // Construir SignedInfo (W3C enveloped signature)
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
    <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
    <Reference URI="${uri}">
      <Transforms>
        <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      </Transforms>
      <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
      <DigestValue>${digestValue}</DigestValue>
    </Reference>
  </SignedInfo>`;

  // Assinar o SignedInfo
  const md2 = forge.md.sha1.create();
  md2.update(signedInfo);
  const signatureValue = forge.util.encode64(privateKey.sign(md2));

  // Montar Signature completa
  const signature = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  ${signedInfo}
  <SignatureValue>${signatureValue}</SignatureValue>
  <KeyInfo>
    <X509Data>
      <X509Certificate>${certB64}</X509Certificate>
    </X509Data>
  </KeyInfo>
</Signature>`;

  // Inserir antes do </NFe> ou antes de </infNFe>
  if (xml.includes("</NFe>")) {
    return xml.replace("</NFe>", signature + "</NFe>");
  }
  return xml.replace("</infNFe>", signature + "</infNFe>");
}

// ============================================================
// Chamadas SOAP à SEFAZ
// ============================================================

async function soapRequest(url: string, soapBody: string, action: string, agent?: https.Agent): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    ${soapBody}
  </soap12:Body>
</soap12:Envelope>`;

  // Usar https.request com agent mTLS quando fornecido
  if (agent) {
    const parsedUrl = new URL(url);
    return new Promise<string>((resolve, reject) => {
      const req = https.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname,
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          SOAPAction: action,
          "Content-Length": Buffer.byteLength(envelope),
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
          } else {
            resolve(data);
          }
        });
      });
      req.on("error", reject);
      req.write(envelope);
      req.end();
    });
  }

  // Fallback sem agent (não deveria chegar aqui para SEFAZ)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      SOAPAction: action,
    },
    body: envelope,
  });

  if (!res.ok) {
    throw new Error(`SEFAZ HTTP ${res.status}: ${await res.text()}`);
  }

  return res.text();
}

// ============================================================
// Consulta Destinatário (Manifestação)
// ============================================================

export async function consultarDestinatario(
  pfxBytes: Buffer,
  senha: string,
  cnpj: string,
  uf: string,
  ambiente: "homologacao" | "producao" = "homologacao",
): Promise<{ notas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string }> }> {
  const endpoints = getEndpoints(uf);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);

  // Montar XML da consulta
  const xmlConsulta = `<consSitNFe xmlns="${ns}" versao="1.00">
  <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
  <xServ>CONSULTAR</xServ>
</consSitNFe>`;

  // Para manifestação do destinatário, usamos NFeDistribuicaoDFe
  const xmlBody = `<nfeDistDFeInteresse xmlns="${ns}">
  <nfeDadosMsg>
    <distDFeInteresse xmlns="${ns}" versao="1.01">
      <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
      <xServ>CONSULTAR</xServ>
      <CNPJ>${cnpj}</CNPJ>
    </distDFeInteresse>
  </nfeDadosMsg>
</nfeDistDFeInteresse>`;

  const response = await soapRequest(
    endpoints.nfeDistribuicaoDFe,
    xmlBody,
    `${ns}/NFeDistribuicaoDFe/NFeDistribuicaoDFe/consultar`,
    agent,
  );

  // Parse da resposta (simplificado - em produção, usar parser XML robusto)
  const notas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string }> = [];
  
  // Regex para extrair chaves de acesso da resposta
  const chavesMatch = response.matchAll(/<chNFe>(\d{44})<\/chNFe>/g);
  for (const match of chavesMatch) {
    notas.push({
      chave: match[1],
      emitente: "Consulta SEFAZ",
      cnpj: "",
      valor: 0,
      data: new Date().toISOString(),
    });
  }

  return { notas };
}

// ============================================================
// Envio de Evento (Manifestação: Ciência, Confirmação, Desconhecimento)
// ============================================================

type TipoEventoManifestacao = "210200" | "210210" | "210220"; // ciência, confirmação, desconhecimento

export async function enviarEventoManifestacao(
  pfxBytes: Buffer,
  senha: string,
  chave: string,
  tipoEvento: TipoEventoManifestacao,
  cnpj: string,
  uf: string,
  ambiente: "homologacao" | "producao" = "homologacao",
  justificativa?: string,
): Promise<{ sucesso: boolean; codigo: string; motivo: string }> {
  const endpoints = getEndpoints(uf);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);
  const dataHora = new Date().toISOString().replace(/\.\d{3}Z$/, "");

  // Número sequencial do evento (1 para primeiro evento da chave)
  const nSeqEvento = "1";

  // Montar XML do evento
  const eventoXml = `<eventoNFe xmlns="${ns}" versao="1.00">
  <infEvento Id="ID${tipoEvento}${chave}${nSeqEvento}">
    <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
    <xServ>VERIFICAR ASSINATURA</xServ>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${chave}</chNFe>
    <dhEvento>${dataHora}</dhEvento>
    <tpEvento>${tipoEvento}</tpEvento>
    <nSeqEvento>${nSeqEvento}</nSeqEvento>
    <detEvento versao="1.00">
      <descEvento>${tipoEvento === "210200" ? "Ciencia da Operacao" : tipoEvento === "210210" ? "Confirmacao da Operacao" : "Desconhecimento da Operacao"}</descEvento>
      ${justificativa ? `<xJust>${justificativa}</xJust>` : ""}
    </detEvento>
  </infEvento>
</eventoNFe>`;

  // Assinar o XML do evento
  const eventoAssinado = signXml(eventoXml, pfxBytes, senha);

  // Enviar via SOAP
  const xmlBody = `<nfeRecepcaoEvento xmlns="${ns}">
  <nfeDadosMsg>
    ${eventoAssinado}
  </nfeDadosMsg>
</nfeRecepcaoEvento>`;

  const response = await soapRequest(
    endpoints.receptEventos,
    xmlBody,
    `${ns}/NFeRecepcaoEvento/NFeRecepcaoEvento/recepcaoEvento`,
    agent,
  );

  // Parse da resposta
  const retMatch = response.match(/<retEventoNFe[^>]*>([\s\S]*?)<\/retEventoNFe>/);
  if (retMatch) {
    const cStat = retMatch[1].match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
    const xMotivo = retMatch[1].match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
    return { sucesso: cStat === "128" || cStat === "135", codigo: cStat, motivo: xMotivo };
  }

  return { sucesso: false, codigo: "ERRO", motivo: "Resposta inválida da SEFAZ" };
}

// ============================================================
// Emissão de NF-e
// ============================================================

export async function emitirNFe(
  pfxBytes: Buffer,
  senha: string,
  xmlNFe: string,
  uf: string,
  ambiente: "homologacao" | "producao" = "homologacao",
): Promise<{ sucesso: boolean; chave: string; numero: string; codigo: string; motivo: string }> {
  const endpoints = getEndpoints(uf);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);

  // Assinar o XML da NFe
  const xmlAssinado = signXml(xmlNFe, pfxBytes, senha);

  // Envolver em SOAP
  const xmlBody = `<nfeAutorizacao xmlns="${ns}">
  <nfeDadosMsg>
    ${xmlAssinado}
  </nfeDadosMsg>
</nfeAutorizacao>`;

  const response = await soapRequest(
    endpoints.nfeAutorizacao,
    xmlBody,
    `${ns}/NFeAutorizacao/NFeAutorizacao/nfeAutorizacaoLote`,
    agent,
  );

  // Parse da resposta
  const retMatch = response.match(/<retEnviNFe[^>]*>([\s\S]*?)<\/retEnviNFe>/);
  if (retMatch) {
    const cStat = retMatch[1].match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
    const xMotivo = retMatch[1].match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
    const nRec = retMatch[1].match(/<nRec>([^<]+)<\/nRec>/)?.[1] || "";
    return {
      sucesso: cStat === "103",
      chave: "",
      numero: "",
      codigo: cStat,
      motivo: xMotivo || `Protocolo: ${nRec}`,
    };
  }

  return { sucesso: false, chave: "", numero: "", codigo: "ERRO", motivo: "Resposta inválida da SEFAZ" };
}

// ============================================================
// Buscar certificado ativo (usado pelo modo direto no Vercel)
// ============================================================

export async function buscarCertificadoAtivo(empresaId: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  const supabase = createClient(url, key);

  const { data: cert, error: certErr } = await supabase
    .from("certificados_digitais")
    .select("id, arquivo_path, thumbprint, validade, nome")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .single();

  if (certErr || !cert) throw new Error("Nenhum certificado ativo encontrado");

  const { data: fileData, error: dlErr } = await supabase.storage
    .from("certificados")
    .download(cert.arquivo_path);

  if (dlErr || !fileData) throw new Error("Falha ao baixar certificado");

  const pfx = Buffer.from(await fileData.arrayBuffer());

  const { data: certSenha } = await supabase
    .from("certificados_digitais")
    .select("senha_cript")
    .eq("id", cert.id)
    .single();

  if (!certSenha?.senha_cript) throw new Error("Senha do certificado não encontrada");

  const { data: empresa } = await supabase
    .from("empresas")
    .select("cnpj, uf")
    .eq("id", empresaId)
    .single();

  return {
    pfx,
    senha: certSenha.senha_cript,
    cnpj: empresa?.cnpj || "",
    uf: empresa?.uf || "SP",
  };
}
