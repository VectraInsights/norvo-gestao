/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildCteNormalXml, buildCteXml } from "./sefaz-cte";

// Base mínima válida para emissão em homologação (SEFAZ_AMBIENTE é fixo).
const baseCte = (over: Record<string, any> = {}) => ({
  ambiente: "homologacao",
  numero: "500",
  serie: "1",
  cfop: "6352",
  natOp: "PRESTACAO DE SERVICO DE TRANSPORTE",
  tpServ: "0",
  retira: "1",
  vPrest: 1000,
  vCarga: 1500,
  pesoKg: 100,
  cMunEnv: "3106209",
  xMunEnv: "FORMIGA",
  ufEnv: "MG",
  cMunIni: "3106209",
  xMunIni: "FORMIGA",
  ufIni: "MG",
  cMunFim: "3106209",
  xMunFim: "FORMIGA",
  ufFim: "MG",
  tomador: {
    toma: "0",
    cnpj: "12345678000199",
    xNome: "TOMADOR LTDA",
    uf: "MG",
    cMun: "3106209",
    xMun: "FORMIGA",
    ie: "123456789",
  },
  rem: {
    cnpj: "12345678000199",
    xNome: "REMETENTE LTDA",
    uf: "MG",
    cMun: "3106209",
    xMun: "FORMIGA",
    ie: "123456789",
    cep: "35570000",
    logradouro: "RUA A",
    nro: "100",
    bairro: "CENTRO",
  },
  dest: {
    cnpj: "98765432000188",
    xNome: "DESTINATARIO SA",
    uf: "MG",
    cMun: "3106209",
    xMun: "FORMIGA",
    ie: "987654321",
    cep: "35570000",
    logradouro: "RUA B",
    nro: "200",
    bairro: "CENTRO",
  },
  emit: {
    cnpj: "12345678000199",
    xNome: "TRANSPORTADORA TESTE",
    ie: "123456789",
    uf: "MG",
    cMun: "3106209",
    xMun: "FORMIGA",
    crt: "3",
    logradouro: "RUA C",
    nro: "1",
    bairro: "CENTRO",
    cep: "35570000",
  },
  icms: { CST: "00", vBC: 1000, pICMS: 12, vICMS: 120 },
  chavesNFe: ["4".repeat(44)],
  modalRod: {
    rntrc: "12345678",
    ciot: "123456789012",
    veiculos: [
      { placa: "abc1a23", uf: "MG" },
      { placa: "xyz9z87", uf: "MG" },
    ],
    motoristas: [{ xNome: "jose da silva", cpf: "123.456.789-01" }],
  },
  responsavelEmissao: "maria souza",
  especieVeiculo: "cavalo mecanico",
  eixosTotal: 6,
  obs: "ENTREGA ATE 18H",
  ...over,
});

const buildNormal = (over: Record<string, any> = {}) =>
  buildCteNormalXml(baseCte({ modelo: "normal", ...over }) as any).xml;

describe("CT-e Normal 4.00 — modal rodoviário minimalista", () => {
  it("emite o <rodo> somente com RNTRC (sem moto/veicTracao/veicReboque/CIOT)", () => {
    const xml = buildNormal();

    expect(xml).toContain("<rodo><RNTRC>12345678</RNTRC></rodo>");
    expect(xml).not.toContain("<moto>");
    expect(xml).not.toContain("<veicTracao>");
    expect(xml).not.toContain("<veicReboque>");
    expect(xml).not.toContain("<CIOT>");
    expect(xml).not.toContain("<lacRodo>");
  });

  it("leva placa, motorista, espécie e eixos no <compl> (xObs + ObsCont)", () => {
    const xml = buildNormal();

    expect(xml).toContain("<xEmi>MARIA SOUZA</xEmi>");
    expect(xml).toContain(
      "<xObs>Placa XYZ9Z87 Motorista JOSE DA SILVA CPF 12345678901 ENTREGA ATE 18H</xObs>",
    );
    expect(xml).toContain('<ObsCont xCampo="CPFMOTORISTA"><xTexto>12345678901</xTexto></ObsCont>');
    expect(xml).toContain('<ObsCont xCampo="PLACA"><xTexto>ABC1A23</xTexto></ObsCont>');
    expect(xml).toContain(
      '<ObsCont xCampo="EspecieVeiculo"><xTexto>CAVALO MECANICO</xTexto></ObsCont>',
    );
    expect(xml).toContain('<ObsCont xCampo="PlacaFinal"><xTexto>XYZ9Z87</xTexto></ObsCont>');
    expect(xml).toContain('<ObsCont xCampo="Quantidade_Eixos"><xTexto>6</xTexto></ObsCont>');
  });

  it("posiciona o <compl> entre </ide> e <emit> (ordem do XSD)", () => {
    const xml = buildNormal();

    expect(xml).toMatch(/<\/ide>[\s\S]*<compl>[\s\S]*<\/compl>[\s\S]*<emit>/);
  });

  it("usa a tração como PlacaFinal quando não há reboque", () => {
    const xml = buildNormal({
      modalRod: { rntrc: "12345678", veiculos: [{ placa: "abc1a23", uf: "MG" }], motoristas: [] },
    });

    expect(xml).toContain('<ObsCont xCampo="PLACA"><xTexto>ABC1A23</xTexto></ObsCont>');
    expect(xml).toContain('<ObsCont xCampo="PlacaFinal"><xTexto>ABC1A23</xTexto></ObsCont>');
  });

  it("respeita os limites do leiaute (xEmi 20 e xObs 2000)", () => {
    const xml = buildNormal({ responsavelEmissao: "A".repeat(50), obs: "B".repeat(2500) });
    const xEmi = xml.match(/<xEmi>([^<]*)<\/xEmi>/)?.[1] || "";
    const xObs = xml.match(/<xObs>([^<]*)<\/xObs>/)?.[1] || "";

    expect(xEmi).toHaveLength(20);
    expect(xObs.length).toBeLessThanOrEqual(2000);
  });

  it("omite o <compl> quando não há nada a informar", () => {
    const xml = buildNormal({
      responsavelEmissao: "",
      especieVeiculo: "",
      eixosTotal: 0,
      obs: "",
      modalRod: { rntrc: "12345678", veiculos: [], motoristas: [] },
    });

    expect(xml).not.toContain("<compl>");
  });
});

describe("CT-e Simplificado 4.00 — modal rodoviário", () => {
  it("não emite <moto> dentro do <rodo>", () => {
    const { xml } = buildCteXml(baseCte({ modelo: "simp" }) as any);

    expect(xml).toContain("<rodo><RNTRC>12345678</RNTRC></rodo>");
    expect(xml).not.toContain("<moto>");
  });
});
