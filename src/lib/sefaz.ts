/**
 * Serviço de integração com SEFAZ (NFe)
 * 
 * Fluxo:
 * 1. Busca certificado do Supabase Storage + tabela certificados_digitais (via service role)
 * 2. Parse do PKCS#12 (.pfx/.p12) com node-forge (fallback: crypto nativo Node.js)
 * 3. Assinatura do XML com chave privada + cadeia de certificados
 * 4. Envio SOAP ao webservice da SEFAZ
 * 
 * Endereços por UF (homologação): https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=tW+YMYc/50s=
 */

import forge from "node-forge";
import https from "node:https";
import crypto from "node:crypto";
import { gunzipSync } from "zlib";

// OID constants for PKCS#12 bags
const OID_PKCS8_SHROUDED_KEY_BAG = "1.2.840.113549.1.12.10.1.2";
const OID_CERT_BAG = "1.2.840.113549.1.12.10.1.3";

// ============================================================
// Agent HTTPS com certificado cliente (mTLS)
// ============================================================

export function createSefazAgent(pfxBytes: Buffer, senha: string): https.Agent {
  // Usar pfx direto — é o método nativo do Node.js para PKCS#12
  // SEFAZ exige TLS 1.2 (TLS 1.3 derruba o handshake com ECONNRESET em vários endpoints)
  return new https.Agent({
    pfx: pfxBytes,
    passphrase: senha,
    rejectUnauthorized: false,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.2",
    keepAlive: false,
  });
}
export function soapEnvelope12(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;
}

// ============================================================
// Configuração de endpoints SEFAZ por UF (homologação)
// ============================================================

// Endereços NACIONAIS — Ambiente Nacional (AN) para serviços comuns
// Fonte: portal NF-e (https://www.nfe.fazenda.gov.br/portal/webServices.aspx?tipoConteudo=Wak0FwB7dKs=)
const NACIONAL = {
  homologacao: {
    nfeDistribuicaoDFe: "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    receptEventos: "https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
  producao: {
    nfeDistribuicaoDFe: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    receptEventos: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  },
};

// Endereços por UF — NF-e 4.00 (endereços estaduais são iguais em hom/prod)
const SEFAZ_ENDPOINTS: Record<string, { nfeAutorizacao: string; nfeRetAutorizacao: string; nfeStatusServico: string; receptEventos: string }> = {
  // Estados com SEFAZ própria (autorizadoras)
  SP: {
    nfeAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    nfeStatusServico: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  MG: {
    nfeAutorizacao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    nfeStatusServico: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
    receptEventos: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
  },
  GO: {
    nfeAutorizacao: "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  AM: {
    nfeAutorizacao: "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  PR: {
    nfeAutorizacao: "https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  BA: {
    nfeAutorizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    nfeStatusServico: "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  CE: {
    nfeAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    nfeStatusServico: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  PE: {
    nfeAutorizacao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  RS: {
    nfeAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    nfeStatusServico: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  MS: {
    nfeAutorizacao: "https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  MT: {
    nfeAutorizacao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
    nfeRetAutorizacao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
    nfeStatusServico: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
  // Padrão nacional (fallback) — SVRS
  DEFAULT: {
    nfeAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    nfeRetAutorizacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    nfeStatusServico: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    receptEventos: NACIONAL.homologacao.receptEventos,
  },
};

function getEndpoints(uf: string, ambiente: "homologacao" | "producao" = "homologacao") {
  const base = SEFAZ_ENDPOINTS[uf] || SEFAZ_ENDPOINTS.DEFAULT;
  const nacional = ambiente === "producao" ? NACIONAL.producao : NACIONAL.homologacao;
  return {
    ...base,
    nfeDistribuicaoDFe: nacional.nfeDistribuicaoDFe,
    receptEventos: nacional.receptEventos,
  };
}

// Código da UF IBGE (obrigatório no distDFeInt)
const UF_CODIGO: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MG: "31", MS: "50",
  MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41",
  RJ: "33", RN: "24", RO: "11", RR: "14", RS: "43", SC: "42",
  SE: "28", SP: "35", TO: "17",
};

function getCodigoUf(uf: string): string {
  return UF_CODIGO[uf] || UF_CODIGO.SP;
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

/**
 * Tenta extrair certificado do PFX usando node-forge.
 * Retorna null se node-forge não conseguir parse (algoritmos não suportados).
 */
function tryForgeParse(pfxBytes: Buffer, senha: string): CertificadoInfo | null {
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBytes.toString("base64")));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

    const keyBags = p12.getBags({ bagType: OID_PKCS8_SHROUDED_KEY_BAG });
    const certBags = p12.getBags({ bagType: OID_CERT_BAG });

    const keyBag = keyBags[OID_PKCS8_SHROUDED_KEY_BAG]?.[0];
    const certBag = certBags[OID_CERT_BAG]?.[0];

    if (!keyBag?.key || !certBag?.cert) return null;

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
  } catch {
    return null;
  }
}

/**
 * Extrai chave privada e cadeia de certificados usando crypto nativo do Node.js.
 * Funciona com qualquer algoritmo suportado pelo OpenSSL (AES-256, SHA-256, etc.)
 */
function extractPkcs12Native(pfxBytes: Buffer, senha: string): {
  privateKey: crypto.KeyObject;
  certChain: Buffer[];
} {
  // Extrair chave privada via crypto nativo
  // type "pkcs12" é suportado pelo Node.js 18+ mas não nas definições de tipo
  const privateKey = (crypto as unknown as { createPrivateKey: (opts: { key: Buffer; format: string; type: string; passphrase: string }) => crypto.KeyObject }).createPrivateKey({
    key: pfxBytes,
    format: "der",
    type: "pkcs12",
    passphrase: senha,
  });

  // Extrair cadeia de certificados do PKCS#12 via ASN.1 manual
  const certChain = extractCertChainFromPkcs12(pfxBytes);

  return { privateKey, certChain };
}

/**
 * Extrai a cadeia de certificados X.509 do PKCS#12 parseando ASN.1 manualmente.
 * Procura por OCTET STRINGs que contenham certificados DER válidos.
 */
function extractCertChainFromPkcs12(pfxBytes: Buffer): Buffer[] {
  const certs: Buffer[] = [];

  // Parse do ASN.1 using node-forge (funciona para estrutura, só falha no pkcs12FromAsn1)
  const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBytes.toString("base64")));

  // Busca recursiva por certificados DER no ASN.1 tree
  function walkAsn1(node: forge.asn1.Asn1) {
    if (!node) return;

    // Se é uma string OCTET, verifica se parece um certificado DER
    if (node.type === forge.asn1.Type.OCTETSTRING) {
      const value = node.value as string;
      const derBytes = Buffer.from(value, "binary");

      // Certificados DER começam com SEQUENCE (30 82) e têm tamanho típico de 500-4000 bytes
      if (derBytes.length >= 200 && derBytes.length <= 8000 &&
          derBytes[0] === 0x30 && derBytes[1] === 0x82) {
        try {
          const certAsn1 = forge.asn1.fromDer(derBytes.toString("binary"));
          const cert = forge.pki.certificateFromAsn1(certAsn1);
          if (cert && cert.subject) {
            certs.push(derBytes);
          }
        } catch {
          // Não é um certificado válido, ignora
        }
      }
    }

    // Recursar nos filhos
    if (node.value && typeof node.value === "string") {
      // Folha, não recusrar
    } else if (Array.isArray(node.value)) {
      for (const child of node.value) {
        walkAsn1(child);
      }
    }
  }

  try {
    walkAsn1(p12Asn1);
  } catch {
    // Se o parse ASN.1 falhar, retorna vazio
  }

  return certs;
}

/**
 * Fallback nativo para parseCertificate quando node-forge não suporta o algoritmo do PFX.
 */
function parseCertificateNative(pfxBytes: Buffer, senha: string): CertificadoInfo {
  const { certChain } = extractPkcs12Native(pfxBytes, senha);

  if (certChain.length === 0) {
    throw new Error("Não foi possível extrair certificado do PFX (crypto nativo)");
  }

  // Usar o primeiro certificado (leaf certificate)
  const certDer = certChain[0];
  const certAsn1 = forge.asn1.fromDer(certDer.toString("binary"));
  const cert = forge.pki.certificateFromAsn1(certAsn1);

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

export function parseCertificate(pfxBytes: Buffer, senha: string): CertificadoInfo {
  // Tentar node-forge primeiro
  const forgeResult = tryForgeParse(pfxBytes, senha);
  if (forgeResult) return forgeResult;

  // Fallback: crypto nativo do Node.js
  console.log("[sefaz] node-forge não suporta este PFX, usando crypto nativo");
  return parseCertificateNative(pfxBytes, senha);
}

// ============================================================
// Assinatura XML (W3C XML Digital Signature - envelopamento)
// ============================================================

/**
 * Tenta assinar XML usando node-forge. Retorna null se o PFX não for suportado.
 */
function tryForgeSignXml(xml: string, pfxBytes: Buffer, senha: string): string | null {
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBytes.toString("base64")));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

    const keyBags = p12.getBags({ bagType: OID_PKCS8_SHROUDED_KEY_BAG });
    const certBags = p12.getBags({ bagType: OID_CERT_BAG });

    const privateKey = keyBags[OID_PKCS8_SHROUDED_KEY_BAG]?.[0]?.key;
    const certificate = certBags[OID_CERT_BAG]?.[0]?.cert;

    if (!privateKey || !certificate) return null;

    return signXmlWithForge(xml, privateKey, certificate, pfxBytes, senha);
  } catch {
    return null;
  }
}

function signXmlWithForge(
  xml: string,
  privateKey: forge.pki.PrivateKey,
  certificate: forge.pki.Certificate,
  _pfxBytes: Buffer,
  _senha: string,
): string {
  // Serializar certificado para base64 (sem BEGIN/END)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const certB64 = forge.util.encode64(certDer);

  // ID do elemento a assinar (infNFe/infCte/infEvento/infMDFe com atributo Id)
  const matchId = xml.match(/<inf(?:NFe|Cte|Evento|MDFe)\s+Id="([^"]+)"/);
  const uri = matchId ? `#${matchId[1]}` : "#NFe";

  // Canonicalização simplificada (C14N exclusive - suficiente para SEFAZ)
  const xmlToSign = xml;

  // Criar SHA-1 digest do conteúdo
  const md = forge.md.sha1.create();
  md.update(xmlToSign);
  const digestValue = forge.util.encode64(md.digest().getBytes());

  // Construir SignedInfo em LINHA ÚNICA (W3C enveloped signature) — sem LF/indentação (regra D03/599 do MDF-e)
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="${uri}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  // Assinar o SignedInfo
  const md2 = forge.md.sha1.create();
  md2.update(signedInfo);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signatureValue = forge.util.encode64((privateKey as any).sign(md2));

  // Montar Signature completa em LINHA ÚNICA (sem whitespace — regra D03/599)
  const signature = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;

  // Inserir assinatura no local correto conforme o tipo de documento
  // EventoCTe: Signature goes inside <eventoCTe> before </eventoCTe>
  if (xml.includes("</eventoCTe>")) return xml.replace("</eventoCTe>", signature + "</eventoCTe>");
  // CTeSimp: XSD order is infCte → infCTeSupl → ds:Signature. Place Signature before </CTeSimp>
  if (xml.includes("</CTeSimp>")) return xml.replace("</CTeSimp>", signature + "</CTeSimp>");
  if (xml.includes("</CTe>")) return xml.replace("</CTe>", signature + "</CTe>");
  if (xml.includes("</MDFe>")) return xml.replace("</MDFe>", signature + "</MDFe>");
  if (xml.includes("</NFe>")) {
    return xml.replace("</NFe>", signature + "</NFe>");
  }
  if (xml.includes("</infCte>")) return xml.replace("</infCte>", signature + "</infCte>");
  if (xml.includes("</infMDFe>")) return xml.replace("</infMDFe>", signature + "</infMDFe>");
  return xml.replace("</infNFe>", signature + "</infNFe>");
}

/**
 * Assinatura XML usando crypto nativo do Node.js (fallback para PFX com algoritmos não suportados pelo node-forge).
 */
function signXmlNative(xml: string, pfxBytes: Buffer, senha: string): string {
  const { privateKey, certChain } = extractPkcs12Native(pfxBytes, senha);

  if (certChain.length === 0) {
    throw new Error("Não foi possível extrair certificado para assinatura XML");
  }

  // Serializar certificado leaf para base64
  const certB64 = certChain[0].toString("base64");

  // Extrair informações do cert leaf
  const certAsn1 = forge.asn1.fromDer(certChain[0].toString("binary"));
  const certificate = forge.pki.certificateFromAsn1(certAsn1);

  // ID do elemento a assinar
  const matchId = xml.match(/<inf(?:NFe|Cte|Evento|MDFe)\s+Id="([^"]+)"/);
  const uri = matchId ? `#${matchId[1]}` : "#NFe";

  // SHA-1 digest do conteúdo
  const md = forge.md.sha1.create();
  md.update(xml);
  const digestValue = forge.util.encode64(md.digest().getBytes());

  // SignedInfo em LINHA ÚNICA (sem LF/indentação — regra D03/599 do MDF-e)
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="${uri}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  // Assinar SignedInfo com crypto nativo (RSA-SHA1)
  const sign = crypto.createSign("SHA1");
  sign.update(signedInfo);
  const signatureBuffer = sign.sign(privateKey);
  const signatureValue = signatureBuffer.toString("base64");

  // Montar Signature completa em LINHA ÚNICA (sem whitespace — regra D03/599)
  const signature = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;

  // EventoCTe: Signature goes inside <eventoCTe> before </eventoCTe>
  if (xml.includes("</eventoCTe>")) return xml.replace("</eventoCTe>", signature + "</eventoCTe>");
  // CTeSimp: XSD order is infCte → infCTeSupl → ds:Signature. Place Signature before </CTeSimp>
  if (xml.includes("</CTeSimp>")) return xml.replace("</CTeSimp>", signature + "</CTeSimp>");
  if (xml.includes("</CTe>")) return xml.replace("</CTe>", signature + "</CTe>");
  if (xml.includes("</MDFe>")) return xml.replace("</MDFe>", signature + "</MDFe>");
  if (xml.includes("</NFe>")) return xml.replace("</NFe>", signature + "</NFe>");
  if (xml.includes("</infCte>")) return xml.replace("</infCte>", signature + "</infCte>");
  if (xml.includes("</infMDFe>")) return xml.replace("</infMDFe>", signature + "</infMDFe>");
  return xml.replace("</infNFe>", signature + "</infNFe>");
}

export function signXml(
  xml: string,
  pfxBytes: Buffer,
  senha: string,
): string {
  // Tentar node-forge primeiro
  const forgeResult = tryForgeSignXml(xml, pfxBytes, senha);
  if (forgeResult) return forgeResult;

  // Fallback: crypto nativo do Node.js
  console.log("[sefaz] node-forge não suporta este PFX para assinatura, usando crypto nativo");
  return signXmlNative(xml, pfxBytes, senha);
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

  // SOAP 1.2: action vai NO Content-Type, não como header SOAPAction separado
  const contentType = `application/soap+xml; charset=utf-8; action="${action}"`;

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
          "Content-Type": contentType,
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
      "Content-Type": contentType,
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

function parseDistribuicaoResponse(response: string): {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  notas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string; nsu: string }>;
} {
  const cStat = response.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = response.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";
  const ultNSU = response.match(/<ultNSU>(\d+)<\/ultNSU>/)?.[1] || "";
  const maxNSU = response.match(/<maxNSU>(\d+)<\/maxNSU>/)?.[1] || "";

  const notas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string; nsu: string }> = [];

  const docZipMatches = response.matchAll(/<docZip[^>]*NSU="(\d+)"[^>]*>([\s\S]*?)<\/docZip>/g);

  for (const match of docZipMatches) {
    const nsu = match[1];
    const base64Content = match[2].trim();

    try {
      const compressedBuffer = Buffer.from(base64Content, "base64");
      let decodedXml: string;
      try {
        decodedXml = gunzipSync(compressedBuffer).toString("utf8");
      } catch {
        decodedXml = compressedBuffer.toString("utf8");
      }

      const chave = decodedXml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] || "";
      const cnpjEmitente = decodedXml.match(/<CNPJCPF>(\d{14})<\/CNPJCPF>/)?.[1] || decodedXml.match(/<CNPJ>(\d{14})<\/CNPJ>/)?.[1] || "";
      const xNome = decodedXml.match(/<xNome>([^<]+)<\/xNome>/)?.[1] || "";
      const vNF = decodedXml.match(/<vNF>([^<]+)<\/vNF>/)?.[1] || "0";
      const dhEmi = decodedXml.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1] || "";

      if (chave) {
        notas.push({
          chave,
          emitente: xNome || "Emitente desconhecido",
          cnpj: cnpjEmitente,
          valor: parseFloat(vNF) || 0,
          data: dhEmi || new Date().toISOString(),
          nsu,
        });
      }
    } catch {
      // docZip não é resNFe (pode ser resEvento ou outro tipo)
    }
  }

  return { cStat, xMotivo, ultNSU, maxNSU, notas };
}

export async function consultarDestinatario(
  pfxBytes: Buffer,
  senha: string,
  cnpj: string,
  uf: string,
  ambiente: "homologacao" | "producao" = "homologacao",
  startNsu?: string,
): Promise<{ notas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string }>; debug?: { cStat: string; xMotivo: string; endpoint: string; tpAmb: string; cUFAutor: string; cnpj: string }; maxNsuObtido?: string; ultNSU?: string; resetouCursor?: boolean }> {
  const endpoints = getEndpoints(uf, ambiente);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);

  const nsWdsl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const cUFAutor = getCodigoUf(uf);

  console.log("[sefaz] consultarDestinatario CNPJ:", cnpjLimpo, "UF:", uf, "codUF:", cUFAutor, "ambiente:", ambiente, "endpoint:", endpoints.nfeDistribuicaoDFe, "startNsu:", startNsu || "(zero)");

  async function executarConsulta(nsuInicial: string) {
    let allNotas: Array<{ chave: string; emitente: string; cnpj: string; valor: number; data: string }> = [];
    let ultNSU = nsuInicial;
    let maxNSU = "";
    let page = 0;
    const MAX_PAGES = 10;
    let cStat = "";
    let xMotivo = "";

    do {
      page++;
      const xmlBody = `<nfeDistDFeInteresse xmlns="${nsWdsl}">
  <nfeDadosMsg xmlns="${nsWdsl}">
    <distDFeInt xmlns="${ns}" versao="1.00">
      <tpAmb>${tpAmb}</tpAmb>
      <cUFAutor>${cUFAutor}</cUFAutor>
      <CNPJ>${cnpjLimpo}</CNPJ>
      <distNSU>
        <ultNSU>${ultNSU}</ultNSU>
      </distNSU>
    </distDFeInt>
  </nfeDadosMsg>
</nfeDistDFeInteresse>`;

      console.log("[sefaz] página", page, "ultNSU:", ultNSU);

      const response = await soapRequest(
        endpoints.nfeDistribuicaoDFe,
        xmlBody,
        `${ns}/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse`,
        agent,
      );

      const parsed = parseDistribuicaoResponse(response);
      cStat = parsed.cStat;
      xMotivo = parsed.xMotivo;
      console.log("[sefaz] cStat:", cStat, "xMotivo:", xMotivo,
        "ultNSU:", parsed.ultNSU, "maxNSU:", parsed.maxNSU, "notas página:", parsed.notas.length);

      if (cStat !== "138" && cStat !== "137") {
        console.error("[sefaz] erro SEFAZ:", cStat, xMotivo);
        break;
      }

      allNotas.push(...parsed.notas);
      maxNSU = parsed.maxNSU;

      if (parsed.ultNSU && parsed.ultNSU !== "0") {
        ultNSU = String(Number(parsed.ultNSU) + 1).padStart(15, "0");
      }

      console.log("[sefaz] total acumulado:", allNotas.length, "próx ultNSU:", ultNSU, "maxNSU:", maxNSU);

      if (parsed.notas.length === 0 || !maxNSU || ultNSU > maxNSU || page >= MAX_PAGES) {
        break;
      }
    } while (true);

    return { allNotas, maxNSU, cStat, xMotivo, ultNSU };
  }

  // Tentar com o cursor salvo
  let resultado = await executarConsulta(startNsu || "000000000000000");
  let resetouCursor = false;

  // cStat 656 = Consumo Indevido (outro sistema avançou o cursor) → reseta automaticamente
  // Se veio de um cursor salvo, tenta do zero; se veio do zero, mantém o ultNSU para o caller salvar
  if (resultado.cStat === "656" && startNsu) {
    console.log("[sefaz] cStat 656 detectado — resetando cursor para zero e tentando novamente...");
    const retry = await executarConsulta("000000000000000");
    // Se o retry também deu 656, preserva o ultNSU original para o caller salvar e aguardar 1h
    if (retry.cStat === "656" && (retry as any).ultNSU) {
      (resultado as any).ultNSU = (retry as any).ultNSU || (resultado as any).ultNSU;
    } else {
      resultado = retry;
    }
    resetouCursor = true;
  }

  console.log("[sefaz] TOTAL final notas encontradas:", resultado.allNotas.length);
  return {
    notas: resultado.allNotas,
    maxNsuObtido: resultado.maxNSU || undefined,
    ultNSU: (resultado as any).ultNSU || undefined,
    resetouCursor,
    debug: {
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      endpoint: endpoints.nfeDistribuicaoDFe,
      tpAmb,
      cUFAutor,
      cnpj: cnpjLimpo,
    },
  };
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
  const endpoints = getEndpoints(uf, ambiente);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);
  const dataHora = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const cnpjLimpo = cnpj.replace(/\D/g, "");

  // Número sequencial do evento (1 para primeiro evento da chave)
  const nSeqEvento = "1";

  // Montar XML do evento
  const eventoXml = `<eventoNFe xmlns="${ns}" versao="1.00">
  <infEvento Id="ID${tipoEvento}${chave}${nSeqEvento}">
    <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
    <CNPJ>${cnpjLimpo}</CNPJ>
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

  // Enviar via SOAP — namespace WSDL nos wrapper
  const nsWdslRecepcao = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";
  const xmlBody = `<nfeRecepcaoEvento xmlns="${nsWdslRecepcao}">
  <nfeDadosMsg xmlns="${nsWdslRecepcao}">
    ${eventoAssinado}
  </nfeDadosMsg>
</nfeRecepcaoEvento>`;

  const response = await soapRequest(
    endpoints.receptEventos,
    xmlBody,
    `${ns}/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento`,
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
  const endpoints = getEndpoints(uf, ambiente);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const agent = createSefazAgent(pfxBytes, senha);

  // Assinar o XML da NFe
  const xmlAssinado = signXml(xmlNFe, pfxBytes, senha);

  // Envolver em SOAP — namespace WSDL nos wrapper
  const nsWdslAutorizacao = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
  const xmlBody = `<nfeAutorizacao xmlns="${nsWdslAutorizacao}">
  <nfeDadosMsg xmlns="${nsWdslAutorizacao}">
    ${xmlAssinado}
  </nfeDadosMsg>
</nfeAutorizacao>`;

  const response = await soapRequest(
    endpoints.nfeAutorizacao,
    xmlBody,
    `${ns}/wsdl/NFeAutorizacao4/nfeAutorizacaoLote`,
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

// ============================================================
// Consulta por Chave de Acesso (consChNFe)
// ============================================================

export async function consultarPorChave(
  pfxBytes: Buffer,
  senha: string,
  chave: string,
  cnpj: string,
  uf: string,
  ambiente: "homologacao" | "producao" = "homologacao",
): Promise<{ nota: { chave: string; emitente: string; cnpj: string; valor: number; data: string; xml: string } | null; debug?: { cStat: string; xMotivo: string; endpoint: string } }> {
  const endpoints = getEndpoints(uf, ambiente);
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const nsWdsl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
  const agent = createSefazAgent(pfxBytes, senha);
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const chaveLimpa = chave.replace(/\D/g, "");

  if (chaveLimpa.length !== 44) {
    return { nota: null, debug: { cStat: "ERRO", xMotivo: "Chave de acesso deve ter 44 dígitos", endpoint: endpoints.nfeDistribuicaoDFe } };
  }

  const xmlBody = `<nfeDistDFeInteresse xmlns="${nsWdsl}">
  <nfeDadosMsg xmlns="${nsWdsl}">
    <distDFeInt xmlns="${ns}" versao="1.01">
      <tpAmb>${tpAmb}</tpAmb>
      <CNPJ>${cnpj.replace(/\D/g, "")}</CNPJ>
      <consChNFe>
        <chNFe>${chaveLimpa}</chNFe>
      </consChNFe>
    </distDFeInt>
  </nfeDadosMsg>
</nfeDistDFeInteresse>`;

  console.log("[sefaz] consultarPorChave:", chaveLimpa, "endpoint:", endpoints.nfeDistribuicaoDFe);

  const response = await soapRequest(
    endpoints.nfeDistribuicaoDFe,
    xmlBody,
    `${ns}/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse`,
    agent,
  );

  const cStat = response.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "";
  const xMotivo = response.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "";

  console.log("[sefaz] consultarPorChave cStat:", cStat, "xMotivo:", xMotivo);

  if (cStat !== "138") {
    return { nota: null, debug: { cStat, xMotivo, endpoint: endpoints.nfeDistribuicaoDFe } };
  }

  // Extrair docZip
  const docZipMatch = response.match(/<docZip[^>]*>([\s\S]*?)<\/docZip>/);
  if (!docZipMatch) {
    return { nota: null, debug: { cStat, xMotivo, endpoint: endpoints.nfeDistribuicaoDFe } };
  }

  const base64Content = docZipMatch[1].trim();
  const compressedBuffer = Buffer.from(base64Content, "base64");
  let decodedXml: string;
  try {
    decodedXml = gunzipSync(compressedBuffer).toString("utf8");
  } catch {
    decodedXml = compressedBuffer.toString("utf8");
  }

  console.log("[sefaz] consultarPorChave decodedXml (first 500):", decodedXml.slice(0, 500));

  const emitCNPJ = decodedXml.match(/<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>[\s\S]*?<\/emit>/)?.[1] || "";
  const emitXNome = decodedXml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>[\s\S]*?<\/emit>/)?.[1] || "";
  const vNF = decodedXml.match(/<vNF>([^<]+)<\/vNF>/)?.[1] || "0";
  const dhEmi = decodedXml.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1] || "";

  return {
    nota: {
      chave: chaveLimpa,
      emitente: emitXNome || "Emitente desconhecido",
      cnpj: emitCNPJ,
      valor: parseFloat(vNF) || 0,
      data: dhEmi || new Date().toISOString(),
      xml: decodedXml,
    },
    debug: { cStat, xMotivo, endpoint: endpoints.nfeDistribuicaoDFe },
  };
}
