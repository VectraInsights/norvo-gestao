/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildCteNormalXml, buildCteXml } from "./sefaz-cte";

// Base mínima válida para emissão em homologação (SEFAZ_AMBIENTE é fixo).
// Os valores reproduzem o CT-e de referência (chave ...5311429212600).
const baseCte = (over: Record<string, any> = {}) => ({
  ambiente: "homologacao",
  numero: "531",
  serie: "1",
  cfop: "6352",
  natOp: "PRESTACAO DE SERVICO DE TRANSPORTE",
  tpServ: "0",
  retira: "1",
  vPrest: 4404,
  vCarga: 98224.96,
  pesoKg: 1435,
  cMunEnv: "3126109",
  xMunEnv: "FORMIGA",
  ufEnv: "MG",
  cMunIni: "3126109",
  xMunIni: "FORMIGA",
  ufIni: "MG",
  cMunFim: "1504208",
  xMunFim: "MARABA",
  ufFim: "PA",
  tomador: {
    toma: "0",
    cnpj: "12345678000199",
    xNome: "TOMADOR LTDA",
    uf: "MG",
    cMun: "3126109",
    xMun: "FORMIGA",
    ie: "123456789",
  },
  rem: {
    cnpj: "21306287000152",
    xNome: "REMETENTE LTDA",
    uf: "MG",
    cMun: "3126109",
    xMun: "FORMIGA",
    ie: "2614310460066",
    cep: "35574825",
    logradouro: "RUA VEREADOR DECIO DE PAULA",
    nro: "101",
    bairro: "PLANALTO",
  },
  dest: {
    cnpj: "29979036068020",
    xNome: "DESTINATARIO SA",
    uf: "AP",
    cMun: "1600303",
    xMun: "MACAPA",
    ie: "",
    cep: "68900912",
    logradouro: "RUA GENERAL RONDON",
    nro: "1039",
    bairro: "JULIAO RAMOS",
  },
  emit: {
    cnpj: "03919614000160",
    xNome: "JUVENAL TRANSPORTES LTDA",
    ie: "1860873170000",
    uf: "MG",
    cMun: "3126109",
    xMun: "FORMIGA",
    crt: "1",
    logradouro: "ADEMAR DOS SANTOS BARBOSA",
    nro: "135",
    bairro: "SAO SEBASTIAO",
    cep: "32150150",
  },
  icms: { CST: "00", vBC: 4404, pICMS: 7, vICMS: 308.28 },
  chavesNFe: [
    "31260921306287000152550010000602281686937734",
    "31260921306287000152550010000602361722592047",
  ],
  // Modal rodoviário igual ao XML de referência autorizado.
  modalRod: {
    rntrc: "00839402",
    veiculos: [
      { placa: "RIR3D23", uf: "MG", renavam: "01259943272", tpRod: "03", tpCar: "00" },
      { placa: "HNG0404", uf: "MG", renavam: "00234674024", tpCar: "00" },
    ],
    motoristas: [{ xNome: "ROBERTO DE SOUZA", cpf: "69751773687" }],
  },
  ...over,
});

const buildNormal = (over: Record<string, any> = {}) =>
  buildCteNormalXml(baseCte({ modelo: "normal", ...over }) as any).xml;

describe("CT-e Normal 4.00 — modal rodoviário (formato de referência)", () => {
  it("gera o <rodo> com RNTRC, moto, tração e reboque", () => {
    const xml = buildNormal();

    expect(xml).toContain("<rodo>");
    expect(xml).toContain("<RNTRC>00839402</RNTRC>");
    expect(xml).toContain("<moto><xNome>ROBERTO DE SOUZA</xNome><CPF>69751773687</CPF></moto>");
    expect(xml).toContain("<veicTracao>");
    expect(xml).toContain("<placa>RIR3D23</placa>");
    expect(xml).toContain("<veicReboque>");
    expect(xml).toContain("<placa>HNG0404</placa>");
  });

  it("mantém a ordem do modal: RNTRC, moto, tração e reboque", () => {
    const xml = buildNormal();
    const rodo = xml.match(/<rodo>([\s\S]*?)<\/rodo>/)?.[1] || "";

    expect(rodo.indexOf("<RNTRC>")).toBeLessThan(rodo.indexOf("<moto>"));
    expect(rodo.indexOf("<moto>")).toBeLessThan(rodo.indexOf("<veicTracao>"));
    expect(rodo.indexOf("<veicTracao>")).toBeLessThan(rodo.indexOf("<veicReboque>"));
  });

  it("não usa <compl> nem <CIOT> no CT-e Normal", () => {
    const xml = buildNormal();

    expect(xml).not.toContain("<compl>");
    expect(xml).not.toContain("<CIOT>");
    expect(xml).not.toContain("PlacaFinal");
    expect(xml).not.toContain("CPFMOTORISTA");
  });

  it("omite moto/veículos quando não informado", () => {
    const xml = buildNormal({ modalRod: { rntrc: "00839402" } });

    expect(xml).toContain("<rodo><RNTRC>00839402</RNTRC></rodo>");
  });

  it("mantém as NF-e vinculadas e o QR Code", () => {
    const xml = buildNormal();

    expect(xml).toContain(
      "<infNFe><chave>31260921306287000152550010000602281686937734</chave></infNFe>",
    );
    expect(xml).toContain("<infCTeSupl><qrCodCTe>");
    expect(xml).toContain("portalcte.fazenda.mg.gov.br");
  });
});

describe("CT-e Simplificado 4.00 — modal rodoviário", () => {
  it("mantém RNTRC e <moto> no <rodo>", () => {
    const { xml } = buildCteXml(baseCte({ modelo: "simp" }) as any);

    expect(xml).toContain("<RNTRC>00839402</RNTRC>");
    expect(xml).toContain("<moto><xNome>ROBERTO DE SOUZA</xNome><CPF>69751773687</CPF></moto>");
  });
});