import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
export const DANFE_REV = "20260918-n1";

// DANFE no mesmo estilo visual do DACTE (dacte-pdf.ts): retrato A4, P&B,
// caixas com borda 0.2, rótulos uppercase bold 5.5, valores 6-7pt, barras CODE-128.
export interface DanfeProduto {
  codigo: string;
  nome: string;
  qtd: number | string;
  un: string;
  valorUnit: number;
  valorTotal: number;
  cfop?: string;
  cst?: string;
}

export interface DanfeParcela {
  numero: string;
  dataVencimento: string;
  valor: number;
}

export interface DanfeData {
  chave: string;
  numero: string;
  serie?: string;
  dataEmissao?: string;
  dhEmi?: string;
  ambiente?: string;
  naturezaOperacao?: string;
  cfop?: string;
  // Emitente
  emitNome: string;
  emitCnpj: string;
  emitEndereco?: string;
  emitBairro?: string;
  emitCEP?: string;
  emitCidade?: string;
  emitUF?: string;
  emitFone?: string;
  emitIE?: string;
  // Destinatário
  destNome?: string;
  destCnpj?: string;
  destEndereco?: string;
  destBairro?: string;
  destCEP?: string;
  destCidade?: string;
  destUF?: string;
  destIE?: string;
  // Totais
  valorProdutos?: number;
  valorFrete?: number;
  valorDesconto?: number;
  valorSeguro?: number;
  valorOutras?: number;
  baseIcms?: number;
  valorIcms?: number;
  valorTotal: number;
  // Transporte
  transportadora?: string;
  transpCnpj?: string;
  transpEndereco?: string;
  transpCidade?: string;
  transpUF?: string;
  volumes?: string;
  pesoBruto?: string;
  pesoLiquido?: string;
  // Itens
  produtos: DanfeProduto[];
  parcelas?: DanfeParcela[];
  infoComplementares?: string;
  protocolo?: string;
  logoDataUrl?: string;
  fl?: string;
}

function fmtCnpj(v: string): string {
  const c = (v || "").replace(/\D/g, "");
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "";
}

function fmtNum(v: number | string): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQtd(v: string | number): string {
  const s = String(v === undefined || v === null ? "" : v).trim();
  const m = s.match(/^(-?\d+)([.,](\d+))?$/);
  if (!m) return s;
  const dec = (m[3] || "").slice(0, 4);
  const thou = m[1].replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dd = (dec + "00").slice(0, Math.max(2, dec.length));
  return (s.charAt(0) === "-" ? "-" : "") + thou + "," + dd;
}

function fmtInt(v: string | number): string {
  const n = Number(String(v || "").replace(/\D/g, "")) || 0;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtChave(chave: string): string {
  return (chave || "").replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim();
}

function fmtData(v: string): string {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.length >= 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  return v;
}

function cfopFmt(cfop: string): string {
  const d = (cfop || "").replace(/\D/g, "");
  return d.length === 4 ? `${d[0]}.${d.slice(1)}` : (cfop || "");
}

// CODE-128C real da chave. Volta null fora do browser ou sem chave válida.
function barcodePng(chave: string): string | null {
  try {
    const digits = (chave || "").replace(/\D/g, "");
    if (digits.length !== 44 || typeof document === "undefined") return null;
    const JB: any = (JsBarcode as any)?.default || JsBarcode;
    const c = document.createElement("canvas");
    JB(c, digits, { format: "CODE128C", displayValue: false, margin: 0, height: 48, width: 2, background: "#ffffff", lineColor: "#000000" });
    return c.toDataURL("image/png");
  } catch { return null; }
}

export function gerarDanfePdf(data: DanfeData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 6, CW = W - 2 * M;
  const LIM = 291;
  let y = M;

  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); };
  const box = (x: number, yy: number, w: number, h: number) => { border(); doc.rect(x, yy, w, h, "S"); };
  const vline = (x: number, yy: number, h: number) => { border(); doc.line(x, yy, x, yy + h); };
  const hline = (x1: number, x2: number, yy: number) => { border(); doc.line(x1, yy, x2, yy); };
  const lab = (t: string, x: number, yy: number) => { black(); setFont("bold", 5.5); doc.text(t, x, yy); };
  const val = (t: string, x: number, yy: number, s = 7) => { black(); setFont("normal", s); doc.text(String(t || ""), x, yy); };
  const valB = (t: string, x: number, yy: number, s = 7) => { black(); setFont("bold", s); doc.text(String(t || ""), x, yy); };
  const need = (h: number) => { if (y + h > LIM) { doc.addPage(); y = M; } };
  const cut = (t: string, n: number) => String(t || "").slice(0, n).toUpperCase();
  const D = (v: any) => (v === undefined || v === null || v === "" ? "" : String(v));
  const ctr = (t: string, xx: number, yy: number, s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    try { (doc as any).text(t, xx, yy, { align: "center" }); } catch { doc.text(t, xx, yy); }
  };
  const right = (t: string, xx: number, yy: number, s = 6) => {
    black(); setFont("normal", s);
    try { (doc as any).text(t, xx, yy, { align: "right" }); } catch { doc.text(t, xx - doc.getTextWidth(t), yy); }
  };

  // ---- Cabeçalho: emitente (esq) | DANFE + barras + chave (dir) ----
  const colL = 118, colR = CW - colL - 2, rx = M + colL + 2;
  const headH = 34;
  box(M, y, colL, headH);
  if (data.logoDataUrl) { try { doc.addImage(data.logoDataUrl as string, "PNG", M + 2, y + 2, 26, 12); } catch {} }
  const ex = M + 30;
  valB(cut(D(data.emitNome) || "EMPRESA", 44), ex, y + 4, 7);
  setFont("normal", 6); black();
  doc.text(`Endereço : ${cut(D(data.emitEndereco), 60)}`, ex, y + 8);
  doc.text(`Bairro : ${cut(D(data.emitBairro), 34)}   CEP : ${D(data.emitCEP)}`, ex, y + 11.5);
  doc.text(`Município : ${cut(D(data.emitCidade), 30)}   UF : ${D(data.emitUF)}`, ex, y + 15);
  doc.text(`Fone : ${D(data.emitFone)}`, ex, y + 18.5);
  doc.text(`CPF / CNPJ : ${fmtCnpj(data.emitCnpj)}`, ex, y + 22);
  doc.text(`Insc. Est. : ${cut(D(data.emitIE), 18)}`, ex, y + 25.5);
  doc.text(`Natureza da Operação : ${cut(D(data.naturezaOperacao), 40)}`, ex, y + 29.5);

  // Coluna direita: DANFE, modelo/série/número, entrada/saída, barras, chave
  box(rx, y, colR, headH);
  ctr("DANFE", rx + colR / 2, y + 4.5, 9, true);
  setFont("normal", 4.5); black();
  ctr("Documento Auxiliar da Nota Fiscal Eletrônica", rx + colR / 2, y + 7, 4.2);
  ctr("0 - ENTRADA   1 - SAÍDA", rx + colR / 2, y + 9.5, 4.5, true);
  hline(rx + 2, rx + colR - 2, y + 11);
  setFont("normal", 5); black();
  doc.text(`MODELO`, rx + 2, y + 14);
  doc.text(`SÉRIE`, rx + 22, y + 14);
  doc.text(`NÚMERO`, rx + 40, y + 14);
  doc.text(`FL`, rx + 60, y + 14);
  valB("55", rx + 2, y + 17.5, 6);
  valB(String(data.serie || "1").padStart(3, "0"), rx + 22, y + 17.5, 6);
  valB(fmtInt(data.numero), rx + 40, y + 17.5, 6);
  valB(D(data.fl) || "1/1", rx + 60, y + 17.5, 6);
  vline(rx + 20, y + 11.5, 8);
  vline(rx + 38, y + 11.5, 8);
  vline(rx + 58, y + 11.5, 8);
  const barsImg = barcodePng(data.chave);
  if (barsImg) {
    try {
      const props = (doc as any).getImageProperties(barsImg);
      const ratio = props.width / props.height;
      let iw = 8 * ratio, ih = 8;
      const maxW = colR - 6;
      if (iw > maxW) { iw = maxW; ih = iw / ratio; }
      doc.addImage(barsImg, "PNG", rx + (colR - iw) / 2, y + 21, iw, ih);
    } catch {}
  }
  setFont("normal", 4.5); black();
  ctr("CHAVE DE ACESSO", rx + colR / 2, y + 30.5, 4.5, true);
  ctr(fmtChave(data.chave), rx + colR / 2, y + 33, 5.5, true);
  y += headH + 1;

  // ---- Emissão / entrada-saída ----
  const emiH = 6;
  box(M, y, CW, emiH);
  const colsEmi: Array<[string, string, number]> = [
    ["Data de Emissão", fmtData(D(data.dhEmi || data.dataEmissao)), 30],
    ["Data de Entrada / Saída", "", 34],
    ["Hora de Entrada / Saída", "", 30],
    ["CFOP", cfopFmt(D(data.cfop)), 20],
    ["Nº da Nota Fiscal", fmtInt(data.numero), 0],
  ];
  let emx = M + 2;
  colsEmi.forEach(([l, v, w]) => {
    lab(l, emx, y + 2.5);
    val(v, emx, y + 5, 6);
    if (w) { vline(emx + w, y, emiH); emx += w + 2; }
  });
  y += emiH + 1;

  // ---- Destinatário / remetente ----
  const destH = 20;
  box(M, y, CW, destH);
  setFont("bold", 6); black();
  doc.text("DESTINATÁRIO / REMETENTE", M + 2, y + 3.5);
  const dRows: Array<[string, string, string, string]> = [
    [`Nome / Razão Social : ${cut(D(data.destNome), 60)}`, `CPF / CNPJ : ${fmtCnpj(D(data.destCnpj))}`, `Data de Emissão : ${fmtData(D(data.dhEmi || data.dataEmissao))}`],
    [`Endereço : ${cut(D(data.destEndereco), 60)}`, `Bairro : ${cut(D(data.destBairro), 26)}`, `CEP : ${D(data.destCEP)}`],
    [`Município : ${cut(D(data.destCidade), 40)}`, `UF : ${D(data.destUF)}`, `Insc. Est. : ${cut(D(data.destIE), 18)}`],
  ] as any;
  let dyy = y + 8;
  dRows.forEach((r) => {
    const rr = r as unknown as string[];
    setFont("normal", 6); black();
    doc.text(rr[0], M + 2, dyy);
    doc.text(rr[1], M + 96, dyy);
    doc.text(rr[2], M + 150, dyy);
    dyy += 4;
  });
  y += destH + 1;

  // ---- Produtos / serviços ----
  const titH = 3.5;
  box(M, y, CW, titH);
  ctr("DADOS DOS PRODUTOS / SERVIÇOS", W / 2, y + 2.5, 6, true);
  y += titH;
  const colDefs: Array<[string, number, "l" | "c" | "r"]> = [
    ["CÓDIGO", 18, "l"],
    ["DESCRIÇÃO DO PRODUTO / SERVIÇO", 62, "l"],
    ["CFOP", 12, "c"],
    ["UN", 10, "c"],
    ["QUANT.", 16, "r"],
    ["V. UNITÁRIO", 20, "r"],
    ["V. TOTAL", 20, "r"],
    ["B. CÁLC. ICMS", 18, "r"],
    ["V. ICMS", 22, "r"],
  ];
  const headPH = 5;
  const drawProdHead = () => {
    need(headPH + 4);
    box(M, y, CW, headPH);
    let cx = M;
    colDefs.forEach(([h, w]) => {
      black(); setFont("bold", 4.8);
      const tx = h === "DESCRIÇÃO DO PRODUTO / SERVIÇO" ? cx + 1 : cx + w / 2;
      try { (doc as any).text(h, tx, y + 3.2, { align: h.startsWith("DESCRI") || h === "CÓDIGO" ? "left" : "center" }); }
      catch { doc.text(h, cx + 1, y + 3.2); }
      if (cx > M) vline(cx, y, headPH);
      cx += w;
    });
    vline(M + 18, y, headPH);
    y += headPH;
  };
  drawProdHead();
  const rowH = 4.2;
  const produtos = data.produtos || [];
  if (produtos.length === 0) {
    need(8);
    box(M, y, CW, 8);
    ctr("Nenhum item informado.", W / 2, y + 5, 6);
    y += 8;
  } else {
    produtos.forEach((p) => {
      need(rowH + 4);
      box(M, y, CW, rowH);
      let cx = M;
      const cells: Array<[string, number, "l" | "c" | "r"]> = [
        [cut(D(p.codigo), 12), 18, "l"],
        [cut(D(p.nome), 44), 62, "l"],
        [cfopFmt(D(p.cfop)), 12, "c"],
        [cut(D(p.un), 6), 10, "c"],
        [fmtQtd(D(p.qtd)), 16, "r"],
        [fmtNum(p.valorUnit), 20, "r"],
        [fmtNum(p.valorTotal), 20, "r"],
        ["", 18, "r"],
        ["", 22, "r"],
      ];
      cells.forEach(([txt, w, align], i) => {
        black(); setFont("normal", 5);
        if (i > 0) vline(cx, y, rowH);
        if (txt) {
          if (align === "r") right(txt, cx + w - 1, y + 2.9, 5);
          else if (align === "c") ctr(txt, cx + w / 2, y + 2.9, 5);
          else doc.text(txt, cx + 1, y + 2.9);
        }
        cx += w;
      });
      y += rowH;
    });
  }

  // ---- Totais ----
  need(14);
  const totH = 4;
  box(M, y, CW, totH);
  ctr("CÁLCULO DO IMPOSTO", W / 2, y + 2.8, 6, true);
  y += totH;
  const vp = data.valorProdutos !== undefined ? data.valorProdutos : produtos.reduce((a, p) => a + (Number(p.valorTotal) || 0), 0);
  const totCols: Array<[string, string, number]> = [
    ["Base de Cálculo ICMS", fmtNum(data.baseIcms ?? 0), 34],
    ["Valor do ICMS", fmtNum(data.valorIcms ?? 0), 30],
    ["Valor do Frete", fmtNum(data.valorFrete ?? 0), 26],
    ["Valor do Seguro", fmtNum(data.valorSeguro ?? 0), 26],
    ["Desconto", fmtNum(data.valorDesconto ?? 0), 26],
    ["Outras Despesas", fmtNum(data.valorOutras ?? 0), 0],
  ];
  const totValH = 7;
  box(M, y, CW, totValH);
  let tx = M + 2;
  totCols.forEach(([l, v, w]) => {
    lab(l, tx, y + 2.5);
    val(v, tx, y + 5.5, 6);
    if (w) { vline(tx + w, y, totValH); tx += w + 2; }
  });
  y += totValH;
  const totRowH = 7;
  box(M, y, CW, totRowH);
  lab("Valor Total dos Produtos", M + 2, y + 2.5);
  val(fmtNum(vp), M + 2, y + 5.5, 6);
  vline(M + 40, y, totRowH);
  setFont("bold", 6); black();
  doc.text("VALOR TOTAL DA NOTA", M + 44, y + 2.5);
  { const s = fmtNum(data.valorTotal); setFont("bold", 9); black(); doc.text(s, M + 44, y + 6); }
  y += totRowH + 1;

  // ---- Transportador / volumes ----
  const trH = 12;
  box(M, y, CW, trH);
  setFont("bold", 6); black();
  doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", M + 2, y + 3.5);
  setFont("normal", 6); black();
  doc.text(`Razão Social : ${cut(D(data.transportadora), 50)}`, M + 2, y + 7.5);
  doc.text(`CPF / CNPJ : ${fmtCnpj(D(data.transpCnpj))}`, M + 100, y + 7.5);
  doc.text(`Endereço : ${cut(D(data.transpEndereco), 46)}`, M + 150, y + 7.5);
  doc.text(`Município : ${cut(D(data.transpCidade), 40)}`, M + 2, y + 10.8);
  doc.text(`UF : ${D(data.transpUF)}`, M + 100, y + 10.8);
  doc.text(`Quantidade : ${D(data.volumes)}`, M + 116, y + 10.8);
  doc.text(`Peso Bruto : ${D(data.pesoBruto)}`, M + 146, y + 10.8);
  doc.text(`Peso Líquido : ${D(data.pesoLiquido)}`, M + 172, y + 10.8);
  y += trH + 1;

  // ---- Duplicatas / parcelas ----
  const parcelas = data.parcelas || [];
  if (parcelas.length > 0) {
    need(12);
    const dpTitleH = 3.5;
    box(M, y, CW, dpTitleH);
    ctr("DUPLICATAS", W / 2, y + 2.5, 6, true);
    y += dpTitleH;
    const perRow = 3;
    const dpColW = CW / perRow;
    for (let i = 0; i < parcelas.length; i += perRow) {
      need(6);
      const chunk = parcelas.slice(i, i + perRow);
      box(M, y, CW, 5.5);
      chunk.forEach((pc, c) => {
        const cx = M + c * dpColW;
        if (c > 0) vline(cx, y, 5.5);
        setFont("normal", 5); black();
        doc.text(`Nº ${D(pc.numero) || String(i + c + 1)}`, cx + 1.5, y + 2.2);
        doc.text(`Venc. ${fmtData(D(pc.dataVencimento))}`, cx + 1.5, y + 4.5);
        right(fmtNum(pc.valor), cx + dpColW - 1.5, y + 3.4, 5.5);
      });
      y += 5.5;
    }
    y += 1;
  }

  // ---- Informações complementares ----
  const isHom = (data.ambiente || "") === "homologacao";
  need(20);
  const iaH = 14;
  box(M, y, CW, iaH);
  setFont("bold", 6); black();
  doc.text("Informações Complementares", M + 2, y + 3.5);
  if (D(data.infoComplementares)) {
    setFont("normal", 5); black();
    const lines = doc.splitTextToSize(String(data.infoComplementares), CW - 4);
    doc.text(lines.slice(0, 4), M + 2, y + 7.5);
  }
  if (D(data.protocolo)) {
    setFont("normal", 5); black();
    doc.text(`Protocolo de Autorização : ${D(data.protocolo)}`, M + 2, y + iaH - 2);
  }
  if (isHom) {
    doc.setTextColor(170, 170, 170);
    ctr("AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", W / 2, y + iaH / 2 + 1, 9, true);
    black();
  }
  y += iaH + 1;

  // ---- Rodapé ----
  need(8);
  setFont("normal", 4.5); doc.setTextColor(120, 120, 120);
  ctr("DANFE gerado pelo sistema Norvo Gestão — sem valor fiscal (representação do documento importado).", W / 2, y + 3, 4.5);

  return doc.output("blob");
}
