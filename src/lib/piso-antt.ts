// Piso mínimo de frete ANTT — Tabela A (composição veicular/caminhão simples).
// Fonte: Portaria SUROC nº 22/2026 (Res. 6.084/2026). Fórmula: PISO = d × CCD + CC.
// d = distância em km; CCD = coef. deslocamento (R$/km); CC = coef. carga/descarga (R$).
// Eixos = nº de eixos carregados do veículo combinado (2,3,4,5,6,7,9 — sem 8 na norma).

export const PISO_VIGENCIA = "Portaria SUROC nº 22/2026 (Tabela A)";

export const TIPOS_CARGA_ANTT = [
  "Granel sólido",
  "Granel líquido",
  "Frigorificada ou Aquecida",
  "Conteinerizada",
  "Carga Geral",
  "Neogranel",
  "Perigosa (granel sólido)",
  "Perigosa (granel líquido)",
  "Perigosa (frigorificada ou aquecida)",
  "Perigosa (conteinerizada)",
  "Perigosa (carga geral)",
  "Carga Granel Pressurizada",
] as const;

export type TipoCargaAntt = (typeof TIPOS_CARGA_ANTT)[number];

type Cel = { ccd: number; cc: number };
type Linha = Partial<Record<2 | 3 | 4 | 5 | 6 | 7 | 9, Cel>>;

const T: Record<TipoCargaAntt, Linha> = {
  "Granel sólido": {
    2: { ccd: 4.1056, cc: 460.59 },
    3: { ccd: 5.2555, cc: 552.24 },
    4: { ccd: 5.9476, cc: 597.0 },
    5: { ccd: 6.8548, cc: 664.83 },
    6: { ccd: 7.5641, cc: 680.01 },
    7: { ccd: 8.2316, cc: 820.34 },
    9: { ccd: 9.4318, cc: 908.91 },
  },
  "Granel líquido": {
    2: { ccd: 4.1796, cc: 471.98 },
    3: { ccd: 5.3511, cc: 569.57 },
    4: { ccd: 6.1019, cc: 621.52 },
    5: { ccd: 7.0226, cc: 693.08 },
    6: { ccd: 7.7372, cc: 709.72 },
    7: { ccd: 8.37, cc: 840.5 },
    9: { ccd: 9.5909, cc: 934.76 },
  },
  "Frigorificada ou Aquecida": {
    2: { ccd: 4.8234, cc: 520.07 },
    3: { ccd: 6.1659, cc: 623.27 },
    4: { ccd: 7.0345, cc: 686.63 },
    5: { ccd: 8.0623, cc: 757.98 },
    6: { ccd: 8.8911, cc: 772.35 },
    7: { ccd: 9.8134, cc: 982.76 },
    9: { ccd: 11.1479, cc: 1067.06 },
  },
  Conteinerizada: {
    3: { ccd: 5.2282, cc: 544.75 },
    4: { ccd: 5.8755, cc: 577.15 },
    5: { ccd: 6.791, cc: 647.29 },
    6: { ccd: 7.4986, cc: 662.01 },
    7: { ccd: 8.2292, cc: 819.69 },
    9: { ccd: 9.3486, cc: 886.05 },
  },
  "Carga Geral": {
    2: { ccd: 4.0738, cc: 451.84 },
    3: { ccd: 5.2177, cc: 541.86 },
    4: { ccd: 5.918, cc: 588.86 },
    5: { ccd: 6.8284, cc: 657.56 },
    6: { ccd: 7.5347, cc: 671.93 },
    7: { ccd: 8.2727, cc: 831.66 },
    9: { ccd: 9.4114, cc: 903.32 },
  },
  Neogranel: {
    2: { ccd: 3.6743, cc: 451.84 },
    3: { ccd: 5.2162, cc: 541.44 },
    4: { ccd: 5.9453, cc: 596.35 },
    5: { ccd: 6.8284, cc: 657.56 },
    6: { ccd: 7.5347, cc: 671.93 },
    7: { ccd: 8.2727, cc: 831.66 },
    9: { ccd: 9.4114, cc: 903.32 },
  },
  "Perigosa (granel sólido)": {
    2: { ccd: 4.8756, cc: 608.79 },
    3: { ccd: 6.0354, cc: 703.16 },
    4: { ccd: 6.7644, cc: 753.03 },
    5: { ccd: 7.6715, cc: 820.86 },
    6: { ccd: 8.3808, cc: 836.04 },
    7: { ccd: 9.0666, cc: 981.39 },
    9: { ccd: 10.2747, cc: 1072.15 },
  },
  "Perigosa (granel líquido)": {
    2: { ccd: 4.9621, cc: 632.58 },
    3: { ccd: 6.1436, cc: 732.9 },
    4: { ccd: 6.8986, cc: 789.96 },
    5: { ccd: 7.8193, cc: 861.51 },
    6: { ccd: 8.5339, cc: 878.16 },
    7: { ccd: 9.1849, cc: 1013.95 },
    9: { ccd: 10.4138, cc: 1110.41 },
  },
  "Perigosa (frigorificada ou aquecida)": {
    2: { ccd: 5.4315, cc: 630.88 },
    3: { ccd: 6.7869, cc: 737.63 },
    4: { ccd: 7.6718, cc: 807.63 },
    5: { ccd: 8.6996, cc: 878.98 },
    6: { ccd: 9.5284, cc: 893.35 },
    7: { ccd: 10.4745, cc: 1110.28 },
    9: { ccd: 11.8192, cc: 1197.43 },
  },
  "Perigosa (conteinerizada)": {
    3: { ccd: 5.6126, cc: 645.45 },
    4: { ccd: 6.2966, cc: 682.95 },
    5: { ccd: 7.2121, cc: 753.1 },
    6: { ccd: 7.9198, cc: 767.81 },
    7: { ccd: 8.6686, cc: 930.51 },
    9: { ccd: 9.796, cc: 999.06 },
  },
  "Perigosa (carga geral)": {
    2: { ccd: 4.4482, cc: 549.81 },
    3: { ccd: 5.6021, cc: 642.55 },
    4: { ccd: 6.3392, cc: 694.66 },
    5: { ccd: 7.2495, cc: 763.36 },
    6: { ccd: 7.9558, cc: 777.73 },
    7: { ccd: 8.7121, cc: 942.48 },
    9: { ccd: 9.8588, cc: 1016.33 },
  },
  "Carga Granel Pressurizada": {
    5: { ccd: 7.1929, cc: 757.81 },
    6: { ccd: 7.9452, cc: 784.82 },
    9: { ccd: 9.9531, cc: 1052.26 },
  },
};

// Piso em R$ ou null (sem célula p/ a combinação — ex.: 8 eixos não existe na norma).
export function pisoMinimoAntt(tipo: string, eixos: number, km: number): number | null {
  const linha = (T as Record<string, Linha>)[String(tipo || "").trim()];
  const cel = linha?.[eixos as keyof Linha];
  if (!cel || !(km > 0)) return null;
  return Math.round((km * cel.ccd + cel.cc) * 100) / 100;
}
