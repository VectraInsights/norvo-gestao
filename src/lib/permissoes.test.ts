import { describe, expect, it } from "vitest";
import { MODULOS, moduloDaRota, modulosDaRota, moduloDoItemMenu, podeAcessarRota } from "./permissoes";

describe("moduloDaRota", () => {
  it("identifica módulos nas rotas do ERP", () => {
    expect(moduloDaRota("/financeiro/contas")).toBe("financeiro");
    expect(moduloDaRota("/fiscal/emitidas/")).toBe("fiscal");
  });

  it("ignora query string, hash e espaços externos", () => {
    expect(moduloDaRota("  /estoque/produtos?pagina=2#lista  ")).toBe("estoque");
  });

  it("identifica todos os módulos cadastrados", () => {
    for (const modulo of MODULOS) {
      expect(moduloDaRota(`/${modulo.key}/inicio`)).toBe(modulo.key);
    }
  });

  it("mantém rotas públicas e administrativas sem módulo", () => {
    expect(moduloDaRota("/dashboard")).toBeNull();
    expect(moduloDaRota("/configuracoes/usuarios")).toBeNull();
    expect(moduloDaRota("dashboard")).toBeNull();
    expect(moduloDaRota("/")).toBeNull();
    expect(MODULOS).toHaveLength(7);
  });
});

describe("podeAcessarRota (cadastros de apoio)", () => {
  const soFiscal = (m: string | null) => m === "fiscal";

  it("libera veículos e motoristas para quem só tem o módulo Fiscal", () => {
    expect(podeAcessarRota("/frota/veiculos", soFiscal)).toBe(true);
    expect(podeAcessarRota("/rh/colaboradores", soFiscal)).toBe(true);
  });

  it("mantém as demais rotas restritas ao próprio módulo", () => {
    expect(podeAcessarRota("/frota/viagens", soFiscal)).toBe(false);
    expect(podeAcessarRota("/rh/folha", soFiscal)).toBe(false);
    expect(podeAcessarRota("/fiscal/cte", soFiscal)).toBe(true);
  });

  it("libera rotas sem módulo para qualquer um", () => {
    expect(podeAcessarRota("/dashboard", () => false)).toBe(true);
    expect(podeAcessarRota("/configuracoes", () => false)).toBe(true);
  });

  it("lista os módulos alternativos de cada rota de apoio", () => {
    expect(modulosDaRota("/frota/veiculos")).toEqual(["frota", "fiscal"]);
    expect(modulosDaRota("/rh/colaboradores")).toEqual(["rh", "fiscal"]);
    expect(modulosDaRota("/frota/multas")).toEqual(["frota"]);
  });
});

describe("moduloDoItemMenu (menu do sidebar)", () => {
  it("sem módulo explícito, vale o módulo da rota (regra estrita)", () => {
    expect(moduloDoItemMenu("/frota/veiculos")).toBe("frota");
    expect(moduloDoItemMenu("/rh/colaboradores")).toBe("rh");
    expect(moduloDoItemMenu("/fiscal/cte")).toBe("fiscal");
  });

  it("com módulo explícito, vale o módulo do grupo do item", () => {
    // "Veículos" e "Motoristas" dentro do grupo Fiscal
    expect(moduloDoItemMenu("/frota/veiculos", "fiscal")).toBe("fiscal");
    expect(moduloDoItemMenu("/rh/colaboradores", "fiscal")).toBe("fiscal");
  });
});
