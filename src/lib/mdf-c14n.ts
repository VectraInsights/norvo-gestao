/**
 * Canonicalização C14N 1.0 Inclusivo para MDF-e
 * http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 */

import { DOMParser } from "@xmldom/xmldom";

const MDFE_XML_NAMESPACE = "http://www.portalfiscal.inf.br/mdfe";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

function escapeC14nText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function escapeC14nAttribute(value: string): string {
  return escapeC14nText(value)
    .replace(/"/g, "\"")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

function compareAttributes(a: Attr, b: Attr): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function canonicalizeMdfInfMdfInclusive(node: Element): string {
  const render = (current: Element | Text | CDATASection | Comment): string => {
    const nodeType = current.nodeType;

    if (nodeType === 3 || nodeType === 4) {
      return escapeC14nText((current as Text).nodeValue || "");
    }
    if (nodeType === 8) return "";
    if (nodeType === 7) {
      throw new Error("MDF-e não pode conter processing instruction antes da assinatura");
    }
    if (nodeType !== 1) return "";

    const element = current as Element;

    if (element.prefix || element.namespaceURI !== "http://www.portalfiscal.inf.br/mdfe") {
      throw new Error("MDF-e com namespace/prefixo não suportado para C14N inclusivo");
    }

    const allAttributes = Array.from(element.attributes);
    const explicitXmlns = allAttributes.filter((attr) => attr.name === "xmlns" || attr.prefix === "xmlns" || attr.namespaceURI === "http://www.w3.org/2000/xmlns/");
    if (explicitXmlns.some((attr) => attr.name !== "xmlns")) {
      throw new Error("MDF-e com namespace prefixado não suportado");
    }
    const explicitDefaultXmlns = explicitXmlns.find((attr) => attr.name === "xmlns")?.value || "";
    if (explicitDefaultXmlns && explicitDefaultXmlns !== "http://www.portalfiscal.inf.br/mdfe") {
      throw new Error("MDF-e com namespace default divergente do MDF-e");
    }
    const attributes = allAttributes
      .filter((attr) => attr.name !== "xmlns" && attr.prefix !== "xmlns" && attr.namespaceURI !== "http://www.w3.org/2000/xmlns/");
    if (attributes.some((attr) => attr.prefix || attr.namespaceURI === "http://www.w3.org/XML/1998/namespace" || (attr.namespaceURI || "") !== "")) {
      throw new Error("MDF-e com atributo namespace/XML não suportado para C14N inclusivo");
    }
    attributes.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

    // Preserva o xmlns declarado explicitamente no nó (ex.: <infModal ... xmlns="...">);
    // a raiz sempre carrega o namespace. Namespaces redundantes NÃO são limpos.
    const isRoot = element === node || element.parentNode === null ||
      element.parentNode.namespaceURI !== "http://www.portalfiscal.inf.br/mdfe";
    const rootNamespace = isRoot ? ' xmlns="http://www.portalfiscal.inf.br/mdfe"' : "";
    const renderedAttributes = attributes.map((attr) => ` ${attr.name}="${escapeC14nAttribute(attr.value)}"`).join("");
    const preservedXmlns = !isRoot && explicitDefaultXmlns ? ` xmlns="${explicitDefaultXmlns}"` : "";
    const children = Array.from(element.childNodes)
      .map((child) => render(child))
      .join("");
    return "<" + element.nodeName + rootNamespace + renderedAttributes + preservedXmlns + ">" + children + "</" + element.nodeName + ">";
  };

  return render(node);
}

export function getMdfReferenceNode(xml: string): { node: Element; id: string } {
  const { DOMParser } = require("@xmldom/xmldom");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const infMdf = document.getElementsByTagName("infMDFe").item(0);
  if (!infMdf) throw new Error("MDF-e sem elemento infMDFe para assinar");

  const id = infMdf.getAttribute("Id") || "";
  if (!id) throw new Error("MDF-e sem atributo Id em infMDFe");
  return { node: infMdf as unknown as Element, id };
}

export const XML_INCLUSIVE_C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";