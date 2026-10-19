import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { consultarCnpj, patchContatoComCnpj } from "@/lib/cnpj";
import { toast } from "sonner";

type Contato = {
  id: string;
  nome?: string | null;
  documento?: string | null;
  [k: string]: unknown;
};

/** Tabela de cadastro de cada módulo (cada módulo tem a sua). */
export type TabelaCadastro = "clientes" | "fornecedores" | "transportes";

const CHAVE_CACHE: Record<TabelaCadastro, string> = {
  clientes: "contatos-clientes",
  fornecedores: "fornecedores",
  transportes: "contatos-fiscal",
};

/**
 * Correção em lote pela Receita Federal (nome = razão social oficial + completa
 * endereço/CEP/telefone vazios).
 *
 * Usado nas telas de cadastro de cada módulo (Fiscal > Contatos, Estoque >
 * Fornecedores, Vendas > Clientes). Cada módulo corrige **apenas a própria tabela** —
 * um módulo não mexe no cadastro do outro (os módulos são independentes).
 */
export function useCorrigirPelaReceita() {
  const qc = useQueryClient();
  const [corrigindo, setCorrigindo] = useState(false);

  const corrigir = async (alvos: Contato[], tabela: TabelaCadastro) => {
    const comCnpj = alvos
      .filter((c) => String(c.documento || "").replace(/\D/g, "").length === 14)
      .slice(0, 200);
    if (!comCnpj.length) {
      toast.info("Nenhum contato com CNPJ na lista");
      return;
    }
    setCorrigindo(true);
    try {
      let atualizados = 0;
      for (const c of comCnpj) {
        try {
          const dados = await consultarCnpj(c.documento as string);
          if (!dados) continue;
          const patch = patchContatoComCnpj(c, dados);
          if (!patch) continue;
          const { error } = await supabase
            .from(tabela as any)
            .update(patch as never)
            .eq("id", c.id);
          if (!error) atualizados++;
        } catch {
          /* API fora do ar: segue para o próximo */
        }
        // Respeita o limite de taxa das APIs públicas.
        await new Promise((r) => setTimeout(r, 200));
      }
      qc.invalidateQueries({ queryKey: [CHAVE_CACHE[tabela]] });
      qc.invalidateQueries({ queryKey: ["contatos-fiscal"] });
      qc.invalidateQueries({ queryKey: ["contatos-clientes"] });
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      if (atualizados > 0)
        toast.success(`${atualizados} cadastro(s) corrigido(s) com a Receita Federal`);
      else toast.info("Os cadastros da lista já estão de acordo com a Receita");
    } finally {
      setCorrigindo(false);
    }
  };

  return { corrigindo, corrigir };
}
