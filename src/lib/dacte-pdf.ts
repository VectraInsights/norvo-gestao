import { jsPDF } from "jspdf";

interface DacteData {
  chave: string;
  numero: string;
  serie: string;
  ambiente: string;
  dataEmissao: string;
  // Emitente
  emitCnpj: string;
  emitNome: string;
  emitEndereco: string;
  emitCidade: string;
  emitUF: string;
  emitIE: string;
  // Tomador
  tomadorCnpj: string;
  tomadorNome: string;
  tomadorEndereco: string;
  tomadorCidade: string;
  tomadorUF: string;
  // Remetente
  remCnpj: string;
  remNome: string;
  remCidade: string;
  remUF: string;
  // Destinatário
  destCnpj: string;
  destNome: string;
  destCidade: string;
  destUF: string;
  // Valores
  cfop: string;
  valorServico: number;
  valorCarga: number;
  pesoKg: number;
  // Impostos
  icmsCST: string;
  icmsBase: number;
  icmsAliq: number;
  icmsValor: number;
  // NF-e
  nFes: Array<{ nNF: string; serie: string; valor: number }>;
  // Veículos
  placa: string;
  placaReboque: string;
  rntrc: string;
  // Observações
  obs: string;
}

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, "");
  return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function gerarDactePdf(data: DacteData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = 210;
  const h = 297;
  const m = 10; // margem
  const cw = w - 2 * m; // content width

  // === CABEÇALHO ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, m, cw, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE ELETRÔNICO", m + 2, m + 5);
  doc.setFontSize(8);
  doc.text("DACTE", m + 2, m + 9);
  doc.text(`CT-e Nº ${data.numero}  Série ${data.serie}`, w - m - 40, m + 5);
  doc.text(data.ambiente === "homologacao" ? "HOMOLOGAÇÃO" : "PRODUÇÃO", w - m - 40, m + 9);

  let y = m + 16;

  // === CHAVE DE ACESSO ===
  doc.setFillColor(230, 230, 230);
  doc.rect(m, y, cw, 8, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("CHAVE DE ACESSO", m + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const chaveFormat = data.chave.replace(/(\d{4})/g, "$1 ").trim();
  doc.text(chaveFormat, m + 2, y + 7);
  y += 10;

  // === DADOS PRINCIPAIS (3 colunas) ===
  const colW = cw / 3;
  doc.setFillColor(240, 240, 240);
  doc.rect(m, y, cw, 10, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");

  // Coluna 1: Data/Hora Emissão
  doc.text("DATA/HORA EMISSÃO", m + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(data.dataEmissao ? new Date(data.dataEmissao).toLocaleString("pt-BR") : "—", m + 2, y + 7);

  // Coluna 2: CFOP
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("CFOP", m + colW + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(data.cfop, m + colW + 2, y + 7);

  // Coluna 3: RNTRC
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("RNTRC", m + 2 * colW + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(data.rntrc || "—", m + 2 * colW + 2, y + 7);
  y += 12;

  // === EMITENTE ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, cw, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("EMITENTE", m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(data.emitNome || "—", m + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`CNPJ: ${formatCnpj(data.emitCnpj)}  IE: ${data.emitIE || "—"}  ${data.emitCidade}/${data.emitUF}`, m + 2, y + 7);
  y += 10;

  // === TOMADOR ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, cw, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("TOMADOR DO SERVIÇO", m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(data.tomadorNome || "—", m + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`CNPJ: ${formatCnpj(data.tomadorCnpj)}  ${data.tomadorCidade}/${data.tomadorUF}`, m + 2, y + 7);
  y += 10;

  // === REMETENTE / DESTINATÁRIO (lado a lado) ===
  const halfW = cw / 2;

  // Remetente
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, halfW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("REMETENTE", m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(data.remNome || "—", m + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`CNPJ: ${formatCnpj(data.remCnpj)}  ${data.remCidade}/${data.remUF}`, m + 2, y + 7);

  // Destinatário
  doc.setFillColor(0, 80, 150);
  doc.rect(m + halfW, y - 7, halfW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("DESTINATÁRIO", m + halfW + 2, y - 3);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(data.destNome || "—", m + halfW + 2, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`CNPJ: ${formatCnpj(data.destCnpj)}  ${data.destCidade}/${data.destUF}`, m + halfW + 2, y + 7);
  y += 10;

  // === VALORES ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, cw, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("VALORES DO SERVIÇO", m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);

  const valCols = [
    { label: "Valor do Serviço", value: formatBrl(data.valorServico) },
    { label: "Valor da Carga", value: formatBrl(data.valorCarga) },
    { label: "Peso Bruto", value: `${data.pesoKg.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg` },
  ];
  const valColW = cw / valCols.length;
  doc.setFontSize(7);
  valCols.forEach((c, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(c.label, m + i * valColW + 2, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(c.value, m + i * valColW + 2, y + 7);
    doc.setFontSize(7);
  });
  y += 10;

  // === ICMS ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, cw, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("IMPOSTOS", m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);

  const impCols = [
    { label: "ICMS CST", value: data.icmsCST },
    { label: "Base Cálculo", value: formatBrl(data.icmsBase) },
    { label: "Alíquota", value: `${data.icmsAliq}%` },
    { label: "Valor ICMS", value: formatBrl(data.icmsValor) },
  ];
  const impColW = cw / impCols.length;
  doc.setFontSize(7);
  impCols.forEach((c, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(c.label, m + i * impColW + 2, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(c.value, m + i * impColW + 2, y + 7);
    doc.setFontSize(7);
  });
  y += 10;

  // === DOCUMENTOS FISCAIS (NF-e) ===
  doc.setFillColor(0, 80, 150);
  doc.rect(m, y, cw, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(`DOCUMENTOS FISCAIS (${data.nFes.length} NF-e)`, m + 2, y + 4);
  y += 7;
  doc.setTextColor(0, 0, 0);

  if (data.nFes.length > 0) {
    // Cabeçalho da tabela
    doc.setFillColor(230, 230, 230);
    doc.rect(m, y, cw, 5, "F");
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.text("Nº NF-e", m + 2, y + 3.5);
    doc.text("Série", m + 30, y + 3.5);
    doc.text("Valor", m + 50, y + 3.5);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    data.nFes.forEach((nf) => {
      if (y > h - 40) return; // não extrapola página
      doc.text(nf.nNF, m + 2, y + 3);
      doc.text(nf.serie, m + 30, y + 3);
      doc.text(formatBrl(nf.valor), m + 50, y + 3);
      y += 4.5;
    });
  } else {
    doc.setFontSize(7);
    doc.text("Nenhum documento fiscal vinculado.", m + 2, y + 4);
    y += 5;
  }
  y += 3;

  // === VEÍCULO ===
  if (data.placa) {
    doc.setFillColor(0, 80, 150);
    doc.rect(m, y, cw, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("VEÍCULO", m + 2, y + 4);
    y += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Placa: ${data.placa}${data.placaReboque ? "  Reboque: " + data.placaReboque : ""}`, m + 2, y + 3);
    y += 7;
  }

  // === OBSERVAÇÕES ===
  if (data.obs) {
    doc.setFillColor(0, 80, 150);
    doc.rect(m, y, cw, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("OBSERVAÇÕES", m + 2, y + 4);
    y += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(data.obs, cw - 4);
    doc.text(lines, m + 2, y + 3);
    y += lines.length * 3.5 + 3;
  }

  // === RODAPÉ ===
  doc.setDrawColor(0, 80, 150);
  doc.setLineWidth(0.3);
  doc.line(m, h - 20, w - m, h - 20);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("Norvo Gestão — ERP para Transportadoras", m, h - 16);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, m, h - 13);
  doc.text("Este documento não substitui o CT-e eletrônico emitido na SEFAZ.", m, h - 10);

  return doc.output("blob");
}
