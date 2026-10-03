import { describe, expect, it } from "vitest";
import { buildCceEvento, CCE_COND_USO } from "./sefaz-cte";

const CHAVE = "31261003919614000160570010000005311168383066";

describe("CC-e", () => {
  it("monta evento 110110 com Id e condição de uso", () => {
    const xml = buildCceEvento(CHAVE, "03919614000160", "Endereco de entrega correto: Rua X, 123");
    expect(xml).toContain(`<infEvento Id="ID110110${CHAVE}001">`);
    expect(xml).toContain("<tpEvento>110110</tpEvento>");
    expect(xml).toContain("<descEvento>Carta de Correcao</descEvento>");
    expect(xml).toContain(CCE_COND_USO);
    expect(xml).toContain(`<chCTe>${CHAVE}</chCTe>`);
    expect(xml).toMatch(/<dhEvento>[^<]*-03:00<\/dhEvento>/);
  });
  it("barra texto curto e chave inválida", () => {
    expect(() => buildCceEvento(CHAVE, "03919614000160", "curto")).toThrow();
    expect(() => buildCceEvento("123", "03919614000160", "Texto longo o suficiente aqui")).toThrow();
  });
});
