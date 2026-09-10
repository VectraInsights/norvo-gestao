// Inscrição Estadual: normalização (só números) + quantidade de dígitos por UF (SINTEGRA).
// SP produtor rural (inicia com P) e formatos com letras são preservados como estão.

export const IE_DIGITOS_POR_UF: Record<string, number[]> = {
  AC: [13],
  AL: [9],
  AM: [9],
  AP: [9],
  BA: [8, 9],
  CE: [9],
  DF: [13],
  ES: [9],
  GO: [9],
  MA: [9],
  MG: [13],
  MS: [9],
  MT: [11],
  PA: [9],
  PB: [9],
  PE: [9],
  PI: [9],
  PR: [10],
  RJ: [8],
  RN: [10],
  RO: [14],
  RR: [9],
  RS: [10],
  SC: [9],
  SE: [9],
  SP: [12],
  TO: [9],
};

export function limparIE(v: unknown): string {
  const s = String(v ?? "").trim();
  if (s === "") return "";
  if (s.toUpperCase() === "ISENTO") return "ISENTO";
  if (/[a-zA-Z]/.test(s)) return s;
  return s.replace(/\D/g, "");
}

export function validarIE(
  uf: unknown,
  ie: unknown,
): { ok: boolean; digitos: number; esperados: number[]; isento: boolean } {
  const s = String(ie ?? "").trim();
  if (s.toUpperCase() === "ISENTO") return { ok: true, digitos: 0, esperados: [], isento: true };
  if (/[a-zA-Z]/.test(s)) return { ok: true, digitos: 0, esperados: [], isento: false };
  const d = s.replace(/\D/g, "");
  const list = IE_DIGITOS_POR_UF[String(uf || "").toUpperCase()] || [];
  if (d === "") return { ok: false, digitos: 0, esperados: list, isento: false };
  if (list.length === 0) return { ok: true, digitos: d.length, esperados: list, isento: false };
  return { ok: list.includes(d.length), digitos: d.length, esperados: list, isento: false };
}
