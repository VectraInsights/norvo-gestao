/**
 * Consulta de CNPJ na Receita Federal (via APIs públicas) e aplicação no cadastro.
 *
 * Usado em vários lugares do app (cadastro manual, tela de emissão, importação de XML).
 * Antes a chamada estava duplicada em ~8 arquivos; aqui fica em um só lugar, com o
 * mesmo comportamento: BrasilAPI -> ReceitaWS como fallback.
 *
 * IMPORTANTE: o nome do cadastro de transporte vem do XML como o emitente escreveu
 * (com erros de digitação comuns). A razão social oficial da Receita é a referência
 * correta — por isso a reconciliação pós-importação.
 */

export type DadosCnpj = {
  razaoSocial: string;
  nomeFantasia: string;
  logradouro: string;
  tipoLogradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  situacao: string;
};

const txt = (v: unknown) => String(v ?? "").trim();
const somenteDigitos = (v: unknown) => txt(v).replace(/\D/g, "");

/** Cache da sessão: o mesmo CNPJ não é consultado duas vezes. */
const cache = new Map<string, DadosCnpj | null>();

/**
 * Busca os dados cadastrais do CNPJ. Retorna null se não achar (ou se as APIs
 * falharem) — o chamador deve seguir com os dados que já tem.
 */
export async function consultarCnpj(cnpj: string, timeoutMs = 8000): Promise<DadosCnpj | null> {
  const digits = somenteDigitos(cnpj);
  if (digits.length !== 14) return null;
  if (cache.has(digits)) return cache.get(digits) ?? null;

  for (const url of [
    `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
    `https://receitaws.com.br/v1/cnpj/${digits}`,
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      const d = await res.json();
      if (!d || d.status === "ERROR") continue;
      const razaoSocial = txt(d.razao_social || d.nome);
      if (!razaoSocial) continue;
      const dados: DadosCnpj = {
        razaoSocial,
        nomeFantasia: txt(d.nome_fantasia || d.fantasia),
        logradouro: txt(d.logradouro || d.street),
        tipoLogradouro: txt(d.descricao_tipo_de_logradouro || d.tipo_logradouro),
        numero: txt(d.numero || d.number),
        complemento: txt(d.complemento),
        bairro: txt(d.bairro || d.district),
        cidade: txt(d.cidade || d.municipio || d.city),
        uf: txt(d.uf || d.state).toUpperCase(),
        cep: somenteDigitos(d.cep || d.zip),
        telefone: txt(d.ddd_telefone_1 || d.telefone || d.phone),
        email: txt(d.email),
        situacao: txt(d.descricao_situacao_cadastral || d.situacao_cadastral),
      };
      cache.set(digits, dados);
      return dados;
    } catch {
      /* API fora do ar/timeout: tenta a próxima */
    }
  }
  cache.set(digits, null);
  return null;
}

/**
 * Monta o patch do contato a partir dos dados da Receita.
 *
 * - O NOME só é trocado pela razão social oficial quando o cadastro ainda está com o
 *   nome que veio do XML (`nomeDoXml`) ou vazio — se o usuário corrigiu o nome na mão,
 *   a correção dele é preservada.
 * - O resto (endereço, CEP, telefone, e-mail) só preenche campo VAZIO: o que veio do
 *   documento fiscal não é sobrescrito.
 *
 * Retorna null quando não há nada a alterar.
 */
export function patchContatoComCnpj(
  atual: Record<string, unknown> | null | undefined,
  dados: DadosCnpj,
  nomeDoXml?: string,
): Record<string, unknown> | null {
  const upd: Record<string, unknown> = {};
  const nomeAtual = txt(atual?.nome);
  const nomeOficial = dados.razaoSocial;
  if (nomeOficial && nomeOficial !== nomeAtual) {
    const nomeVeioDoXml = !nomeDoXml || nomeAtual === txt(nomeDoXml);
    if (!nomeAtual || nomeVeioDoXml) upd.nome = nomeOficial;
  }
  const preenche = (origem: keyof DadosCnpj, destino: string) => {
    const valor = txt(dados[origem]);
    if (valor && !txt(atual?.[destino])) upd[destino] = valor;
  };
  preenche("logradouro", "logradouro");
  preenche("numero", "numero");
  preenche("complemento", "complemento");
  preenche("bairro", "bairro");
  preenche("cidade", "cidade");
  preenche("uf", "uf");
  preenche("cep", "cep");
  preenche("telefone", "telefone");
  preenche("email", "email");
  return Object.keys(upd).length ? upd : null;
}
