import { describe, expect, it } from "vitest";
import { gerarDanfePdf, type DanfeData } from "./danfe-pdf";

const sample: DanfeData = {
  chave: "31260949793806000173550010000155451078529987",
  numero: "15545",
  serie: "1",
  dhEmi: "2026-09-10T11:24:50-03:00",
  ambiente: "producao",
  naturezaOperacao: "VENDA DE MERC. ADQUIRIDA OU REC.",
  tpEntradaSaida: "1",
  emitNome: "PD DIESEL PARTS LTDA",
  emitCnpj: "49793806000173",
  emitEndereco: "AVENIDA MARIA DA GLORIA, 100 - SALA 5",
  emitBairro: "AMAZONAS",
  emitCEP: "32223-470",
  emitCidade: "CONTAGEM",
  emitUF: "MG",
  emitFone: "3141120281",
  emitIE: "0045609970059",
  destNome: "JUVENAL TRANSPORTES LTDA",
  destCnpj: "03919614000160",
  destEndereco: "RUA ADEMAR DOS SANTOS BARBOSA, 135",
  destBairro: "SAO SEBASTIAO",
  destCEP: "32150-150",
  destCidade: "CONTAGEM",
  destUF: "MG",
  destFone: "3133902051",
  destIE: "1860873170000",
  valorProdutos: 1830,
  valorFrete: 40,
  valorTotal: 1870,
  vTotTrib: 104.46,
  protocolo: "131267897249223",
  protocoloData: "2026-09-10T11:24:50-03:00",
  fretePorConta: "1-Por conta do Dest",
  volumes: "1",
  pesoBruto: "2.400",
  pesoLiquido: "2.400",
  produtos: [
    { codigo: "000846", nome: "BICO INJETOR 0433175489 - P1786 DSLA160P1786 - BOSCH", qtd: "6.0000", un: "PC", valorUnit: "243.0000", valorTotal: "1458.00", cfop: "5405", cst: "060", ncm: "84099969", desconto: 0, baseIcms: 0, vIcms: 0, vIpi: 0, aliqIcms: 0, aliqIpi: 0 },
    { codigo: "003957", nome: "REPARO F000431702 - BOSCH", qtd: "6.0000", un: "PC", valorUnit: "62.0000", valorTotal: "372.00", cfop: "5405", cst: "060", ncm: "84139190", desconto: 0, baseIcms: 0, vIcms: 0, vIpi: 0, aliqIcms: 0, aliqIpi: 0 },
  ],
  parcelas: [
    { numero: "001", dataVencimento: "2026-10-08", valor: 623.46 },
    { numero: "002", dataVencimento: "2026-11-08", valor: 623.27 },
    { numero: "003", dataVencimento: "2026-12-08", valor: 623.27 },
  ],
  infoComplementares: "PRAZO DE GARANTIA E DE 90 DIAS APOS A COMPRA. Numero do Pedido: 18141",
};

describe("DANFE layout oficial", () => {
  it("gera PDF de 1 página com as seções do modelo", async () => {
    const blob = gerarDanfePdf(sample);
    expect(blob.size).toBeGreaterThan(5000);
    const buf = Buffer.from(await blob.arrayBuffer());
    const raw = buf.toString("latin1");
    for (const s of [
      "DANFE",
      "000.015.545",
      "PD DIESEL PARTS LTDA",
      "JUVENAL TRANSPORTES LTDA",
      "FATURA",
      "DUPLICATA",
      "131267897249223",
      "1.870,00",
      "VALOR DESC",
      "6,0000",
      "243,0000",
      "2,400",
      "5405",
      "RESERVADO AO FISCO",
    ]) {
      expect(raw).toContain(s);
    }
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBe(1);
  });
});
