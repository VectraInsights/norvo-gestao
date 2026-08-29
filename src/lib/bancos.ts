import c6 from "@/assets/bancos/c6.png.asset.json";
import pagbank from "@/assets/bancos/pagbank.png.asset.json";
import mercadopago from "@/assets/bancos/mercadopago.png.asset.json";

export type Banco = {
  slug: string;
  nome: string;
  /** Códigos COMPE (banco) que casam com este banco */
  codigos: string[];
  /** Aliases para reconhecer pelo nome digitado */
  aliases: string[];
  logo: string;
};

// Logos normalizados: 512x512, fundo branco, mesmo canvas (public/bancos/*.png)
// Ordem importa (mais específico primeiro na busca por alias)
export const BANCOS: Banco[] = [
  { slug: "bradesco",    nome: "Bradesco",       codigos: ["237"], aliases: ["bradesco"],                              logo: "/bancos/bradesco.png" },
  { slug: "itau",        nome: "Itaú",           codigos: ["341"], aliases: ["itau", "itaú", "itaú unibanco"],         logo: "/bancos/itau.png" },
  { slug: "sicoob",      nome: "Sicoob",         codigos: ["756", "748"], aliases: ["sicoob"],                         logo: "/bancos/sicoob.png" },
  { slug: "caixa",       nome: "Caixa",          codigos: ["104"], aliases: ["caixa", "caixa econômica", "cef"],       logo: "/bancos/caixa.png" },
  { slug: "santander",   nome: "Santander",      codigos: ["033"], aliases: ["santander"],                             logo: "/bancos/santander.png" },
  { slug: "nubank",      nome: "Nubank",         codigos: ["260"], aliases: ["nubank", "nu pagamentos"],               logo: "/bancos/nubank.png" },
  { slug: "inter",       nome: "Inter",          codigos: ["077"], aliases: ["inter", "banco inter"],                  logo: "/bancos/inter.png" },
  { slug: "bb",          nome: "Banco do Brasil",codigos: ["001"], aliases: ["banco do brasil", "bb", "bco brasil"],   logo: "/bancos/bb.png" },
  { slug: "daycoval",    nome: "Daycoval",       codigos: ["707"], aliases: ["daycoval"],                               logo: "/bancos/daycoval.png" },
  { slug: "c6",          nome: "C6 Bank",        codigos: ["336"], aliases: ["c6", "c6 bank"],                         logo: c6.url },
  { slug: "pagbank",     nome: "PagBank",        codigos: ["290"], aliases: ["pagbank", "pagseguro"],                  logo: pagbank.url },
  { slug: "mercadopago", nome: "Mercado Pago",   codigos: ["323"], aliases: ["mercado pago", "mercadopago"],           logo: mercadopago.url },
];

export function detectBancoByNome(nome: string | null | undefined): Banco | undefined {
  if (!nome) return undefined;
  const n = nome.toLowerCase().trim();
  return BANCOS.find((b) => b.aliases.some((a) => n.includes(a)));
}

export function detectBancoByCodigo(codigo: string | null | undefined): Banco | undefined {
  if (!codigo) return undefined;
  const c = codigo.replace(/\D/g, "").padStart(3, "0");
  return BANCOS.find((b) => b.codigos.includes(c));
}

/** Insere hífen antes do último dígito: "123456" -> "12345-6" */
export function formatContaComDigito(raw: string): string {
  const s = (raw ?? "").replace(/[^0-9xX]/g, "");
  if (s.length < 2) return s;
  return `${s.slice(0, -1)}-${s.slice(-1)}`;
}

/** Normaliza para comparação: só dígitos, sem zeros à esquerda e sem dígito verificador */
export function normalizaContaNumero(raw: string | null | undefined): string {
  // Se veio com hífen, descarta o que vem depois (dígito verificador)
  const semDv = (raw ?? "").split("-")[0];
  const digits = semDv.replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}

