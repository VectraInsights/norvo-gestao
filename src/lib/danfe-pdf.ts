import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
export const DANFE_REV = "20261003-n2";

// DANFE no layout oficial da SEFAZ (NF-e modelo 55, retrato A4, P&B):
// canhoto no topo, cabeçalho emitente/DANFE/código-de-barras+chave, e as seções
// Destinatário, Fatura, Cálculo do Imposto, Transportador, Produtos, ISSQN e
// Dados Adicionais, com rótulos uppercase miúdos e valores abaixo, como no modelo.
export interface DanfeProduto {
  codigo: string;
  nome: string;
  qtd: number | string;
  un: string;
  valorUnit: number;
  valorTotal: number;
  cfop?: string;
  cst?: string;
  ncm?: string;
  baseIcms?: number | string;
  vIcms?: number | string;
  vIpi?: number | string;
  aliqIcms?: number | string;
  aliqIpi?: number | string;
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
  fl?: string;
  tpEntradaSaida?: string; // "0" entrada | "1" saída
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
  emitIESubst?: string;
  // Destinatário
  destNome?: string;
  destCnpj?: string;
  destEndereco?: string;
  destBairro?: string;
  destCEP?: string;
  destCidade?: string;
  destUF?: string;
  destFone?: string;
  destIE?: string;
  // Totais
  valorProdutos?: number;
  valorFrete?: number;
  valorDesconto?: number;
  valorSeguro?: number;
  valorOutras?: number;
  baseIcms?: number;
  valorIcms?: number;
  baseIcmsST?: number;
  valorIcmsST?: number;
  valorTotal: number;
  // Transporte
  transportadora?: string;
  transpCnpj?: string;
  transpEndereco?: string;
  transpCidade?: string;
  transpUF?: string;
  transpIE?: string;
  fretePorConta?: string;
  antt?: string;
  placa?: string;
  placaUF?: string;
  volumes?: string;
  especie?: string;
  marca?: string;
  numeracao?: string;
  pesoBruto?: string;
  pesoLiquido?: string;
  // ISSQN
  issqnInscMun?: string;
  issqnTotalServicos?: number | string;
  issqnBase?: number | string;
  issqnValor?: number | string;
  // Itens / parcelas / rodapé
  produtos: DanfeProduto[];
  parcelas?: DanfeParcela[];
  infoComplementares?: string;
  protocolo?: string;
  protocoloData?: string;
  logoDataUrl?: string;
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

function fmtDH(v: string): string {
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return fmtData(v);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return v || ""; }
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

interface Col {
  label: string;
  value?: string;
  w: number;
  align?: "l" | "c" | "r";
  vsize?: number;
}

export function gerarDanfePdf(data: DanfeData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 5, CW = W - 2 * M;
  const LIM = 292;
  let y = M;

  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); };
  const box = (x: number, yy: number, w: number, h: number) => { border(); doc.rect(x, yy, w, h, "S"); };
  const vline = (x: number, yy: number, h: number) => { border(); doc.line(x, yy, x, yy + h); };
  const lab = (t: string, x: number, yy: number) => { black(); setFont("bold", 4.6); doc.text(String(t || "").toUpperCase(), x, yy); };
  const need = (h: number) => { if (y + h > LIM) { doc.addPage(); y = M; } };
  const cut = (t: string, n: number) => String(t || "").slice(0, n);
  const D = (v: any) => (v === undefined || v === null || v === "" ? "" : String(v));
  const ctr = (t: string, xx: number, yy: number, s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    try { (doc as any).text(t, xx, yy, { align: "center" }); } catch { doc.text(t, xx, yy); }
  };
  const drawVal = (t: string, x: number, w: number, yy: number, align: "l" | "c" | "r", s: number) => {
    black(); setFont("normal", s);
    if (align === "r") { try { (doc as any).text(t, x + w - 1, yy, { align: "right" }); } catch { doc.text(t, x + 1, yy); } }
    else if (align === "c") { try { (doc as any).text(t, x + w / 2, yy, { align: "center" }); } catch { doc.text(t, x + 1, yy); } }
    else doc.text(t, x + 1, yy);
  };

  // Linha de células: rótulo uppercase no topo + valor abaixo, separadores verticais
  const linha = (h: number, cols: Col[], valY?: number): number => {
    box(M, y, CW, h);
    let x = M;
    cols.forEach((c, i) => {
      if (i > 0) vline(x, y, h);
      lab(c.label, x + 1, y + 2.6);
      if (c.value) drawVal(c.value, x, c.w, y + (valY ?? h - 1.4), c.align || "l", c.vsize ?? 7);
      x += c.w;
    });
    y += h;
    return y;
  };

  // Barra de título de seção (fundo cinza-claro, texto bold)
  const secao = (titulo: string): number => {
    need(6);
    doc.setFillColor(214, 214, 214);
    doc.rect(M, y, CW, 4, "F");
    border(); doc.rect(M, y, CW, 4, "S");
    black(); setFont("bold", 5.4);
    doc.text(titulo.toUpperCase(), M + 1, y + 2.8);
    y += 4;
    return y;
  };

  // ================= CANHOTO (recibo de entrega) =================
  const canH = 9;
  box(M, y, CW, canH);
  setFont("normal", 6); black();
  doc.text(`Recebemos de ${cut(D(data.emitNome).toUpperCase(), 78)} a mercadoria abaixo discriminada`, M + 1.5, y + 5.5);
  vline(M + 132, y, canH);
  vline(M + 160, y, canH);
  lab("Data de Recebimento", M + 133, y + 2.6);
  lab("Identificação e Assinatura do Recebedor", M + 161, y + 2.6);
  y += canH;
  // linha de corte tracejada
  doc.saveGraphicsState();
  try { (doc as any).setLineDashPattern([2, 2], 0); } catch {}
  border(); doc.line(M, y + 1, M + CW, y + 1);
  try { (doc as any).restoreGraphicsState(); } catch {}
  border();
  y += 2.5;

  // ================= CABEÇALHO: emitente | DANFE | barras+chave =================
  const headH = 30;
  const wE = 70, wD = 55, wB = CW - wE - wD;
  box(M, y, wE, headH);
  box(M + wE, y, wD, headH);
  box(M + wE + wD, y, wB, headH);
  // Emitente
  if (data.logoDataUrl) { try { doc.addImage(data.logoDataUrl as string, "PNG", M + 2, y + 2, 24, 10); } catch {} }
  setFont("bold", 7); black();
  doc.text(cut(D(data.emitNome).toUpperCase(), 40), M + 1.5, y + 5);
  setFont("normal", 5.6); black();
  doc.text(cut(D(data.emitEndereco), 46), M + 1.5, y + 9);
  doc.text(`${cut(D(data.emitBairro), 22)}  CEP: ${D(data.emitCEP)}`, M + 1.5, y + 12);
  doc.text(`${cut(D(data.emitCidade), 26)} / ${D(data.emitUF)}  Fone: ${D(data.emitFone)}`, M + 1.5, y + 15);
  setFont("bold", 5.6); black();
  doc.text(`CNPJ: ${fmtCnpj(data.emitCnpj)}   IE: ${D(data.emitIE)}`, M + 1.5, y + 19);
  // Bloco DANFE
  const dx = M + wE;
  ctr("DANFE", dx + wD / 2, y + 5, 10, true);
  setFont("normal", 4.4); black();
  ctr("Documento Auxiliar da Nota Fiscal Eletrônica", dx + wD / 2, y + 8, 4.4);
  ctr("Não permite efeito tributário / não substitui a nota fiscal", dx + wD / 2, y + 10.4, 4);
  const tp = D(data.tpEntradaSaida) || "1";
  setFont("bold", 5.4); black();
  ctr(`0 - ENTRADA      1 - SAÍDA`, dx + wD / 2, y + 14, 5.4, true);
  // destaca o tipo aplicável
  const tpX = tp === "0" ? dx + wD / 2 - 16 : dx + wD / 2 + 10;
  border(); doc.rect(tpX - 1.6, y + 11.4, 3.2, 3.2, "S");
  setFont("bold", 6); black();
  ctr(`Nº ${fmtInt(data.numero)}`, dx + wD / 2, y + 19, 6, true);
  ctr(`SÉRIE ${String(data.serie || "1").padStart(3, "0")}   FOLHA ${D(data.fl) || "1/1"}`, dx + wD / 2, y + 23, 5.4, true);
  // Bloco barras + chave
  const bx = M + wE + wD;
  const barsImg = barcodePng(data.chave);
  if (barsImg) {
    try {
      const props = (doc as any).getImageProperties(barsImg);
      const ratio = props.width / props.height;
      let iw = 9 * ratio, ih = 9;
      const maxW = wB - 6;
      if (iw > maxW) { iw = maxW; ih = iw / ratio; }
      doc.addImage(barsImg, "PNG", bx + (wB - iw) / 2, y + 2, iw, ih);
    } catch {}
  }
  lab("Chave de Acesso", bx + (wB - 20) / 2, y + 14);
  setFont("bold", 5.6); black();
  ctr(fmtChave(data.chave), bx + wB / 2, y + 18, 5.6, true);
  setFont("normal", 4.2); black();
  ctr("Consulta de autenticidade no portal nacional da NF-e", bx + wB / 2, y + 22, 4.2);
  ctr("www.nfe.fazenda.gov.br ou no site da Sefaz Autorizada", bx + wB / 2, y + 24.4, 4.2);
  y += headH;

  // ================= NATUREZA / PROTOCOLO =================
  linha(7, [
    { label: "Natureza da Operação", value: cut(D(data.naturezaOperacao).toUpperCase(), 60), w: 118 },
    { label: "Protocolo de Autorização de Uso", value: `${D(data.protocolo)}  ${fmtDH(D(data.protocoloData))}`, w: CW - 118, vsize: 6 },
  ]);
  linha(7, [
    { label: "Inscrição Estadual", value: D(data.emitIE), w: 66 },
    { label: "Insc. Estadual do Subst. Tribut.", value: D(data.emitIESubst), w: 66 },
    { label: "CNPJ", value: fmtCnpj(data.emitCnpj), w: CW - 132 },
  ]);

  // ================= DESTINATÁRIO / REMETENTE =================
  secao("Destinatário / Remetente");
  linha(7, [
    { label: "Nome / Razão Social", value: cut(D(data.destNome).toUpperCase(), 66), w: 118 },
    { label: "CNPJ / CPF", value: fmtCnpj(D(data.destCnpj)), w: 50 },
    { label: "Data da Emissão", value: fmtData(D(data.dhEmi || data.dataEmissao)), w: CW - 168, align: "c" },
  ]);
  linha(7, [
    { label: "Endereço", value: cut(D(data.destEndereco).toUpperCase(), 62), w: 108 },
    { label: "Bairro / Distrito", value: cut(D(data.destBairro), 34), w: 60 },
    { label: "CEP", value: D(data.destCEP), w: CW - 168 },
  ]);
  linha(7, [
    { label: "Município", value: cut(D(data.destCidade).toUpperCase(), 50), w: 88 },
    { label: "UF", value: D(data.destUF), w: 12, align: "c" },
    { label: "Fone / Fax", value: D(data.destFone), w: 48 },
    { label: "Inscrição Estadual", value: D(data.destIE), w: CW - 148 },
  ]);

  // ================= FATURA / DUPLICATAS =================
  const parcelas = data.parcelas || [];
  if (parcelas.length > 0) {
    secao("Fatura / Duplicatas");
    const somaParc = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    linha(7, [
      { label: "Número da Fatura", value: D(parcelas[0]?.numero) || fmtInt(data.numero), w: 60 },
      { label: "Valor Original", value: fmtNum(somaParc || data.valorTotal), w: 46, align: "r" },
      { label: "Valor do Desconto", value: fmtNum(data.valorDesconto ?? 0), w: 46, align: "r" },
      { label: "Valor Líquido", value: fmtNum(data.valorTotal), w: CW - 152, align: "r" },
    ]);
    const perRow = 4;
    const colW = CW / perRow;
    for (let i = 0; i < parcelas.length; i += perRow) {
      need(6);
      const chunk = parcelas.slice(i, i + perRow);
      box(M, y, CW, 5.5);
      chunk.forEach((pc, c) => {
        const cx = M + c * colW;
        if (c > 0) vline(cx, y, 5.5);
        setFont("normal", 5); black();
        doc.text(`${D(pc.numero) || String(i + c + 1)}`, cx + 1.5, y + 2.4);
        doc.text(fmtData(D(pc.dataVencimento)), cx + 1.5, y + 4.6);
        drawVal(fmtNum(pc.valor), cx, colW, y + 3.6, "r", 5.4);
      });
      y += 5.5;
    }
  }

  // ================= CÁLCULO DO IMPOSTO =================
  secao("Cálculo do Imposto");
  const vp = data.valorProdutos !== undefined ? data.valorProdutos : (data.produtos || []).reduce((a, p) => a + (Number(p.valorTotal) || 0), 0);
  linha(7, [
    { label: "Base de Cálculo do ICMS", value: fmtNum(data.baseIcms ?? 0), w: 40, align: "r" },
    { label: "Valor do ICMS", value: fmtNum(data.valorIcms ?? 0), w: 40, align: "r" },
    { label: "Base de Cálculo ICMS S.T.", value: fmtNum(data.baseIcmsST ?? 0), w: 40, align: "r" },
    { label: "Valor do ICMS S.T.", value: fmtNum(data.valorIcmsST ?? 0), w: 40, align: "r" },
    { label: "Valor Total dos Produtos", value: fmtNum(vp), w: CW - 160, align: "r" },
  ]);
  linha(7, [
    { label: "Valor do Frete", value: fmtNum(data.valorFrete ?? 0), w: 40, align: "r" },
    { label: "Valor do Seguro", value: fmtNum(data.valorSeguro ?? 0), w: 40, align: "r" },
    { label: "Desconto", value: fmtNum(data.valorDesconto ?? 0), w: 40, align: "r" },
    { label: "Outras Desp. Acessórias", value: fmtNum(data.valorOutras ?? 0), w: 40, align: "r" },
    { label: "Valor Total da Nota", value: fmtNum(data.valorTotal), w: CW - 160, align: "r", vsize: 7.5 },
  ]);

  // ================= TRANSPORTADOR / VOLUMES =================
  secao("Transportador / Volumes Transportados");
  linha(7, [
    { label: "Razão Social", value: cut(D(data.transportadora).toUpperCase(), 46), w: 78 },
    { label: "Frete por Conta", value: D(data.fretePorConta) || "9 - Sem Frete", w: 30, vsize: 6 },
    { label: "Código ANTT", value: D(data.antt), w: 20 },
    { label: "Placa do Veículo", value: D(data.placa), w: 25, align: "c" },
    { label: "UF", value: D(data.placaUF), w: 10, align: "c" },
    { label: "CNPJ / CPF", value: fmtCnpj(D(data.transpCnpj)), w: CW - 163, vsize: 6 },
  ]);
  linha(7, [
    { label: "Endereço", value: cut(D(data.transpEndereco).toUpperCase(), 56), w: 98 },
    { label: "Município", value: cut(D(data.transpCidade), 40), w: 60 },
    { label: "UF", value: D(data.transpUF), w: 10, align: "c" },
    { label: "Inscrição Estadual", value: D(data.transpIE), w: CW - 168 },
  ]);
  linha(7, [
    { label: "Quantidade", value: D(data.volumes), w: 33, align: "r" },
    { label: "Espécie", value: D(data.especie), w: 33 },
    { label: "Marca", value: D(data.marca), w: 34 },
    { label: "Numeração", value: D(data.numeracao), w: 34 },
    { label: "Peso Bruto", value: D(data.pesoBruto), w: 33, align: "r" },
    { label: "Peso Líquido", value: D(data.pesoLiquido), w: CW - 167, align: "r" },
  ]);

  // ================= DADOS DOS PRODUTOS / SERVIÇOS =================
  secao("Dados dos Produtos / Serviços");
  const pcols: Array<{ h: string; w: number; align: "l" | "c" | "r" }> = [
    { h: "CÓDIGO", w: 14, align: "l" },
    { h: "DESCRIÇÃO DO PRODUTO / SERVIÇO", w: 51, align: "l" },
    { h: "NCM/SH", w: 12, align: "c" },
    { h: "CST", w: 7, align: "c" },
    { h: "CFOP", w: 9, align: "c" },
    { h: "UN", w: 7, align: "c" },
    { h: "QUANT.", w: 13, align: "r" },
    { h: "VLR. UNIT.", w: 15, align: "r" },
    { h: "VLR. TOTAL", w: 15, align: "r" },
    { h: "B. CÁLC. ICMS", w: 13, align: "r" },
    { h: "VLR. ICMS", w: 13, align: "r" },
    { h: "VLR. IPI", w: 11, align: "r" },
    { h: "AL. ICMS", w: 10, align: "r" },
    { h: "AL. IPI", w: 10, align: "r" },
  ];
  const drawProdHead = () => {
    box(M, y, CW, 5);
    let x = M;
    pcols.forEach((c, i) => {
      if (i > 0) vline(x, y, 5);
      black(); setFont("bold", 3.9);
      try { (doc as any).text(c.h, x + c.w / 2, y + 3.2, { align: "center" }); } catch { doc.text(c.h, x + 0.5, y + 3.2); }
      x += c.w;
    });
    y += 5;
  };
  drawProdHead();
  const produtos = data.produtos || [];
  if (produtos.length === 0) {
    need(8);
    box(M, y, CW, 8);
    ctr("Nenhum item informado.", W / 2, y + 5, 6);
    y += 8;
  } else {
    produtos.forEach((p) => {
      const descLines = doc.splitTextToSize(cut(D(p.nome).toUpperCase(), 120), 51 - 1.5) as string[];
      const nLines = Math.min(3, Math.max(1, descLines.length));
      const rowH = 2.4 + nLines * 2.5;
      if (y + rowH > LIM) { doc.addPage(); y = M; secao("Dados dos Produtos / Serviços"); drawProdHead(); }
      box(M, y, CW, rowH);
      let x = M;
      const cells: Array<[string, number, "l" | "c" | "r", number]> = [
        [cut(D(p.codigo), 12), 14, "l", 4.6],
        ["", 51, "l", 4.6],
        [D(p.ncm), 12, "c", 4.6],
        [D(p.cst), 7, "c", 4.4],
        [cfopFmt(D(p.cfop)), 9, "c", 4.4],
        [cut(D(p.un), 5), 7, "c", 4.6],
        [fmtQtd(D(p.qtd)), 13, "r", 4.6],
        [fmtNum(p.valorUnit), 15, "r", 4.6],
        [fmtNum(p.valorTotal), 15, "r", 4.6],
        [fmtNum(p.baseIcms ?? 0), 13, "r", 4.6],
        [fmtNum(p.vIcms ?? 0), 13, "r", 4.6],
        [fmtNum(p.vIpi ?? 0), 11, "r", 4.6],
        [fmtNum(p.aliqIcms ?? 0), 10, "r", 4.4],
        [fmtNum(p.aliqIpi ?? 0), 10, "r", 4.4],
      ];
      cells.forEach(([txt, w, align, s], i) => {
        if (i > 0) vline(x, y, rowH);
        if (i === 1) {
          black(); setFont("normal", 4.6);
          doc.text(descLines.slice(0, nLines), x + 0.8, y + 2.6);
        } else if (txt) {
          drawVal(txt, x, w, y + 2.6, align, s);
        }
        x += w;
      });
      y += rowH;
    });
  }

  // ================= CÁLCULO DO ISSQN =================
  secao("Cálculo do ISSQN");
  linha(7, [
    { label: "Inscrição Municipal", value: D(data.issqnInscMun), w: 50 },
    { label: "Valor Total dos Serviços", value: fmtNum(data.issqnTotalServicos ?? 0), w: 50, align: "r" },
    { label: "Base de Cálculo do ISSQN", value: fmtNum(data.issqnBase ?? 0), w: 50, align: "r" },
    { label: "Valor do ISSQN", value: fmtNum(data.issqnValor ?? 0), w: CW - 150, align: "r" },
  ]);

  // ================= DADOS ADICIONAIS =================
  secao("Dados Adicionais");
  need(22);
  const iaH = 20;
  box(M, y, CW, iaH);
  vline(M + 130, y, iaH);
  lab("Informações Complementares", M + 1, y + 2.6);
  lab("Reservado ao Fisco", M + 131, y + 2.6);
  if (D(data.infoComplementares)) {
    setFont("normal", 4.8); black();
    const lines = doc.splitTextToSize(String(data.infoComplementares), 130 - 3) as string[];
    doc.text(lines.slice(0, 7), M + 1, y + 6);
  }
  const isHom = (data.ambiente || "") === "homologacao";
  if (isHom) {
    doc.setTextColor(150, 150, 150);
    ctr("AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", M + 65, y + iaH / 2 + 2, 7, true);
    black();
  }
  y += iaH;

  return doc.output("blob");
}
