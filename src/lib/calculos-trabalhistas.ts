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
