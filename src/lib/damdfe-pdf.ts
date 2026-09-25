import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
import qrcode from "./vendor/qrcode.bundle.cjs";

export const DAMDFE_REV = "20260925-p1";

// DAMDFE simplificado (retrato A4, P&B) a partir do XML assinado do MDF-e.
export interface DamdfeData {
  chave: string;
  numero: string;
  serie: string;
  dhEmi: string;
  tpAmb: string;
  tpEmit: string;
  ufIni: string;
  ufFim: string;
  munCarrega: string;
  munDescarrega: string;
  percurso: string[];
  emitCnpj: string;
  emitNome: string;
  emitIE: string;
  emitLgr: string;
  emitNro: string;
  emitBairro: string;
  emitMun: string;
  emitUF: string;
  rntrc: string;
  placa: string;
  renavam: string;
  tpRod: string;
  tpCar: string;
  ciot: string;
  ufVeic: string;
  condutorNome: string;
  condutorCpf: string;
  reboques: Array<{ placa: string; renavam: string; uf: string }>;
  contratanteNome: string;
  contratanteDoc: string;
  chavesCte: string[];
  xSeg: string;
  cnpjSeg: string;
  nApol: string;
  nAver: string;
  tpCarga: string;
  xProd: string;
  qCte: string;
  vCarga: string;
  qCarga: string;
  protocolo?: string;
  qrUrl?: string;
}

function D(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}
function fmtCnpj(v: string): string {
  const c = D(v).replace(/\D/g, "");
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return D(v);
}
function fmtChave(chave: string): string {
  return D(chave).replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim();
}
function fmtDH(v: string): string {
  const m = D(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : D(v);
}
function fmtNum(v: string): string {
  const n = Number(String(v || "").replace(",", "."));
  return isNaN(n) ? D(v) : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function barcodePng(chave: string): string | null {
  try {
    const digits = D(chave).replace(/\D/g, "");
    if (digits.length !== 44 || typeof document === "undefined") return null;
    const JB: any = (JsBarcode as any)?.default || JsBarcode;
    const c = document.createElement("canvas");
    JB(c, digits, { format: "CODE128C", displayValue: false, margin: 0, height: 44, width: 2, background: "#ffffff", lineColor: "#000000" });
    return c.toDataURL("image/png");
  } catch { return null; }
}
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

// Extrai os dados do XML assinado do MDF-e para o DAMDFE / visualização.
export function damdfeDataDoXml(xml: string, extra?: { protocolo?: string; numero?: string | null; serie?: string | null }): DamdfeData {
  const q = (sel: string, root?: Element | Document): string => {
    try {
      const el = (root || doc)?.querySelector(sel);
      return el?.textContent || "";
    } catch { return ""; }
  };
  let doc: Document | null = null;
  try { doc = new DOMParser().parseFromString(xml, "text/xml"); } catch {}
  const inf = doc?.querySelector("infMDFe");
  const rodo = doc?.querySelector("rodo");
  const seg = doc?.querySelector("seg");
  const prod = doc?.querySelector("prodPred");
  const tot = doc?.querySelector("tot");
  const contrat = doc?.querySelector("infContratante");
  const chavesCte = Array.from(doc?.querySelectorAll("infCTe > chCTe") || []).map(e => e.textContent || "").filter(Boolean);
  const percurso = Array.from(doc?.querySelectorAll("infPercurso > UFPer") || []).map(e => e.textContent || "").filter(Boolean);
  const reboques = Array.from(doc?.querySelectorAll("veicReboque") || []).map(r => ({
    placa: r.querySelector("placa")?.textContent || "",
    renavam: r.querySelector("RENAVAM")?.textContent || "",
    uf: r.querySelector("UF")?.textContent || "",
  }));
  const chave = (inf?.getAttribute("Id") || "").replace(/^MDFe/, "");
  const tpCargaMap: Record<string, string> = { "01": "Granel sólido", "02": "Granel líquido", "03": "Frigorificada", "04": "Conteinerizada", "05": "Carga Geral", "06": "Neogranel", "07": "Perigosa (granel sólido)", "08": "Perigosa (granel líquido)", "09": "Perigosa (frigorificada)", "10": "Perigosa (conteinerizada)", "11": "Perigosa (carga geral)" };
  const tpCargaCod = prod?.querySelector("tpCarga")?.textContent || "05";
  return {
    chave,
    numero: extra?.numero || q("nMDF", inf || undefined),
    serie: extra?.serie || q("serie", inf || undefined),
    dhEmi: q("dhEmi", inf || undefined),
    tpAmb: q("tpAmb", inf || undefined),
    tpEmit: q("tpEmit", inf || undefined),
    ufIni: q("UFIni", inf || undefined),
    ufFim: q("UFFim", inf || undefined),
    munCarrega: doc?.querySelector("infMunCarrega > xMunCarrega")?.textContent || "",
    munDescarrega: doc?.querySelector("infMunDescarga > xMunDescarga")?.textContent || "",
    percurso,
    emitCnpj: q("emit > CNPJ", inf || undefined),
    emitNome: q("emit > xNome", inf || undefined),
    emitIE: q("emit > IE", inf || undefined),
    emitLgr: q("enderEmit > xLgr", inf || undefined),
    emitNro: q("enderEmit > nro", inf || undefined),
    emitBairro: q("enderEmit > xBairro", inf || undefined),
    emitMun: q("enderEmit > xMun", inf || undefined),
    emitUF: q("enderEmit > UF", inf || undefined),
    rntrc: q("RNTRC", rodo || undefined),
    ciot: q("CIOT", rodo || undefined),
    placa: q("veicTracao > placa", rodo || undefined),
    renavam: q("veicTracao > RENAVAM", rodo || undefined),
    tpRod: q("veicTracao > tpRod", rodo || undefined),
    tpCar: q("veicTracao > tpCar", rodo || undefined),
    ufVeic: q("veicTracao > UF", rodo || undefined),
    condutorNome: q("condutor > xNome", rodo || undefined),
    condutorCpf: q("condutor > CPF", rodo || undefined),
    reboques,
    contratanteNome: q("xNome", contrat || undefined),
    contratanteDoc: q("CNPJ", contrat || undefined) || q("CPF", contrat || undefined),
    chavesCte,
    xSeg: q("xSeg", seg || undefined),
    cnpjSeg: q("infSeg > CNPJ", seg || undefined),
    nApol: q("nApol", seg || undefined),
    nAver: q("nAver", seg || undefined),
    tpCarga: tpCargaMap[tpCargaCod] ? `${tpCargaCod} - ${tpCargaMap[tpCargaCod]}` : tpCargaCod,
    xProd: prod?.querySelector("xProd")?.textContent || "",
    qCte: q("qCTe", tot || undefined) || q("qMDFe", tot || undefined),
    vCarga: q("vCarga", tot || undefined),
    qCarga: q("qCarga", tot || undefined),
    protocolo: extra?.protocolo,
    qrUrl: `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${chave}&tpAmb=${q("tpAmb", inf || undefined) || "2"}`,
  };
}

export function gerarDamdfePdf(d: DamdfeData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, M = 6, CW = W - 2 * M;
  const LIM = 290;
  let y = M;
  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const box = (x: number, yy: number, w: number, h: number) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.rect(x, yy, w, h, "S"); };
  const lab = (t: string, x: number, yy: number) => { black(); setFont("bold", 5.5); doc.text(t, x, yy); };
  const val = (t: string, x: number, yy: number, s = 7) => { black(); setFont("normal", s); doc.text(D(t), x, yy); };
  const valB = (t: string, x: number, yy: number, s = 7) => { black(); setFont("bold", s); doc.text(D(t), x, yy); };
  const need = (h: number) => { if (y + h > LIM) { doc.addPage(); y = M; } };
  const cut = (t: string, n: number) => D(t).slice(0, n);
  const ctr = (t: string, xx: number, yy: number, s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    try { (doc as any).text(t, xx, yy, { align: "center" }); } catch { doc.text(t, xx, yy); }
  };
  const secTitle = (t: string) => { need(8); setFont("bold", 7); black(); doc.text(t, M + 1, y + 4); y += 6; };

  // ---- Cabeçalho: emitente | DAMDFE ----
  const colL = 118, colR = CW - colL - 2, rx = M + colL + 2;
  const emH = 26;
  box(M, y, colL, emH);
  valB(cut(D(d.emitNome) || "EMITENTE", 44), M + 2, y + 4, 8);
  val(`${D(d.emitLgr)}, ${D(d.emitNro)} - ${D(d.emitBairro)}`, M + 2, y + 8, 6);
  val(`${D(d.emitMun)} / ${D(d.emitUF)}`, M + 2, y + 11.5, 6);
  val(`CNPJ ${fmtCnpj(d.emitCnpj)}   IE ${D(d.emitIE)}`, M + 2, y + 15, 6);
  val(`RNTRC ${D(d.rntrc)}`, M + 2, y + 18.5, 6);
  val(`Carreg.: ${D(d.ufIni)}  →  Descarreg.: ${D(d.ufFim)}${d.percurso.length ? `  (via ${d.percurso.join("-")})` : ""}`, M + 2, y + 22, 6);
  box(rx, y, colR, emH);
  ctr("DAMDFE", rx + colR / 2, y + 5, 11, true);
  ctr("Documento Auxiliar do Manifesto Eletrônico", rx + colR / 2, y + 8.5, 5);
  ctr(`Modelo 58   Série ${D(d.serie)}   Nº ${D(d.numero)}`, rx + colR / 2, y + 13, 7, true);
  ctr(`Emissão ${fmtDH(d.dhEmi)}`, rx + colR / 2, y + 17, 6);
  if (d.tpAmb === "2") { doc.setTextColor(200, 0, 0); setFont("bold", 7); try { (doc as any).text("HOMOLOGAÇÃO — SEM VALOR FISCAL", rx + colR / 2, y + 22, { align: "center" }); } catch {} black(); }
  y += emH + 1;

  // ---- Chave + barras ----
  const chaveH = 20;
  box(M, y, CW, chaveH);
  lab("CHAVE DE ACESSO", M + 2, y + 3.5);
  setFont("normal", 7); black();
  doc.text(fmtChave(d.chave), M + 2, y + 7.5);
  const bc = barcodePng(d.chave);
  if (bc) { try { doc.addImage(bc, "PNG", M + 2, y + 9, 120, 9); } catch {} }
  // QR à direita
  const qrTxt = D(d.qrUrl);
  if (qrTxt) drawQr(doc, M + CW - 20, y + 2, 16, qrTxt);
  y += chaveH + 1;

  // ---- Protocolo ----
  if (d.protocolo) {
    box(M, y, CW, 7);
    lab("PROTOCOLO DE AUTORIZAÇÃO", M + 2, y + 4.5);
    valB(D(d.protocolo), M + 52, y + 4.5, 7);
    y += 8;
  }

  // ---- Veículo / condutor / contratante ----
  secTitle("MODAL RODOVIÁRIO");
  need(24);
  box(M, y, CW, 22);
  lab("PLACA TRAÇÃO", M + 2, y + 3.5); valB(D(d.placa), M + 2, y + 7.5, 8);
  lab("RENAVAM", M + 32, y + 3.5); val(D(d.renavam), M + 32, y + 7.5, 7);
  lab("UF", M + 62, y + 3.5); val(D(d.ufVeic), M + 62, y + 7.5, 7);
  lab("CONDUTOR", M + 72, y + 3.5); val(`${cut(D(d.condutorNome), 30)}  ${fmtCnpj(d.condutorCpf)}`, M + 72, y + 7.5, 7);
  lab("REBOQUE(S)", M + 2, y + 12); val(d.reboques.map(r => `${D(r.placa)}/${D(r.uf)}`).join("  ") || "—", M + 2, y + 16, 7);
  lab("CONTRATANTE", M + 72, y + 12); val(`${cut(D(d.contratanteNome), 30)}  ${fmtCnpj(d.contratanteDoc)}`, M + 72, y + 16, 7);
  y += 23;

  // ---- Documentos vinculados ----
  secTitle(`DOCUMENTOS VINCULADOS (${d.chavesCte.length} CT-e)`);
  for (const ch of d.chavesCte) {
    need(7);
    box(M, y, CW, 6);
    val(fmtChave(ch), M + 2, y + 4, 6.5);
    y += 6;
  }
  y += 1;

  // ---- Seguro ----
  secTitle("SEGURO DA CARGA");
  need(14);
  box(M, y, CW, 12);
  lab("SEGURADORA", M + 2, y + 3.5); val(`${cut(D(d.xSeg), 34)}  ${fmtCnpj(d.cnpjSeg)}`, M + 2, y + 7.5, 7);
  lab("APÓLICE", M + 2, y + 11); val(D(d.nApol), M + 22, y + 11, 7);
  lab("AVERBAÇÃO", M + 80, y + 11); val(D(d.nAver), M + 104, y + 11, 7);
  y += 13;

  // ---- Produto + totais ----
  secTitle("CARGA");
  need(14);
  box(M, y, CW, 12);
  lab("PRODUTO PREDOMINANTE", M + 2, y + 3.5); val(`${D(d.tpCarga)}  ${cut(D(d.xProd), 50)}`, M + 2, y + 7.5, 7);
  lab("QTD CT-e", M + 2, y + 11); val(D(d.qCte), M + 22, y + 11, 7);
  lab("VALOR", M + 50, y + 11); valB(fmtNum(d.vCarga), M + 64, y + 11, 7);
  lab("PESO (kg)", M + 110, y + 11); valB(fmtNum(d.qCarga), M + 130, y + 11, 7);
  y += 13;

  // ---- Consulta ----
  need(12);
  setFont("normal", 6); black();
  doc.text("Consulta e confirmação: dfe-portal.svrs.rs.gov.br/mdfe/qrCode", M + 1, y + 4);
  doc.text(`Chave: ${D(d.chave)}`, M + 1, y + 8);

  return doc.output("blob");
}
