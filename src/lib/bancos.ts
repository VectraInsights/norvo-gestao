import bradesco from "@/assets/bancos/bradesco.png.asset.json";
import itau from "@/assets/bancos/itau.png.asset.json";
import sicoob from "@/assets/bancos/sicoob.png.asset.json";
import c6 from "@/assets/bancos/c6.png.asset.json";
import bb from "@/assets/bancos/bb.png.asset.json";
import caixa from "@/assets/bancos/caixa.png.asset.json";
import nubank from "@/assets/bancos/nubank.png.asset.json";
import santander from "@/assets/bancos/santander.png.asset.json";
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

// Ordem importa (mais específico primeiro na busca por alias)
export const BANCOS: Banco[] = [
  { slug: "bradesco",    nome: "Bradesco",       codigos: ["237"], aliases: ["bradesco"],                              logo: bradesco.url },
  { slug: "itau",        nome: "Itaú",           codigos: ["341"], aliases: ["itau", "itaú", "itaú unibanco"],         logo: itau.url },
  { slug: "sicoob",      nome: "Sicoob",         codigos: ["756", "748"], aliases: ["sicoob"],                         logo: sicoob.url },
  { slug: "c6",          nome: "C6 Bank",        codigos: ["336"], aliases: ["c6", "c6 bank"],                         logo: c6.url },
  { slug: "bb",          nome: "Banco do Brasil",codigos: ["001"], aliases: ["banco do brasil", "bb", "bco brasil"],   logo: bb.url },
  { slug: "caixa",       nome: "Caixa",          codigos: ["104"], aliases: ["caixa", "caixa econômica", "cef"],       logo: caixa.url },
  { slug: "nubank",      nome: "Nubank",         codigos: ["260"], aliases: ["nubank", "nu pagamentos"],               logo: nubank.url },
  { slug: "santander",   nome: "Santander",      codigos: ["033"], aliases: ["santander"],                             logo: santander.url },
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

/** Normaliza para comparação: só dígitos, sem zeros à esquerda */
export function normalizaContaNumero(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
}
