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
  const seg = pathname.trim().split(/[/?#]/)[1] ?? "";
  return MODULOS.some((m) => m.key === seg) ? seg : null;
}

/**
 * Rotas de cadastro acessíveis por MAIS de um módulo.
 *
 * Veículos e motoristas são cadastros de APOIO: o Fiscal precisa deles para emitir
 * CT-e/MDF-e (tração, reboques, motorista, placa), mas o cadastro é o mesmo do
 * Frota/RH — duplicar a tabela criaria duas frotas e duas listas de motorista.
 */
export const MODULOS_ALTERNATIVOS: Record<string, ModuloKey[]> = {
  "/frota/veiculos": ["frota", "fiscal"],
  "/rh/colaboradores": ["rh", "fiscal"],
};

/** Módulos que podem acessar a rota (vazio = rota sempre visível). */
export function modulosDaRota(pathname: string): ModuloKey[] {
  const alts = MODULOS_ALTERNATIVOS[pathname];
  if (alts) return alts;
  const m = moduloDaRota(pathname);
  return m ? [m] : [];
}

/** O usuário pode acessar a rota? Usa o mesmo `pode` das permissões por módulo. */
export function podeAcessarRota(
  pathname: string,
  pode: (modulo: string | null) => boolean,
): boolean {
  const mods = modulosDaRota(pathname);
  if (!mods.length) return true;
  return mods.some((m) => pode(m));
}
