// Cadastro de NCM do modulo Fiscal (CT-e / MDF-e).
//
// O MDF-e 3.00 exige o grupo <prodPred> (rejeicao 725 se faltar):
//   <prodPred>
//     <tpCarga>05</tpCarga>        01-11, OBRIGATORIO (classificacao ANTT de carga)
//     <xProd>CARGA GERAL</xProd>   1-120, OBRIGATORIO
//     <NCM>84099969</NCM>          2 ou 8 digitos, OPCIONAL
//   </prodPred>
//
// O CT-e 4.00 (Normal e Simplificado) usa <infCarga><proPred>, que e TEXTO LIVRE
// (1-120) — nao tem NCM. Logo, o NCM so entra no MDF-e (uma vez por manifesto) e o
// nome do produto vai no proPred do CT-e.
//
// A tabela `ncm_fiscal` guarda esse cadastro por empresa (ver migration
// 20261021120000_ncm_fiscal.sql), separada do cadastro de produtos do Estoque.

import { TIPOS_CARGA_ANTT } from "@/lib/piso-antt";
import { supabase } from "@/integrations/supabase/client";

export type NcmFiscal = {
  id: string;
  empresa_id: string;
  ncm: string | null;
  x_prod: string;
  tp_carga: string | null;
  origem: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** tpCarga do MDF-e (01-11) -> nome. Mesma ordem/siglas do `damdfe-pdf.ts`. */
export const TP_CARGA_MDF: Record<string, string> = {
  "01": "Granel sólido",
  "02": "Granel líquido",
  "03": "Frigorificada",
  "04": "Conteinerizada",
  "05": "Carga Geral",
  "06": "Neogranel",
  "07": "Perigosa (granel sólido)",
  "08": "Perigosa (granel líquido)",
  "09": "Perigosa (frigorificada)",
  "10": "Perigosa (conteinerizada)",
  "11": "Perigosa (carga geral)",
};

/**
 * Tipo de carga ANTT (piso) -> tpCarga do MDF-e.
 * A Portaria SUROC 22/2026 lista 12 tipos; o MDF-e tem 11 (01-11) — "Carga Granel
 * Pressurizada" e exclusivo do modal aquaviario e nao tem codigo no prodPred.
 */
const ANTT_PARA_TP_CARGA: Record<string, string> = {
  "Granel sólido": "01",
  "Granel líquido": "02",
  "Frigorificada ou Aquecida": "03",
  Conteinerizada: "04",
  "Carga Geral": "05",
  Neogranel: "06",
  "Perigosa (granel sólido)": "07",
  "Perigosa (granel líquido)": "08",
  "Perigosa (frigorificada ou aquecida)": "09",
  "Perigosa (conteinerizada)": "10",
  "Perigosa (carga geral)": "11",
};

/** Opcoes do select de tipo de carga (rotulo ANTT + codigo do MDF-e). */
export const OPCOES_TP_CARGA = TIPOS_CARGA_ANTT.map((nome) => ({
  nome,
  codigo: ANTT_PARA_TP_CARGA[nome] ?? null,
}));

/** Tipo de carga ANTT (do percurso) -> codigo tpCarga do MDF-e (null se nao houver). */
export function tpCargaDoTipoAntt(tipo: string): string | null {
  return ANTT_PARA_TP_CARGA[String(tipo || "").trim()] ?? null;
}

/** Codigo tpCarga -> nome ANTT equivalente (para exibir no cadastro do MDF-e). */
export function tipoAnttDoTpCarga(codigo: string | null | undefined): string | null {
  const c = String(codigo || "").trim();
  if (!c) return null;
  const nome = TP_CARGA_MDF[c];
  if (!nome) return null;
  const achado = Object.entries(ANTT_PARA_TP_CARGA).find(([, v]) => v === c);
  return achado ? achado[0] : nome;
}

/** Rotulo pronto para exibir: "05 - Carga Geral". */
export function rotuloTpCarga(codigo: string | null | undefined): string {
  const c = String(codigo || "").trim();
  if (!c) return "—";
  return `${c} - ${TP_CARGA_MDF[c] ?? "Carga Geral"}`;
}

/** NCM valido: 8 digitos (o MDF-e aceita 2 ou 8, mas so 8 identifica o produto). */
export function ncmValido(codigo: unknown): boolean {
  const d = String(codigo ?? "").replace(/\D/g, "");
  return d.length === 8;
}

/** Normaliza o NCM: so digitos, ate 8. */
export function normalizaNcm(codigo: unknown): string {
  return String(codigo ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Chave de comparacao do cadastro (ncm + nome em minusculas, sem acento). */
export function chaveNcmFiscal(ncm: unknown, xProd: unknown): string {
  const n = normalizaNcm(ncm);
  const p = String(xProd ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return `${n}|${p}`;
}

/**
 * Registra no cadastro fiscal (`ncm_fiscal`) os produtos que vieram com NCM no XML.
 * Idempotente: nao duplica o mesmo par NCM + produto. Silencioso se a tabela ainda
 * nao existir (migration 20261021120000 nao aplicada).
 * Devolve quantas linhas novas entraram.
 */
export async function registrarNcmFiscal(
  empresaId: string,
  itens: { nome: string; ncm: string }[],
): Promise<number> {
  const validos: { ncm: string; x_prod: string }[] = [];
  const vistas = new Set<string>();
  for (const i of itens || []) {
    const ncm = normalizaNcm(i?.ncm);
    const x_prod = String(i?.nome ?? "").trim().slice(0, 120);
    if (!ncmValido(ncm) || !x_prod) continue;
    const k = chaveNcmFiscal(ncm, x_prod);
    if (vistas.has(k)) continue;
    vistas.add(k);
    validos.push({ ncm, x_prod });
  }
  if (!validos.length) return 0;
  try {
    const { data: atuais, error } = await supabase
      .from("ncm_fiscal" as never)
      .select("id, ncm, x_prod")
      .eq("empresa_id", empresaId);
    if (error) return 0;
    const existentes = new Set(
      ((atuais ?? []) as unknown as { ncm: string | null; x_prod: string | null }[]).map((r) =>
        chaveNcmFiscal(r.ncm, r.x_prod),
      ),
    );
    const novos = validos.filter((v) => !existentes.has(chaveNcmFiscal(v.ncm, v.x_prod)));
    if (!novos.length) return 0;
    const { error: errIns } = await supabase
      .from("ncm_fiscal" as never)
      .insert(
        novos.map((v) => ({
          empresa_id: empresaId,
          ncm: v.ncm,
          x_prod: v.x_prod,
          tp_carga: null,
          origem: "nf",
        })) as never,
      );
    if (errIns) return 0;
    return novos.length;
  } catch {
    return 0;
  }
}

/** Lista o cadastro fiscal de NCM da empresa (vazio se a tabela nao existir). */
export async function listarNcmFiscal(empresaId: string): Promise<NcmFiscal[]> {
  try {
    const { data, error } = await supabase
      .from("ncm_fiscal" as never)
      .select("id, empresa_id, ncm, x_prod, tp_carga, origem, created_at, updated_at")
      .eq("empresa_id", empresaId)
      .order("x_prod");
    if (error) return [];
    return ((data ?? []) as unknown as NcmFiscal[]) ?? [];
  } catch {
    return [];
  }
}
