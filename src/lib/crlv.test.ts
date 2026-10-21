import { describe, expect, it } from "vitest";
import {
  extrairDoTextoOcr,
  tipoVeiculoDoCrlv,
  valorSobRotulo,
  type ItemTexto,
} from "./crlv";

// Itens no formato do CRLV digital: rótulo numa linha, valor logo abaixo na mesma coluna.
const itens: ItemTexto[] = [
  { s: "CÓDIGO RENAVAM", x: 31, y: 747 },
  { s: "00886511674", x: 31, y: 733 },
  { s: "PLACA", x: 31, y: 720 },
  { s: "MWB5492", x: 31, y: 707 },
  { s: "CHASSI", x: 130, y: 494 },
  { s: "9BM6953016B476377", x: 131, y: 471 },
  { s: "ESPÉCIE / TIPO", x: 31, y: 529 },
  { s: "CARGA CAMINHAO", x: 31, y: 506 },
  { s: "CARROCERIA", x: 317, y: 682 },
  { s: "CARROCERIA FECHADA", x: 316, y: 668 },
  { s: "NOME", x: 316, y: 656 },
  { s: "JUVENAL TRANSPORTES EIRELI", x: 316, y: 644 },
];

describe("valorSobRotulo", () => {
  it("lê o valor que fica abaixo do rótulo, na mesma coluna", () => {
    expect(valorSobRotulo(itens, "CHASSI")).toBe("9BM6953016B476377");
    expect(valorSobRotulo(itens, "PLACA")).toBe("MWB5492");
    expect(valorSobRotulo(itens, "NOME")).toBe("JUVENAL TRANSPORTES EIRELI");
  });

  it("ignora acento e pontuação do rótulo", () => {
    expect(valorSobRotulo(itens, "CÓDIGO RENAVAM")).toBe("00886511674");
    expect(valorSobRotulo(itens, "codigo renavam")).toBe("00886511674");
  });

  it("devolve vazio quando o rótulo não existe", () => {
    expect(valorSobRotulo(itens, "TAG PEDAGIO")).toBe("");
  });
});

describe("tipoVeiculoDoCrlv", () => {
  it("caminhão com baú é Truck (não Cavalo Mecânico)", () => {
    expect(tipoVeiculoDoCrlv("CARGA CAMINHAO", "CARROCERIA FECHADA")).toBe("Truck");
    expect(tipoVeiculoDoCrlv("CARGA CAMINHONETE", "CARROCERIA ABERTA")).toBe("Truck");
    expect(tipoVeiculoDoCrlv("ESPECIAL CAMINHAO", "CAR.FECH/MEC.OPER")).toBe("Truck");
  });

  it("cavalo de carreta (sem carroceria) é Cavalo Mecânico", () => {
    expect(tipoVeiculoDoCrlv("TRACAO CAMINHAO TRATOR", "NÃO APLICÁVEL")).toBe(
      "Cavalo Mecânico",
    );
    expect(tipoVeiculoDoCrlv("TRACAO CAMINHAO TRATOR", "")).toBe("Cavalo Mecânico");
  });

  it("reboque é Carreta", () => {
    expect(tipoVeiculoDoCrlv("CARGA SEMI-REBOQUE", "CARROCERIA FECHADA")).toBe("Carreta");
  });

  it("passageiro é Van/Furgão", () => {
    expect(tipoVeiculoDoCrlv("PASSAGEIRO MICROONIBUS", "NÃO APLICÁVEL")).toBe("Van/Furgão");
    expect(tipoVeiculoDoCrlv("PASSAGEIRO AUTOMOVEL", "NÃO APLICÁVEL")).toBe("Van/Furgão");
  });

  it("nomes explícitos têm prioridade", () => {
    expect(tipoVeiculoDoCrlv("CAVALO MECANICO", "CARROCERIA FECHADA")).toBe(
      "Cavalo Mecânico",
    );
    expect(tipoVeiculoDoCrlv("TRUCK", "")).toBe("Truck");
    expect(tipoVeiculoDoCrlv("TOCO", "")).toBe("Toco");
  });

  it("não devolve tipo para espécie desconhecida", () => {
    expect(tipoVeiculoDoCrlv("")).toBe("");
    expect(tipoVeiculoDoCrlv("REBOQUE", "")).toBe("Carreta");
  });
});

// Texto real do OCR de um CRLV impresso (rótulos embaralhados, valores legíveis).
const textoOcr = `REPÚBLICA FEDERATIVA DO BRASIL
SECRETARIA NACIONAL DE TRÂNSITO - SENATRAN
DETRAN- MG !
CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL ; CATEGORIA CAPACIDADE
CÓDIGO RENAVAM [5] FATE AAA ASIA [E] 2 : 13.75
00956390668 Tt) ba EA fo 7 =. & ! POTÊNCIA/CILINDRADA | PESO BRUTO TOTAL
PLACA EXERCÍCIO EEE: AO E ! 231CV/***x* 0.23
EE Ps ERR ——
MIH1250 2026 F. TE e Fecnf£a . z ; MOTOR | CMT | EIXOS | LOTAÇÃO
ANO FABRICAÇÃO ANO MODELO A, SEA, 5 2 meo aro 906973U0768790 0.32 3 03P
E E A+ E
2008 2008 : Nr PEA * SE o ' CARROCERIA
NÚMERO DO CRV =) SRT ADA Sã % : CARROCERIA FECHADA
? : JUVENAL TRANSPORTES EIRELI
: | CPF / CNP)
i 03.919.614/0001-60
MARCA / MODELO / VERSÃO ! ASSINADO DIGITALMENTE PELO DETRAN
M.BENZ/L 1620 '
ESPÉCIE / TIPO ! CAT. TARIF DATA DE QUITAÇÃO PAGAMENTO
i " x [corta única [ ] PARCELADO
CARGA CAMINHAO ' o
PLACA ANTERIOR / UF | CHASSI ; FUNDO NACIONAL DE SAÚDE (R$)
REAR RARA (RA 9BM6953048B585200 O RD MM`;

describe("extrairDoTextoOcr (CRLV impresso)", () => {
  it("lê os campos pelo padrão do texto (rótulos do OCR saem embaralhados)", () => {
    const o = extrairDoTextoOcr(textoOcr);
    expect(o.placa).toBe("MIH1250");
    expect(o.renavam).toBe("00956390668");
    expect(o.chassi).toBe("9BM6953048B585200");
    expect(o.ano).toBe("2008");
    expect(o.nome).toBe("JUVENAL TRANSPORTES EIRELI");
    expect(o.cpf).toBe("03.919.614/0001-60");
    expect(o.especie).toBe("CARGA CAMINHAO");
    expect(o.carroceria).toBe("CARROCERIA FECHADA");
    expect(o.marca).toBe("M.BENZ/L 1620");
    expect(o.eixos).toBe("3");
  });

  it("o tipo sai pela espécie + carroceria do texto do OCR", () => {
    const o = extrairDoTextoOcr(textoOcr);
    expect(tipoVeiculoDoCrlv(o.especie, o.carroceria)).toBe("Truck");
  });
});
