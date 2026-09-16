/* Cálculos trabalhistas avulsos (estimativa rápida) — mesmas tabelas da folha/férias.
 * INSS 2026 progressivo (teto R$ 988,09) · IRRF 2026 Lei 15.270/2025. */

export const INSS_FAIXAS = [
  { limite: 1621.0, aliquota: 0.075 },
  { limite: 2902.84, aliquota: 0.09 },
  { limite: 4354.27, aliquota: 0.12 },
  { limite: 8475.55, aliquota: 0.14 },
];

export const INSS_TETO = 988.09;

export function calcINSS(base: number): number {
  let inss = 0;
  let anterior = 0;
  for (const fx of INSS_FAIXAS) {
    const parcela = Math.min(base, fx.limite) - anterior;
    if (parcela <= 0) break;
    inss += parcela * fx.aliquota;
    anterior = fx.limite;
  }
  return Math.min(Math.round(inss * 100) / 100, INSS_TETO);
}

export const IRRF_FAIXAS = [
  { limite: 2428.8, aliquota: 0, deducao: 0 },
  { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
];

export const DEDUCAO_DEPENDENTE = 189.59;

export function calcIRRF(baseCalculo: number, salarioBruto: number, dependentes = 0): number {
  const base = Math.max(0, baseCalculo - Math.max(0, Math.floor(dependentes) || 0) * DEDUCAO_DEPENDENTE);
  let imposto = 0;
  for (const fx of IRRF_FAIXAS) {
    if (base <= fx.limite) {
      imposto = Math.max(0, base * fx.aliquota - fx.deducao);
      break;
    }
  }
  if (imposto <= 0) return 0;
  // Lei 15.270/2025 — redução do imposto
  if (salarioBruto <= 5000) return 0;
  if (salarioBruto <= 7350) {
    const reducao = 978.62 - 0.133145 * salarioBruto;
    return Math.round(Math.max(0, imposto - reducao) * 100) / 100;
  }
  return Math.round(imposto * 100) / 100;
}

export type ResultadoSalario = {
  bruto: number; proventos: number; inss: number; irrf: number;
  outrosDescontos: number; liquido: number;
};

export function calcSalarioLiquido(bruto: number, proventos = 0, outrosDescontos = 0, dependentes = 0): ResultadoSalario {
  const inss = calcINSS(bruto);
  const baseIrrf = Math.max(0, bruto - inss);
  const irrf = baseIrrf > 0 ? calcIRRF(baseIrrf, bruto, dependentes) : 0;
  const liquido = bruto + proventos - outrosDescontos - inss - irrf;
  return { bruto, proventos, inss, irrf, outrosDescontos, liquido };
}

export type ResultadoFerias = {
  diasGozo: number; abonoDias: number;
  proporcional: number; terco: number; brutoFerias: number;
  inssFerias: number; irrfFerias: number; liquidoFerias: number;
  valorAbono: number;
  decimoBruto: number; inssDecimo: number; irrfDecimo: number; liquidoDecimo: number;
  total: number;
};

export function calcFerias(salario: number, diasGozo: number, abonoDias = 0, adiantarDecimo = false, dependentes = 0): ResultadoFerias {
  const dias = Math.min(30, Math.max(1, Math.round(diasGozo) || 0));
  const abono = Math.min(10, Math.max(0, Math.round(abonoDias) || 0));
  const proporcional = (salario / 30) * dias;
  const terco = proporcional / 3;
  const brutoFerias = proporcional + terco;
  const inssFerias = calcINSS(brutoFerias);
  const irrfFerias = calcIRRF(Math.max(0, brutoFerias - inssFerias), brutoFerias, dependentes);
  const liquidoFerias = brutoFerias - inssFerias - irrfFerias;
  // Abono pecuniário — isento de INSS e IRRF
  const valorAbono = abono > 0 ? (salario / 30) * abono : 0;
  // 13º adiantado junto — INSS e IRRF incidem
  const decimoBruto = adiantarDecimo ? (salario / 30) * dias : 0;
  const inssDecimo = adiantarDecimo ? calcINSS(decimoBruto) : 0;
  const irrfDecimo = adiantarDecimo ? calcIRRF(Math.max(0, decimoBruto - inssDecimo), decimoBruto) : 0;
  const liquidoDecimo = decimoBruto - inssDecimo - irrfDecimo;
  return {
    diasGozo: dias, abonoDias: abono,
    proporcional, terco, brutoFerias, inssFerias, irrfFerias, liquidoFerias,
    valorAbono, decimoBruto, inssDecimo, irrfDecimo, liquidoDecimo,
    total: liquidoFerias + valorAbono + liquidoDecimo,
  };
}

export type ResultadoDecimo = {
  meses: number; bruto: number; inss: number; irrf: number; liquido: number;
};

export function calcDecimoTerceiro(salario: number, meses: number, dependentes = 0): ResultadoDecimo {
  const m = Math.min(12, Math.max(1, Math.round(meses) || 0));
  const bruto = (salario * m) / 12;
  const inss = calcINSS(bruto);
  const irrf = calcIRRF(Math.max(0, bruto - inss), bruto, dependentes);
  return { meses: m, bruto, inss, irrf, liquido: bruto - inss - irrf };
}

export type ResultadoHoraExtra = {
  valorHora: number; total50: number; total100: number; total: number;
};

export function calcHoraExtra(salario: number, qtd50 = 0, qtd100 = 0): ResultadoHoraExtra {
  const valorHora = salario / 220;
  const total50 = qtd50 * valorHora * 1.5;
  const total100 = qtd100 * valorHora * 2;
  return { valorHora, total50, total100, total: total50 + total100 };
}

export type TipoRescisao = "sem-justa" | "pedido" | "justa" | "termino" | "acordo";

export const TIPOS_RESCISAO: Array<{ value: TipoRescisao; label: string }> = [
  { value: "sem-justa", label: "Sem justa causa" },
  { value: "pedido", label: "Pedido de demissão" },
  { value: "justa", label: "Justa causa" },
  { value: "termino", label: "Término de contrato" },
  { value: "acordo", label: "Acordo (art. 484-A)" },
];

export type RescisaoInput = {
  salario: number; diasSaldo: number; admissao: string; rescisao: string;
  feriasVencidasDias: number; avisoDias: number; saldoFGTS: number; dependentes?: number;
};

export type VerbaRecisoria = { nome: string; valor: number; inss: boolean; irrf: boolean; fgts: boolean };

export type ResultadoRescisao = {
  verbas: VerbaRecisoria[]; bruto: number; baseINSS: number; inss: number;
  baseIRRF: number; irrf: number; liquido: number;
  fgtsMes: number; multaPct: number; multaFGTS: number; totalFGTS: number;
  mesesDecimo: number; mesesFerias: number; periodoVencido: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcRescisao(tipo: TipoRescisao, inp: RescisaoInput): ResultadoRescisao {
  const sal = Math.max(0, inp.salario || 0);
  const dias = Math.min(31, Math.max(0, inp.diasSaldo || 0));
  // 13º: meses do ano da rescisão (admissão em diante) com 15+ dias trabalhados
  const a = parseISO(inp.admissao);
  const f = parseISO(inp.rescisao);
  let mDec = 0;
  if (a && f && cmpData(f, a) >= 0) {
    const ini = a.y === f.y ? a : { y: f.y, m: 1, d: 1 };
    mDec = Math.min(12, contarMeses15d(ini, f));
  }
  // Férias: meses do período aquisitivo atual com 15+ dias; 12+ = período vencido
  let mFer = 0;
  let periodoVencido = false;
  if (a && f && cmpData(f, a) >= 0) {
    const total = contarMeses15d(a, f);
    periodoVencido = total >= 12;
    mFer = total % 12;
  }
  const venc = Math.min(60, Math.max(0, Math.round(inp.feriasVencidasDias) || 0));
  const av = Math.min(90, Math.max(0, Math.round(inp.avisoDias) || 0));
  const dep = Math.max(0, Math.floor(inp.dependentes || 0));
  const verbas: VerbaRecisoria[] = [];
  const soVencidas = tipo === "justa";
  verbas.push({ nome: `Saldo de salário (${dias}d)`, valor: r2((sal / 30) * dias), inss: true, irrf: true, fgts: true });
  if (!soVencidas && av > 0) {
    const vAviso = r2(((sal / 30) * av) * (tipo === "acordo" ? 0.5 : 1));
    verbas.push({
      nome: tipo === "pedido" ? `Aviso descontado (${av}d)` : `Aviso indenizado (${av}d)`,
      valor: tipo === "pedido" ? -vAviso : vAviso, inss: false, irrf: false, fgts: tipo !== "pedido",
    });
  }
  if (!soVencidas && mDec > 0) {
    verbas.push({ nome: `13º proporcional (${mDec}/12)`, valor: r2((sal / 12) * mDec), inss: true, irrf: true, fgts: true });
  }
  if (!soVencidas && mFer > 0) {
    const f = (sal / 12) * mFer;
    verbas.push({ nome: `Férias proporcionais (${mFer}/12) + ⅓`, valor: r2(f + f / 3), inss: false, irrf: false, fgts: true });
  }
  if (venc > 0) {
    const f = (sal / 30) * venc;
    verbas.push({ nome: `Férias vencidas (${venc}d) + ⅓`, valor: r2(f + f / 3), inss: false, irrf: false, fgts: true });
  }
  const bruto = r2(verbas.reduce((s, v) => s + v.valor, 0));
  const baseINSS = r2(verbas.reduce((s, v) => s + (v.inss ? v.valor : 0), 0));
  const inss = calcINSS(Math.max(0, baseINSS));
  const baseIRRF = r2(Math.max(0, baseINSS - inss));
  const irrf = baseIRRF > 0 ? calcIRRF(baseIRRF, Math.max(0, bruto), dep) : 0;
  const fgtsMes = r2(verbas.reduce((s, v) => s + (v.fgts && v.valor > 0 ? v.valor * 0.08 : 0), 0));
  const multaPct = tipo === "sem-justa" ? 0.4 : tipo === "acordo" ? 0.2 : 0;
  const baseMulta = r2(Math.max(0, inp.saldoFGTS || 0) + fgtsMes);
  const multaFGTS = r2(multaPct * baseMulta);
  return {
    verbas, bruto, baseINSS, inss, baseIRRF, irrf,
    liquido: r2(bruto - inss - irrf),
    fgtsMes, multaPct, multaFGTS, totalFGTS: r2(baseMulta + multaFGTS),
    mesesDecimo: mDec, mesesFerias: mFer, periodoVencido,
  };
}

type DataYMD = { y: number; m: number; d: number };

function parseISO(s: string): DataYMD | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").slice(0, 10));
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function cmpData(x: DataYMD, y2: DataYMD): number {
  return x.y - y2.y || x.m - y2.m || x.d - y2.d;
}

function diasNoMes(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Conta os meses com 15+ dias dentro do intervalo (fração >= 15 dias conta 1 mês). */
export function contarMeses15d(inicio: DataYMD, fim: DataYMD): number {
  let n = 0;
  let y = inicio.y;
  let m = inicio.m;
  while (y < fim.y || (y === fim.y && m <= fim.m)) {
    const dim = diasNoMes(y, m);
    const d0 = y === inicio.y && m === inicio.m ? Math.min(inicio.d, dim) : 1;
    const d1 = y === fim.y && m === fim.m ? Math.min(fim.d, dim) : dim;
    if (d1 - d0 + 1 >= 15) n++;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return n;
}
