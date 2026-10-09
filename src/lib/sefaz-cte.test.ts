/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildCteNormalXml, buildCteXml, cClassTribEfetivo, compraGovXml, docAntOficial, isufTag, pagAntXml, pgtoVincXml, rtcFase2, tomaSefazDeModFrete } from "./sefaz-cte";

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
    crt: "3",
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

  it("inclui tração e reboques no <rodo> quando informados", () => {
    const { xml } = buildCteXml(
      baseCte({
        modelo: "simp",
        modalRod: {
          rntrc: "00839402",
          veiculos: [
            { placa: "RIR3D23", uf: "MG", renavam: "01259943272", tpRod: "03", tpCar: "00" },
            { placa: "HNG0404", uf: "MG", renavam: "00234674024", tpCar: "00" },
          ],
        },
      }) as any,
    );

    expect(xml).toContain("<veicTracao><placa>RIR3D23</placa>");
    expect(xml).toContain("<veicReboque><placa>HNG0404</placa>");
  });
});

describe("toma: modFrete da tela vira tomador oficial SEFAZ", () => {
  it("0/3 -> 0 (remetente), 1/4 -> 3 (destinatário), 2 -> 4 (outros)", () => {
    expect(tomaSefazDeModFrete("0")).toBe("0");
    expect(tomaSefazDeModFrete("3")).toBe("0");
    expect(tomaSefazDeModFrete("1")).toBe("3");
    expect(tomaSefazDeModFrete("4")).toBe("3");
    expect(tomaSefazDeModFrete("2")).toBe("4");
  });

  it("9 ou vazio lançam erro claro (não geram XML inválido)", () => {
    expect(() => tomaSefazDeModFrete("9")).toThrow(/sem transporte|Tomador inválido/);
    expect(() => tomaSefazDeModFrete("")).toThrow();
  });

  it("normal com FOB (1) emite toma4=3 (nunca expedidor sem <exped>)", () => {
    const xml = buildNormal({
      tomador: { ...(baseCte().tomador as any), toma: "1" },
    });

    expect(xml).toContain("<toma4><toma>3</toma>");
    expect(xml).not.toContain("<toma3><toma>1</toma>");
  });
});

describe("CIOT fora do XML do CT-e (dado ANTT, não vai no leiaute 4.00)", () => {
  it("normal nunca emite <CIOT> mesmo com ciot no form", () => {
    const xml = buildNormal({
      modalRod: { ...(baseCte().modalRod as any), ciot: "123456789012" },
    });

    expect(xml).not.toContain("<CIOT>");
    expect(xml).toContain("<RNTRC>00839402</RNTRC>");
  });

  it("simplificado nunca emite <CIOT>", () => {
    const { xml } = buildCteXml(
      baseCte({
        modelo: "simp",
        modalRod: { ...(baseCte().modalRod as any), ciot: "123456789012" },
      }) as any,
    );

    expect(xml).not.toContain("<CIOT>");
  });
});

describe("<seg> no CT-e Normal (infCTeNorm, após infModal)", () => {
  const comSeg = {
    seg: { resp: "4", xSeg: "SEGURADORA TESTE SA", nApol: "12345", nAver: "678" },
  };

  it("emite respSeg/xSeg/nApol/nAver após o infModal", () => {
    const xml = buildNormal(comSeg);

    expect(xml).toContain("<seg><respSeg>4</respSeg><xSeg>SEGURADORA TESTE SA</xSeg><nApol>12345</nApol><nAver>678</nAver></seg>");
    expect(xml.indexOf("<seg>")).toBeGreaterThan(xml.indexOf("</infModal>"));
    expect(xml.indexOf("<seg>")).toBeLessThan(xml.indexOf("</infCTeNorm>"));
  });

  it("respSeg só admite 4/5 (outros viram 4)", () => {
    expect(buildNormal({ seg: { resp: "2", xSeg: "SEG" } })).toContain("<respSeg>4</respSeg>");
    expect(buildNormal({ seg: { resp: "5", xSeg: "SEG" } })).toContain("<respSeg>5</respSeg>");
  });

  it("sem dados de seguro omite o grupo", () => {
    expect(buildNormal()).not.toContain("<seg>");
  });
});

describe("<docAnt> oficial (agrupado por emitente)", () => {
  const ch1 = "35251021306287000152570010000000011000000010";
  const ch2 = "35251021306287000152570010000000021000000020";

  it("agrupa chaves pelo CNPJ em <emiDocAnt> sem <infDocAnt>", () => {
    const xml = docAntOficial([ch1, ch2]);

    expect(xml).toContain("<docAnt><emiDocAnt><CNPJ>21306287000152</CNPJ>");
    expect(xml).toContain(`<idDocAnt><idDocAntEle><chCTe>${ch1}</chCTe></idDocAntEle></idDocAnt>`);
    expect(xml).toContain(`<chCTe>${ch2}</chCTe>`);
    expect(xml).not.toContain("<infDocAnt>");
    expect(xml).not.toContain("tpPrest");
  });

  it("normal inclui o <docAnt> como irmão do <infDoc> (filho de infCTeNorm)", () => {
    const xml = buildNormal({ docAnt: { chaves: [ch1] } });

    expect(xml).toContain("</infDoc><docAnt><emiDocAnt><CNPJ>21306287000152</CNPJ>");
    expect(xml).not.toContain("<infDocAnt>");
  });
});

describe("<ICMSSN> no Simples Nacional (CRT 1/4)", () => {
  it("CRT 1 com CSOSN emite <ICMSSN> (normal e simp)", () => {
    const sn = { emit: { ...(baseCte().emit as any), crt: "1" }, icms: { CST: "102", vBC: 4404, pICMS: 0, vICMS: 0 } };
    const xmlN = buildNormal(sn);
    const xmlS = buildCteXml(baseCte({ modelo: "simp", ...sn }) as any).xml;

    for (const xml of [xmlN, xmlS]) {
      expect(xml).toContain("<ICMSSN><CST>102</CST></ICMSSN>");
      expect(xml).not.toContain("<ICMS00>");
    }
  });

  it("CRT 1 sem CSOSN lança erro claro (não gera XML inválido)", () => {
    expect(() => buildNormal({
      emit: { ...(baseCte().emit as any), crt: "1" },
      icms: { CST: "00", vBC: 4404, pICMS: 0, vICMS: 0 },
    })).toThrow(/CSOSN/);
  });

  it("CRT 3 mantém <ICMS00> (sem regressão)", () => {
    expect(buildNormal()).toContain("<ICMS00><CST>00</CST>");
  });
});

describe("RTC fase 2 (atrás de flag): cClassTrib, ISUF, compras gov, split", () => {
  const CH = "35251021306287000152570010000000011000000010";
  const comFase2 = { rtc: { fase2: true } };

  it("desligada: cClassTrib 000001 e nenhum grupo novo", () => {
    expect(cClassTribEfetivo({})).toBe("000001");
    expect(cClassTribEfetivo({ rtc: { fase2: true }, cClassTrib: "abc" })).toBe("000001");
    expect(rtcFase2({})).toBe(false);
    const xml = buildNormal({ cClassTrib: "200002" });
    expect(xml).toContain("<cClassTrib>000001</cClassTrib>");
    expect(xml).not.toContain("<pgtoVinc>");
    expect(xml).not.toContain("<gCompraGov>");
  });

  it("ligada: cClassTrib real no Normal e no Simp", () => {
    const xmlN = buildNormal({ ...comFase2, cClassTrib: "200002" });
    const xmlS = buildCteXml(baseCte({ modelo: "simp", ...comFase2, cClassTrib: "200002" }) as any).xml;
    expect(xmlN).toContain("<cClassTrib>200002</cClassTrib>");
    expect(xmlS).toContain("<cClassTrib>200002</cClassTrib>");
  });

  it("ISUF só com fase 2 e 8-9 dígitos", () => {
    expect(isufTag("ISUFEmit", "12345678")).toBe("<ISUFEmit>12345678</ISUFEmit>");
    expect(isufTag("ISUF", "123")).toBe("");
    const xml = buildNormal({ ...comFase2, emit: { ...(baseCte().emit as any), isuf: "123456789" } });
    expect(xml).toContain("<ISUFEmit>123456789</ISUFEmit>");
    expect(buildNormal()).not.toContain("ISUF");
  });

  it("gCompraGov válida entra no ide; inválida some", () => {
    const gov = { compraGov: { tpEnte: "1", pRedutor: 10, tpOp: "1", refDFe: [CH] } };
    const xml = buildNormal({ ...comFase2, ...gov });
    expect(xml).toContain("<gCompraGov><tpEnteGov>1</tpEnteGov><pRedutor>10.0000</pRedutor><tpOpGov>1</tpOpGov>");
    expect(xml).toContain(`<refDFeAnt>${CH}</refDFeAnt>`);
    expect(compraGovXml({})).toBe("");
    expect(compraGovXml({ rtc: { fase2: true }, compraGov: { tpEnte: "9" } })).toBe("");
  });

  it("tpPagAnt 1 sai direto; 3 exige chave; pgtoVinc valida campos", () => {
    expect(pagAntXml({ rtc: { fase2: true }, pagAnt: { tipo: "1" } })).toBe("<tpPagAnt>1</tpPagAnt>");
    expect(pagAntXml({})).toBe("");
    expect(() => pagAntXml({ rtc: { fase2: true }, pagAnt: { tipo: "3", chaves: [] } })).toThrow();
    const pg = { pgtoVinc: [{ idTransacao: "TX1", tpMeio: "3", cnpjReceb: "12345678000199", cnpjBase: "12345678" }] };
    expect(pgtoVincXml({ rtc: { fase2: true }, ...pg })).toContain('<pgto nPag="001"><idTransacao>TX1</idTransacao><tpMeioPgto>03</tpMeioPgto>');
    expect(() => pgtoVincXml({ rtc: { fase2: true }, pgtoVinc: [{ idTransacao: "X" }] })).toThrow();
    expect(pgtoVincXml({})).toBe("");
  });
});

describe("<compl> no CT-e Normal (após infCTeNorm)", () => {
  it("inclui <compl><xObs> quando há observação", () => {
    const xml = buildNormal({ obsGerais: "ENTREGA AGENDAR COM JOAO" } as any);

    expect(xml).toContain("<compl><xObs>ENTREGA AGENDAR COM JOAO</xObs></compl>");
    expect(xml.indexOf("<compl>")).toBeGreaterThan(xml.indexOf("</infCTeNorm>"));
    expect(xml.indexOf("<compl>")).toBeLessThan(xml.indexOf("<infRespTec>"));
  });

  it("omite <compl> sem observação", () => {
    expect(buildNormal()).not.toContain("<compl>");
  });
});