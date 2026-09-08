import { jsPDF } from "jspdf";

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
    "00": "00 - NORMAL",
    "20": "20 - COM REDUÇÃO",
    "45": "45 - ISENTO",
    "60": "60 - ICMS ST",
    "90": "90 - OUTRAS",
  };
  return map[c] || (c ? `${c} - OUTRAS` : "90 - OUTRAS");
}

export function gerarDactePdf(data: DacteData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 7;
  const CW = W - 2 * M;
  const HL = M + CW / 2; // half left
  const HR = M + CW / 2; // half right start

  let y = M;

  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const white = () => doc.setTextColor(255, 255, 255);
  const dkGray = () => doc.setTextColor(80, 80, 80);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.15); };
  const headerBg = () => doc.setFillColor(0, 80, 150);
  const grayBg = () => doc.setFillColor(230, 230, 230);

  const drawBox = (x: number, _y: number, w: number, h: number) => {
    border();
    doc.rect(x, _y, w, h, "S");
  };

  const sectionTitle = (x: number, _y: number, w: number, title: string) => {
    headerBg();
    doc.rect(x, _y, w, 5, "F");
    border();
    doc.rect(x, _y, w, 5, "S");
    white();
    setFont("bold", 6);
    doc.text(title, x + 1.5, _y + 3.5);
    black();
    return _y + 5.5;
  };

  const twoColSection = (titleL: string, titleR: string, yStart: number, boxH: number) => {
    const hw = CW / 2;
    // left header
    headerBg();
    doc.rect(M, yStart, hw, 5, "F");
    border();
    doc.rect(M, yStart, hw, 5, "S");
    white();
    setFont("bold", 6);
    doc.text(titleL, M + 1.5, yStart + 3.5);
    // right header
    headerBg();
    doc.rect(M + hw, yStart, hw, 5, "F");
    border();
    doc.rect(M + hw, yStart, hw, 5, "S");
    white();
    doc.text(titleR, M + hw + 1.5, yStart + 3.5);
    black();
    // boxes
    border();
    doc.rect(M, yStart + 5, hw, boxH - 5, "S");
    doc.rect(M + hw, yStart + 5, hw, boxH - 5, "S");
    return yStart + 5;
  };

  const addrBlock = (x: number, _y: number, w: number, lines: string[]) => {
    setFont("normal", 5);
    lines.forEach((ln, i) => {
      if (ln) doc.text(ln, x + 1.5, _y + 3 + i * 3.5);
    });
  };

  // ═══════════════════════════════════════════════════
  // LINHA 1: EMPRESA | DACTE | MODAL
  // ═══════════════════════════════════════════════════
  headerBg();
  doc.rect(M, y, CW, 10, "F");
  white();
  const hasLogo = !!data.logoDataUrl;
  if (hasLogo) {
    try { doc.addImage(data.logoDataUrl as string, "PNG", M + 1.5, y + 1, 24, 8); } catch { /* mantém só o nome */ }
  }
  setFont("bold", 10);
  doc.text(data.emitNome || "EMPRESA", (hasLogo ? M + 27 : M + 2), y + 5);
  setFont("bold", 11);
  doc.text("DACTE", W / 2 - 10, y + 4);
  setFont("normal", 5.5);
  doc.text("Documento Auxiliar do Conhecimento de Transporte Eletrônico", W / 2 - 35, y + 8.5);
  setFont("bold", 7);
  doc.text("MODAL", W - M - 30, y + 3.5);
  setFont("bold", 9);
  doc.text("RODOVIÁRIO", W - M - 30, y + 8);
  y += 11;

  // ═══════════════════════════════════════════════════
  // LINHA 2: ENDEREÇO EMITENTE | DADOS DOCUMENTO
  // ═══════════════════════════════════════════════════
  const hw2 = CW / 2;
  grayBg();
  doc.rect(M, y, hw2, 16, "F");
  drawBox(M, y, hw2, 16);
  black();
  setFont("normal", 5.5);
  doc.text(data.emitEndereco || "ENDEREÇO EXEMPLO", M + 2, y + 4);
  doc.text(`${data.emitCidade || "CIDADE"} - ${data.emitUF || "UF"}`, M + 2, y + 8);
  doc.text(`CNPJ: ${fmtCnpj(data.emitCnpj)}  IE: ${data.emitIE || "—"}`, M + 2, y + 12);

  grayBg();
  doc.rect(M + hw2, y, hw2, 16, "F");
  drawBox(M + hw2, y, hw2, 16);
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
  setFont("bold", 4.5);
  doc.text("IND. BC RED. DEST", dx + 65, y + 13);
  setFont("normal", 5);
  doc.text("—", dx + 90, y + 13);
  y += 17;

  // ═══════════════════════════════════════════════════
  // BARRAS SIMULADAS + CHAVE DE ACESSO
  // ═══════════════════════════════════════════════════
  grayBg();
  doc.rect(M, y, CW, 14, "F");
  drawBox(M, y, CW, 14);
  // barras
  for (let bx = M + 2; bx < W - M - 2; bx += 1.1) {
    const bh = 5 + Math.random() * 2.5;
    doc.setFillColor(0, 0, 0);
    doc.rect(bx, y + 1, 0.5, bh, "F");
  }
  black();
  setFont("bold", 5);
  doc.text("Chave de acesso", M + 2, y + 13);
  setFont("normal", 6.5);
  doc.text(fmtChave(data.chave), M + 2, y + 10);
  y += 15;

  // ═══════════════════════════════════════════════════
  // TIPO DOC-E | TIPO SERVIÇO | TOMADOR | IND GLOBALIZADO
  // ═══════════════════════════════════════════════════
  grayBg();
  doc.rect(M, y, CW, 6, "F");
  drawBox(M, y, CW, 6);
  setFont("bold", 4.5);
  let cx = M + 2;
  const tipoItems = [
    { lbl: "TIPO DOC-E", val: data.tipoDocE || "Normal" },
    { lbl: "TIPO DO SERVIÇO", val: data.tipoServico || "Normal" },
    { lbl: "TOMADOR DO SERVIÇO", val: data.tomadorNome || "Destinatário" },
    { lbl: "IND. CT-e GLOBALIZADO", val: data.indGlobalizado || "Não" },
  ];
  tipoItems.forEach((t) => {
    doc.text(t.lbl, cx, y + 2.5);
    setFont("normal", 5);
    doc.text(t.val, cx, y + 5);
    setFont("bold", 4.5);
    cx += 42;
  });
  y += 7;

  // ═══════════════════════════════════════════════════
  // CONSULTA AUTENTICIDADE
  // ═══════════════════════════════════════════════════
  grayBg();
  doc.rect(M, y, CW, 5, "F");
  drawBox(M, y, CW, 5);
  setFont("normal", 5);
  doc.text("Consulta de autenticidade no portal nacional do CT-e, no site da Sefaz Autorizadora, ou em", M + 2, y + 2.2);
  setFont("bold", 5);
  doc.text("http://www.cte.fazenda.gov.br/portal", M + 2, y + 4.5);
  y += 6;

  // ═══════════════════════════════════════════════════
  // PROTOCOLO DE AUTORIZAÇÃO
  // ═══════════════════════════════════════════════════
  grayBg();
  doc.rect(M, y, CW, 6, "F");
  drawBox(M, y, CW, 6);
  setFont("bold", 5.5);
  doc.text("PROTOCOLO DE AUTORIZAÇÃO DE USO", M + 2, y + 4);
  setFont("normal", 6);
  doc.text(data.protocolo || "CT-e sem Autorização de Uso da SEFAZ", M + 75, y + 4);
  y += 7;

  // ═══════════════════════════════════════════════════
  // CFOP | NATUREZA | ORIGEM | DESTINO
  // ═══════════════════════════════════════════════════
  grayBg();
  doc.rect(M, y, CW, 10, "F");
  drawBox(M, y, CW, 10);
  setFont("bold", 4.5);
  doc.text("CFOP", M + 2, y + 3);
  doc.text("NATUREZA DA OPERAÇÃO", M + 18, y + 3);
  doc.text("ORIGEM DA PRESTAÇÃO", M + 90, y + 3);
  doc.text("DESTINO DA PRESTAÇÃO", M + 140, y + 3);
  setFont("normal", 6.5);
  doc.text(data.cfop || "—", M + 2, y + 8);
  doc.text(data.naturezaOperacao || "TRANSPORTE INTERESTADUAL - INDUSTRIAL", M + 18, y + 8);
  doc.text(`${data.origemCidade || "—"} - ${data.origemUF || "—"}`, M + 90, y + 8);
  doc.text(`${data.destinoCidade || "—"} - ${data.destinoUF || "—"}`, M + 140, y + 8);
  y += 11;

  // ═══════════════════════════════════════════════════
  // REMETENTE | DESTINATÁRIO
  // ═══════════════════════════════════════════════════
  const hw = CW / 2;
  const remDestH = 28;
  const ry = twoColSection("REMETENTE", "DESTINATÁRIO", y, remDestH);
  // remetente
  addrBlock(M, ry, hw, [
    `ENDEREÇO: ${data.remEndereco || data.remBairro || "—"}`,
    `MUNICÍPIO: ${data.remCidade || "—"}   UF: ${data.remUF || "—"}   CEP: ${data.remCEP || "—"}   PAÍS: ${data.remPais || "Brasil"}`,
    `CNPJ/CPF: ${fmtCnpj(data.remCnpj)}   INSCRIÇÃO ESTADUAL: ${data.remIE || "—"}   FONE: ${data.remFone || "—"}`,
    `NOME: ${data.remNome || "—"}`,
  ]);
  // destinatário
  addrBlock(M + hw, ry, hw, [
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
  addrBlock(M, ery, hw, [
    `ENDEREÇO: ${data.expEndereco || "—"}`,
    `MUNICÍPIO: ${data.expCidade || "—"}   UF: ${data.expUF || "—"}   CEP: —   PAÍS: Brasil`,
    `CNPJ/CPF: ${fmtCnpj(data.expCnpj || "")}   INSCR. EST.: ${data.expIE || "—"}   FONE: —`,
    `NOME: ${data.expNome || "—"}`,
  ]);
  addrBlock(M + hw, ery, hw, [
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
  addrBlock(M, y + 5, CW, [
    `NOME: ${data.tomadorNome || "—"}`,
    `ENDEREÇO: ${data.tomadorEndereco || "—"}`,
    `MUNICÍPIO: ${data.tomadorCidade || "—"}   UF: ${data.tomadorUF || "—"}   CEP: —   PAÍS: Brasil`,
  ]);
  y += tomH + 1;

  // ═══════════════════════════════════════════════════
  // PRODUTO PREDOMINANTE | CARACTERÍSTICAS | VALOR
  // ═══════════════════════════════════════════════════
  const prodH = 10;
  grayBg();
  doc.rect(M, y, CW, prodH, "F");
  drawBox(M, y, CW, prodH);
  setFont("bold", 4.5);
  doc.text("PRODUTO PREDOMINANTE", M + 2, y + 3.5);
  doc.text("OUTRAS CARACTERÍSTICAS DA CARGA", M + 65, y + 3.5);
  doc.text("VALOR TOTAL DA MERCADORIA", W - M - 40, y + 3.5);
  setFont("normal", 6);
  doc.text(data.produtoPredominante || "NATUREZA EXEMPLO", M + 2, y + 8);
  doc.text(data.outrasCaract || "ESPÉCIE EXEMPLO", M + 65, y + 8);
  doc.text(fmtBrl(data.valorCarga), W - M - 40, y + 8);
  y += prodH + 1;

  // ═══════════════════════════════════════════════════
  // PESO | QTDE | TIPO
  // ═══════════════════════════════════════════════════
  const pesoH = 8;
  grayBg();
  doc.rect(M, y, CW, pesoH, "F");
  drawBox(M, y, CW, pesoH);
  setFont("bold", 4.5);
  doc.text("PESO (KG)", M + 2, y + 3);
  doc.text("QTDE. UN. MEDIDA", M + 30, y + 3);
  doc.text("TIPO", M + 60, y + 3);
  doc.text("QTDE. UN. MEDIDA", M + 85, y + 3);
  doc.text("TIPO", M + 115, y + 3);
  doc.text("QTDE. UN. MEDIDA", M + 135, y + 3);
  doc.text("TIPO", M + 165, y + 3);
  setFont("normal", 6);
  doc.text(`${data.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} KG`, M + 2, y + 7);
  y += pesoH + 1;

  // ═══════════════════════════════════════════════════
  // COMPONENTES DO VALOR DA PRESTAÇÃO
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO");
  y += 5;
  // header row
  grayBg();
  doc.rect(M, y, CW, 5, "F");
  drawBox(M, y, CW, 5);
  setFont("bold", 4.5);
  doc.text("NOME", M + 2, y + 3.5);
  doc.text("VALOR", M + 38, y + 3.5);
  doc.text("NOME", M + 58, y + 3.5);
  doc.text("VALOR", M + 94, y + 3.5);
  doc.text("NOME", M + 114, y + 3.5);
  doc.text("VALOR", M + 150, y + 3.5);
  doc.text("VALOR TOTAL DO SERVIÇO", W - M - 35, y + 3.5);
  y += 5.5;
  // values
  drawBox(M, y, CW, 5);
  setFont("normal", 5.5);
  doc.text("Frete Valor", M + 2, y + 3.5);
  doc.text(fmtBrl(data.valorServico), M + 38, y + 3.5);
  setFont("bold", 6);
  doc.text(fmtBrl(data.valorServico), W - M - 25, y + 3.5);
  y += 6;
  // valor a receber
  grayBg();
  doc.rect(M, y, CW, 5, "F");
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
  grayBg();
  doc.rect(M, y, CW, 7, "F");
  drawBox(M, y, CW, 7);
  setFont("bold", 4.5);
  doc.text("SITUAÇÃO TRIBUTÁRIA", M + 2, y + 3);
  doc.text("BASE DE CÁLCULO", M + 55, y + 3);
  doc.text("ALÍQ. ICMS (%)", M + 95, y + 3);
  doc.text("VALOR ICMS", M + 125, y + 3);
  doc.text("% RED BC CALC", M + 155, y + 3);
  setFont("normal", 5.5);
  doc.text(cstLabel(data.icmsCST), M + 2, y + 6);
  doc.text(fmtBrl(data.icmsBase), M + 55, y + 6);
  doc.text(`${data.icmsAliq}%`, M + 95, y + 6);
  doc.text(fmtBrl(data.icmsValor), M + 125, y + 6);
  const redBc = Number(data.reducaoBase ?? 0) || 0;
  doc.text(`${redBc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`, M + 155, y + 6);
  y += 8;

  // ═══════════════════════════════════════════════════
  // DOCUMENTOS ORIGINÁRIOS
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "DOCUMENTOS ORIGINÁRIOS");
  y += 5;
  drawBox(M, y, CW, 6);
  setFont("bold", 4.5);
  doc.text("TP DOC.", M + 2, y + 4);
  doc.text("CHAVE DO DOCUMENTO", M + 30, y + 4);
  doc.text("TP DOC.", M + 115, y + 4);
  doc.text("CHAVE DO DOCUMENTO", M + 143, y + 4);
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
        const ox = c === 0 ? M + 2 : M + 115;
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
  // OBSERVAÇÕES
  // ═══════════════════════════════════════════════════
  sectionTitle(M, y, CW, "OBSERVAÇÕES");
  y += 5;
  const obsH = 16;
  drawBox(M, y, CW, obsH);
  if (data.obs) {
    setFont("normal", 5);
    black();
    const lines = doc.splitTextToSize(data.obs, CW - 4);
    doc.text(lines.slice(0, 2), M + 2, y + 4);
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
  doc.text(data.rntrc || "00000000", M + 2, y + 6);
  doc.text("—", M + 42, y + 6);
  y += 8;

  // ═══════════════════════════════════════════════════
  // USO EXCLUSIVO | RESERVADO AO FISCO
  // ═══════════════════════════════════════════════════
  const usoH = 16;
  drawBox(M, y, hw, usoH);
  drawBox(M + hw, y, hw, usoH);
  setFont("bold", 5);
  doc.text("USO EXCLUSIVO DO EMISSOR DO CT-e", M + 2, y + 4);
  doc.text("RESERVADO AO FISCO", M + hw + 2, y + 4);
  y += usoH + 1;

  // ═══════════════════════════════════════════════════
  // RODAPÉ + DECLARAÇÃO
  // ═══════════════════════════════════════════════════
  dkGray();
  setFont("normal", 4.5);
  doc.text(`DATA E HORA DA IMPRESSÃO: ${new Date().toLocaleString("pt-BR")}`, M, y + 2);
  doc.text("Norvo Gestão", W - M - 22, y + 2);
  y += 5;

  // declaração
  drawBox(M, y, CW, 18);
  black();
  setFont("normal", 5);
  doc.text("DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE", M + 2, y + 4);
  setFont("bold", 4.5);
  doc.text("NOME:", M + 2, y + 9);
  doc.text("ASSINATURA / CARIMBO", M + 65, y + 16);
  doc.text("CRIAÇÃO DATA, HORA", M + 125, y + 9);
  doc.text("SAÍDA DATA, HORA", M + 125, y + 13);
  // selo CT-e
  headerBg();
  doc.setDrawColor(0, 80, 150);
  doc.setLineWidth(0.5);
  doc.rect(W - M - 28, y + 6, 25, 10, "FD");
  white();
  setFont("bold", 7);
  doc.text("CT-e", W - M - 20, y + 9.5);
  setFont("normal", 4);
  doc.text(`Nº ${data.numero || "—"}`, W - M - 27, y + 12.5);
  doc.text(`Série: ${data.serie || "001"}`, W - M - 27, y + 15);

  return doc.output("blob");
}
