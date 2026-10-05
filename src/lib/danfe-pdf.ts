import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
export const DANFE_REV = "20261005-oficial";

// DANFE no layout oficial da SEFAZ (NF-e modelo 55, retrato A4, P&B):
// canhoto com Nº/Série, cabeçalho emitente/DANFE/barras+chave, natureza,
// destinatário, fatura/duplicatas, cálculo do imposto (9 colunas), transporte,
// produtos (com VALOR DESC), ISSQN e dados adicionais — títulos sem faixa,
// fonte serifada, Nº com zeros (000.015.545), como no modelo impresso.
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
  desconto?: number | string;
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
  emitIM?: string;
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
  dataSaidaEnt?: string;
  horaSaidaEnt?: string;
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
  vImpImportacao?: number;
  vIcmsUfRemet?: number;
  vFcpUfDest?: number;
  valorPis?: number;
  valorIpi?: number;
  vIcmsUfDest?: number;
  vTotTrib?: number;
  valorCofins?: number;
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

// Nº da NF-e no padrão impresso: 9 dígitos com zeros (000.015.545)
function fmtNFe(v: string | number): string {
  const d = String(v || "").replace(/\D/g, "").slice(-9).padStart(9, "0");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
}

function fmtSerie(v: string | number | undefined): string {
  const d = String(v || "1").replace(/\D/g, "") || "1";
  return d.padStart(3, "0").slice(-3);
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
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return v || ""; }
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
  lsize?: number;
}

export function gerarDanfePdf(data: DanfeData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 5, CW = W - 2 * M;
  const LIM = 292;
  let y = M;

  const F = "times";
  const setFont = (w: "bold" | "normal" | "italic", s: number) => { doc.setFont(F, w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); };
  const box = (x: number, yy: number, w: number, h: number) => { border(); doc.rect(x, yy, w, h, "S"); };
  const vline = (x: number, yy: number, h: number) => { border(); doc.line(x, yy, x, yy + h); };
  const lab = (t: string, x: number, yy: number, s = 5) => { black(); setFont("normal", s); doc.text(String(t || "").toUpperCase(), x, yy); };
  const need = (h: number) => { if (y + h > LIM) { doc.addPage(); y = M; } };
  const cut = (t: string, n: number) => String(t || "").slice(0, n);
  const D = (v: any) => (v === undefined || v === null || v === "" ? "" : String(v));
  const ctr = (t: string, xx: number, yy: number, s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    try { (doc as any).text(t, xx, yy, { align: "center" }); } catch { doc.text(t, xx, yy); }
  };
  const drawVal = (t: string, x: number, w: number, yy: number, align: "l" | "c" | "r", s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    if (align === "r") { try { (doc as any).text(t, x + w - 1, yy, { align: "right" }); } catch { doc.text(t, x + 1, yy); } }
    else if (align === "c") { try { (doc as any).text(t, x + w / 2, yy, { align: "center" }); } catch { doc.text(t, x + 1, yy); } }
    else doc.text(t, x + 1, yy);
  };

  // Título de seção no padrão do modelo: texto pequeno acima da caixa, sem faixa.
  const titulo = (t: string) => {
    need(4);
    black(); setFont("normal", 5.2);
    doc.text(String(t || "").toUpperCase(), M + 0.5, y + 2.4);
    y += 3.2;
  };

  // Linha de células: rótulo pequeno no topo + valor abaixo, separadores verticais
  const linha = (h: number, cols: Col[], valY?: number): number => {
    need(h);
    box(M, y, CW, h);
    let x = M;
    cols.forEach((c, i) => {
      if (i > 0) vline(x, y, h);
      lab(c.label, x + 1, y + 2.6, c.lsize ?? 5);
      if (c.value) drawVal(c.value, x, c.w, y + (valY ?? h - 1.2), c.align || "l", c.vsize ?? 7, true);
      x += c.w;
    });
    y += h;
    return y;
  };

  // ================= CANHOTO (recibo de entrega) =================
  const canhotoTxt = `RECEBEMOS DE ${cut(D(data.emitNome).toUpperCase(), 60)} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${fmtData(D(data.dhEmi || data.dataEmissao))} VALOR TOTAL: R$ ${fmtNum(data.valorTotal)} DESTINATÁRIO: ${cut(D(data.destNome).toUpperCase(), 40)} - ${cut(D(data.destEndereco).toUpperCase(), 60)}`;
  setFont("normal", 5.4);
  const canLines = doc.splitTextToSize(canhotoTxt, CW - 3) as string[];
  const canH = 3 + canLines.length * 2.7;
  need(canH + 12);
  box(M, y, CW, canH);
  black();
  doc.text(canLines, M + 1.5, y + 2.8);
  y += canH;
  const recH = 10;
  const wNFe = 40, wData = 32;
  box(M, y, wData, recH);
  box(M + wData, y, CW - wData - wNFe, recH);
  box(M + CW - wNFe, y, wNFe, recH);
  lab("Data de Recebimento", M + 1, y + 2.6);
  lab("Identificação e Assinatura do Recebedor", M + wData + 1, y + 2.6);
  ctr("NF-e", M + CW - wNFe / 2, y + 3.4, 10, true);
  ctr(`Nº. ${fmtNFe(data.numero)}`, M + CW - wNFe / 2, y + 6.4, 7.5, true);
  ctr(`Série ${fmtSerie(data.serie)}`, M + CW - wNFe / 2, y + 9, 7, true);
  y += recH;
  // linha de corte tracejada
  doc.saveGraphicsState();
  try { (doc as any).setLineDashPattern([2, 2], 0); } catch {}
  border(); doc.line(M, y + 1, M + CW, y + 1);
  try { (doc as any).restoreGraphicsState(); } catch {}
  border();
  y += 2.5;

  // ================= CABEÇALHO: emitente | DANFE | barras+chave =================
  const headH = 36;
  need(headH);
  const wE = 72, wD = 42, wB = CW - wE - wD;
  box(M, y, wE, headH);
  box(M + wE, y, wD, headH);
  box(M + wE + wD, y, wB, headH);
  // Emitente (centralizado, como no modelo)
  ctr("IDENTIFICAÇÃO DO EMITENTE", M + wE / 2, y + 3, 4.6);
  ctr(cut(D(data.emitNome).toUpperCase(), 38), M + wE / 2, y + 8.4, 9, true);
  setFont("normal", 6); black();
  ctr(cut(D(data.emitEndereco).toUpperCase(), 44), M + wE / 2, y + 13, 6);
  ctr(`${cut(D(data.emitBairro).toUpperCase(), 20)} - ${D(data.emitCEP)}`, M + wE / 2, y + 16.6, 6);
  ctr(`${cut(D(data.emitCidade).toUpperCase(), 22)} - ${D(data.emitUF)} Fone/Fax: ${D(data.emitFone)}`, M + wE / 2, y + 20.2, 6);
  // Bloco DANFE
  const dx = M + wE;
  ctr("DANFE", dx + wD / 2, y + 6.4, 13, true);
  ctr("Documento Auxiliar da Nota", dx + wD / 2, y + 10, 5);
  ctr("Fiscal Eletrônica", dx + wD / 2, y + 12.6, 5);
  const tp = D(data.tpEntradaSaida) || "1";
  // 0 - ENTRADA / 1 - SAÍDA com o tipo aplicável emoldurado
  black(); setFont("normal", 5.4);
  const t0x = dx + 4, t1x = dx + wD / 2 + 1;
  doc.text("0 - ENTRADA", t0x, y + 17);
  doc.text("1 - SAÍDA", t1x, y + 17);
  border();
  if (tp === "0") doc.rect(t0x - 1.5, y + 14.2, 20, 4.4, "S");
  else doc.rect(t1x - 1.5, y + 14.2, 18, 4.4, "S");
  ctr(`Nº. ${fmtNFe(data.numero)}`, dx + wD / 2, y + 23.4, 8, true);
  ctr(`Série ${fmtSerie(data.serie)}`, dx + wD / 2, y + 27.4, 7, true);
  ctr(`Folha ${D(data.fl) || "1/1"}`, dx + wD / 2, y + 31, 6);
  // Bloco barras + chave
  const bx = M + wE + wD;
  const barsImg = barcodePng(data.chave);
  if (barsImg) {
    try {
      const props = (doc as any).getImageProperties(barsImg);
      const ratio = props.width / props.height;
      let iw = 11 * ratio, ih = 11;
      const maxW = wB - 8;
      if (iw > maxW) { iw = maxW; ih = iw / ratio; }
      doc.addImage(barsImg, "PNG", bx + (wB - iw) / 2, y + 1.5, iw, ih);
    } catch {}
  }
  ctr("CHAVE DE ACESSO", bx + wB / 2, y + 16.4, 5);
  ctr(fmtChave(data.chave), bx + wB / 2, y + 20.4, 6.4, true);
  ctr("Consulta de autenticidade no portal nacional da NF-e", bx + wB / 2, y + 28, 4.6);
  ctr("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", bx + wB / 2, y + 30.8, 4.6);
  y += headH;

  // ================= NATUREZA / PROTOCOLO =================
  linha(9, [
    { label: "Natureza da Operação", value: cut(D(data.naturezaOperacao).toUpperCase(), 60), w: 120, vsize: 7.5 },
    { label: "Protocolo de Autorização de Uso", value: `${D(data.protocolo)}${D(data.protocoloData) ? ` - ${fmtDH(D(data.protocoloData))}` : ""}`, w: CW - 120, vsize: 6.5 },
  ]);
  linha(8, [
    { label: "Inscrição Estadual", value: D(data.emitIE), w: 50 },
    { label: "Inscrição Municipal", value: D(data.emitIM || data.issqnInscMun), w: 50 },
    { label: "Inscrição Estadual do Subst. Tribut.", value: D(data.emitIESubst), w: 50 },
    { label: "CNPJ / CPF", value: fmtCnpj(data.emitCnpj), w: CW - 150 },
  ]);

  // ================= DESTINATÁRIO / REMETENTE =================
  titulo("Destinatário / Remetente");
  linha(8, [
    { label: "Nome / Razão Social", value: cut(D(data.destNome).toUpperCase(), 64), w: 112, vsize: 7.5 },
    { label: "CNPJ / CPF", value: fmtCnpj(D(data.destCnpj)), w: 52 },
    { label: "Data da Emissão", value: fmtData(D(data.dhEmi || data.dataEmissao)), w: CW - 164, align: "c" },
  ]);
  linha(8, [
    { label: "Endereço", value: cut(D(data.destEndereco).toUpperCase(), 58), w: 96, vsize: 7 },
    { label: "Bairro / Distrito", value: cut(D(data.destBairro).toUpperCase(), 30), w: 52, vsize: 7 },
    { label: "CEP", value: D(data.destCEP), w: 26 },
    { label: "Data da Saída/Entrada", value: fmtData(D(data.dataSaidaEnt)), w: CW - 174, align: "c" },
  ]);
  linha(8, [
    { label: "Município", value: cut(D(data.destCidade).toUpperCase(), 48), w: 84, vsize: 7.5 },
    { label: "UF", value: D(data.destUF), w: 10, align: "c" },
    { label: "Fone / Fax", value: D(data.destFone), w: 36 },
    { label: "Inscrição Estadual", value: D(data.destIE), w: 44 },
    { label: "Hora da Saída/Entrada", value: D(data.horaSaidaEnt), w: CW - 174, align: "c" },
  ]);

  // ================= FATURA / DUPLICATAS =================
  titulo("Fatura / Duplicata");
  const parcelas = data.parcelas || [];
  if (parcelas.length === 0) {
    need(8);
    box(M, y, CW, 8);
    y += 8;
  } else {
    need(9);
    const bw = CW / parcelas.length;
    box(M, y, CW, 9);
    parcelas.forEach((pc, c) => {
      const cx = M + c * bw;
      if (c > 0) vline(cx, y, 9);
      black(); setFont("normal", 5.4);
      doc.text(`Num.   ${cut(D(pc.numero), 12)}`, cx + 1.5, y + 3);
      doc.text(`Venc.  ${fmtData(D(pc.dataVencimento))}`, cx + 1.5, y + 5.6);
      black(); setFont("bold", 5.6);
      doc.text(`Valor  R$ ${fmtNum(pc.valor)}`, cx + 1.5, y + 8);
    });
    y += 9;
  }

  // ================= CÁLCULO DO IMPOSTO =================
  titulo("Cálculo do Imposto");
  const vp = data.valorProdutos !== undefined ? data.valorProdutos : (data.produtos || []).reduce((a, p) => a + (Number(p.valorTotal) || 0), 0);
  const iw = 21, iwLast = CW - iw * 8;
  const impRow = (cells: Array<[string, string]>): number => {
    need(8);
    box(M, y, CW, 8);
    let x = M;
    cells.forEach(([t, v], i) => {
      const w = i < 8 ? iw : iwLast;
      if (i > 0) vline(x, y, 8);
      lab(t, x + 1, y + 2.6, 4.4);
      if (v) drawVal(v, x, w, y + 6.6, "r", 6.5, true);
      x += w;
    });
    y += 8;
    return y;
  };
  impRow([
    ["Base de Cálc. do ICMS", fmtNum(data.baseIcms ?? 0)],
    ["Valor do ICMS", fmtNum(data.valorIcms ?? 0)],
    ["Base de Cálc. ICMS S.T.", fmtNum(data.baseIcmsST ?? 0)],
    ["Valor do ICMS Subst.", fmtNum(data.valorIcmsST ?? 0)],
    ["V. Imp. Importação", fmtNum(data.vImpImportacao ?? 0)],
    ["V. ICMS UF Remet.", fmtNum(data.vIcmsUfRemet ?? 0)],
    ["V. FCP UF Dest.", fmtNum(data.vFcpUfDest ?? 0)],
    ["Valor do PIS", fmtNum(data.valorPis ?? 0)],
    ["V. Total Produtos", fmtNum(vp)],
  ]);
  impRow([
    ["Valor do Frete", fmtNum(data.valorFrete ?? 0)],
    ["Valor do Seguro", fmtNum(data.valorSeguro ?? 0)],
    ["Desconto", fmtNum(data.valorDesconto ?? 0)],
    ["Outras Despesas", fmtNum(data.valorOutras ?? 0)],
    ["Valor Total IPI", fmtNum(data.valorIpi ?? 0)],
    ["V. ICMS UF Dest.", fmtNum(data.vIcmsUfDest ?? 0)],
    ["V. Tot. Trib.", fmtNum(data.vTotTrib ?? 0)],
    ["Valor da Cofins", fmtNum(data.valorCofins ?? 0)],
    ["V. Total da Nota", fmtNum(data.valorTotal)],
  ]);

  // ================= TRANSPORTADOR / VOLUMES =================
  titulo("Transportador / Volumes Transportados");
  linha(8, [
    { label: "Nome / Razão Social", value: cut(D(data.transportadora).toUpperCase(), 44), w: 84, vsize: 6.5 },
    { label: "Frete", value: cut(D(data.fretePorConta) || "9-Sem Frete", 22), w: 34, vsize: 6.5 },
    { label: "Código ANTT", value: D(data.antt), w: 20 },
    { label: "Placa do Veículo", value: D(data.placa), w: 20, align: "c" },
    { label: "UF", value: D(data.placaUF), w: 10, align: "c" },
    { label: "CNPJ / CPF", value: fmtCnpj(D(data.transpCnpj)), w: CW - 168, vsize: 6 },
  ]);
  linha(8, [
    { label: "Endereço", value: cut(D(data.transpEndereco).toUpperCase(), 54), w: 90, vsize: 6.5 },
    { label: "Município", value: cut(D(data.transpCidade).toUpperCase(), 36), w: 62, vsize: 6.5 },
    { label: "UF", value: D(data.transpUF), w: 10, align: "c" },
    { label: "Inscrição Estadual", value: D(data.transpIE), w: CW - 162 },
  ]);
  linha(8, [
    { label: "Quantidade", value: D(data.volumes), w: 24, align: "c", vsize: 7 },
    { label: "Espécie", value: D(data.especie), w: 30 },
    { label: "Marca", value: D(data.marca), w: 30 },
    { label: "Numeração", value: D(data.numeracao), w: 30 },
    { label: "Peso Bruto", value: D(data.pesoBruto), w: 43, align: "r", vsize: 7 },
    { label: "Peso Líquido", value: D(data.pesoLiquido), w: CW - 157, align: "r", vsize: 7 },
  ]);

  // ================= DADOS DOS PRODUTOS / SERVIÇOS =================
  titulo("Dados dos Produtos / Serviços");
  const pcols: Array<{ h: string; w: number; align: "l" | "c" | "r" }> = [
    { h: "CÓDIGO PRODUTO", w: 12, align: "l" },
    { h: "DESCRIÇÃO DO PRODUTO / SERVIÇO", w: 54, align: "l" },
    { h: "NCM/SH", w: 14, align: "c" },
    { h: "O/CST", w: 8, align: "c" },
    { h: "CFOP", w: 9, align: "c" },
    { h: "UN", w: 6, align: "c" },
    { h: "QUANT", w: 11, align: "r" },
    { h: "VALOR UNIT", w: 13, align: "r" },
    { h: "VALOR TOTAL", w: 14, align: "r" },
    { h: "VALOR DESC", w: 11, align: "r" },
    { h: "B.CÁLC ICMS", w: 11, align: "r" },
    { h: "VALOR ICMS", w: 11, align: "r" },
    { h: "VALOR IPI", w: 10, align: "r" },
    { h: "ALÍQ. ICMS", w: 8, align: "r" },
    { h: "ALÍQ. IPI", w: 8, align: "r" },
  ];
  const cfopFmt = (cfop: string): string => {
    const d = (cfop || "").replace(/\D/g, "");
    return d.length === 4 ? `${d[0]}.${d.slice(1)}` : (cfop || "");
  };
  const drawProdHead = () => {
    need(6);
    box(M, y, CW, 6);
    let x = M;
    pcols.forEach((c, i) => {
      if (i > 0) vline(x, y, 6);
      black(); setFont("bold", 3.4);
      const hs = doc.splitTextToSize(c.h, c.w - 1) as string[];
      const hy = y + (hs.length > 1 ? 2.4 : 4);
      hs.slice(0, 2).forEach((hl, li) => {
        try { (doc as any).text(hl, x + c.w / 2, hy + li * 2, { align: "center" }); } catch { doc.text(hl, x + 0.5, hy + li * 2); }
      });
      x += c.w;
    });
    y += 6;
  };
  drawProdHead();
  const produtos = data.produtos || [];
  if (produtos.length === 0) {
    need(8);
    box(M, y, CW, 8);
    y += 8;
  } else {
    produtos.forEach((p) => {
      const descLines = doc.splitTextToSize(cut(D(p.nome).toUpperCase(), 400), 54 - 1.5) as string[];
      const nLines = Math.min(6, Math.max(1, descLines.length));
      const rowH = 2.6 + nLines * 2.5;
      if (y + rowH > LIM) { doc.addPage(); y = M; titulo("Dados dos Produtos / Serviços"); drawProdHead(); }
      box(M, y, CW, rowH);
      let x = M;
      const cells: Array<[string, number, "l" | "c" | "r", number]> = [
        [cut(D(p.codigo), 12), 12, "l", 4.6],
        ["", 54, "l", 4.6],
        [cut(D(p.ncm), 10), 14, "c", 4.4],
        [cut(D(p.cst), 5), 8, "c", 4.4],
        [cfopFmt(D(p.cfop)), 9, "c", 4.4],
        [cut(D(p.un), 5), 6, "c", 4.6],
        [fmtQtd(D(p.qtd)), 11, "r", 4.6],
        [fmtNum(p.valorUnit), 13, "r", 4.6],
        [fmtNum(p.valorTotal), 14, "r", 4.6],
        [fmtNum(p.desconto ?? 0), 11, "r", 4.6],
        [fmtNum(p.baseIcms ?? 0), 11, "r", 4.6],
        [fmtNum(p.vIcms ?? 0), 11, "r", 4.6],
        [fmtNum(p.vIpi ?? 0), 10, "r", 4.6],
        [fmtNum(p.aliqIcms ?? 0), 8, "r", 4.4],
        [fmtNum(p.aliqIpi ?? 0), 8, "r", 4.4],
      ];
      cells.forEach(([txt, w, align, s], i) => {
        if (i > 0) vline(x, y, rowH);
        if (i === 1) {
          black(); setFont("normal", 4.6);
          doc.text(descLines.slice(0, nLines), x + 0.8, y + 2.8);
        } else if (txt) {
          drawVal(txt, x, w, y + 2.8, align, s);
        }
        x += w;
      });
      y += rowH;
    });
  }

  // ================= CÁLCULO DO ISSQN =================
  titulo("Cálculo do ISSQN");
  linha(8, [
    { label: "Inscrição Municipal", value: D(data.issqnInscMun), w: 50 },
    { label: "Valor Total dos Serviços", value: fmtNum(data.issqnTotalServicos ?? 0), w: 50, align: "r" },
    { label: "Base de Cálculo do ISSQN", value: fmtNum(data.issqnBase ?? 0), w: 50, align: "r" },
    { label: "Valor do ISSQN", value: fmtNum(data.issqnValor ?? 0), w: CW - 150, align: "r" },
  ]);

  // ================= DADOS ADICIONAIS =================
  titulo("Dados Adicionais");
  need(24);
  const iaH = 22;
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

  // Rodapé: impressão (esq.) + sistema (dir.)
  black(); setFont("italic", 5);
  try {
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    doc.text(`Impresso em ${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} as ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`, M, 293);
    (doc as any).text("Norvo Gestão", M + CW, 293, { align: "right" });
  } catch {}

  return doc.output("blob");
}
