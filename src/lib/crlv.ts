// Leitura do CRLV (Certificado de Registro e Licenciamento de Veículo).
//
// O CRLV digital é desenhado em COLUNAS: o rótulo de cada campo fica numa linha e o
// valor logo abaixo, na mesma coluna. O PDF entrega os itens numa ordem que não é a
// visual (os rótulos vêm todos antes dos valores), então buscar no texto linearizado
// erra — daqui ler pela COORDENADA, pelo rótulo.
//
// CRLV impresso em PDF ("Print to PDF") não tem camada de texto: a página é só a
// imagem. Nesses casos cai no OCR (tesseract, a mesma lib que a CNH usa no RH) e os
// itens do OCR viram os mesmos itens — a página impressa tem o layout do CRLV digital,
// então as coordenadas batem.

/** Item de texto do PDF (ou do OCR) com a coordenada onde foi desenhado. */
export type ItemTexto = { s: string; x: number; y: number };

/** Normaliza um rótulo para comparação: sem acento, sem pontuação, maiúsculo. */
export const normRotulo = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/**
 * Valor de um campo do CRLV, lido pelo RÓTULO (busca o item abaixo dele, na mesma
 * coluna).
 */
export function valorSobRotulo(itens: ItemTexto[], rotulo: string): string {
  const alvo = normRotulo(rotulo);
  if (!alvo) return "";
  for (const lbl of itens.filter((it) => normRotulo(it.s) === alvo)) {
    const abaixo = itens
      .filter(
        (it) =>
          it.s.trim() &&
          it.y < lbl.y - 4 &&
          it.y > lbl.y - 34 &&
          Math.abs(it.x - lbl.x) < 16,
      )
      .sort((a, b) => b.y - a.y);
    if (abaixo.length) return abaixo[0].s.trim();
  }
  return "";
}

/**
 * Tipo de veículo a partir do texto do CRLV.
 *
 * O CRLV descreve a espécie em texto livre ("CARGA CAMINHAO", "CARGA SEMI-REBOQUE",
 * "PASSAGEIRO AUTOMOVEL", "TRACAO CAMINHAO TRATOR"...) e o cadastro usa os tipos da
 * lista padrão.
 *
 * `carroceria` desempata o caso genérico: "CARGA CAMINHAO" COM carroceria (baú) é um
 * caminhão com carga própria (Truck); SEM carroceria é o cavalo de uma carreta
 * (Cavalo Mecânico).
 */
export function tipoVeiculoDoCrlv(especie: string, carroceria = ""): string {
  const t = String(especie || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  const c = String(carroceria || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (!t) return "";
  if (
    t.includes("SEMI-REBOQUE") ||
    t.includes("REBOQUE") ||
    t.includes("CARRETA") ||
    t.includes("BITREM")
  )
    return "Carreta";
  if (t.includes("CAVALO")) return "Cavalo Mecânico";
  if (t.includes("TOCO")) return "Toco";
  if (t.includes("3/4")) return "3/4";
  if (t.includes("TRUCK")) return "Truck";
  if (
    t.includes("PASSAGEIRO") ||
    t.includes("MICROONIBUS") ||
    t.includes("MINIBUS") ||
    t.includes("ONIBUS") ||
    t.includes("VAN") ||
    t.includes("UTILITARIO") ||
    t.includes("FURGAO") ||
    // Caminhonete (picape/SUV de carga): é leve, não é caminhão nem carreta.
    t.includes("CAMINHONETE")
  )
    return "Van/Furgão";
  // Genérico ("CARGA CAMINHAO" / "CAMINHAO" / "CARGA"): a carroceria diz se é
  // caminhão com baú (Truck) ou cavalo de carreta (sem carroceria).
  if (t.includes("CAMINHAO") || t.includes("CARGA")) {
    const semCorpo =
      !c ||
      c.includes("NAO APLICAVEL") ||
      c.includes("SEM CARROCERIA") ||
      c.includes("NAO INFORMADO");
    return semCorpo ? "Cavalo Mecânico" : "Truck";
  }
  return "";
}

/**
 * Extrai os campos do CRLV a partir do TEXTO do OCR.
 *
 * No CRLV impresso o OCR embaralha os rótulos (o "NOME" às vezes vira "?"), mas os
 * VALORES saem legíveis: placa, RENAVAM, chassi, CNPJ, nome com sufixo jurídico,
 * espécie, carroceria e marca. Por isso a leitura aqui é por padrão de TEXTO — a
 * leitura por coordenada serve para o CRLV digital (que tem o texto de verdade).
 */
export function extrairDoTextoOcr(texto: string) {
  const up = String(texto || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const anos = [...up.matchAll(/\b(19|20)[0-9]{2}\b/g)].map((m) => m[0]);
  return {
    placa: (up.match(/([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/) || [])[1] || "",
    renavam: (up.match(/\b([0-9]{11})\b/) || [])[1] || "",
    chassi: (up.match(/\b([A-Z0-9]{17})\b/) || [])[1] || "",
    ano: anos[1] || anos[0] || "",
    nome:
      (
        up.match(
          /([A-Z][A-Z0-9 .&\-]{3,60}?\s(?:LTDA|EPP|MEI|EIRELI)(?:\s*-\s*(?:EPP|MEI))?)\b/,
        ) || []
      )[1] || "",
    cpf: (up.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/) || [])[1] || "",
    especie:
      (
        up.match(
          /(CARGA SEMI-REBOQUE|TRACAO CAMINHAO TRATOR|CARGA CAMINHONETE|CARGA CAMINHAO|CARGA SECA|CARGA FRIA|PASSAGEIRO [A-Z]+|ESPECIAL CAMINHAO|CAMINHAO)/,
        ) || []
      )[1] || "",
    carroceria:
      (
        up.match(
          /(CARROCERIA FECHADA|CARROCERIA ABERTA|CAR\.?FECH[^ ]*|FECHADA\/[A-Z ]*|FECHADA\/MEC[^ ]*)/,
        ) || []
      )[1] || "",
    // A marca no CRLV vem em dois formatos: "M.BENZ/L 1620" (com ponto) ou
    // "I/TOYOTA HILUX CS4X2" (sem ponto).
    marca:
      (up.match(/(?:^|\s)([A-Z]\.[A-Z]+\/[A-Z]?\s?[A-Z0-9]{2,8}(?:\s+[A-Z0-9]{2,8}){0,3})/) || [])[1] ||
      (up.match(/(?:^|\s)([A-Z]{1,2}\/[A-Z][A-Z0-9]*(?:\s+[A-Z0-9]{2,8}){0,3})/) || [])[1] ||
      "",
    eixos: (up.match(/(\d)\s+0\dP/) || [])[1] || "",
    categoria: (up.match(/\b(ALUGUEL|PARTICULAR|AGREGADO|TERCEIRO)\b/) || [])[1] || "",
  };
}

// ---------------------------------------------------------------------------
// CRLV IMPRESSO: OCR com RECORTE (a página inteira em OCR erra muito)
// ---------------------------------------------------------------------------

/** Palavra reconhecida pelo OCR, com a caixa (bbox) onde foi lida. */
export type PalavraOcr = {
  s: string;
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** Caixa (posição) em pixels do canvas do OCR. */
type Caixa = { x0: number; y0: number; x1: number; y1: number };

/**
 * Rótulos do CRLV digital. Servem para duas coisas: achar onde cada campo é
 * escrito e saber onde TERMINA a faixa do valor (o próximo rótulo começa o
 * próximo campo).
 */
const ROTULOS_CRLV = [
  "CÓDIGO RENAVAM",
  "PLACA EXERCÍCIO",
  "ANO FABRICAÇÃO",
  "ANO MODELO",
  "MARCA / MODELO / VERSÃO",
  "ESPÉCIE / TIPO",
  "CHASSI",
  "NOME",
  "CPF / CNPJ",
  "CARROCERIA",
  "PLACA ANTERIOR",
  "MOTOR",
  "CMT",
  "EIXOS",
  "LOTAÇÃO",
  "CAPACIDADE",
  "POTÊNCIA/CILINDRADA",
  "PESO BRUTO TOTAL",
  "COR PREDOMINANTE",
  "COMBUSTÍVEL",
  "LOCAL",
  "DATA",
  "CATEGORIA",
  "NÚMERO DO CRV",
  "CÓDIGO DE SEGURANÇA DO CLA",
  "ASSINADO DIGITALMENTE PELO DETRAN",
  "DADOS DO SEGURO DPVAT",
];

/**
 * Acha o rótulo de um campo no CRLV impresso.
 *
 * O CRLV é desenhado em COLUNAS: o rótulo fica numa linha e o valor logo abaixo,
 * alinhado com o COMEÇO do rótulo. Devolve a caixa das palavras do rótulo — o
 * valor é procurado logo abaixo dela.
 */
export function acharRotulo(palavras: PalavraOcr[], frase: string): Caixa | null {
  const alvo = frase
    .split(/\s+/)
    .map(normRotulo)
    .filter(Boolean);
  if (!alvo.length) return null;
  for (const w of palavras) {
    if (!alvo.includes(normRotulo(w.s))) continue;
    const cy = (w.y0 + w.y1) / 2;
    // as palavras da mesma linha (base vertical próxima)
    const linha = palavras.filter((p) => Math.abs((p.y0 + p.y1) / 2 - cy) < 12);
    const achados = linha.filter((p) => alvo.includes(normRotulo(p.s)));
    // todas as palavras do rótulo precisam estar na linha
    if (!alvo.every((a) => achados.some((p) => normRotulo(p.s) === a))) continue;
    return {
      x0: Math.min(...achados.map((p) => p.x0)),
      x1: Math.max(...achados.map((p) => p.x1)),
      y0: Math.min(...achados.map((p) => p.y0)),
      y1: Math.max(...achados.map((p) => p.y1)),
    };
  }
  return null;
}

/** Recorta a faixa do valor (logo abaixo do rótulo) e relê com o OCR. */
async function lerTrecho(
  worker: any,
  canvas: HTMLCanvasElement,
  rotulo: Caixa,
  larguraPt: number,
  alturaPt: number,
  escala: number,
  whitelist: string,
  proximoY?: number,
): Promise<string> {
  const x0 = Math.max(0, Math.round(rotulo.x0 - 8));
  const x1 = Math.min(canvas.width, Math.round(rotulo.x0 + larguraPt * escala));
  const y0 = Math.max(0, Math.round(rotulo.y1 + 2));
  let y1 = Math.min(canvas.height, Math.round(rotulo.y1 + alturaPt * escala));
  if (proximoY != null && proximoY > y0 + 6) y1 = Math.min(y1, Math.round(proximoY - 2));
  if (x1 - x0 < 6 || y1 - y0 < 6) return "";
  const c = document.createElement("canvas");
  c.width = x1 - x0;
  c.height = y1 - y0;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  try {
    // A whitelist tira o ruído (o "O" no lugar do "Q", barras, pontinhos) e o
    // PSM 6 lê a faixa inteira como um bloco.
    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: 6,
    });
    const { data } = await worker.recognize(c, {}, { text: true });
    return String(data?.text || "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

/**
 * Placa pelo próprio DOCUMENTO.
 *
 * O CRLV digital é impresso com o título "CRLVDigital_<PLACA>_<ano>" e o arquivo
 * quase sempre tem o nome da placa. O OCR erra letra com frequência (Q vira O,
 * M vira I), então essa fonte é bem mais segura que a leitura da imagem.
 */
export function placaDoDocumento(nomeArquivo?: string, tituloPdf?: string): string {
  const pega = (s?: string) =>
    (
      String(s || "")
        .toUpperCase()
        .match(/(?:^|[^A-Z0-9])([A-Z]{3}[0-9][A-Z0-9][0-9]{2})(?![A-Z0-9])/) || []
    )[1] || "";
  return pega(tituloPdf) || pega(nomeArquivo);
}

/** Dados lidos de um CRLV impresso (PDF sem camada de texto). */
export type DadosCrlvImpresso = {
  placa: string;
  renavam: string;
  chassi: string;
  ano: string;
  nome: string;
  cpf: string;
  especie: string;
  carroceria: string;
  marca: string;
  eixos: string;
  categoria: string;
  itens: ItemTexto[];
  texto: string;
};

/**
 * Lê um CRLV IMPRESSO (PDF "Print to PDF": a página é vetor/imagem, sem texto).
 *
 * A página é renderizada e passada pelo OCR; cada campo é lido de um RECORTE (a
 * faixa logo abaixo do rótulo) com uma whitelist de caracteres. Ler a página
 * inteira de uma vez erra muito: o RENAVAM virava o "código de segurança" e a
 * placa saía com as letras trocadas.
 */
export async function lerCrlvImpresso(
  pdf: any,
  opts: { nomeArquivo?: string; tituloPdf?: string } = {},
): Promise<DadosCrlvImpresso | null> {
  const { createWorker } = await import("tesseract.js");
  const page = await pdf.getPage(1);
  const escala = 4;
  const viewport = page.getViewport({ scale: escala });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const worker = await createWorker("por");
  try {
    // No tesseract.js v7 o output padrão é SÓ `text` — as palavras (com bbox) só
    // vêm se o `blocks` for pedido explicitamente.
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
    const blocos = (data as any)?.blocks ?? [];
    const palavras: PalavraOcr[] = blocos
      .flatMap((b: any) =>
        (b?.paragraphs ?? []).flatMap((p: any) =>
          (p?.lines ?? []).flatMap((l: any) => l?.words ?? []),
        ),
      )
      .map((w: any) => ({
        s: String(w?.text ?? "").trim(),
        conf: Number(w?.confidence ?? 0),
        x0: Number(w?.bbox?.x0 ?? 0),
        y0: Number(w?.bbox?.y0 ?? 0),
        x1: Number(w?.bbox?.x1 ?? 0),
        y1: Number(w?.bbox?.y1 ?? 0),
      }))
      .filter((p: PalavraOcr) => p.s);
    if (!palavras.length) return null;
    const texto = String(data?.text || "");

    // Onde cada rótulo está (e onde o próximo começa, para cortar a faixa).
    const rotulos = new Map<string, Caixa | null>();
    for (const r of ROTULOS_CRLV) rotulos.set(r, acharRotulo(palavras, r));
    const faixa = (nome: string) => {
      const r = rotulos.get(nome);
      if (!r) return null;
      let proximo = Infinity;
      for (const [outro, c] of rotulos) {
        if (!c || outro === nome) continue;
        if (c.y0 < r.y1 + 40) continue; // não é o rótulo seguinte
        if (c.x0 < r.x0 - 20 || c.x0 > r.x0 + 200) continue; // outra coluna
        if (c.y0 < proximo) proximo = c.y0;
      }
      return { rotulo: r, proximo };
    };
    const recorte = async (
      nome: string,
      larguraPt: number,
      alturaPt: number,
      whitelist: string,
    ) => {
      const f = faixa(nome);
      if (!f) return "";
      return lerTrecho(
        worker,
        canvas,
        f.rotulo,
        larguraPt,
        alturaPt,
        escala,
        whitelist,
        f.proximo,
      );
    };

    const renavamTxt = await recorte("CÓDIGO RENAVAM", 95, 18, "0123456789");
    const placaTxt = await recorte(
      "PLACA EXERCÍCIO",
      110,
      18,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    );
    const chassiTxt = await recorte(
      "CHASSI",
      120,
      26,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    );
    const marcaTxt = await recorte(
      "MARCA / MODELO / VERSÃO",
      135,
      26,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ .-&",
    );
    const especieTxt = await recorte(
      "ESPÉCIE / TIPO",
      120,
      26,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ ",
    );
    const anoTxt = await recorte("ANO FABRICAÇÃO", 90, 20, "0123456789");

    // O texto da página toda serve de reserva para o que o recorte não pegou.
    const txt = extrairDoTextoOcr(texto);
    const placaDoc = placaDoDocumento(opts.nomeArquivo, opts.tituloPdf);
    const placaOcr = (placaTxt.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/) || [])[1] || "";
    if (placaDoc && placaOcr && placaDoc !== placaOcr)
      console.log("[CRLV] placa do documento difere do OCR:", placaDoc, placaOcr);

    const alturaPt = canvas.height / escala;
    return {
      placa: placaDoc || placaOcr || txt.placa,
      renavam: (renavamTxt.match(/\d{11}/) || [])[0] || txt.renavam,
      chassi: (chassiTxt.match(/[A-Z0-9]{14,17}/) || [])[0] || txt.chassi,
      ano: (anoTxt.match(/\d{4}/) || [])[0] || txt.ano,
      nome: txt.nome,
      cpf: txt.cpf,
      especie: especieTxt || txt.especie,
      carroceria: txt.carroceria,
      marca: marcaTxt || txt.marca,
      eixos: txt.eixos,
      categoria: txt.categoria,
      // os mesmos itens, em pontos da página (para a leitura por rótulo)
      itens: palavras.map((p) => ({
        s: p.s,
        x: (p.x0 + p.x1) / 2 / escala,
        y: alturaPt - (p.y0 + p.y1) / 2 / escala,
      })),
      texto,
    };
  } catch {
    return null;
  } finally {
    await worker.terminate();
  }
}
