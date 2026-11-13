import { describe, expect, it } from "vitest";
import {
  chaveReferenciadaDoXml,
  LIMITE_COMPLEMENTARES,
  modalidadeCte,
  motivoBloqueioComplementar,
  motivoBloqueioSubstituicao,
  ROTULO_COMPLEMENTAR,
  ROTULO_NORMAL,
  ROTULO_SUBSTITUICAO,
} from "./cte-modalidade";

const CHAVE = "35240612345678000199550010000000011000000017";

describe("modalidade do CT-e", () => {
  it("CT-e normal (tpCTe=0) é Normal", () => {
    const m = modalidadeCte(`<tpCTe>0</tpCTe><tpServ>0</tpServ>`, {});
    expect(m.rotulo).toBe(ROTULO_NORMAL);
    expect(m.tpCTe).toBe("0");
  });

  it("tpCTe=1 (complementar) é Complementar e traz a chave do CT-e original", () => {
    const m = modalidadeCte(
      `<tpCTe>1</tpCTe><tpServ>0</tpServ><infCteComp><chCTe>${CHAVE}</chCTe></infCteComp>`,
      {},
    );
    expect(m.rotulo).toBe(ROTULO_COMPLEMENTAR);
    expect(m.tpCTe).toBe("1");
    expect(m.chReferenciada).toBe(CHAVE);
  });

  it("tpCTe=3 (substituição) é Substituição e traz a chave do CT-e substituído", () => {
    const m = modalidadeCte(
      `<tpCTe>3</tpCTe><tpServ>0</tpServ><infCteSub><chCte>${CHAVE}</chCte></infCteSub>`,
      {},
    );
    expect(m.rotulo).toBe(ROTULO_SUBSTITUICAO);
    expect(m.chReferenciada).toBe(CHAVE);
  });

  it("rascunho sem XML usa o form salvo (finalidade/tipo/chave)", () => {
    expect(
      modalidadeCte("", { finalidadeEmissao: "Complemento", cteReferenciado: CHAVE }).rotulo,
    ).toBe(ROTULO_COMPLEMENTAR);
    expect(
      modalidadeCte("", { finalidadeEmissao: "Substituicao", cteReferenciado: CHAVE }).rotulo,
    ).toBe(ROTULO_SUBSTITUICAO);
    expect(modalidadeCte("", { tipoServico: "Subcontratacao" }).rotulo).toBe("Subcontratação");
    expect(modalidadeCte("", { tipoServico: "Redespacho" }).rotulo).toBe("Redespacho");
    expect(modalidadeCte("", { tipoServico: "Redespacho Intermediario" }).rotulo).toBe(
      "Redespacho Intermediário",
    );
    expect(
      modalidadeCte("", { finalidadeEmissao: "Complemento", cteReferenciado: CHAVE })
        .chReferenciada,
    ).toBe(CHAVE);
  });

  it("extrai a chave referenciada mesmo com quebra de linha no XML", () => {
    const xml = `<infCteComp>\n  <chCTe>${CHAVE}</chCTe>\n</infCteComp>`;
    expect(chaveReferenciadaDoXml(xml)).toBe(CHAVE);
    expect(modalidadeCte(xml, {}).chReferenciada).toBe(CHAVE);
  });
});

describe("regras da SEFAZ (MOC CT-e 4.00) para complementar/substituir", () => {
  it("não permite complementar um complementar (G164)", () => {
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_COMPLEMENTAR,
        qtdComplementares: 0,
        qtdSubstituicoes: 0,
      }),
    ).toMatch(/complementar um CT-e complementar/i);
  });

  it("não permite complementar CT-e já substituído (G166)", () => {
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: 0,
        qtdSubstituicoes: 1,
      }),
    ).toMatch(/já substituído/i);
  });

  it("limita a 10 complementares por CT-e (G167)", () => {
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: LIMITE_COMPLEMENTARES - 1,
        qtdSubstituicoes: 0,
      }),
    ).toBe("");
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: LIMITE_COMPLEMENTARES,
        qtdSubstituicoes: 0,
      }),
    ).toMatch(/10/i);
  });

  it("permite complementar CT-e normal e CT-e de substituição", () => {
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: 2,
        qtdSubstituicoes: 0,
      }),
    ).toBe("");
    expect(
      motivoBloqueioComplementar({
        rotulo: ROTULO_SUBSTITUICAO,
        qtdComplementares: 0,
        qtdSubstituicoes: 0,
      }),
    ).toBe("");
  });

  it("não permite substituir complementar nem CT-e já complementado (G083/G085)", () => {
    expect(
      motivoBloqueioSubstituicao({
        rotulo: ROTULO_COMPLEMENTAR,
        qtdComplementares: 0,
        qtdSubstituicoes: 0,
      }),
    ).toMatch(/substituir um CT-e complementar/i);
    expect(
      motivoBloqueioSubstituicao({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: 1,
        qtdSubstituicoes: 0,
      }),
    ).toMatch(/já complementado/i);
    expect(
      motivoBloqueioSubstituicao({
        rotulo: ROTULO_NORMAL,
        qtdComplementares: 0,
        qtdSubstituicoes: 0,
      }),
    ).toBe("");
  });
});
