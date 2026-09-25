import { jsPDF } from "jspdf";
import JsBarcode from "./vendor/jsbarcode.bundle.cjs";
import qrcode from "./vendor/qrcode.bundle.cjs";
import { JUVENAL_LOGO } from "./juvenal-logo";

export const DAMDFE_REV = "20260925-p1";

// DAMDFE simplificado (retrato A4, P&B) a partir do XML assinado do MDF-e.
export interface DamdfeData {
  chave: string;
  numero: string;
  serie: string;
  dhEmi: string;
  dhIniViagem: string;
  tpAmb: string;
  tpEmit: string;
  ufIni: string;
  ufFim: string;
  munCarrega: string;
  munDescarrega: string;
  // Documentos vinculados (enriquecido pelo chamador com numero/NFes).
  docs: Array<{ numero: string; chave: string; nfes: string }>;
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
  // RNTRC/proprietário DO CADASTRO do veículo (nunca do emitente).
  tracRntrc: string;
  tracProp: string;
  tracPropDoc: string;
  tpRod: string;
  tpCar: string;
  ciot: string;
  ufVeic: string;
  condutorNome: string;
  condutorCpf: string;
  reboques: Array<{ placa: string; renavam: string; uf: string; rntrc?: string; prop?: string; propDoc?: string }>;
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
  logoDataUrl?: string;
  obs?: string;
  emitCep?: string;
  emitFone?: string;
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
export function damdfeDataDoXml(xml: string, extra?: { protocolo?: string; numero?: string | null; serie?: string | null; emitCep?: string; emitFone?: string }): DamdfeData {
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
    dhIniViagem: q("dhIniViagem", inf || undefined),
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
    tracRntrc: "",
    tracProp: "",
    tracPropDoc: "",
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
    docs: chavesCte.map(ch => ({ numero: "", chave: ch, nfes: "" })),
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
    emitCep: extra?.emitCep || "",
    emitFone: extra?.emitFone || "",
    qrUrl: `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${chave}&tpAmb=${q("tpAmb", inf || undefined) || "2"}`,
  };
}

export function gerarDamdfePdf(d: DamdfeData): Blob {
  // Layout oficial paisagem A4; logo da empresa no topo esquerdo.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, M = 5, CW = W - 2 * M;
  const LIM = 202;
  let y = M;
  const setFont = (w: "bold" | "normal", s: number) => { doc.setFont("helvetica", w); doc.setFontSize(s); };
  const black = () => doc.setTextColor(0, 0, 0);
  const box = (x: number, yy: number, w: number, h: number) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.rect(x, yy, w, h, "S"); };
  const vline = (x: number, yy: number, h: number) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.line(x, yy, x, yy + h); };
  const lab = (t: string, x: number, yy: number) => { black(); setFont("bold", 5.5); doc.text(t, x, yy); };
  const val = (t: string, x: number, yy: number, s = 7) => { black(); setFont("normal", s); doc.text(D(t), x, yy); };
  const valB = (t: string, x: number, yy: number, s = 7) => { black(); setFont("bold", s); doc.text(D(t), x, yy); };
  const need = (h: number) => { if (y + h > LIM) { doc.addPage(); y = M; } };
  const cut = (t: string, n: number) => D(t).slice(0, n);
  const ctr = (t: string, xx: number, yy: number, s: number, bold = false) => {
    black(); setFont(bold ? "bold" : "normal", s);
    try { (doc as any).text(t, xx, yy, { align: "center" }); } catch { doc.text(t, xx, yy); }
  };
  const titleBar = (t: string) => {
    need(7);
    box(M, y, CW, 5);
    black(); setFont("bold", 6.5);
    try { (doc as any).text(t, M + CW / 2, y + 3.5, { align: "center" }); } catch { doc.text(t, M + 1, y + 3.5); }
    y += 5;
  };
  const cell = (x: number, w: number, label: string, value: string, vs = 7, bold = false) => {
    lab(label, x + 1, y + 3);
    if (bold) valB(value, x + 1, y + 7, vs); else val(value, x + 1, y + 7, vs);
  };
  const fmtChaveDots = (ch: string) => D(ch).replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1.");
  const fmtData = (v: string) => { const m = D(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : D(v); };

  // ---- Cabeçalho 40/60: [logo + emitente] [DAMDFE + barras + QR + chave] ----
  const logo = (d as any).logoDataUrl || JUVENAL_LOGO;
  const hH = 34;
  const wLeft = 115, wRight = CW - wLeft - 1;
  const xEm = M, xDa = M + wLeft + 1;
  box(xEm, y, wLeft, hH);
  try { doc.addImage(logo, "PNG", xEm + 2, y + 6, 30, 20); } catch {}
  const tx = xEm + 34, tw = wLeft - 34;
  ctr(cut(D(d.emitNome) || "EMITENTE", 38), tx + tw / 2, y + 5, 9, true);
  ctr(`${fmtCnpj(d.emitCnpj)}   RNTRC: ${D(d.rntrc)}`, tx + tw / 2, y + 9.5, 7);
  ctr(`${D(d.emitLgr)}, ${D(d.emitNro)}`, tx + tw / 2, y + 14, 7);
  ctr(`${D(d.emitMun)} / ${D(d.emitUF)}`, tx + tw / 2, y + 18.5, 7);
  ctr(`CEP: ${D(d.emitCep)}   Tel.: ${D(d.emitFone)}`, tx + tw / 2, y + 23, 7);
  ctr(`Carreg.: ${D(d.ufIni)} → Descarreg.: ${D(d.ufFim)}`, tx + tw / 2, y + 27.5, 6);
  box(xDa, y, wRight, hH);
  black(); setFont("bold", 13); doc.text("DAMDFE", xDa + 2, y + 6.5);
  setFont("normal", 6); black(); doc.text("Documento Auxiliar de Manifesto Eletrônico de Cargas", xDa + 32, y + 6.5);
  const bc0 = barcodePng(d.chave);
  if (bc0) { try { doc.addImage(bc0, "PNG", xDa + 2, y + 9, wRight - 34, 8); } catch {} }
  if (D(d.qrUrl)) drawQr(doc, xDa + wRight - 26, y + 8, 20, D(d.qrUrl));
  lab("CHAVE DE ACESSO", xDa + 2, y + 22.5);
  val(fmtChaveDots(d.chave), xDa + 2, y + 27, 6.5);
  y += hH + 1;

  // ---- Linha 2: modelo/serie/numero/FL/emissão/previsão/UFs/protocolo ----
  const h2 = 11;
  box(M, y, CW, h2);
  const c2: Array<[number, string, string]> = [
    [22, "MODELO", "58"], [20, "SÉRIE", D(d.serie) || "000"], [26, "NÚMERO", D(d.numero)],
    [16, "FL", ""], [30, "EMISSÃO", fmtData(d.dhEmi)], [44, "PREVISÃO INÍCIO", fmtDH(d.dhIniViagem)],
    [30, "UF CARREG.", D(d.ufIni)], [32, "UF DESCARREG.", D(d.ufFim)],
  ];
  let cx = M;
  let flX = 0, flY = 0;
  for (const [w, label, value] of c2) {
    if (cx > M) vline(cx, y, h2);
    cell(cx, w, label, label === "FL" ? "" : value, 7, true);
    if (label === "FL") { flX = cx + 1; flY = y + 7; }
    cx += w;
  }
  vline(cx, y, h2);
  lab("PROTOCOLO DE AUTORIZAÇÃO DE USO", cx + 1, y + 3);
  valB(`${D(d.protocolo)}${d.tpAmb === "2" ? "   HOMOLOGAÇÃO — SEM VALOR FISCAL" : ""}`, cx + 1, y + 7.5, 7);
  y += h2 + 1;

  // ---- Modal rodoviário (linha cheia, sem QR) ----
  titleBar("MODAL RODOVIÁRIO DE CARGAS");
  need(16);
  box(M, y, CW, 15);
  const mrow: Array<[number, string, string, boolean?]> = [
    [30, "Quantidade CT-e", String(d.docs.length || d.chavesCte.length || "0"), true],
    [28, "Quantidade NF-e", "0", false],
    [28, "Quantidade NF", "0", false],
    [44, "Quantidade Medida", fmtNum4(d.qCarga), false],
    [26, "Unidade", "KG", false],
    [52, "Valor Total Carga", fmtNum(d.vCarga), true],
    [52, "Valor Total Serviço", fmtNum(d.vCarga), true],
    [27, "Valor Total Agregado", "0,00", false],
  ];
  let mx = M;
  for (const [w, label, value, bold] of mrow) {
    if (mx > M) vline(mx, y, 15);
    cell(mx, w, label, value, 7, !!bold);
    mx += w;
  }
  y += 16;

  // ---- Seguro RCV ----
  titleBar("INFORMAÇÕES SEGURO DE RESPONSABILIDADE CIVIL DE VEÍCULO - RCV");
  need(11);
  box(M, y, CW, 10);
  cell(M, 130, "Protocolo Averbação", cut(D(d.nAver), 40), 7);
  vline(M + 130, y, 10);
  cell(M + 130, 80, "CNPJ Responsável", fmtCnpj(d.emitCnpj), 7);
  vline(M + 210, y, 10);
  cell(M + 210, CW - 210, "Nº Apólice", cut(D(d.nApol), 24), 7);
  y += 11;

  // ---- Veículos / condutores / CIOT ----
  titleBar("VEÍCULOS");
  need(24);
  const hV = 10 + Math.max(1, d.reboques.length + 1) * 5;
  box(M, y, CW, hV);
  const vcols: Array<[number, string]> = [[34, "PLACA"], [34, "RENAVAM"], [30, "RNTRC"], [48, "DOC PROPRIETÁRIO"], [0, "NOME PROPRIETÁRIO"]];
  let vx = M;
  const vxs: number[] = [];
  for (const [w0, t] of vcols) { const w = w0 || (M + CW - vx - 100); vxs.push(vx); lab(t, vx + 1, y + 3); vx += w; if (vx < M + CW - 100) vline(vx, y, hV); }
  const vcondX = M + CW - 100;
  vline(vcondX, y, hV);
  lab("CONDUTORES — CPF", vcondX + 1, y + 3);
  lab("NOME", vcondX + 42, y + 3);
  const ciotTxt = `RESPONSÁVEL CIOT: ${fmtCnpj(d.emitCnpj)}`;
  black(); setFont("bold", 6); doc.text(ciotTxt, M + CW - 1 - doc.getTextWidth(ciotTxt), y + 3);
  // Proprietário/RNTRC vêm do cadastro do veículo (tracRntrc/tracProp e
  // reboques[].rntrc/prop); sem cadastro, fica em branco (nunca emitente).
  // DOC: usa o CNPJ/CPF cadastrado no veículo (proprietario_doc); quando
  // ausente, cai no nome-bate-com-empresa; senão fica vazio.
  const normProp = (s: string) => D(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const docPropDe = (prop: string, docExplicito?: string) => {
    const dd = D(docExplicito).replace(/\D/g, "");
    if (dd.length === 11 || dd.length === 14) return fmtCnpj(dd);
    const p = normProp(prop), e = normProp(d.emitNome);
    if (!p || !e) return "";
    if (p === e) return fmtCnpj(d.emitCnpj);
    if (p.length >= 6 && e.length >= 6 && (p.includes(e) || e.includes(p))) return fmtCnpj(d.emitCnpj);
    return "";
  };
  const veicRows = [{ placa: d.placa, renavam: d.renavam, rntrc: D(d.tracRntrc), doc: D((d as any).tracPropDoc), nome: cut(D(d.tracProp), 30) }, ...d.reboques.map(r => ({ placa: r.placa, renavam: r.renavam, rntrc: D(r.rntrc), doc: D((r as any).propDoc), nome: cut(D(r.prop), 30) }))];
  veicRows.forEach((v, i) => {
    const ry = y + 6 + i * 5;
    val(D(v.placa), vxs[0] + 1, ry, 6.5); val(D(v.renavam), vxs[1] + 1, ry, 6.5); val(D(v.rntrc), vxs[2] + 1, ry, 6.5);
    val(docPropDe(v.nome, v.doc), vxs[3] + 1, ry, 6.5); val(D(v.nome), vxs[4] + 1, ry, 6.5);
  });
  val(fmtCnpj(d.condutorCpf), vcondX + 1, y + 8, 6.5); val(cut(D(d.condutorNome), 24), vcondX + 42, y + 8, 6.5);
  y += hV + 1;

  // ---- Documentos vinculados ----
  titleBar("INFORMAÇÕES DOS DOCUMENTOS FISCAIS VINCULADOS AO MANIFESTO");
  need(11);
  box(M, y, CW, 6);
  const dcols: Array<[number, string]> = [[16, "Tipo Doc."], [20, "Nº Doc."], [78, "Chave Documento"], [48, "Numero Averbação"], [44, "CNPJ Responsável"], [34, "Nº Apólice"], [24, "Nº CIOT"], [0, "Nº Notas Fiscais"]];
  let dx = M;
  for (const [w0, t] of dcols) { const w = w0 || (M + CW - dx); if (dx > M) vline(dx, y, 6); lab(t, dx + 1, y + 4); dx += w; }
  y += 6;
  for (const docu of d.docs) {
    need(6);
    box(M, y, CW, 6);
    let ddx = M;
    const cells = ["CT-e", cut(D(docu.numero), 10), D(docu.chave), cut(D(d.nAver), 26), fmtCnpj(d.emitCnpj), cut(D(d.nApol), 22), cut(D(d.ciot), 14), cut(D(docu.nfes), 14)];
    const widths = [16, 20, 78, 48, 44, 34, 24, CW - 264];
    cells.forEach((c, i) => { if (ddx > M) vline(ddx, y, 6); val(c, ddx + 1, y + 4, 5.5); ddx += widths[i]; });
    y += 6;
  }
  y += 1;

  // ---- Composição da carga ----
  titleBar("INFORMAÇÕES DA COMPOSIÇÃO DA CARGA");
  need(16);
  box(M, y, CW, 15);
  const cw3 = CW / 3;
  lab("VALE PEDÁGIO", M + 1, y + 3.5);
  vline(M + cw3, y, 15);
  lab("INFO DE UNIDADE DE TRANSPORTE", M + cw3 + 1, y + 3.5);
  vline(M + 2 * cw3, y, 15);
  lab("IDENTIFICAÇÃO DE UNID DE CARGA", M + 2 * cw3 + 1, y + 3.5);
  y += 16;

  // ---- Observação / adicionais ----
  need(22);
  box(M, y, CW, 21);
  const midObs = M + CW / 2;
  lab("OBSERVAÇÃO", M + 1, y + 3.5);
  vline(midObs, y, 21);
  lab("INFORMAÇÕES ADICIONAIS", midObs + 1, y + 3.5);
  try {
    const obsLines = (doc as any).splitTextToSize(D((d as any).obs || ""), CW / 2 - 4);
    setFont("normal", 6); black();
    (doc as any).text(obsLines.slice(0, 4), M + 1, y + 8);
  } catch {}
  val(`CNPJ ANTT - Autorizado: ${fmtCnpj(d.emitCnpj)}`, midObs + 1, y + 16, 7);
  y += 22;

  // ---- FL i/N ----
  try {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      if (i === 1 && flX) { black(); setFont("bold", 7); doc.text(`${i}/${n}`, flX, flY); }
    }
  } catch {}

  return doc.output("blob");
}

function fmtNum4(v: string): string {
  const n = Number(String(v || "").replace(",", "."));
  return isNaN(n) ? String(v || "") : n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
