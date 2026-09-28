import { describe, expect, it } from "vitest";
import { cnpj, dateBR, num } from "./format";

describe("formatadores", () => {
  it("formata CNPJ normalizado", () => {
    expect(cnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
  });

  it("não desloca datas brasileiras para o dia anterior", () => {
    expect(dateBR("2026-09-28")).toBe("28/09/2026");
  });

  it("formata números com locale brasileiro", () => {
    expect(num(1234.5678, 2)).toBe("1.234,57");
  });
});
