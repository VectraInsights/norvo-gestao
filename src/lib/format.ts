export const brl = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const num = (n: number | string | null | undefined, digits = 3) =>
  Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export const dateBR = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

export const cnpj = (v: string | null | undefined) => {
  if (!v) return "—";
  const s = v.replace(/\D/g, "").padStart(14, "0");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12, 14)}`;
};
