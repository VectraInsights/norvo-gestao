// Herança de dados do CT-e original (usada no CT-e complementar): veículos
// (Tração/Reboque) e motorista.
//
// Lê o form salvo quando existe e completa com o XML (<veicTracao>/
// <veicReboque>/<moto>) — o xml_assinado nem sempre tem .form (XML
// importado de outro sistema) e, sem esse fallback, o complementar abria com
// "Selecione placa/motorista" vazios.
//
// Usa o DOMParser global (browser). Em Node (testes) injete um antes de
// chamar: globalThis.DOMParser = DOMParser (@xmldom/xmldom).

export interface DadosVeiculoMotoristaCte {
  /** Tração */
  placaVeiculo: string;
  /** Reboque (legado: não tem campo na UI) */
  placaReboque: string;
  /** Reboque 1 */
  semiReboque1: string;
  /** Reboque 2 */
  semiReboque2: string;
  motoristaNome: string;
  motorista2Nome: string;
  motoristaCpf: string;
  motorista2Cpf: string;
}

export function veicMotoristaDoCte(xmlAssinado: string | null): DadosVeiculoMotoristaCte {
  let raw = String(xmlAssinado || "");
  let form: Record<string, any> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.xml || parsed.form)) {
      raw = String(parsed.xml || "");
      form = parsed.form && typeof parsed.form === "object" ? parsed.form : {};
    }
  } catch {
    /* XML puro */
  }
  const up = (v: unknown) =>
    String(v || "")
      .trim()
      .toUpperCase();
  const out: DadosVeiculoMotoristaCte = {
    placaVeiculo: up(form.placaVeiculo),
    placaReboque: up(form.placaReboque),
    semiReboque1: up(form.semiReboque1),
    semiReboque2: up(form.semiReboque2),
    motoristaNome: String(form.motoristaNome || "").trim(),
    motorista2Nome: String(form.motorista2Nome || "").trim(),
    motoristaCpf: "",
    motorista2Cpf: "",
  };
  if (!raw.trim().startsWith("<")) return out;
  const xmlDoc = new DOMParser().parseFromString(raw, "application/xml");
  // getElementsByTagName (e não querySelectorAll) porque o DOMParser do Node
  // (@xmldom/xmldom, usado nos testes) não tem querySelectorAll. O localName
  // no XML preserva a caixa (<CPF> vs <cpf>) — compara sem caixa.
  const descendentes = (raiz: Document | Element, name: string): Element[] => {
    const alvo = name.toLowerCase();
    const lista = raiz.getElementsByTagName("*");
    const out: Element[] = [];
    for (let i = 0; i < lista.length; i++) {
      const n = (lista[i] as Element | undefined) || lista.item?.(i);
      if (n && String(n.localName || "").toLowerCase() === alvo) out.push(n);
    }
    return out;
  };
  const texto = (raiz: Element | null | undefined, name: string) =>
    raiz ? descendentes(raiz, name)[0]?.textContent?.trim() || "" : "";
  if (!out.placaVeiculo)
    out.placaVeiculo = up(texto(descendentes(xmlDoc, "veicTracao")[0], "placa"));
  // A emissão monta os reboques na ordem [placaReboque, semiReboque1,
  // semiReboque2]; sem form não dá para saber a origem de cada um e a UI só
  // expõe Reboque 1/2 (placaReboque é legado sem campo) — preenche os
  // visíveis primeiro.
  const rebs = descendentes(xmlDoc, "veicReboque")
    .map((r) => up(texto(r, "placa")))
    .filter(Boolean);
  if (!out.semiReboque1) out.semiReboque1 = rebs[0] || "";
  if (!out.semiReboque2) out.semiReboque2 = rebs[1] || "";
  if (!out.placaReboque && rebs[2]) out.placaReboque = rebs[2];
  const motos = descendentes(xmlDoc, "moto");
  if (!out.motoristaNome) out.motoristaNome = texto(motos[0], "xNome");
  if (!out.motorista2Nome) out.motorista2Nome = texto(motos[1], "xNome");
  out.motoristaCpf = texto(motos[0], "CPF").replace(/\D/g, "");
  out.motorista2Cpf = texto(motos[1], "CPF").replace(/\D/g, "");
  return out;
}

// Id do motorista carregado a partir do nome/CPF gravados no CT-e original:
// o <moto> do XML só sai se o id casar com o cadastro ativo, senão o
// complementar reemite sem o motorista (e sem o CPF na validação).
export function idMotoristaPorNomeCpf(
  lista: Array<{ id: string; nome: string; cpf: string | null }> | undefined,
  nome: string,
  cpf: string,
): string {
  const alvoCpf = String(cpf || "").replace(/\D/g, "");
  const hit =
    (alvoCpf
      ? (lista || []).find((m) => String(m.cpf || "").replace(/\D/g, "") === alvoCpf)
      : undefined) ||
    (nome
      ? (lista || []).find(
          (m) =>
            String(m.nome || "")
              .trim()
              .toLowerCase() === nome.trim().toLowerCase(),
        )
      : undefined);
  return hit?.id || "";
}
