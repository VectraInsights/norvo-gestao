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
    t.includes("FURGAO")
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
 * Lê uma página de CRLV IMPRESSO (PDF sem camada de texto) com OCR.
 *
 * Renderiza a página num canvas e roda o tesseract (português). Devolve os "itens" no
 * mesmo formato do texto do PDF (x/y em pontos da página), para o parser por rótulo
 * funcionar igual.
 */
export async function ocrPaginaCrlv(pdf: any): Promise<ItemTexto[]> {
  const { createWorker } = await import("tesseract.js");
  const page = await pdf.getPage(1);
  const scale = 3;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  await page.render({ canvasContext: ctx, viewport }).promise;
  const worker = await createWorker("por");
  try {
    const { data } = await worker.recognize(canvas);
    const words = (data as any)?.words ?? [];
    return words
      .map((w: any) => ({
        s: String(w?.text ?? ""),
        // tesseract mede em pixels do canvas, com y do topo; o PDF usa y de baixo
        x: ((w?.bbox?.x0 ?? 0) + (w?.bbox?.x1 ?? 0)) / 2 / scale,
        y: (viewport.height - ((w?.bbox?.y0 ?? 0) + (w?.bbox?.y1 ?? 0)) / 2) / scale,
      }))
      .filter((i: ItemTexto) => i.s.trim());
  } catch {
    return [];
  } finally {
    await worker.terminate();
  }
}
