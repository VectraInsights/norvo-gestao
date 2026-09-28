import { describe, expect, it } from "vitest";
import { MODULOS, moduloDaRota } from "./permissoes";

describe("moduloDaRota", () => {
  it("identifica módulos nas rotas do ERP", () => {
    expect(moduloDaRota("/financeiro/contas")).toBe("financeiro");
    expect(moduloDaRota("/fiscal/emitidas/")).toBe("fiscal");
  });

  it("ignora query string, hash e espaços externos", () => {
    expect(moduloDaRota("  /estoque/produtos?pagina=2#lista  ")).toBe("estoque");
  });

  it("mantém rotas públicas e administrativas sem módulo", () => {
    expect(moduloDaRota("/dashboard")).toBeNull();
    expect(moduloDaRota("/configuracoes/usuarios")).toBeNull();
    expect(MODULOS).toHaveLength(7);
  });
});
