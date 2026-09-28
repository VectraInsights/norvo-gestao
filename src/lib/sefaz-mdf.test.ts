import { describe, expect, it } from "vitest";
import { gerarChaveMdf, montarProdPredXml } from "./sefaz-mdf";

describe("regras do MDF-e", () => {
  it("gera uma chave de acesso com 44 dígitos e dígito verificador válido", () => {
    const chave = gerarChaveMdf("35", "2609", "12345678000195", "001", "000000123", "12345678");

    expect(chave).toMatch(/^35\d{42}$/);
    expect(chave).toHaveLength(44);
  });

  it("escapa caracteres especiais na descrição da carga", () => {
    const xml = montarProdPredXml({
      tpCarga: "01",
      xProd: "Carga <especial> & teste",
      ncm: "12345678",
    });

    expect(xml).toContain("Carga &lt;especial&gt; &amp; teste");
    expect(xml).not.toContain("<especial>");
  });

  it("usa produto padrão quando não há dados", () => {
    expect(montarProdPredXml()).toContain("<tpCarga>05</tpCarga><xProd>CARGA GERAL</xProd>");
  });

  it("não permite conteúdo XML injetado em campos fiscais", () => {
    const xml = montarProdPredXml({ tpCarga: "01", xProd: '"/><evil>1</evil>', ncm: "12345678" });

    expect(xml).not.toContain("<evil>");
    expect(xml).toContain("&lt;evil&gt;");
  });
});
