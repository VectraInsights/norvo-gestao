export type ModuloKey =
  "financeiro" | "vendas" | "estoque" | "frota" | "projetos" | "rh" | "fiscal";

export const MODULOS: { key: ModuloKey; label: string }[] = [
  { key: "financeiro", label: "Financeiro" },
  { key: "vendas", label: "Vendas & CRM" },
  { key: "estoque", label: "Estoque" },
  { key: "frota", label: "Frota & Viagens" },
  { key: "projetos", label: "Projetos" },
  { key: "rh", label: "DP / RH" },
  { key: "fiscal", label: "Fiscal" },
];

/** Descobre o módulo de uma rota pelo primeiro segmento. Retorna null para rotas
 *  sempre visíveis (Dashboard, Configurações, etc.). */
export function moduloDaRota(pathname: string): ModuloKey | null {
  const seg = pathname.split("/")[1] ?? "";
  return (MODULOS.some((m) => m.key === seg) ? seg : null) as ModuloKey | null;
}
