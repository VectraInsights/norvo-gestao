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
  cfop: string;
  valorServico: number;
  valorCarga: number;
  pesoKg: number;
  icmsCST: string;
  icmsBase: number;
  icmsAliq: number;
  icmsValor: number;
  nFes: Array<{ nNF: string; serie: string; valor: number }>;
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
}

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14) return cnpj || "—";
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatCpf(cpf: string): string {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11) return cpf || "—";
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatCnpjCpf(v: string): string {
  const c = v.replace(/\D/g, "");
  if (c.length === 14) return formatCnpj(c);
  if (c.length === 11) return formatCpf(c);
  return v || "—";
}

function formatBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatChave(chave: string): string {
  const c = chave.replace(/\D/g, "");
  return c.replace(/(\d{4})/g, "$1 ").trim();
}

export function gerarDactePdf(data: DacteData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = 210;
  const ph = 297;
  const m = 7;
  const cw = pw - 2 * m;

  // helpers
  const setFont = (style: "helvetica", weight: "bold" | "normal", size: number) => {
    doc.setFont(style, weight);
    doc.setFontSize(size);
  };
  const black = () => doc.setTextColor(0, 0, 0);
  const white = () => doc.setTextColor(255, 255, 255);
  const gray = () => doc.setTextColor(100, 100, 100);
  const lightGray = () => doc.setFillColor(230, 230, 230);
  const headerBg = () => doc.setFillColor(0, 80, 150);

  const lineH = (y: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(m, y, pw - m, y);
  };

  const sectionHeader = (y: number, label: string, fullW = cw) => {
    headerBg();
    doc.rect(m, y, fullW, 5, "F");
    white();
    setFont("helvetica", "bold", 6);
    doc.text(label, m + 1.5, y + 3.5);
    black();
    return y + 5.5;
  };

  let y = m;

  // ─── LINHA 1: EMPRESA (esq) | DACTE (centro) | MODAL (dir) ───
  headerBg();
  doc.rect(m, y, cw, 8, "F");
  white();
  setFont("helvetica", "bold", 9);
  doc.text(data.emitNome || "EMPRESA", m + 2, y + 5);
  setFont("helvetica", "bold", 10);
  doc.text("DACTE", pw / 2 - 8, y + 3.5);
  setFont("helvetica", "normal", 6);
  doc.text("Documento Auxiliar do Conhecimento de Transporte Eletrônico", pw / 2 - 30, y + 7);
  setFont("helvetica", "bold", 7);
  doc.text("MODAL", pw - m - 30, y + 3);
  setFont("helvetica", "bold", 8);
  doc.text("RODOVIÁRIO", pw - m - 30, y + 7);
  y += 9;

  // ─── LINHA 2: ENDEREÇO/CONTATO (esq) | DADOS DOC (dir) ───
  const halfCw = cw / 2;
  // esquerda: endereço
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, halfCw, 14, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, halfCw, 14, "S");
  black();
  setFont("helvetica", "normal", 5.5);
  const addrLines = [
    data.emitEndereco || "ENDEREÇO EXEMPLO, 1 COMPLEMENTO",
    `${data.emitCidade || "CIDADE"} - ${data.emitUF || "UF"}`,
    `CNPJ: ${formatCnpj(data.emitCnpj)}  IE: ${data.emitIE || "—"}`,
  ];
  addrLines.forEach((ln, i) => {
    doc.text(ln, m + 2, y + 3 + i * 4);
  });
  // direita: modelo/série/número/fl/data
  doc.setFillColor(240, 240, 240);
  doc.rect(m + halfCw, y, halfCw, 14, "F");
  doc.rect(m + halfCw, y, halfCw, 14, "S");
  const modelo = data.modelo || "57";
  const serie = (data.serie || "001").padStart(3, "0");
  const numero = (data.numero || "1").padStart(9, "0");
  const fl = data.fl || "1/1";
  const dtEmissao = data.dataEmissao ? new Date(data.dataEmissao).toLocaleString("pt-BR") : "—";

  const dx = m + halfCw + 2;
  setFont("helvetica", "bold", 5);
  doc.text("MODELO", dx, y + 3);
  doc.text("SÉRIE", dx + 12, y + 3);
  doc.text("NÚMERO", dx + 25, y + 3);
  doc.text("FL", dx + 52, y + 3);
  doc.text("DATA E HORA EMISSÃO", dx + 60, y + 3);
  setFont("helvetica", "normal", 7);
  doc.text(modelo, dx, y + 8);
  doc.text(serie, dx + 12, y + 8);
  doc.text(numero, dx + 25, y + 8);
  doc.text(fl, dx + 52, y + 8);
  setFont("helvetica", "normal", 5.5);
  doc.text(dtEmissao, dx + 60, y + 8);
  // indicador emissão
  setFont("helvetica", "bold", 5);
  doc.text("IND. BC RED. DEST", dx + 60, y + 12);
  setFont("helvetica", "normal", 5.5);
  doc.text("—", dx + 80, y + 12);
  y += 15;

  // ─── CHAVE DE ACESSO (barras simuladas + texto) ───
  lightGray();
  doc.rect(m, y, cw, 12, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 12, "S");
  // barras simuladas
  black();
  for (let bx = m + 2; bx < pw - m - 2; bx += 1.2) {
    const bh = 4 + Math.random() * 2;
    doc.setFillColor(0, 0, 0);
    doc.rect(bx, y + 1, 0.6, bh, "F");
  }
  setFont("helvetica", "bold", 5);
  doc.text("Chave de acesso", m + 2, y + 11);
  setFont("helvetica", "normal", 7);
  doc.text(formatChave(data.chave), m + 2, y + 9);
  y += 13;

  // ─── LINHA: TIPO DOC-E | TIPO SERVIÇO | TOMADOR | IND GLOBALIZADO ───
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, 5, "F");
  doc.rect(m, y, cw, 5, "S");
  setFont("helvetica", "bold", 4.5);
  const tipoL = [
    { label: "TIPO DOC-E", val: data.tipoDocE || "Normal" },
    { label: "TIPO DO SERVIÇO", val: data.tipoServico || "Normal" },
    { label: "TOMADOR DO SERVIÇO", val: data.tomadorNome || "Destinatário" },
    { label: "IND. CT-e GLOBALIZADO", val: data.indGlobalizado || "Não" },
  ];
  let dx2 = m + 2;
  tipoL.forEach((t) => {
    doc.text(t.label, dx2, y + 2);
    setFont("helvetica", "normal", 5);
    doc.text(t.val, dx2, y + 4.3);
    setFont("helvetica", "bold", 4.5);
    dx2 += 42;
  });
  y += 6;

  // ─── CONSULTA AUTENTICIDADE ───
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, 5, "F");
  doc.rect(m, y, cw, 5, "S");
  setFont("helvetica", "normal", 5);
  black();
  doc.text("Consulta de autenticidade no portal nacional do CT-e, no site da Sefaz Autorizadora, ou em", m + 2, y + 2.2);
  setFont("helvetica", "bold", 5);
  doc.text("http://www.cte.fazenda.gov.br/portal", m + 2, y + 4.5);
  y += 6;

  // ─── PROTOCOLO DE AUTORIZAÇÃO ───
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, 5, "F");
  doc.rect(m, y, cw, 5, "S");
  setFont("helvetica", "bold", 5.5);
  black();
  doc.text("PROTOCOLO DE AUTORIZAÇÃO DE USO", m + 2, y + 3.5);
  setFont("helvetica", "normal", 6);
  doc.text(data.protocolo || "CT-e sem Autorização de Uso da SEFAZ", m + cw / 2, y + 3.5);
  y += 6;

  // ─── CFOP | NATUREZA | ORIGEM | DESTINO ───
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, 8, "F");
  doc.rect(m, y, cw, 8, "S");
  setFont("helvetica", "bold", 5);
  doc.text("CFOP", m + 2, y + 3);
  doc.text("NATUREZA DA OPERAÇÃO", m + 15, y + 3);
  doc.text("ORIGEM DA PRESTAÇÃO", m + 85, y + 3);
  doc.text("DESTINO DA PRESTAÇÃO", m + 130, y + 3);
  setFont("helvetica", "normal", 6.5);
  doc.text(data.cfop || "—", m + 2, y + 7);
  doc.text(data.naturezaOperacao || "TRANSPORTE INTERESTADUAL - INDUSTRIAL", m + 15, y + 7);
  doc.text(`${data.origemCidade || "—"} - ${data.origemUF || "—"}`, m + 85, y + 7);
  doc.text(`${data.destinoCidade || "—"} - ${data.destinoUF || "—"}`, m + 130, y + 7);
  y += 9;

  // ─── REMETENTE / DESTINATÁRIO (lado a lado) ───
  const boxH = 22;
  // remetente
  sectionHeader(y, "REMETENTE", halfCw);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, halfCw, boxH, "S");
  let ry = y + 1;
  setFont("helvetica", "normal", 5);
  doc.text(`ENDEREÇO: ${data.remEndereco || data.remBairro || "—"}`, m + 2, ry + 3);
  doc.text(`MUNICÍPIO: ${data.remCidade || "—"}   UF: ${data.remUF || "—"}   CEP: ${data.remCEP || "—"}   PAÍS: ${data.remPais || "Brasil"}`, m + 2, ry + 7);
  doc.text(`CNPJ/CPF: ${formatCnpjCpf(data.remCnpj)}   INSCRIÇÃO ESTADUAL: ${data.remIE || "—"}   FONE: ${data.remFone || "—"}`, m + 2, ry + 11);
  doc.text(`NOME: ${data.remNome || "—"}`, m + 2, ry + 15);
  // destinatário
  const dxDest = m + halfCw;
  sectionHeader(dxDest - 7.5, "DESTINATÁRIO", halfCw);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(dxDest, y, halfCw, boxH, "S");
  setFont("helvetica", "normal", 5);
  doc.text(`ENDEREÇO: ${data.destEndereco || data.destBairro || "—"}`, dxDest + 2, ry + 3);
  doc.text(`MUNICÍPIO: ${data.destCidade || "—"}   UF: ${data.destUF || "—"}   CEP: ${data.destCEP || "—"}   PAÍS: ${data.destPais || "Brasil"}`, dxDest + 2, ry + 7);
  doc.text(`CNPJ/CPF: ${formatCnpjCpf(data.destCnpj)}   INSCRIÇÃO ESTADUAL: ${data.destIE || "—"}   FONE: ${data.destFone || "—"}`, dxDest + 2, ry + 11);
  doc.text(`NOME: ${data.destNome || "—"}`, dxDest + 2, ry + 15);
  y += boxH + 1;

  // ─── EXPEDIDOR / RECEBEDOR (lado a lado, compacto) ───
  const smBoxH = 14;
  sectionHeader(y, "EXPEDIDOR", halfCw);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, halfCw, smBoxH, "S");
  setFont("helvetica", "normal", 5);
  doc.text("ENDEREÇO: —", m + 2, y + 4);
  doc.text("MUNICÍPIO: —   UF: —   CEP: —   PAÍS: Brasil", m + 2, y + 8);
  doc.text("CNPJ/CPF: —   INSCR. EST.: —   FONE: —", m + 2, y + 12);

  sectionHeader(y, "RECEBEDOR", halfCw);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m + halfCw, y, halfCw, smBoxH, "S");
  setFont("helvetica", "normal", 5);
  doc.text("ENDEREÇO: —", m + halfCw + 2, y + 4);
  doc.text("MUNICÍPIO: —   UF: —   CEP: —   PAÍS: Brasil", m + halfCw + 2, y + 8);
  doc.text("CNPJ/CPF: —   INSCR. EST.: —   FONE: —", m + halfCw + 2, y + 12);
  y += smBoxH + 1;

  // ─── TOMADOR DO SERVIÇO (full width) ───
  const tomH = 14;
  sectionHeader(y, "TOMADOR DO SERVIÇO");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, tomH, "S");
  setFont("helvetica", "normal", 5);
  doc.text(`NOME: ${data.tomadorNome || "—"}`, m + 2, y + 4);
  doc.text(`ENDEREÇO: ${data.tomadorEndereco || "—"}`, m + 2, y + 8);
  doc.text(`MUNICÍPIO: ${data.tomadorCidade || "—"}   UF: ${data.tomadorUF || "—"}   CEP: —   PAÍS: Brasil`, m + 2, y + 12);
  y += tomH + 1;

  // ─── PRODUTO PREDOMINANTE / CARACTERÍSTICAS / VALOR TOTAL ───
  const prodH = 8;
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, prodH, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, prodH, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("PRODUTO PREDOMINANTE", m + 2, y + 3);
  doc.text("OUTRAS CARACTERÍSTICAS DA CARGA", m + 60, y + 3);
  doc.text("VALOR TOTAL DA MERCADORIA", pw - m - 35, y + 3);
  setFont("helvetica", "normal", 5.5);
  doc.text(data.produtoPredominante || "NATUREZA EXEMPLO", m + 2, y + 6.5);
  doc.text(data.outrasCaract || "ESPECIE EXEMPLO", m + 60, y + 6.5);
  doc.text(formatBrl(data.valorCarga), pw - m - 35, y + 6.5);
  y += prodH + 1;

  // ─── PESO / QTDE UN MEDIDA / TIPO ───
  const pesoH = 6;
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, pesoH, "F");
  doc.rect(m, y, cw, pesoH, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("PESO (KG)", m + 2, y + 2.5);
  doc.text("QTDE. UN. MEDIDA", m + 35, y + 2.5);
  doc.text("TIPO", m + 70, y + 2.5);
  doc.text("QTDE. UN. MEDIDA", m + 100, y + 2.5);
  doc.text("TIPO", m + 135, y + 2.5);
  doc.text("QTDE. UN. MEDIDA", m + 155, y + 2.5);
  doc.text("TIPO", m + 180, y + 2.5);
  setFont("helvetica", "normal", 5.5);
  doc.text(`${data.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} KG`, m + 2, y + 5);
  y += pesoH + 1;

  // ─── COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO ───
  let yComp = sectionHeader(y, "COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO");
  const compCols = ["NOME", "VALOR", "NOME", "VALOR", "NOME", "VALOR", "VALOR TOTAL DO SERVIÇO"];
  const compColW = [35, 22, 35, 22, 35, 22, 30];
  doc.setFillColor(230, 230, 230);
  doc.rect(m, yComp, cw, 4, "F");
  doc.rect(m, yComp, cw, 4, "S");
  setFont("helvetica", "bold", 4.5);
  let cx = m + 2;
  compCols.forEach((col, i) => {
    doc.text(col, cx, yComp + 2.8);
    cx += compColW[i];
  });
  yComp += 4.5;
  setFont("helvetica", "normal", 5);
  cx = m + 2;
  doc.text("Frete Valor", cx, yComp + 3);
  cx += 35;
  doc.text(formatBrl(data.valorServico), cx, yComp + 3);
  cx += 22 + 35 + 22 + 35 + 22;
  setFont("helvetica", "bold", 5.5);
  doc.text(formatBrl(data.valorServico), cx, yComp + 3);
  yComp += 5;

  // valor a receber
  doc.setFillColor(240, 240, 240);
  doc.rect(m, yComp, cw, 4, "F");
  doc.rect(m, yComp, cw, 4, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("VALOR A RECEBER", pw - m - 35, yComp + 2.8);
  setFont("helvetica", "normal", 5.5);
  doc.text(formatBrl(data.valorServico), pw - m - 12, yComp + 2.8);
  yComp += 5;
  y = yComp + 1;

  // ─── INFORMAÇÕES RELATIVAS AO IMPOSTO ───
  y = sectionHeader(y, "INFORMAÇÕES RELATIVAS AO IMPOSTO");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 6, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("SITUAÇÃO TRIBUTÁRIA", m + 2, y + 2.5);
  doc.text("BASE DE CÁLCULO", m + 50, y + 2.5);
  doc.text("ALÍQ. ICMS (%)", m + 90, y + 2.5);
  doc.text("VALOR ICMS", m + 118, y + 2.5);
  doc.text("RED. BC ICMS ST", m + 148, y + 2.5);
  setFont("helvetica", "normal", 5.5);
  doc.text(data.icmsCST || "90 - SIMPLES NACIONAL", m + 2, y + 5);
  doc.text(formatBrl(data.icmsBase), m + 50, y + 5);
  doc.text(`${data.icmsAliq}%`, m + 90, y + 5);
  doc.text(formatBrl(data.icmsValor), m + 118, y + 5);
  doc.text("—", m + 148, y + 5);
  y += 7;

  // ─── DOCUMENTOS ORIGINÁRIOS ───
  y = sectionHeader(y, "DOCUMENTOS ORIGINÁRIOS");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 5, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("TP DOC.", m + 2, y + 3);
  doc.text("CNPJ/CPF EMITENTE", m + 20, y + 3);
  doc.text("SÉRIE / NÚMERO DOCUMENTO", m + 65, y + 3);
  doc.text("TP DOC.", m + 110, y + 3);
  doc.text("CNPJ/CPF EMITENTE", m + 125, y + 3);
  doc.text("SÉRIE / NÚMERO DOCUMENTO", m + 165, y + 3);
  y += 5.5;

  if (data.nFes.length > 0) {
    const maxPerRow = 2;
    const rows = Math.ceil(data.nFes.length / maxPerRow);
    const rowH = 5;
    for (let r = 0; r < rows && r < 4; r++) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.1);
      doc.rect(m, y, cw, rowH, "S");
      setFont("helvetica", "normal", 5);
      for (let c = 0; c < maxPerRow; c++) {
        const idx = r * maxPerRow + c;
        if (idx >= data.nFes.length) break;
        const nf = data.nFes[idx];
        const offX = c === 0 ? m + 2 : m + 110;
        doc.text("Outros", offX, y + 3.2);
        doc.text(formatCnpjCpf(data.remCnpj || ""), offX + 18, y + 3.2);
        doc.text(`${nf.serie || "1"}/${nf.nNF || "—"}`, offX + 65, y + 3.2);
      }
      y += rowH;
    }
  } else {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
    doc.rect(m, y, cw, 5, "S");
    setFont("helvetica", "normal", 5);
    doc.text("Nenhum documento fiscal vinculado.", m + 2, y + 3.2);
    y += 5;
  }
  y += 1;

  // ─── OBSERVAÇÕES ───
  y = sectionHeader(y, "OBSERVAÇÕES");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 12, "S");
  if (data.obs) {
    setFont("helvetica", "normal", 5);
    const lines = doc.splitTextToSize(data.obs, cw - 4);
    doc.text(lines.slice(0, 3), m + 2, y + 4);
  }
  y += 13;

  // ─── DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO ───
  y = sectionHeader(y, "DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 6, "S");
  setFont("helvetica", "bold", 4.5);
  doc.text("ENTR. DA EMPRESA", m + 2, y + 2.5);
  doc.text("ESSE CONHECIMENTO DE TRANSPORTE ATENDE À LEGISLAÇÃO DE TRANSPORTE RODOVIÁRIO EM VIGOR", m + 40, y + 2.5);
  setFont("helvetica", "normal", 5.5);
  doc.text(data.rntrc || "00000000", m + 2, y + 5);
  y += 7;

  // ─── USO EXCLUSIVO / RESERVADO AO FISCO ───
  const usoH = 14;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, halfCw, usoH, "S");
  doc.rect(m + halfCw, y, halfCw, usoH, "S");
  setFont("helvetica", "bold", 5);
  doc.text("USO EXCLUSIVO DO EMISSOR DO CT-e", m + 2, y + 3);
  setFont("helvetica", "bold", 5);
  doc.text("RESERVADO AO FISCO", m + halfCw + 2, y + 3);
  y += usoH + 1;

  // ─── RODAPÉ ───
  setFont("helvetica", "normal", 4.5);
  gray();
  doc.text(`DATA E HORA DA IMPRESSÃO: ${new Date().toLocaleString("pt-BR")}`, m, y + 2);
  doc.text("www.norrvo.com.br", pw - m - 25, y + 2);
  y += 4;

  // ─── DECLARAÇÃO ───
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(m, y, cw, 16, "S");
  black();
  setFont("helvetica", "normal", 5);
  doc.text("DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE", m + 2, y + 4);
  setFont("helvetica", "bold", 4.5);
  doc.text("NOME:", m + 2, y + 8);
  doc.text("ASSINATURA / CARIMBO", m + 60, y + 14);
  doc.text("CRIAÇÃO DATA, HORA", m + 120, y + 8);
  doc.text("SAÍDA DATA, HORA", m + 120, y + 12);

  // selo CT-e
  doc.setDrawColor(0, 80, 150);
  doc.setLineWidth(0.5);
  doc.rect(pw - m - 25, y + 6, 22, 8, "S");
  setFont("helvetica", "bold", 6);
  doc.text("CT-e", pw - m - 18, y + 9.5);
  setFont("helvetica", "normal", 4);
  doc.text(`Nº ${data.numero || "—"}`, pw - m - 22, y + 12);
  doc.text(`Série: ${data.serie || "001"}`, pw - m - 22, y + 14);

  return doc.output("blob");
}
