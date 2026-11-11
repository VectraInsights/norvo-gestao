import { DOMParser } from "@xmldom/xmldom";
import { beforeAll, describe, expect, it } from "vitest";
import { idMotoristaPorNomeCpf, veicMotoristaDoCte } from "./cte-original";

// O helper usa o DOMParser global (browser); em Node injeta o do xmldom.
beforeAll(() => {
  (globalThis as any).DOMParser = DOMParser;
});

const XML_CTE = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc><infCte><infCTeNorm><infModal versaoModal="4.00"><rodo>
<RNTRC>12345678</RNTRC>
<moto><xNome>ANTONIO LUIZ PAIVA</xNome><CPF>12345678901</CPF></moto>
<veicTracao><placa>CZK8K55</placa><tara>8000</tara><tpRod>03</tpRod><tpCar>00</tpCar><UF>MG</UF></veicTracao>
<veicReboque><placa>ABC1D23</placa><tara>5000</tara><UF>MG</UF></veicReboque>
<veicReboque><placa>XYZ9W88</placa><tara>5000</tara><UF>MG</UF></veicReboque>
</rodo></infModal></infCTeNorm></infCte></cteProc>`;

describe("veicMotoristaDoCte", () => {
  it("herda tração, reboques e motorista do XML puro", () => {
    const d = veicMotoristaDoCte(XML_CTE);
    expect(d.placaVeiculo).toBe("CZK8K55");
    expect(d.semiReboque1).toBe("ABC1D23");
    expect(d.semiReboque2).toBe("XYZ9W88");
    expect(d.motoristaNome).toBe("ANTONIO LUIZ PAIVA");
    expect(d.motoristaCpf).toBe("12345678901");
  });

  it("usa o form salvo quando ele existe", () => {
    const d = veicMotoristaDoCte(
      JSON.stringify({
        xml: XML_CTE,
        form: {
          placaVeiculo: "TUCK9999",
          semiReboque1: "R1",
          semiReboque2: "R2",
          motoristaNome: "JOSE DA SILVA",
        },
      }),
    );
    expect(d.placaVeiculo).toBe("TUCK9999");
    expect(d.semiReboque1).toBe("R1");
    expect(d.semiReboque2).toBe("R2");
    expect(d.motoristaNome).toBe("JOSE DA SILVA");
  });

  it("completa com o XML o que o form não tem", () => {
    const d = veicMotoristaDoCte(
      JSON.stringify({ xml: XML_CTE, form: { placaVeiculo: "TUCK9999" } }),
    );
    expect(d.placaVeiculo).toBe("TUCK9999");
    expect(d.semiReboque1).toBe("ABC1D23");
    expect(d.motoristaNome).toBe("ANTONIO LUIZ PAIVA");
  });

  it("aceita form sem XML (documento salvo só com o form)", () => {
    const d = veicMotoristaDoCte(
      JSON.stringify({ form: { placaVeiculo: "ZZZ1A2B", motoristaNome: "MARIA" } }),
    );
    expect(d.placaVeiculo).toBe("ZZZ1A2B");
    expect(d.motoristaNome).toBe("MARIA");
    expect(d.semiReboque1).toBe("");
  });

  it("não quebra com xml_assinado vazio ou inválido", () => {
    expect(veicMotoristaDoCte(null).placaVeiculo).toBe("");
    expect(veicMotoristaDoCte("lixo").motoristaNome).toBe("");
  });
});

describe("idMotoristaPorNomeCpf", () => {
  const lista = [
    { id: "m1", nome: "Antonio Luiz Paiva", cpf: "12345678901" },
    { id: "m2", nome: "José da Silva", cpf: null },
  ];

  it("acha pelo CPF", () => {
    expect(idMotoristaPorNomeCpf(lista, "", "12345678901")).toBe("m1");
  });

  it("acha pelo nome (sem diferenciar caixa/espaços)", () => {
    expect(idMotoristaPorNomeCpf(lista, "ANTONIO LUIZ PAIVA", "")).toBe("m1");
    expect(idMotoristaPorNomeCpf(lista, "josé da silva", "")).toBe("m2");
  });

  it("devolve vazio quando não acha", () => {
    expect(idMotoristaPorNomeCpf(lista, "Fulano", "")).toBe("");
    expect(idMotoristaPorNomeCpf(undefined, "Fulano", "")).toBe("");
  });
});
