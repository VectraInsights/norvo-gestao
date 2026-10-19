/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { patchContatoComCnpj, type DadosCnpj } from "./cnpj";

const oficial: DadosCnpj = {
  razaoSocial: "EMPREENDIMENTOS PAGUE MENOS S/A",
  nomeFantasia: "PAGUE MENOS",
  logradouro: "RUA DAS FLORES",
  tipoLogradouro: "RUA",
  numero: "1000",
  complemento: "SALA 2",
  bairro: "CENTRO",
  cidade: "CONDOR",
  uf: "PB",
  cep: "58700000",
  telefone: "3333333333",
  email: "contato@exemplo.com",
  situacao: "ATIVA",
};

describe("patchContatoComCnpj (reconciliação com a Receita Federal)", () => {
  it("troca o nome do XML pela razão social oficial", () => {
    const patch = patchContatoComCnpj(
      { nome: "EMPREEENDIMENTOS PAGUE MENOS SA" },
      oficial,
      "EMPREEENDIMENTOS PAGUE MENOS SA",
    );
    expect(patch?.nome).toBe("EMPREENDIMENTOS PAGUE MENOS S/A");
  });

  it("preserva o nome corrigido a mão pelo usuário", () => {
    const patch = patchContatoComCnpj(
      { nome: "PAGUE MENOS - FILIAL SUR" },
      oficial,
      "EMPREEENDIMENTOS PAGUE MENOS SA",
    );
    expect(patch?.nome).toBeUndefined();
  });

  it("preenche o nome quando o cadastro está sem nome", () => {
    const patch = patchContatoComCnpj({ nome: "" }, oficial);
    expect(patch?.nome).toBe("EMPREENDIMENTOS PAGUE MENOS S/A");
  });

  it("preenche só campo vazio e não sobrescreve o que veio do XML", () => {
    const patch = patchContatoComCnpj(
      { nome: "EMPREEENDIMENTOS PAGUE MENOS SA", cidade: "CONDE", uf: "PB", telefone: "" },
      oficial,
      "EMPREEENDIMENTOS PAGUE MENOS SA",
    );
    expect(patch?.cidade).toBeUndefined(); // já tinha vindo do XML
    expect(patch?.uf).toBeUndefined();
    expect(patch?.telefone).toBe("3333333333"); // estava vazio
    expect(patch?.cep).toBe("58700000");
    expect(patch?.logradouro).toBe("RUA DAS FLORES");
  });

  it("devolve null quando não há nada a alterar", () => {
    const patch = patchContatoComCnpj(
      {
        nome: "EMPREENDIMENTOS PAGUE MENOS S/A",
        logradouro: "RUA DAS FLORES",
        numero: "1000",
        complemento: "SALA 2",
        bairro: "CENTRO",
        cidade: "CONDOR",
        uf: "PB",
        cep: "58700000",
        telefone: "3333333333",
        email: "contato@exemplo.com",
      },
      oficial,
      "EMPREEENDIMENTOS PAGUE MENOS S/A",
    );
    expect(patch).toBeNull();
  });
});
