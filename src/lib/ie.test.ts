import { describe, expect, it } from "vitest";
import { limparIE, validarIE } from "./ie";

describe("Inscrição Estadual", () => {
  it("normaliza pontuação sem alterar ISENTO", () => {
    expect(limparIE("110.042.490.114")).toBe("110042490114");
    expect(limparIE("isento")).toBe("ISENTO");
  });

  it("valida quantidade de dígitos por UF", () => {
    expect(validarIE("SP", "110042490114").ok).toBe(true);
    expect(validarIE("SP", "123").ok).toBe(false);
  });
});
