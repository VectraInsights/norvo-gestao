import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
import qrcode from "./vendor/qrcode.bundle.cjs";

interface DacteData {
  chave: string;
  numero: string;
  serie: string;
  ambiente: string;
  dataEmissao: string;
  emitCnpj: string;
  emitNome: string;
  emitEndereco: string;
  emitCidade: string;
  emitUF: string;
  emitIE: string;
  tomadorCnpj: string;
  tomadorNome: string;
  tomadorEndereco: string;
  tomadorCidade: string;
  tomadorUF: string;
  remCnpj: string;
  remNome: string;
  remCidade: string;
  remUF: string;
  remEndereco?: string;
  remBairro?: string;
  remCEP?: string;
  remPais?: string;
  remIE?: string;
  remFone?: string;
  destCnpj: string;
  destNome: string;
  destCidade: string;
  destUF: string;
  destEndereco?: string;
  destBairro?: string;
  destCEP?: string;
  destPais?: string;
  destIE?: string;
  destFone?: string;
  expCnpj?: string;
  expNome?: string;
  expCidade?: string;
  expUF?: string;
  expEndereco?: string;
  expIE?: string;
  recCnpj?: string;
  recNome?: string;
  recCidade?: string;
  recUF?: string;
  recEndereco?: string;
  recIE?: string;
  cfop: string;
  valorServico: number;
  valorCarga: number;
  pesoKg: number;
  icmsCST: string;
  icmsBase: number;
  icmsAliq: number;
  icmsValor: number;
  reducaoBase?: number | string;
  nFes: Array<{ nNF: string; serie: string; valor: number; chave?: string }>;
  placa: string;
  placaReboque: string;
  rntrc: string;
  seguradoraNome?: string;
  apolice?: string;
  averbacao?: string;
  obs: string;
  naturezaOperacao?: string;
  origemCidade?: string;
  origemUF?: string;
  destinoCidade?: string;
  destinoUF?: string;
  produtoPredominante?: string;
  outrasCaract?: string;
  tipoDocE?: string;
  tipoServico?: string;
  indGlobalizado?: string;
  protocolo?: string;
  modelo?: string;
  fl?: string;
  logoDataUrl?: string;
  qrCode?: string;
  comps?: Array<{ nome: string; valor: number }>;
  emitBairro?: string;
  emitCEP?: string;
  emitFone?: string;
}

function fmtCnpj(v: string): string {
  const c = (v || "").replace(/\D/g, "");
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "—";
}

function fmtBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtChave(chave: string): string {
  return (chave || "").replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim();
}

function cstLabel(cst: string): string {
  const c = (cst || "").replace(/\D/g, "").padStart(2, "0");
  const map: Record<string, string> = {
    "00": "00 - Tributada integralmente",
    "10": "10 - Tributada e com cobrança do ICMS por substituição tributária",
    "20": "20 - Com redução de base de cálculo",
    "30": "30 - Isenta ou não tributada e com cobrança do ICMS por substituição tributária",
    "40": "40 - Isenta",
    "41": "41 - Não tributada",
    "50": "50 - Suspensão",
    "51": "51 - Diferimento",
    "60": "60 - ICMS cobrado anteriormente por substituição tributária",
    "70": "70 - Com redução de base de cálculo e cobrança do ICMS por substituição tributária",
    "90": "90 - Outras",
  };
  return map[c] || (c ? `${c} - Verificar CST` : "—");
}

// CODE-128C real da chave (MOC 4.00). Volta null fora do browser ou sem chave válida.
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

// QR Code vetorial (módulos via qrcode-generator). Retorna false se falhar.
function drawQr(doc: any, x: number, y: number, size: number, text: string): boolean {
  try {
    if (!text) return false;
    const Q: any = (qrcode as any)?.default || qrcode;
    const qr = Q(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const s = size / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) doc.rect(x + c * s, y + r * s, s + 0.02, s + 0.02, "F");
      }
    }
    return true;
  } catch { return false; }
}

export function gerarDactePdf(data: DacteData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 7;
  const CW = W - 2 * M;
  const hw = CW / 2;

  let y = M;

  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const dkGray = () => doc.setTextColor(80, 80, 80);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.15); };

  const drawBox = (x: number, _y: number, w: number, h: number) => {
    border();
    doc.rect(x, _y, w, h, "S");
  };

  // Título de seção: texto preto em negrito, sem preenchimento (padrão P&B)
  const sectionTitle = (x: number, _y: number, w: number, title: string) => {
    black();
    setFont("bold", 6.5);
    doc.text(title, x + 1.5, _y + 4);
    return _y + 5.5;
  };

  const twoColSection = (titleL: string, titleR: string, yStart: number, boxH: number) => {
    black();
    setFont("bold", 6.5);
    doc.text(titleL, M + 1.5, yStart + 4);
    doc.text(titleR, M + hw + 1.5, yStart + 4);
    border();
    doc.rect(M, yStart, hw, boxH, "S");
    doc.rect(M + hw, yStart, hw, boxH, "S");
    return yStart + 5;
  };

  const addrBlock = (x: number, _y: number, lines: string[]) => {
    setFont("normal", 5.5);
    lines.forEach((ln, i) => {
      if (ln) doc.text(ln, x + 1.5, _y + 3.5 + i * 3.5);
    });
  };

  // ═══════════════════════════════════════════════════
  // CANHOTO: declaração de recebimento (topo)
  // ═══════════════════════════════════════════════════
  

  // ═══════════════════════════════════════════════════
  // LINHA 1: EMPRESA | DACTE | MODAL
  // ═══════════════════════════════════════════════════
    const qrHead = (data.qrCode || "").trim();
  const headH = 24;
  drawBox(M, y, CW, headH);
  black();
  let ex0 = M + 2;
  if (qrHead) {
    drawQr(doc, M + 2, y + 2, 20, qrHead);
    ex0 = M + 26;
  } else if (data.logoDataUrl) {
    try { doc.addImage(data.logoDataUrl as string, "PNG", M + 1.5, y + 2, 24, 8); } catch {}
    ex0 = M + 27;
  }
  setFont("bold", 9);
  doc.text(data.emitNome || "EMPRESA", ex0, y + 5);
  setFont("normal", 5);
  doc.text(`Endere\u00e7o ${data.emitEndereco || "\u2014"}   Bairro ${data.emitBairro || "\u2014"}`, ex0, y + 9.5);
  doc.text(`Cidade ${data.emitCidade || "\u2014"}, ${data.emitUF || "\u2014"}   CEP ${data.emitCEP || "\u2014"}   Tel. ${data.emitFone || "\u2014"}`, ex0, y + 13.5);
  doc.text(`CPF / CNPJ ${fmtCnpj(data.emitCnpj)}   Insc. Est. ${data.emitIE || "\u2014"}`, ex0, y + 17.5);
  setFont("bold", 12);
  doc.text("DACTE", M + 128, y + 6);
  setFont("normal", 5.5);
  doc.text("Documento Auxiliar do Conhecimento de Transporte Eletr\u00f4nico", M + 106, y + 10.5);
  setFont("bold", 7);
  doc.text("MODAL", W - M - 30, y + 5);
  setFont("bold", 9);
  doc.text("RODOVI\u00c1RIO", W - M - 30, y + 10);
  y += headH + 1;
  drawBox(M, y, CW, 9);
  setFont("bold", 4.5);
  doc.text("MODELO", M + 2, y + 3);
  doc.text("S\u00c9RIE", M + 22, y + 3);
  doc.text("N\u00daMERO", M + 38, y + 3);
  doc.text("FL", M + 70, y + 3);
  doc.text("DATA E HORA EMISS\u00c3O", M + 85, y + 3);
  doc.text("INSC. SUFRAMA DESTINAT\u00c1RIO", M + 150, y + 3);
  setFont("normal", 7);
  doc.text(data.modelo || "57", M + 2, y + 7.5);
  doc.text((data.serie || "001").padStart(3, "0"), M + 22, y + 7.5);
  doc.text((data.numero || "1").padStart(9, "0"), M + 38, y + 7.5);
  doc.text(data.fl || "1/1", M + 70, y + 7.5);
  setFont("normal", 5);
  doc.text(data.dataEmissao ? new Date(data.dataEmissao).toLocaleString("pt-BR") : "\u2014", M + 85, y + 7.5);
  doc.text("\u2014", M + 150, y + 7.5);
  y += 10;

  // ═══════════════════════════════════════════════════
  // BARRAS + CHAVE DE ACESSO
  // ═══════════════════════════════════════════════════
  const qrTxt = (data.qrCode || "").trim();
  const barsImg = barcodePng(data.chave);
  const drawRealBars = (x0: number, y0: number, wMax: number, h: number): number => {
    try {
      if (!barsImg) return -1;
      const props = (doc as any).getImageProperties(barsImg);
      const ratio = props.width / props.height;
      let iw = h * ratio, ih = h;
      if (iw > wMax) { iw = wMax; ih = iw / ratio; }
      doc.addImage(barsImg, "PNG", x0, y0, iw, ih);
      return ih;
    } catch { return -1; }
  };
  const drawSimBars = (x0: number, y0: number, x1: number, bh: number) => {
    for (let bx = x0; bx < x1; bx += 1.1) {
      const h = 5 + Math.random() * bh;
      doc.setFillColor(0, 0, 0);
      doc.rect(bx, y0, 0.5, h, "F");
    }
  };
  if (qrTxt) {
    drawBox(M, y, CW, 30);
    if (drawRealBars(M + 2, y + 2, 156, 9) < 0) drawSimBars(M + 2, y + 2, M + 158, 2.5);
    black();
    setFont("normal", 6.5);
    doc.text(fmtChave(data.chave), M + 2, y + 15);
    setFont("bold", 5);
    doc.text("Chave de acesso", M + 2, y + 28);
    if (!drawQr(doc, W - M - 29, y + 2.5, 25, qrTxt)) {
      setFont("normal", 4.5);
      doc.text("QR indisponível", W - M - 29, y + 15);
    }
    y += 31;
  } else {
    drawBox(M, y, CW, 15);
    if (drawRealBars(M + 2, y + 1, CW - 4, 8) < 0) drawSimBars(M + 2, y + 1, W - M - 2, 2.5);
    black();
    setFont("normal", 6.5);
    doc.text(fmtChave(data.chave), M + 2, y + 11.5);
    setFont("bold", 5);
    doc.text("Chave de acesso", M + 2, y + 13.5);
    y += 16;
  }

  // ═══════════════════════════════════════════════════
  // TIPO CT-E | TIPO SERVIÇO | TOMADOR | IND GLOBALIZADO
  // ═══════════════════════════════════════════════════
  drawBox(M, y, CW, 7);
  setFont("bold", 4.5);
  let cx = M + 2;
  const tipoItems = [
    { lbl: "TIPO DO CT-E", val: data.tipoDocE || "Normal" },
    { lbl: "TIPO DO SERVIÇO", val: data.tipoServico || "Normal" },
    { lbl: "TOMADOR DO SERVIÇO", val: data.tomadorNome || "Destinatário" },
    { lbl: "IND. CT-e GLOBALIZADO", val: data.indGlobalizado || "Não" },
  ];
  tipoItems.forEach((t) => {
    doc.text(t.lbl, cx, y + 2.5);
    setFont("normal", 5);
    doc.text(String(t.val).slice(0, 60), cx, y + 5.5);
    setFont("bold", 4.5);
    cx += 48;
  });
  y += 8;

  // ═══════════════════════════════════════════════════
  // CONSULTA AUTENTICIDADE
  // ═══════════════════════════════════════════════════
  drawBox(M, y, CW, 5.5);
  setFont("normal", 5);
  doc.text("Consulta de autenticidade no portal nacional do CT-e, no site da Sefaz Autorizadora, ou em", M + 2, y + 2.2);
  setFont("bold", 5);
  doc.text("http://www.cte.fazenda.gov.br/portal", M + 2, y + 4.7);
  y += 6.5;

  // ═══════════════════════════════════════════════════
  // PROTOCOLO DE AUTORIZAÇÃO
  // ═══════════════════════════════════════════════════
  drawBox(M, y, CW, 6);
  setFont("bold", 5.5);
  doc.text("PROTOCOLO DE AUTORIZAÇÃO DE USO", M + 2, y + 4);
  setFont("normal", 6);
  doc.text(data.protocolo || "CT-e sem Autorização de Uso da SEFAZ", M + 75, y + 4);
  y += 7;

  // ═══════════════════════════════════════════════════
  // CFOP - NATUREZA | INÍCIO | TÉRMINO DA PRESTAÇÃO
  // ═══════════════════════════════════════════════════
  drawBox(M, y, CW, 11);
  setFont("bold", 4.5);
  doc.text("CFOP - NATUREZA DA PRESTAÇÃO", M + 2, y + 3);
  doc.text("INÍCIO DA PRESTAÇÃO", M + 90, y + 3);
  doc.text("TÉRMINO DA PRESTAÇÃO", M + 140, y + 3);
  setFont("normal", 6);
  doc.text(`${data.cfop || "—"} - ${data.naturezaOperacao || "TRANSPORTE"}`, M + 2, y + 8);
  doc.text(`${data.origemCidade || "—"} - ${data.origemUF || "—"}`, M + 90, y + 8);
  doc.text(`${data.destinoCidade || "—"} - ${data.destinoUF || "—"}`, M + 140, y + 8);
  y += 12;

  // ═══════════════════════════════════════════════════
  // REMETENTE | DESTINATÁRIO
  // ═══════════════════════════════════════════════════
  const remDestH = 28;
  const ry = twoColSection("REMETENTE", "DESTINATÁRIO", y, remDestH);
    addrBlock(M, ry, [     `Remetente : ${data.remNome || "\u2014"}` ,     `Endere\u00e7o : ${data.remEndereco || "\u2014"}` ,     `Munic\u00edpio : ${data.remCidade || "\u2014"}   CEP : ${data.remCEP || "\u2014"}` ,     `Bairro : ${data.remBairro || "\u2014"}   Insc. Est : ${data.remIE || "\u2014"}` ,     `CPF / CNPJ : ${fmtCnpj(data.remCnpj)}   UF : ${data.remUF || "\u2014"}   Fone : ${data.remFone || "\u2014"}` ,     `Pa\u00eds : ${data.remPais || "Brasil"}` ,   ]);
    addrBlock(M + hw, ry, [     `Destinat\u00e1rio : ${data.destNome || "\u2014"}` ,     `Endere\u00e7o : ${data.destEndereco || "\u2014"}` ,     `Munic\u00edpio : ${data.destCidade || "\u2014"}   CEP : ${data.destCEP || "\u2014"}` ,     `Bairro : ${data.destBairro || "\u2014"}   Insc. Est : ${data.destIE || "\u2014"}` ,     `CPF / CNPJ : ${fmtCnpj(data.destCnpj)}   UF : ${data.destUF || "\u2014"}   Fone : ${data.destFone || "\u2014"}` ,     `Pa\u00eds : ${data.destPais || "Brasil"}` ,   ]);
  y += remDestH + 1;

  // ═══════════════════════════════════════════════════
  // EXPEDIDOR | RECEBEDOR
  // ═══════════════════════════════════════════════════
  const expRecH = 25;
  const ery = twoColSection("EXPEDIDOR", "RECEBEDOR", y, expRecH);
    addrBlock(M, ery, [     `Endere\u00e7o : ${data.expEndereco || "\u2014"}` ,     `Munic\u00edpio : ${data.expCidade || "\u2014"}   CEP : \u2014` ,     `Bairro : \u2014   Insc. Est : ${data.expIE || "\u2014"}` ,     `CPF / CNPJ : ${fmtCnpj(data.expCnpj || "")}   UF : ${data.expUF || "\u2014"}   Fone : \u2014` ,     `Pa\u00eds : Brasil` ,   ]);
    addrBlock(M + hw, ery, [     `Endere\u00e7o : ${data.recEndereco || "\u2014"}` ,     `Munic\u00edpio : ${data.recCidade || "\u2014"}   CEP : \u2014` ,     `Bairro : \u2014   Insc. Est : ${data.recIE || "\u2014"}` ,     `CPF / CNPJ : ${fmtCnpj(data.recCnpj || "")}   UF : ${data.recUF || "\u2014"}   Fone : \u2014` ,     `Pa\u00eds : Brasil` ,   ]);
  y += expRecH + 1;

  // ═══════════════════════════════════════════════════
  // TOMADOR DO SERVIÇO (full width)
  // ═══════════════════════════════════════════════════
  const tomH = 22;
  sectionTitle(M, y, CW, "TOMADOR DO SERVIÇO");
  drawBox(M, y + 5, CW, tomH - 5);
    addrBlock(M, y + 5, [
    `NOME: ${data.tomadorNome || "\u2014"}` ,
    `ENDERE\u00c7O: ${data.tomadorEndereco || "\u2014"}` ,
    `MUNIC\u00cdPIO: ${data.tomadorCidade || "\u2014"}   UF: ${data.tomadorUF || "\u2014"}   CEP: \u2014   PA\u00cdS: Brasil` ,
    `CNPJ/CPF: ${fmtCnpj(data.tomadorCnpj)}` ,
  ]);
  y += tomH + 1;

  // ═══════════════════════════════════════════════════
  // PRODUTO PREDOMINANTE | CARACTERÍSTICAS | VALOR
  // ═══════════════════════════════════════════════════
  const prodH = 10;
  drawBox(M, y, CW, prodH);
  setFont("bold", 4.5);
  doc.text("PRODUTO PREDOMINANTE", M + 2, y + 3.5);
  doc.text("OUTRAS CARACTERÍSTICAS DA CARGA", M + 65, y + 3.5);
  doc.text("VALOR TOTAL DA MERCADORIA", W - M - 40, y + 3.5);
  setFont("normal", 6);
  doc.text(String(data.produtoPredominante || "—").slice(0, 45), M + 2, y + 8);
  doc.text(String(data.outrasCaract || "—").slice(0, 45), M + 65, y + 8);
  doc.text(fmtBrl(data.valorCarga), W - M - 40, y + 8);
  y += prodH + 1;

  // ═══════════════════════════════════════════════════
  // PESO | QTDE | TIPO
  // ═══════════════════════════════════════════════════
  const pesoH = 8;
  drawBox(M, y, CW, pesoH);
  setFont("bold", 4.5);
  doc.text("PESO BRUTO (KG)", M + 2, y + 3);
  doc.text("QTDE. UN. MEDIDA", M + 35, y + 3);
  doc.text("CUBAGEM (M3)", M + 80, y + 3);
  doc.text("QTDE. (VOL.)", M + 120, y + 3);
  setFont("normal", 6);
  doc.text(`${data.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} KG`, M + 2, y + 7);
  y += pesoH + 1;

  // ═══════════════════════════════════════════════════
  // COMPONENTES DO VALOR DA PRESTAÇÃO
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO");
  y += 5;
    const comps = (data.comps && data.comps.length > 0 ? data.comps : [{ nome: "Frete Valor", valor: data.valorServico }]).slice(0, 8);
  const compRows = Math.max(1, Math.ceil(comps.length / 2));
  drawBox(M, y, CW, 5 + compRows * 5);
  setFont("bold", 4.5);
  doc.text("NOME", M + 2, y + 3.5);
  doc.text("VALOR", M + 48, y + 3.5);
  doc.text("NOME", M + 98, y + 3.5);
  doc.text("VALOR", M + 144, y + 3.5);
  setFont("normal", 5.5);
  for (let ci = 0; ci < comps.length; ci += 2) {
    const cyy = y + 8.5 + (ci / 2) * 5;
    doc.text(String(comps[ci].nome || "\u2014").slice(0, 26), M + 2, cyy);
    doc.text(fmtBrl(Number(comps[ci].valor) || 0), M + 48, cyy);
    if (comps[ci + 1]) {
      doc.text(String(comps[ci + 1].nome || "\u2014").slice(0, 26), M + 98, cyy);
      doc.text(fmtBrl(Number(comps[ci + 1].valor) || 0), M + 144, cyy);
    }
  }
  y += 5.5 + compRows * 5;
  drawBox(M, y, CW, 5);
  setFont("bold", 4.5);
  doc.text("VALOR TOTAL DO SERVI\u00c7O", W - M - 62, y + 3.5);
  setFont("bold", 6);
  doc.text(fmtBrl(data.valorServico), W - M - 25, y + 3.5);
  y += 6;
  drawBox(M, y, CW, 5);
  setFont("bold", 4.5);
  doc.text("VALOR A RECEBER", W - M - 35, y + 3.5);
  setFont("normal", 6);
  doc.text(fmtBrl(data.valorServico), W - M - 15, y + 3.5);
  y += 6;

  // ═══════════════════════════════════════════════════
  // INFORMAÇÕES RELATIVAS AO IMPOSTO
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "INFORMAÇÕES RELATIVAS AO IMPOSTO");
  y += 5;
  drawBox(M, y, CW, 7);
  setFont("bold", 4.5);
  doc.text("SITUAÇÃO TRIBUTÁRIA", M + 2, y + 3);
  doc.text("BASE DE CÁLCULO", M + 62, y + 3);
  doc.text("ALÍQ. ICMS (%)", M + 98, y + 3);
  doc.text("VALOR ICMS", M + 126, y + 3);
  doc.text("% RED BC CALC", M + 152, y + 3);
  doc.text("ICMS ST", M + 178, y + 3);
  setFont("normal", 5.5);
  doc.text(cstLabel(data.icmsCST).slice(0, 42), M + 2, y + 6);
  doc.text(fmtBrl(data.icmsBase), M + 62, y + 6);
  doc.text(`${data.icmsAliq}%`, M + 98, y + 6);
  doc.text(fmtBrl(data.icmsValor), M + 126, y + 6);
  const redBc = Number(data.reducaoBase ?? 0) || 0;
  doc.text(`${redBc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`, M + 152, y + 6);
  doc.text("—", M + 178, y + 6);
  y += 8;
  const ibsBase = Number(data.icmsBase) || 0;
  const vCBS = ibsBase * 0.009, vIBSUf = ibsBase * 0.001;
  sectionTitle(M, y, CW, "Tributa\u00e7\u00e3o da Reforma Tribut\u00e1ria (IBS/CBS)");
  y += 5;
  drawBox(M, y, CW, 7);
  setFont("bold", 4.5);
  doc.text("CST", M + 2, y + 3);
  doc.text("Classifica\u00e7\u00e3o Tribut\u00e1ria", M + 12, y + 3);
  doc.text("Base de C\u00e1lculo", M + 76, y + 3);
  doc.text("% CBS", M + 102, y + 3);
  doc.text("Valor CBS", M + 113, y + 3);
  doc.text("% IBS Mun", M + 133, y + 3);
  doc.text("Valor IBS Mun", M + 146, y + 3);
  doc.text("% IBS UF", M + 166, y + 3);
  doc.text("Valor IBS UF", M + 177, y + 3);
  setFont("normal", 5);
  doc.text("000", M + 2, y + 6);
  doc.text("000001 - Tributadas integralmente IBS/CBS", M + 12, y + 6);
  doc.text(fmtBrl(ibsBase), M + 76, y + 6);
  doc.text("0,90", M + 102, y + 6);
  doc.text(fmtBrl(vCBS), M + 113, y + 6);
  doc.text("0,00", M + 133, y + 6);
  doc.text(fmtBrl(0), M + 146, y + 6);
  doc.text("0,10", M + 166, y + 6);
  doc.text(fmtBrl(vIBSUf), M + 177, y + 6);
  y += 8;

  // ═══════════════════════════════════════════════════
  // DOCUMENTOS ORIGINÁRIOS
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "DOCUMENTOS ORIGINÁRIOS");
  y += 5;
  drawBox(M, y, CW, 6);
  setFont("bold", 4.5);
  doc.text("TP DOC.", M + 2, y + 4);
  doc.text("CNPJ/CPF EMITENTE", M + 30, y + 4);
  doc.text("SÉRIE/NRO. DOCUMENTO", M + 85, y + 4);
  doc.text("CHAVE DO DOCUMENTO", M + 130, y + 4);
  y += 6.5;

  if (data.nFes.length > 0) {
    const perRow = 2;
    const rows = Math.min(Math.ceil(data.nFes.length / perRow), 4);
    for (let r = 0; r < rows; r++) {
      drawBox(M, y, CW, 8.5);
      setFont("normal", 5);
      for (let c = 0; c < perRow; c++) {
        const idx = r * perRow + c;
        if (idx >= data.nFes.length) break;
        const nf = data.nFes[idx];
        const ox = c === 0 ? M + 2 : M + 100;
        doc.text(`NF-E ${nf.nNF || "—"}`, ox, y + 3.5);
        if (nf.chave) {
          setFont("normal", 4.5);
          doc.text(fmtChave(nf.chave), ox, y + 7);
          setFont("normal", 5);
        }
      }
      y += 9;
    }
  } else {
    drawBox(M, y, CW, 6);
    setFont("normal", 5);
    doc.text("Nenhum documento fiscal vinculado.", M + 2, y + 4);
    y += 6.5;
  }
  y += 1;

  // ═══════════════════════════════════════════════════
  // OBSERVAÇÕES (mantém mensagem de homologação aqui)
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "OBSERVAÇÕES");
  y += 5;
  const obsH = 16;
  drawBox(M, y, CW, obsH);
  if (data.obs) {
    setFont("normal", 5);
    black();
    const lines = doc.splitTextToSize(data.obs, CW - 4);
    doc.text(lines.slice(0, 3), M + 2, y + 4);
  }
  if ((data.ambiente || "") === "homologacao") {
    doc.setTextColor(170, 170, 170);
    setFont("bold", 13);
    doc.text("AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", W / 2, y + obsH / 2 + 5, { align: "center" });
    black();
  }
  y += obsH + 1;

  // ═══════════════════════════════════════════════════
  // DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO");
  y += 5;
  drawBox(M, y, CW, 7);
  setFont("bold", 4.5);
  doc.text("RNTRC DA EMPRESA", M + 2, y + 3);
  doc.text("DATA PREVISTA DE ENTREGA", M + 42, y + 3);
  doc.text("ESTE CONHECIMENTO DE TRANSPORTE ATENDE À LEGISLAÇÃO DE TRANSPORTE RODOVIÁRIO EM VIGOR", M + 88, y + 3);
  setFont("normal", 6);
  doc.text(data.rntrc || "—", M + 2, y + 6);
  doc.text("—", M + 42, y + 6);
  y += 8;

  // ═══════════════════════════════════════════════════
  // DADOS DO SEGURO DA CARGA
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "DADOS DO SEGURO DA CARGA");
  y += 5;
  drawBox(M, y, CW, 10);
  setFont("bold", 4.5);
  doc.text("SEGURADORA", M + 2, y + 3);
  doc.text("APOLICE", M + 85, y + 3);
  doc.text("AVERBACAO", M + 145, y + 3);
  setFont("normal", 6);
  doc.text((data.seguradoraNome || "-").slice(0, 45), M + 2, y + 7.5);
  doc.text(data.apolice || "-", M + 85, y + 7.5);
  doc.text(data.averbacao || "-", M + 145, y + 7.5);
  y += 11;

  // USO EXCLUSIVO | RESERVADO AO FISCO
  // ═══════════════════════════════════════════════════
  const usoH = 14;
  drawBox(M, y, hw, usoH);
  drawBox(M + hw, y, hw, usoH);
  setFont("bold", 5);
  doc.text("USO EXCLUSIVO DO EMISSOR DO CT-e", M + 2, y + 4);
  doc.text("RESERVADO AO FISCO", M + hw + 2, y + 4);
  y += usoH + 1;

  // ═══════════════════════════════════════════════════
  // RODAPÉ
  // ═══════════════════════════════════════════════════
    doc.saveGraphicsState();
  try { (doc as any).setLineDashPattern([2, 2], 0); } catch {}
  doc.line(M, y, M + CW, y);
  doc.restoreGraphicsState();
  border();
  y += 2;
  const recH = 17;
  drawBox(M, y, CW, recH);
  border();
  doc.line(M + 128, y, M + 128, y + recH);
  doc.line(M + 164, y, M + 164, y + recH);
  setFont("normal", 4.5);
  const decl2 = doc.splitTextToSize("DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE", 124);
  doc.text(decl2.slice(0, 2), M + 2, y + 3.5);
  setFont("bold", 4.5);
  doc.text("NOME:", M + 2, y + 11);
  doc.text("RG:", M + 62, y + 11);
  doc.text("ASSINATURA / CARIMBO", M + 2, y + 15.5);
  doc.text("T\u00c9RMINO DA PRESTA\u00c7\u00c3O - DATA/HORA", M + 130, y + 3.5);
  setFont("bold", 6);
  doc.text("CT-E", M + 166, y + 4);
  setFont("normal", 5);
  doc.text(`N\u00ba. DOCUMENTO ${(data.numero || "1").padStart(9, "0")}`, M + 166, y + 9);
  doc.text(`S\u00c9RIE ${(data.serie || "001").padStart(3, "0")}`, M + 166, y + 13.5);
  y += recH + 1;
dkGray();
  setFont("normal", 4.5);
  doc.text(`DATA E HORA DA IMPRESSÃO: ${new Date().toLocaleString("pt-BR")}`, M, y + 2);
  doc.text("Norvo Gestão", W - M - 22, y + 2);

  return doc.output("blob");
}
