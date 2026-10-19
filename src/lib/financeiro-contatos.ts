import { supabase } from "@/integrations/supabase/client";

/**
 * Nome do contato de um lançamento financeiro.
 *
 * O contador do financeiro é um cliente (a receber), um fornecedor (a pagar) ou uma
 * transportadora (frete) — e cada módulo tem sua própria tabela
 * (`clientes` / `fornecedores` / `transportes`). Por isso o
 * `lancamentos_financeiros.contato_id` não tem FK (apontaria para uma tabela só) e o
 * nome é resolvido aqui.
 */
export async function nomesContatosFinanceiros(
  ids: string[],
): Promise<Record<string, string>> {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  const saida: Record<string, string> = {};
  if (!unicos.length) return saida;
  const [cli, forn, trans] = await Promise.all([
    supabase.from("clientes").select("id,nome").in("id", unicos),
    supabase.from("fornecedores").select("id,nome").in("id", unicos),
    supabase.from("transportes").select("id,nome").in("id", unicos),
  ]);
  for (const r of (trans.data || []) as any[]) saida[r.id] = r.nome;
  for (const r of (forn.data || []) as any[]) saida[r.id] = r.nome;
  for (const r of (cli.data || []) as any[]) saida[r.id] = r.nome;
  return saida;
}

/** Lista os contatos que podem ser o contador de um lançamento (cliente, fornecedor ou transportadora). */
export async function listarContatosFinanceiros(
  empresaId: string,
  limite = 500,
): Promise<{ id: string; nome: string | null; documento: string | null }[]> {
  const [cli, forn, trans] = await Promise.all([
    supabase
      .from("clientes")
      .select("id,nome,documento")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("nome")
      .limit(limite),
    supabase
      .from("fornecedores")
      .select("id,nome,documento")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("nome")
      .limit(limite),
    supabase
      .from("transportes")
      .select("id,nome,documento")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("nome")
      .limit(limite),
  ]);
  if (cli.error) throw cli.error;
  if (forn.error) throw forn.error;
  if (trans.error) throw trans.error;
  const vistos = new Set<string>();
  const saida: { id: string; nome: string | null; documento: string | null }[] = [];
  for (const c of [...(cli.data ?? []), ...(forn.data ?? []), ...(trans.data ?? [])] as any[]) {
    const chave = String(c.documento || c.id);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ id: c.id, nome: c.nome, documento: c.documento });
  }
  return saida.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}
