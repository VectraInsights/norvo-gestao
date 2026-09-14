// Completar tipo de logradouro (Av./Rua/Alameda/...) quando o dado vem sem prefixo.
// Ex.: "NAZARE" + CEP 66035445 -> "Avenida Nazare" (via BrasilAPI, com conferencia do nome).
// Usado na exibicao (DACTE); nao altera o dado gravado.

const TIPOS = new Set([
  "RUA", "R", "AVENIDA", "AV", "AVEN", "ALAMEDA", "AL", "ALAM",
  "TRAVESSA", "TRAV", "TV", "TRAVESSAO", "RODOVIA", "ROD", "BR",
  "ESTRADA", "EST", "ESTR", "PRACA", "PCA", "PC", "LARGO", "LG",
  "VILA", "VL", "CONJUNTO", "CJ", "CONJ", "RESIDENCIAL", "RES",
  "SITIO", "CHACARA", "FAZENDA", "FAZ", "POVOADO", "POV", "DISTRITO", "DIST",
  "MARGINAL", "MARG", "VIA", "V", "PARQUE", "PQ", "JARDIM", "JD",
  "NUCLEO", "QUADRA", "QD", "LOTEAMENTO", "LOT", "PASSAGEM", "PSG",
  "BECO", "BEC", "CALCADA", "CAMINHO", "CAM", "ELEVADO", "ELEV",
  "PASSARELA", "PONTILHAO", "PONTE", "RETORNO", "RET", "ROTATORIA", "ROT",
  "SERVIDAO", "SERV", "SUBIDA", "SUB", "DESCIDA", "DESC", "VALE", "VEREDA", "VER",
  "VIELA", "BOULEVARD", "BLVD", "ESPLANADA", "ESPL", "PATIO", "ADRO",
  "CAMPO", "COSTA", "ILHA", "MORRO", "PRAIA", "LADEIRA", "LAD",
  "KM", "AREA", "GLEBA", "TRECHO", "ACESSO",
]);

function norm(s: string): string {
  const a = (s || "").toUpperCase().replace(/\./g, " ").normalize("NFD");
  const b = a.replace(/[^A-Za-z0-9 ]/g, " ");
  return b.replace(/ +/g, " ").trim();
}

export function temTipoLogradouro(s: string): boolean {
  const t = norm(s);
  if (!t) return false;
  return TIPOS.has(t.split(" ")[0]);
}

const cepCache = new Map<string, string>();

export async function completarLogradouro(logr: string, cep: string): Promise<string> {
  const orig = (logr || "").trim();
  if (!orig || temTipoLogradouro(orig)) return orig;
  const digits = (cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return orig;
  if (cepCache.has(digits)) {
    const hit = cepCache.get(digits) || "";
    return hit || orig;
  }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return orig;
    const j = await r.json();
    const street = String(j.street || "").trim();
    // so usa se o nome confere com o dado (evita trocar por rua errada do CEP)
    if (street && temTipoLogradouro(street)) {
      const nOrig = norm(orig), nSt = norm(street);
      if (nSt === nOrig || nSt.endsWith(" " + nOrig) || nSt.includes(nOrig)) {
        cepCache.set(digits, street);
        return street.toUpperCase();
      }
    }
    cepCache.set(digits, "");
    return orig;
  } catch {
    return orig;
  }
}
