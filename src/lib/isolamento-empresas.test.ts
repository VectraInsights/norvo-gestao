import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function lerProjeto(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("isolamento entre empresas", () => {
  it("mantém empresa_id como filtro nas listas multiempresa", () => {
    const consultas = [
      "src/routes/_authenticated/projetos.os.tsx",
      "src/routes/_authenticated/rh.colaboradores.tsx",
      "src/routes/_authenticated/rh.ferias.tsx",
      "src/routes/_authenticated/fiscal.emitidas.tsx",
    ];

    for (const caminho of consultas) {
      const fonte = lerProjeto(caminho);
      expect(fonte).toMatch(/\.eq\("empresa_id", empresa!?\.?id\)/);
    }
  });

  it("não expõe funções internas SECURITY DEFINER às sessões", () => {
    const migration = lerProjeto(
      "supabase/migrations/20260928130000_restringir_funcoes_security_definer.sql",
    );

    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.tg_adiantamento_delete_cleanup() FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.tg_cargo_delete_guard() FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.is_empresa_member(uuid, uuid) TO authenticated;",
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_empresa_member[^;]+ TO anon/,
    );
  });
});
