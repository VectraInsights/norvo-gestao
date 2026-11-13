// Modalidade do CT-e (Normal / Complementar / Substituição / Subcontratação /
// Redespacho / Redespacho Intermediário) e as regras da SEFAZ que dependem
// dela.
//
// A modalidade vem do XML emitido (<tpCTe>/<tpServ>) e, nos rascunhos (sem
// XML), do form salvo (finalidadeEmissao/tipoServico/cteReferenciado).
//
// Regras do MOC CT-e 4.00 usadas aqui:
//  G164: o CT-e complementado deve ser do tipo Normal ou Substituição
//        (rejeição 491) — complementar um complementar é proibido;
//  G166: o CT-e complementado não pode ter sido substituído (657);
//  G167: no máximo 10 CT-es complementares por CT-e (520);
//  G083: o CT-e substituído não pode ter sido complementado (659);
//  G085: o CT-e a ser substituído deve ser Normal ou Substituição (571).

export const LIMITE_COMPLEMENTARES = 10;

export type ModalidadeCte = {
  /** <tpCTe> do XML: 0=Normal, 1=Complementar, 3=Substituição. */
  tpCTe: string;
  /** <tpServ> do XML: 0=Normal, 1=Subcontratação, 2=Redespacho, 3=Intermediário. */
  tpServ: string;
  /** Chave do CT-e referenciado (complementar/substituição). */
  chReferenciada: string;
  /** Rótulo exibido na lista. */
  rotulo: string;
};

export const ROTULO_NORMAL = "Normal";
export const ROTULO_COMPLEMENTAR = "Complementar";
export const ROTULO_SUBSTITUICAO = "Substituição";

const texto = (v: unknown) => String(v ?? "").trim();

/** Extrai <chCTe>/<chCte> do grupo complementar ou de substituição. */
export function chaveReferenciadaDoXml(xml: string): string {
  const x = String(xml || "");
  return (
    x.match(/<infCteComp>[\s\S]*?<chCTe>(\d{44})<\/chCTe>[\s\S]*?<\/infCteComp>/)?.[1] ||
    x.match(/<infCteSub>[\s\S]*?<chCte>(\d{44})<\/chCte>[\s\S]*?<\/infCteSub>/)?.[1] ||
    ""
  );
}

export function modalidadeCte(
  xml: string,
  form: Record<string, unknown> | null | undefined,
): ModalidadeCte {
  const x = String(xml || "");
  const f = (form || {}) as Record<string, unknown>;
  const tpCTe = x.match(/<tpCTe>(\d)<\/tpCTe>/)?.[1] || "";
  const tpServ = x.match(/<tpServ>(\d)<\/tpServ>/)?.[1] || "";
  const chReferenciada = chaveReferenciadaDoXml(x) || texto(f.cteReferenciado).replace(/\D/g, "");
  const fin = texto(f.finalidadeEmissao);
  const tipo = texto(f.tipoServico);

  let rotulo = ROTULO_NORMAL;
  if (tpCTe === "1" || fin === "Complemento") rotulo = ROTULO_COMPLEMENTAR;
  else if (tpCTe === "3" || fin === "Substituicao") rotulo = ROTULO_SUBSTITUICAO;
  else if (tpServ === "1" || tipo === "Subcontratacao") rotulo = "Subcontratação";
  else if (tpServ === "2" || tipo === "Redespacho") rotulo = "Redespacho";
  else if (tpServ === "3" || tipo === "Redespacho Intermediario")
    rotulo = "Redespacho Intermediário";

  return {
    tpCTe:
      tpCTe || (rotulo === ROTULO_COMPLEMENTAR ? "1" : rotulo === ROTULO_SUBSTITUICAO ? "3" : "0"),
    tpServ,
    chReferenciada,
    rotulo,
  };
}

export type ContextoModalidade = {
  /** Modalidade do CT-e alvo (a linha da lista). */
  rotulo: string;
  /** Quantos CT-es complementares o CT-e alvo já recebeu. */
  qtdComplementares: number;
  /** Quantos CT-es de substituição o CT-e alvo já tem. */
  qtdSubstituicoes: number;
};

/** Motivo do bloqueio do botão "Emitir CT-e complementar" ("" = pode). */
export function motivoBloqueioComplementar(ctx: ContextoModalidade): string {
  if (ctx.rotulo === ROTULO_COMPLEMENTAR)
    return "Não é permitido complementar um CT-e complementar";
  if (ctx.qtdSubstituicoes > 0) return "CT-e já substituído — não pode ser complementado";
  if (ctx.qtdComplementares >= LIMITE_COMPLEMENTARES)
    return "Limite de 10 CT-es complementares por CT-e";
  return "";
}

/** Motivo do bloqueio do botão "Emitir CT-e de substituição" ("" = pode). */
export function motivoBloqueioSubstituicao(ctx: ContextoModalidade): string {
  if (ctx.rotulo === ROTULO_COMPLEMENTAR) return "Não é permitido substituir um CT-e complementar";
  if (ctx.qtdComplementares > 0) return "CT-e já complementado — não pode ser substituído";
  return "";
}
