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
  const canhH = 17;
  drawBox(M, y, CW, canhH);
  border();
  doc.line(M + 128, y, M + 128, y + canhH);
  doc.line(M + 164, y, M + 164, y + canhH);
  setFont("normal", 4.5);
  const decl = doc.splitTextToSize("DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE", 124);
  doc.text(decl.slice(0, 2), M + 2, y + 3.5);
  setFont("bold", 4.5);
  doc.text("NOME:", M + 2, y + 11);
  doc.text("RG:", M + 62, y + 11);
  doc.text("ASSINATURA / CARIMBO", M + 2, y + 15.5);
  setFont("bold", 4.5);
  doc.text("TÉRMINO DA PRESTAÇÃO - DATA/HORA", M + 130, y + 3.5);
  setFont("bold", 6);
  doc.text("CT-E", M + 166, y + 4);
  setFont("normal", 5);
  doc.text(`Nº. DOCUMENTO ${(data.numero || "—").padStart(9, "0")}`, M + 166, y + 9);
  doc.text(`SÉRIE ${(data.serie || "001").padStart(3, "0")}`, M + 166, y + 13.5);
  y += canhH + 1;

  // ═══════════════════════════════════════════════════
  // LINHA 1: EMPRESA | DACTE | MODAL
  // ═══════════════════════════════════════════════════
  drawBox(M, y, CW, 11);
  black();
  const hasLogo = !!data.logoDataUrl;
  if (hasLogo) {
    try { doc.addImage(data.logoDataUrl as string, "PNG", M + 1.5, y + 1.5, 24, 8); } catch { /* mantém só o nome */ }
  }
  setFont("bold", 10);
  doc.text(data.emitNome || "EMPRESA", (hasLogo ? M + 27 : M + 2), y + 7);
  setFont("bold", 12);
  doc.text("DACTE", W / 2 - 10, y + 5);
  setFont("normal", 5.5);
  doc.text("Documento Auxiliar do Conhecimento de Transporte Eletrônico", W / 2 - 35, y + 9.5);
  setFont("bold", 7);
  doc.text("MODAL", W - M - 30, y + 4);
  setFont("bold", 9);
  doc.text("RODOVIÁRIO", W - M - 30, y + 9);
  y += 12;

  // ═══════════════════════════════════════════════════
  // LINHA 2: ENDEREÇO EMITENTE | DADOS DOCUMENTO
  // ═══════════════════════════════════════════════════
  const hw2 = CW / 2;
  drawBox(M, y, hw2, 16);
  drawBox(M + hw2, y, hw2, 16);
  black();
  setFont("normal", 6);
  doc.text(data.emitEndereco || "—", M + 2, y + 4.5);
  doc.text(`${data.emitCidade || "—"} - ${data.emitUF || "—"}`, M + 2, y + 8.5);
  doc.text(`CNPJ/CPF: ${fmtCnpj(data.emitCnpj)}   Insc.Estadual: ${data.emitIE || "—"}`, M + 2, y + 12.5);
  const dx = M + hw2 + 2;
  setFont("bold", 4.5);
  doc.text("MODELO", dx, y + 3);
  doc.text("SÉRIE", dx + 14, y + 3);
  doc.text("NÚMERO", dx + 28, y + 3);
  doc.text("FL", dx + 55, y + 3);
  doc.text("DATA E HORA EMISSÃO", dx + 65, y + 3);
  setFont("normal", 7);
  doc.text(data.modelo || "57", dx, y + 8);
  doc.text((data.serie || "001").padStart(3, "0"), dx + 14, y + 8);
  doc.text((data.numero || "1").padStart(9, "0"), dx + 28, y + 8);
  doc.text(data.fl || "1/1", dx + 55, y + 8);
  setFont("normal", 5);
  doc.text(data.dataEmissao ? new Date(data.dataEmissao).toLocaleString("pt-BR") : "—", dx + 65, y + 8);
  y += 17;

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
  addrBlock(M, ry, [
    `ENDEREÇO: ${data.remEndereco || data.remBairro || "—"}`,
    `MUNICÍPIO: ${data.remCidade || "—"}   UF: ${data.remUF || "—"}   CEP: ${data.remCEP || "—"}   PAÍS: ${data.remPais || "Brasil"}`,
    `CNPJ/CPF: ${fmtCnpj(data.remCnpj)}   INSCRIÇÃO ESTADUAL: ${data.remIE || "—"}   FONE: ${data.remFone || "—"}`,
    `NOME: ${data.remNome || "—"}`,
  ]);
  addrBlock(M + hw, ry, [
    `ENDEREÇO: ${data.destEndereco || data.destBairro || "—"}`,
    `MUNICÍPIO: ${data.destCidade || "—"}   UF: ${data.destUF || "—"}   CEP: ${data.destCEP || "—"}   PAÍS: ${data.destPais || "Brasil"}`,
    `CNPJ/CPF: ${fmtCnpj(data.destCnpj)}   INSCRIÇÃO ESTADUAL: ${data.destIE || "—"}   FONE: ${data.destFone || "—"}`,
    `NOME: ${data.destNome || "—"}`,
  ]);
  y += remDestH + 1;

  // ═══════════════════════════════════════════════════
  // EXPEDIDOR | RECEBEDOR
  // ═══════════════════════════════════════════════════
  const expRecH = 18;
  const ery = twoColSection("EXPEDIDOR", "RECEBEDOR", y, expRecH);
  addrBlock(M, ery, [
    `ENDEREÇO: ${data.expEndereco || "—"}`,
    `MUNICÍPIO: ${data.expCidade || "—"}   UF: ${data.expUF || "—"}   CEP: —   PAÍS: Brasil`,
    `CNPJ/CPF: ${fmtCnpj(data.expCnpj || "")}   INSCR. EST.: ${data.expIE || "—"}   FONE: —`,
    `NOME: ${data.expNome || "—"}`,
  ]);
  addrBlock(M + hw, ery, [
    `ENDEREÇO: ${data.recEndereco || "—"}`,
    `MUNICÍPIO: ${data.recCidade || "—"}   UF: ${data.recUF || "—"}   CEP: —   PAÍS: Brasil`,
    `CNPJ/CPF: ${fmtCnpj(data.recCnpj || "")}   INSCR. EST.: ${data.recIE || "—"}   FONE: —`,
    `NOME: ${data.recNome || "—"}`,
  ]);
  y += expRecH + 1;

  // ═══════════════════════════════════════════════════
  // TOMADOR DO SERVIÇO (full width)
  // ═══════════════════════════════════════════════════
  const tomH = 18;
  sectionTitle(M, y, CW, "TOMADOR DO SERVIÇO");
  drawBox(M, y + 5, CW, tomH - 5);
  addrBlock(M, y + 5, [
    `NOME: ${data.tomadorNome || "—"}`,
    `ENDEREÇO: ${data.tomadorEndereco || "—"}`,
    `MUNICÍPIO: ${data.tomadorCidade || "—"}   UF: ${data.tomadorUF || "—"}   CEP: —   PAÍS: Brasil`,
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
  drawBox(M, y, CW, 5);
  setFont("bold", 4.5);
  doc.text("NOME", M + 2, y + 3.5);
  doc.text("VALOR", M + 55, y + 3.5);
  doc.text("NOME", M + 80, y + 3.5);
  doc.text("VALOR", M + 125, y + 3.5);
  doc.text("VALOR TOTAL DO SERVIÇO", W - M - 35, y + 3.5);
  y += 5.5;
  drawBox(M, y, CW, 5);
  setFont("normal", 5.5);
  doc.text("Frete Valor", M + 2, y + 3.5);
  doc.text(fmtBrl(data.valorServico), M + 55, y + 3.5);
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
  dkGray();
  setFont("normal", 4.5);
  doc.text(`DATA E HORA DA IMPRESSÃO: ${new Date().toLocaleString("pt-BR")}`, M, y + 2);
  doc.text("Norvo Gestão", W - M - 22, y + 2);

  return doc.output("blob");
}
