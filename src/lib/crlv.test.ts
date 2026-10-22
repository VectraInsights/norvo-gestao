import { describe, expect, it } from "vitest";
import {
  acharRotulo,
  extrairDoTextoOcr,
  placaDoDocumento,
  tipoVeiculoDoCrlv,
  valorSobRotulo,
  type ItemTexto,
  type PalavraOcr,
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
    expect(tipoVeiculoDoCrlv("ESPECIAL CAMINHAO", "CAR.FECH/MEC.OPER")).toBe("Truck");
  });

  it("caminhonete (picape) é Caminhonete — não é Van nem Truck", () => {
    expect(tipoVeiculoDoCrlv("CARGA CAMINHONETE", "CARROCERIA ABERTA")).toBe("Caminhonete");
    expect(tipoVeiculoDoCrlv("CARGA CAMINHONETE", "")).toBe("Caminhonete");
  });

  it("picape continua Caminhonete mesmo com espécie genérica (o modelo desempata)", () => {
    expect(
      tipoVeiculoDoCrlv("CARGA CAMINHAO", "CARROCERIA ABERTA", "I/TOYOTA HILUX CS4X2"),
    ).toBe("Caminhonete");
    expect(tipoVeiculoDoCrlv("CARGA CAMINHAO", "", "GM S10 2.8")).toBe("Caminhonete");
  });

  it("ônibus e microônibus são tipos próprios", () => {
    expect(tipoVeiculoDoCrlv("PASSAGEIRO MICROONIBUS", "NÃO APLICÁVEL")).toBe(
      "Microônibus",
    );
    expect(tipoVeiculoDoCrlv("PASSAGEIRO ONIBUS", "NÃO APLICÁVEL")).toBe("Onibus");
    expect(tipoVeiculoDoCrlv("PASSAGEIRO AUTOMOVEL", "NÃO APLICÁVEL")).toBe("Automóvel");
    expect(tipoVeiculoDoCrlv("PASSAGEIRO MOTOCICLETA", "")).toBe("Motocicleta");
  });

  it("bitrem é Bitrem (e não Carreta)", () => {
    expect(tipoVeiculoDoCrlv("CARGA BITREM", "")).toBe("Bitrem");
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

  it("passageiro é Automóvel (e van/furgão quando o CRLV diz van)", () => {
    expect(tipoVeiculoDoCrlv("VAN", "NÃO APLICÁVEL")).toBe("Van/Furgão");
    expect(tipoVeiculoDoCrlv("UTILITARIO", "")).toBe("Van/Furgão");
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

describe("placaDoDocumento", () => {
  it("pega a placa no título do PDF (o CRLV digital imprime com ela)", () => {
    expect(placaDoDocumento("", "CRLVDigital_MQK4089_2026 (1).pdf")).toBe("MQK4089");
    expect(placaDoDocumento("", "CRLVDigital_ABC1234_2026")).toBe("ABC1234");
  });

  it("pega a placa no nome do arquivo quando não há título", () => {
    expect(placaDoDocumento("MQK4089.pdf", "")).toBe("MQK4089");
    expect(placaDoDocumento("CRLV MIH1250 (1).pdf", "")).toBe("MIH1250");
  });

  it("não inventa placa quando não há uma no documento", () => {
    expect(placaDoDocumento("veiculo.pdf", "")).toBe("");
    expect(placaDoDocumento("", "")).toBe("");
  });
});

describe("acharRotulo", () => {
  // Palavras do OCR de um CRLV impresso (as do rótulo e as do valor), em pixels.
  const p = (s: string, x0: number, y0: number, x1: number, y1: number): PalavraOcr => ({
    s,
    conf: 90,
    x0,
    y0,
    x1,
    y1,
  });

  const palavras: PalavraOcr[] = [
    p("CÓDIGO", 126, 359, 214, 381),
    p("RENAVAM", 223, 364, 327, 381),
    p("00860983307", 128, 410, 385, 436),
    p("PLACA", 127, 455, 194, 498),
    p("EXERCÍCIO", 413, 464, 522, 486),
    p("MQOK4089", 123, 515, 290, 546),
    p("ANO", 125, 574, 173, 591),
    p("FABRICAÇÃO", 182, 570, 317, 597),
    p("MARCA", 127, 1094, 217, 1111),
    p("MODELO", 225, 1094, 320, 1111),
    p("VERSÃO", 342, 1089, 426, 1111),
    p("ESPÉCIE", 127, 1230, 209, 1252),
    p("TIPO", 230, 1235, 280, 1252),
    p("PLACA", 127, 1376, 194, 1393),
    p("ANTERIOR", 200, 1376, 324, 1393),
    p("CHASSI", 523, 1376, 598, 1393),
  ];

  it("acha o rótulo e devolve o começo da coluna do valor", () => {
    const renavam = acharRotulo(palavras, "CÓDIGO RENAVAM");
    expect(renavam).not.toBeNull();
    expect(renavam!.x0).toBe(126);
    expect(renavam!.y1).toBe(381);

    const placa = acharRotulo(palavras, "PLACA EXERCÍCIO");
    expect(placa!.x0).toBe(127);

    const marca = acharRotulo(palavras, "MARCA / MODELO / VERSÃO");
    expect(marca!.x0).toBe(127);
    expect(marca!.y1).toBe(1111);
  });

  it("acha o CHASSI no meio da linha (e não no PLACA ANTERIOR)", () => {
    const chassi = acharRotulo(palavras, "CHASSI");
    expect(chassi!.x0).toBe(523);
    expect(chassi!.y1).toBe(1393);
  });

  it("devolve null quando o rótulo não existe", () => {
    expect(acharRotulo(palavras, "TAG PEDAGIO")).toBeNull();
  });
});
