import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
import qrcode from "./vendor/qrcode.bundle.cjs";

// DACTE fiel ao modelo oficial (Juvenal Transportes) — retrato A4, P&B.
interface DacteData {
  chave: string;
  numero: string;
  serie: string;
  ambiente: string;
  dataEmissao: string;
  dhEmi?: string;
  versao?: string;
  emitCnpj: string;
  emitNome: string;
  emitEndereco: string;
  emitBairro?: string;
  emitCEP?: string;
  emitFone?: string;
  emitCidade: string;
  emitUF: string;
  emitIE: string;
  tomadorCnpj: string;
  tomadorNome: string;
  tomadorEndereco: string;
  tomadorCidade: string;
  tomadorUF: string;
  tomadorIE?: string;
  tomadorFone?: string;
  tomaCod?: string;
  toma4?: boolean;
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
  naturezaOperacao?: string;
  cfopDescricao?: string;
  origemCidade?: string;
  origemUF?: string;
  destinoCidade?: string;
  destinoUF?: string;
  previsaoViagem?: string;
  valorServico: number;
  valorCarga: number;
  pesoKg: number;
  proPred?: string;
  xOutCat?: string;
  produtoPredominante?: string;
  outrasCaract?: string;
  infQ?: Array<{ q?: string; um?: string }>;
  cubagem?: string;
  qtdVol?: string;
  icmsCST: string;
  icmsBase: number;
  icmsAliq: number;
  icmsValor: number;
  reducaoBase?: number | string;
  icmsST?: number | string;
  ibsCST?: string;
  ibsClass?: string;
  ibsBase?: number | string;
  cbsAliq?: number | string;
  cbsValor?: number | string;
  ibsMunAliq?: number | string;
  ibsMunValor?: number | string;
  ibsUfAliq?: number | string;
  ibsUfValor?: number | string;
  vTotTrib?: number | string;
  nFes: Array<{ nNF: string; serie: string; valor: number; chave?: string }>;
  placa: string;
  placaReboque: string;
  rntrc: string;
  ciot?: string;
  dataPrevEntrega?: string;
  veiculos?: Array<{ tipo?: string; placa?: string; renavam?: string; uf?: string; rntrc?: string }>;
  motoNome?: string;
  motoCPF?: string;
  lacres?: string;
  propDoc?: string;
  propNome?: string;
  propRNTRC?: string;
  subContratado?: string;
  seguradoraNome?: string;
  segCNPJ?: string;
  segResp?: string;
  segRespCNPJ?: string;
  apolice?: string;
  averbacao?: string;
  numeroAverbacao?: string;
  segTotal?: number | string;
  valePedagio?: number | string;
  valePedFornCNPJ?: string;
  valePedComprov?: string;
  valePedRespCNPJ?: string;
  comps?: Array<{ nome: string; valor: number }>;
  obs: string;
  infoAdicionais?: string;
  protocolo?: string;
  modelo?: string;
  fl?: string;
  logoDataUrl?: string;
  qrCode?: string;
  tipoServico?: string;
  finalidade?: string;
  formaPagto?: string;
  respEmissao?: string;
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

function fmtDH(v: string): string {
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v || "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return v || ""; }
}

function fmtDataCurta(v: string): string {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return v || "";
}

function cfopFmt(cfop: string): string {
  const d = (cfop || "").replace(/\D/g, "");
  return d.length === 4 ? `${d[0]}.${d.slice(1)}` : (cfop || "");
}

function cstIcmsLabel(cst: string): string {
  const c = (cst || "").replace(/\D/g, "").padStart(2, "0");
  const map: Record<string, string> = {
    "00": "ICMS com Tributação Integral",
    "10": "ICMS com cobrança por ST",
    "20": "ICMS com redução de base de cálculo",
    "30": "ICMS isenta/não tributada com ST",
    "40": "ICMS isenta",
    "41": "ICMS não tributada",
    "50": "ICMS suspensão",
    "51": "ICMS diferido",
    "60": "ICMS cobrado anteriormente por ST",
    "70": "ICMS com redução e ST",
    "90": "ICMS outros",
  };
  return `${c} - ${map[c] || "Verificar CST"}`;
}

function tomaLabel(cod: string | undefined, toma4: boolean | undefined, tomDoc?: string, remDoc?: string, destDoc?: string, expDoc?: string, recDoc?: string): string {
  const dg = (s: any) => String(s || "").replace(/\D/g, "");
  const td = dg(tomDoc);
  if (td) {
    if (td === dg(remDoc)) return "Remetente";
    if (td === dg(destDoc)) return "Destinatario";
    if (dg(expDoc) && td === dg(expDoc)) return "Expedidor";
    if (dg(recDoc) && td === dg(recDoc)) return "Recebedor";
    return "Outros";
  }
  if (toma4) return "Outros";
  const m: Record<string, string> = { "0": "Remetente", "1": "Expedidor", "2": "Recebedor", "3": "Destinatario", "4": "Outros" };
  return m[String(cod || "")] || "Destinatario";
}

function segRespLabel(r: string | undefined): string {
  const m: Record<string, string> = { "1": "1- Tomador do Serviço", "2": "2- Remetente", "3": "3- Destinatário", "4": "4- Emitente do CT-e", "5": "5- Outros" };
  const k = String(r || "4");
  return m[k] || k;
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
  const W = 210, M = 6, CW = W - 2 * M;
  const hw = CW / 2;
  const LIM = 291;
  let y = M;

  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const border = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); };
  const box = (x: number, yy: number, w: number, h: number) => { border(); doc.rect(x, yy, w, h, "S"); };
  const vline = (x: number, yy: number, h: number) => { border(); doc.line(x, yy, x, yy + h); };
  const dashH = (x1: number, x2: number, yy: number) => {
    doc.saveGraphicsState();
    try { (doc as any).setLineDashPattern([1.5, 1.5], 0); } catch {}
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
    doc.line(x1, yy, x2, yy);
    try { (doc as any).restoreGraphicsState(); } catch {}
    border();
  };
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

  // Bloco pessoa (remetente/destinatário/expedidor/recebedor): título inline + 5 linhas
  const party = (x: number, title: string, p: { nome?: string; lgr?: string; cid?: string; cep?: string; bai?: string; doc?: string; ie?: string; uf?: string; fone?: string }) => {
    valB(`${title} : ${cut(D(p.nome), 46)}`, x + 1.5, y + 4, 6);
    setFont("normal", 6); black();
    const L = [
      `Endereço : ${cut(D(p.lgr), 52)}`,
      `Município : ${cut(D(p.cid), 26)}   CEP : ${D(p.cep)}`,
      `Bairro : ${cut(D(p.bai), 52)}`,
      `CPF / CNP : ${fmtCnpj(D(p.doc))}   Insc. Est : ${cut(D(p.ie), 18)}`,
      `UF : ${D(p.uf)}   País : BRASIL   Fone : ${D(p.fone)}`,
    ];
    L.forEach((ln, i) => doc.text(ln, x + 1.5, y + 7 + i * 2.9));
  };

  // ---- Cabeçalho: emitente | DACTE | modal ----
    // ---- Cabecalho 2 colunas: emitente+DACTE | QR+barras+chave ----
  const colL = 98, colR = CW - colL - 2, rx = M + colL + 2;
  const emH = 18, daH = 11, moH2 = 5, prHL = 6;
  const yTop = y;
  box(M, y, colL, emH);
  if (data.logoDataUrl) { try { doc.addImage(data.logoDataUrl as string, "PNG", M + 2, y + 3.5, 26, 10.2); } catch {} }
  else { border(); doc.rect(M + 2, y + 3.5, 26, 10.2, "S"); }
  const ex = M + 30;
  valB(cut(D(data.emitNome) || "EMPRESA", 34), ex, y + 3.5, 7);
  setFont("normal", 6); black();
  doc.text("Endereço :", ex, y + 6.5);
  val(cut(D(data.emitEndereco), 36), ex + 14, y + 6.5, 6);
  doc.text("Bairro", ex, y + 9.5);
  val(cut(D(data.emitBairro), 20), ex + 14, y + 9.5, 5);
  doc.text("CEP", ex + 38, y + 9.5);
  val(D(data.emitCEP), ex + 44, y + 9.5, 6);
  doc.text("Cidade", ex, y + 12.5);
  val(`${cut(D(data.emitCidade), 18)}, ${D(data.emitUF)}`, ex + 14, y + 12.5, 6);
  doc.text("Tel.", ex + 38, y + 12.5);
  val(D(data.emitFone), ex + 46, y + 12.5, 6);
  doc.text("CPF / CNPJ", ex, y + 15.5);
  val(fmtCnpj(data.emitCnpj), ex + 14, y + 15.5, 6);
  doc.text("Insc. Est.", ex + 38, y + 15.5);
  val(cut(D(data.emitIE), 12), ex + 51, y + 15.5, 6);
  y += emH + 1;
  box(M, y, colL, daH);
  ctr("DACTE", M + colL / 2, y + 3, 9, true);
  setFont("normal", 5); black();
  ctr("Documento auxiliar do conhecimento de transporte eletrônico", M + colL / 2, y + 6, 4.5);
  const dheads = ["Modelo", "Série", "Número", "FL", "Data Emissão"];
  const dvals = ["57", D(data.serie) || "1", fmtInt(data.numero), D(data.fl) || "1 / 1", fmtDH(data.dhEmi || data.dataEmissao)];
  const doff = [0, 18, 32, 52, 62];
  doff.forEach((co, i) => {
    if (i > 0) vline(M + co, y + 7, daH - 7);
    lab(dheads[i], M + co + 1, y + 8.2);
    valB(dvals[i], M + co + 1, y + 10.2, 5.5);
  });
  y += daH + 1;
  box(M, y, colL, moH2);
  setFont("bold", 6); black();
  doc.text("Modal: Rodoviário", M + 2, y + 4);
  doc.text("Insc. Suframa Destinatário:", M + 62, y + 4);
  y += moH2 + 1;
  box(M, y, colL, prHL);
  setFont("bold", 6); black();
  doc.text("Protocolo de Autorização de Uso :", M + 2, y + 4.2);
  val(D(data.protocolo), M + 45, y + 4.2, 6);
  setFont("bold", 6); black();
  doc.text("Versão :", M + 64, y + 4.2);
  val(D(data.versao) || "4.00", M + 76, y + 4.2, 6);
  y += prHL + 1;
  const rhH = emH + 1 + daH + 1 + moH2 + 1 + prHL;
  const ry = yTop;
  box(rx, ry, colR, rhH);
  const qrTxt = (data.qrCode || "").trim();
  if (qrTxt) drawQr(doc, rx + (colR - 25) / 2, ry + 1.5, 25, qrTxt);
  else { border(); doc.rect(rx + (colR - 25) / 2, ry + 1.5, 25, 25, "S"); }
  border(); doc.line(rx, ry + 27, rx + colR, ry + 27);
  const barsImg = barcodePng(data.chave);
  if (barsImg) {
    try {
      const props = (doc as any).getImageProperties(barsImg);
      const ratio = props.width / props.height;
      let iw = 7 * ratio, ih = 7;
      const maxW = colR - 8;
      if (iw > maxW) { iw = maxW; ih = iw / ratio; }
      doc.addImage(barsImg, "PNG", rx + (maxW - iw) / 2 + 2, ry + 28, iw, ih);
    } catch {}
  }
  setFont("normal", 4.5); black();
  const capLines = doc.splitTextToSize("Chave de Acesso para Consulta de autenticidade no site www.cte.fazenda.gov.br ou da Autorizada", colR - 6);
  capLines.slice(0, 2).forEach((ln: string, i: number) => ctr(ln, rx + colR / 2, ry + 37 + i * 2.6, 4.5));
  ctr(fmtChave(data.chave), rx + colR / 2, ry + 42, 6, true);

  // ---- Tipo CT-e / serviço / responsável / tomador / pagamento ----
  const metaH = 5.5;
  box(M, y, CW, metaH);
  const finTxt = String(data.finalidade || "Normal");
  const tipoCTe = /^normal$/i.test(finTxt) ? "Emissao Normal" : finTxt;
  const metas: Array<[string, string, number]> = [
    ["Tipo do CT-E", tipoCTe, 34],
    ["Tipo do Serviço", D(data.tipoServico) || "Normal", 34],
    ["Responsável Emissão", D(data.respEmissao), 38],
    ["Tomador de Serviço", tomaLabel(data.tomaCod, data.toma4, (data as any).tomadorCnpj, (data as any).remCnpj, (data as any).destCnpj, (data as any).expCnpj, (data as any).recCnpj), 38],
    ["Forma de Pagamento", D(data.formaPagto), 0],
  ];
  let mxx = M + 2;
  metas.forEach(([l, v, w]) => {
    lab(l, mxx, y + 2);
    val(cut(v, 26), mxx, y + 5, 5.5);
    if (w) { vline(mxx + w, y, metaH); mxx += w + 2; }
  });
  y += metaH + 1;

  // ---- CFOP + inicio / termino (mesma linha, natureza por inteiro) ----
  const cfiH = 7.5;
  box(M, y, CW, cfiH);
  const cfopTxt = data.cfopDescricao || `${cfopFmt(data.cfop)}  ${D(data.naturezaOperacao) || "TRANSPORTE"}`;
  const cfiCols: Array<[string, string, number]> = [
    ["CFOP - Natureza da Prestação", cfopTxt, 100],
    ["Início da Prestação", `${cut(D(data.origemCidade), 30)}, ${D(data.origemUF)}`, 48],
    ["Término da Prestação", `${cut(D(data.destinoCidade), 30)}, ${D(data.destUF)}`, 0],
  ];
  let cfiX = M + 2;
  cfiCols.forEach(([l, v, w]) => {
    lab(l, cfiX, y + 2.5);
    valB(cut(v, 84), cfiX, y + 6, 6);
    if (w) { vline(cfiX + w, y, cfiH); cfiX += w + 2; }
  });
  y += cfiH + 1;

  // ---- Remetente | Destinatário ----
  const rdH = 21;
  box(M, y, hw, rdH);
  box(M + hw, y, hw, rdH);
  party(M, "Remetente", { nome: data.remNome, lgr: data.remEndereco, cid: data.remCidade, cep: data.remCEP, bai: data.remBairro, doc: data.remCnpj, ie: data.remIE, uf: data.remUF, fone: data.remFone });
  party(M + hw, "Destinatário", { nome: data.destNome, lgr: data.destEndereco, cid: data.destCidade, cep: data.destCEP, bai: data.destBairro, doc: data.destCnpj, ie: data.destIE, uf: data.destUF, fone: data.destFone });
  y += rdH + 1;

  // ---- Expedidor | Recebedor ----
  const erH = 19.5;
  box(M, y, hw, erH);
  box(M + hw, y, hw, erH);
  party(M, "Expedidor", { nome: data.expNome, lgr: data.expEndereco, cid: data.expCidade, cep: "", bai: "", doc: data.expCnpj, ie: data.expIE, uf: data.expUF, fone: "" });
  party(M + hw, "Recebedor", { nome: data.recNome, lgr: data.recEndereco, cid: data.recCidade, cep: "", bai: "", doc: data.recCnpj, ie: data.recIE, uf: data.recUF, fone: "" });
  y += erH + 1;

  // ---- Tomador ----
  const tomH = 13;
  box(M, y, CW, tomH);
  valB(`Tomador: ${cut(D(data.tomadorNome), 58)}`, M + 1.5, y + 3, 6);
  setFont("normal", 6); black();
  const cidUfTom = `${D(data.tomadorCidade)}${D(data.tomadorCidade) && D(data.tomadorUF) ? " / " : ""}${D(data.tomadorUF)}`;
  doc.text(`Endereço : ${cut(D(data.tomadorEndereco) + (cidUfTom ? " - " + cidUfTom : ""), 80)}`, M + 1.5, y + 6);
  doc.text(`CPF / CNPJ : ${fmtCnpj(data.tomadorCnpj)}   Insc. Est. ${cut(D(data.tomadorIE), 16)}   Tel. : ${D(data.tomadorFone)}   País : BRASIL`, M + 1.5, y + 9);
  y += tomH + 1;

  // ---- Produto / valor mercadoria / averbação ----
  const pdH = 7.5;
  box(M, y, CW, pdH);
  lab("Produto Predominante", M + 2, y + 2.5);
  lab("Outras Características da Carga", M + 62, y + 2.5);
  lab("Valor Total Mercadoria", M + 122, y + 2.5);
  lab("Número Averbação", M + 158, y + 2.5);
  val(cut(D(data.proPred) || D(data.produtoPredominante), 30), M + 2, y + 6.5, 6);
  val(cut(D(data.xOutCat) || D(data.outrasCaract), 30), M + 62, y + 6.5, 6);
  val(fmtNum(data.valorCarga), M + 122, y + 6.5, 6);
  setFont("normal", 5); black();
  doc.text(cut(D(data.numeroAverbacao), 26), M + 158, y + 6.5);
  y += pdH + 1;

  // ---- Carga + seguro ----
  const cgH = 13;
  box(M, y, CW, cgH);
  const q0: any = data.infQ && data.infQ.length > 0 ? data.infQ[0] : {};
  const q1: any = data.infQ && data.infQ.length > 1 ? data.infQ[1] : q0;
  lab("Qtd.", M + 2, y + 3); lab("Carga", M + 2, y + 6);
  const cgw: Array<[string, string, string, number]> = [
    ["Qtde Medida/", "Un Medida", `${cut(fmtQtd(D(q0.q)), 14)}/${cut(D(q0.um) || "Unid", 8)}`, 24],
    ["Qtde Cobrada/", "Un Medida", `${cut(fmtQtd(D(q1.q)), 14)}/${cut(D(q1.um) || "Unid", 8)}`, 24],
    ["Cubagem", "(M³)", D(data.cubagem) || "0,00", 18],
    ["Qtd.Vol. /", "UN", D(data.qtdVol), 18],
  ];
  let cxx = M + 16;
  cgw.forEach(([l1, l2, v, w]) => {
    lab(l1, cxx + 1, y + 3); lab(l2, cxx + 1, y + 6);
    val(v, cxx + 1, y + 10.5, 6);
    vline(cxx + w, y, cgH);
    cxx += w + 1.5;
  });
  const sx = cxx + 0.5;
  setFont("normal", 5.5); black();
  doc.text(`Nome da Seguradora  ${cut(D(data.seguradoraNome), 30)}   CNPJ  ${fmtCnpj(D(data.segCNPJ))}`, sx, y + 3.5);
  doc.text(`Responsável  ${cut(segRespLabel(data.segResp), 24)}   CNPJ  ${fmtCnpj(D(data.segRespCNPJ) || data.emitCnpj)}`, sx, y + 7);
  doc.text(`Número Apólice  ${cut(D(data.apolice), 24)}`, sx, y + 10.5);
  y += cgH + 1;

  // ---- Componentes ----
  const getComp = (keys: string[]): number => {
    const list = data.comps || [];
    const hit = list.find(c => keys.some(k => String(c.nome || "").toUpperCase().includes(k)));
    return hit ? Number(hit.valor) || 0 : 0;
  };
  const vFrete = getComp(["FRETE"]);
  const vAdic = getComp(["ADICIONAL"]);
  const vDesc = getComp(["DESCONTO"]);
  const vOut = getComp(["OUTROS"]);
  const vAdv = getComp(["AD VALOREM", "ADVALOREM"]);
  const vGris = getComp(["GRIS"]);
  const vCol = getComp(["COLETA"]);
  const vEnt = getComp(["ENTREGA"]);
  const vSeg = Number(data.segTotal) || getComp(["SEGURO"]);
  const vPed = Number(data.valePedagio) || 0;
  const gridX = M, gridW = 146, totX = M + gridW, totW = CW - gridW;
  const compRows: Array<Array<[string, number]>> = [
    [["Frete", vFrete], ["Adicional", vAdic], ["ICMS", Number(data.icmsValor) || 0], ["Coleta", vCol]],
    [["Pedágio", vPed], ["Desconto", vDesc], ["Ad Valorem", vAdv], ["Entrega", vEnt]],
    [["Sec/Cat", 0], ["Seguro", vSeg], ["GRIS", vGris], ["Outros", vOut]],
  ];
  const chH = 4, crH = 4;
  const compH = chH + crH * 3;
  box(gridX, y, gridW, compH);
  box(totX, y, totW, compH);
  const colW = gridW / 4;
  const pairW = colW / 2;
  setFont("bold", 5); black();
  ["Nome", "Valor", "Nome", "Valor", "Nome", "Valor", "Nome", "Valor"].forEach((h, i) => {
    doc.text(h, gridX + 1 + Math.floor(i / 2) * colW + (i % 2) * pairW, y + 3);
  });
  compRows.forEach((row, r) => {
    row.forEach(([nm, vv], c) => {
      setFont("normal", 5.5); black();
      doc.text(nm, gridX + 1 + c * colW, y + chH + 2 + r * crH);
      doc.text(fmtNum(vv), gridX + 1 + c * colW + pairW, y + chH + 2 + r * crH);
    });
  });
  for (let i = 1; i < 4; i++) vline(gridX + i * colW, y, compH);
  dashH(gridX + 1, gridX + gridW - 1, y + 8);
  dashH(gridX + 1, gridX + gridW - 1, y + 12);
  dashH(totX + 1, totX + totW - 1, y + 8.5);
  setFont("bold", 5.5); black();
  doc.text("Valor do Serviço", totX + 2, y + 3);
  valB(fmtNum(data.valorServico), totX + 2, y + 6.5, 7);
  setFont("bold", 5.5); black();
  doc.text("Valor à Receber", totX + 2, y + 11);
  valB(fmtNum(data.valorServico), totX + 2, y + 14, 7);
  y += compH + 1;

  // ---- ICMS ----
  const icH = 8;
  box(M, y, CW, icH);
  const icCols: Array<[string, string, number]> = [
    ["Situação Tributária", cstIcmsLabel(data.icmsCST).slice(0, 34), 68],
    ["Base de Cálculo", fmtNum(data.icmsBase), 30],
    ["AL ICMS", fmtNum(data.icmsAliq), 22],
    ["Valor ICMS", fmtNum(data.icmsValor), 30],
    ["% Red. Bc. Calc", fmtNum(data.reducaoBase ?? 0), 24],
    ["ICMS ST", fmtNum(data.icmsST ?? 0), 0],
  ];
  let icx = M + 2;
  icCols.forEach(([l, v, w]) => {
    lab(l, icx, y + 3);
    val(v, icx, y + 6.5, 5.5);
    if (w) { vline(icx + w, y, icH); icx += w + 2; }
  });
  y += icH + 1;

  // ---- IBS/CBS ----
  const ibH = 8;
  box(M, y, CW, ibH);
  const ibBase = data.ibsBase !== undefined && data.ibsBase !== "" ? Number(data.ibsBase) : Number(data.icmsBase) || 0;
  const cbsA = data.cbsAliq !== undefined && data.cbsAliq !== "" ? Number(data.cbsAliq) : 0.90;
  const cbsV = data.cbsValor !== undefined && data.cbsValor !== "" ? Number(data.cbsValor) : ibBase * 0.009;
  const munA = data.ibsMunAliq !== undefined && data.ibsMunAliq !== "" ? Number(data.ibsMunAliq) : 0;
  const munV = data.ibsMunValor !== undefined && data.ibsMunValor !== "" ? Number(data.ibsMunValor) : 0;
  const ufA = data.ibsUfAliq !== undefined && data.ibsUfAliq !== "" ? Number(data.ibsUfAliq) : 0.10;
  const ufV = data.ibsUfValor !== undefined && data.ibsUfValor !== "" ? Number(data.ibsUfValor) : ibBase * 0.001;
  const ibCols: Array<[string, string, number]> = [
    ["CST", D(data.ibsCST) || "000", 10],
    ["Classificação Tributária", cut(D(data.ibsClass) || "000001 - Situações tributadas integralmente pelo IBS e CBS.", 34), 54],
    ["Base de Cálculo", fmtNum(ibBase), 24],
    ["% CBS", fmtNum(cbsA), 14],
    ["Valor CBS", fmtNum(cbsV), 20],
    ["% IBS Mun", fmtNum(munA), 14],
    ["Valor IBS Mun", fmtNum(munV), 20],
    ["% IBS Uf", fmtNum(ufA), 12],
    ["Valor IBS Uf", fmtNum(ufV), 0],
  ];
  let ibx = M + 2;
  ibCols.forEach(([l, v, w]) => {
    lab(l, ibx, y + 3);
    val(v, ibx, y + 6.5, 5);
    if (w) { vline(ibx + w, y, ibH); ibx += w + 1.5; }
  });
  y += ibH + 1;

  // ---- Documentos originários ----
  const docTitleH = 4;
  box(M, y, CW, docTitleH);
  ctr("Documentos Originários", W / 2, y + 3, 6, true);
  y += docTitleH;
  const docHeadH = 4;
  box(M, y, CW, docHeadH);
  setFont("bold", 5); black();
  ["Tipo Doc", "Série / Nº Doc.", "Chave NFe", "Tipo Doc", "Série / Nº Doc.", "Chave NFe"].forEach((h, i) => {
    doc.text(h, (i < 3 ? M : M + hw) + [2, 20, 46][i % 3], y + 3);
  });
  y += docHeadH;
  const nfs = data.nFes || [];
  if (nfs.length === 0) {
    need(6);
    box(M, y, CW, 6);
    val("Nenhum documento fiscal vinculado.", M + 2, y + 4.5, 5.5);
    y += 6;
  } else {
    for (let i = 0; i < nfs.length; i += 2) {
      need(11);
      const rh = 5;
      box(M, y, hw, rh);
      box(M + hw, y, hw, rh);
      for (let c = 0; c < 2; c++) {
        const nf = nfs[i + c];
        if (!nf) break;
        const ox = (c === 0 ? M : M + hw) + 2;
        setFont("normal", 5.5); black();
        doc.text("NFe", ox, y + 3);
        doc.text(`${String(nf.serie || "1").padStart(3, "0")} / ${D(nf.nNF)}`, ox + 18, y + 3);
        setFont("normal", 4.5);
        doc.text(fmtChave(nf.chave || ""), ox + 44, y + 3);
      }
      y += rh;
    }
  }
  y += 1;

  // ---- Observações (preenche até o canhoto encostar no rodapé) ----
  const hasObsTxt = !!(data.obs && data.obs.trim());
  const isHom = (data.ambiente || "") === "homologacao";
  need(7 + 6);
  box(M, y, CW, 4.5);
  ctr("Observações", W / 2, y + 3.5, 6, true);
  y += 5;
  const nVeicObs = Math.min(Math.max((data.veiculos && data.veiculos.length) || 1, 1), 4);
  const restoAposObs = 1 + 4.5 + 11 + (26 + 4 * nVeicObs) + 5.5 + 16 + 1; // +1 folga p/ need(17) do canhoto
  let obsH = LIM - y - restoAposObs;
  if (!(obsH >= 7)) obsH = 7;
  box(M, y, CW, obsH);
  if (hasObsTxt) {
    setFont("normal", 5); black();
    const lines = doc.splitTextToSize(data.obs, CW - 4);
    doc.text(lines.slice(0, 2), M + 2, y + 4);
  }
  if (hasObsTxt && isHom && obsH >= 14) dashH(M + 1, M + CW - 1, y + obsH - 6);
  if (isHom) {
    doc.setTextColor(170, 170, 170);
    ctr("AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", W / 2, y + obsH - 3, 9, true);
    black();
  }
  y += obsH + 1;

  // ---- Total impostos aproximado ----
  const impH = 3.5;
  box(M, y, CW, impH);
  const vt = Number(data.vTotTrib) || 0;
  const perc = data.valorServico ? (vt / Number(data.valorServico)) * 100 : 0;
  const percTxt = perc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  setFont("normal", 5); black();
  const impLine = `Total Impostos Aproximado --> Federal Nacional: R$ ${fmtNum(vt)} (${percTxt}%) Estadual: R$ 0,00 (0,00%) Municipal: R$ 0,00 (0,00%) Valor Total: R$ ${fmtNum(vt)} Fonte IBPT - 24.1.A`;
  try { (doc as any).text(impLine, W / 2, y + 2.5, { align: "center" }); } catch { doc.text(impLine, M + 2, y + 2.5); }
  y += impH + 1;

  // ---- Informações adicionais ----
  const iaH = 5;
  need(iaH + 6);
  box(M, y, CW, 4.5);
  setFont("bold", 6); black();
  doc.text("Informações Adicionais", M + 2, y + 3.5);
  y += 5;
  box(M, y, CW, iaH);
  if (D(data.infoAdicionais)) {
    setFont("normal", 5); black();
    const lines = doc.splitTextToSize(String(data.infoAdicionais), CW - 4);
    doc.text(lines.slice(0, 2), M + 2, y + 4);
  }
  y += iaH + 1;

  // ---- Modal lotação ----
  need(40);
  const moTitleH = 4.5;
  box(M, y, CW, moTitleH);
  ctr("Dados Específicos do Modal Rodoviário - Lotação", W / 2, y + 3.5, 6, true);
  y += moTitleH;
  const moH = 6;
  box(M, y, CW, moH);
  lab("RNTRC DA EMPRESA", M + 2, y + 2.5);
  lab("CIOT", M + 44, y + 2.5);
  lab("Data Prevista de Entrega", M + 76, y + 2.5);
  setFont("bold", 5); black();
  doc.text("Esse Conhecimento de Transporte Atende à Legislação de transporte Rodoviário em Vigor", M + 122, y + 4);
  val(D(data.rntrc), M + 2, y + 5, 6);
  val(D(data.ciot), M + 44, y + 5, 6);
  val(fmtDataCurta(D(data.dataPrevEntrega)), M + 76, y + 5, 6);
  y += moH;
  const conjH = 4;
  box(M, y, hw, conjH);
  box(M + hw, y, hw, conjH);
  setFont("bold", 5); black();
  doc.text("Identificação do Conjunto Transportador", M + 2, y + 3);
  doc.text("Informações Referente ao Vale - Pedágio", M + hw + 2, y + 3);
  y += conjH;
  const veics = (data.veiculos && data.veiculos.length > 0)
    ? data.veiculos.slice(0, 4)
    : [{ tipo: "Própria", placa: data.placa, renavam: "", uf: "", rntrc: data.rntrc }];
  const vRowH = 4;
  veics.forEach((vc) => {
    need(vRowH + 22);
    box(M, y, hw, vRowH);
    box(M + hw, y, hw, vRowH);
    setFont("normal", 5); black();
    doc.text(cut(D(vc.tipo) || "Própria", 10), M + 2, y + 3);
    doc.text(cut(D(vc.placa), 10), M + 18, y + 3);
    doc.text(cut(D(vc.renavam), 14), M + 34, y + 3);
    doc.text(cut(D(vc.uf), 4), M + 62, y + 3);
    doc.text(cut(D(vc.rntrc), 12), M + 70, y + 3);
    doc.text(fmtCnpj(D(data.valePedFornCNPJ)), M + hw + 2, y + 3);
    doc.text(cut(D(data.valePedComprov), 14), M + hw + 32, y + 3);
    doc.text(fmtCnpj(D(data.valePedRespCNPJ)), M + hw + 52, y + 3);
    doc.text(fmtNum(data.valePedagio ?? 0), M + hw + 82, y + 3);
    y += vRowH;
  });
  const subcH = 4.5;
  box(M, y, CW, subcH);
  setFont("bold", 4.5); black();
  doc.text("Endereço SubContratado", M + 2, y + 3);
  val(cut(D(data.subContratado), 80), M + 42, y + 3, 5);
  y += subcH;
  const motH = 6;
  box(M, y, CW, motH);
  lab("Motorista", M + 2, y + 2);
  lab("CPF do Motorista", M + 62, y + 2);
  lab("Proprietário", M + 96, y + 2);
  lab("Identificação dos Lacres em Trânsit", M + 150, y + 2);
  val(cut(D(data.motoNome), 30), M + 2, y + 5, 5);
  val(D(data.motoCPF), M + 62, y + 5, 5);
  val(`${fmtCnpj(D(data.propDoc))}  ${cut(D(data.propNome), 24)}`, M + 96, y + 5, 5);
  val(cut(D(data.lacres), 24), M + 150, y + 5, 5);
  y += motH + 1;

  // ---- Uso exclusivo | fisco ----
  need(12);
  const usoH = 4.5;
  box(M, y, hw, usoH);
  box(M + hw, y, hw, usoH);
  setFont("bold", 5.5); black();
  doc.text("Uso Exclusivo do Emissor do CT-e", M + 2, y + 3);
  doc.text("Reservado ao Fisco", M + hw + 2, y + 3);
  y += usoH + 1;

  // ---- Canhoto (Nome/RG | Assinatura | Prestacao | CT-e) ----
  need(17);
  doc.saveGraphicsState();
  try { (doc as any).setLineDashPattern([2, 2], 0); } catch {}
  doc.line(M, y, M + CW, y);
  try { (doc as any).restoreGraphicsState(); } catch {}
  border();
  y += 2;
  const caH = 14;
  box(M, y, CW, caH);
  ctr("DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIMENTO DESTE PRESENTE", W / 2, y + 3.5, 5.5, true);
  vline(M + 58, y + 4, caH - 4);
  vline(M + 108, y + 4, caH - 4);
  vline(M + 152, y + 4, caH - 4);
  setFont("normal", 5); black();
  doc.text("Nome", M + 2, y + 6.5);
  dashH(M + 1, M + 57, y + 9);
  doc.text("RG", M + 2, y + 12);
  ctr("Assinatura ou Carimbo", M + 83, y + 10, 5);
  setFont("normal", 4.5); black();
  ctr("Término da Prestação - Data/Hora", M + 130, y + 6, 4.5);
  dashH(M + 109, M + 151, y + 9);
  ctr("Início de Prestação - Data/Hora", M + 130, y + 12, 4.5);
  setFont("bold", 6); black();
  doc.text("CT-e", M + 154, y + 6);
  setFont("normal", 5.5); black();
  doc.text(`NRO Documento : ${fmtInt(data.numero)}`, M + 154, y + 9.5);
  doc.text(`Série : ${D(data.serie) || "1"}`, M + 154, y + 12);

  return doc.output("blob");
}
