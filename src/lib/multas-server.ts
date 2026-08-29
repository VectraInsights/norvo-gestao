/* eslint-disable @typescript-eslint/no-explicit-any -- multas e multas_config fora de types.ts */
import { createServerFn } from "@tanstack/react-start";

type SincronizarInput = { token: string; empresa_id: string };

async function dbAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAcessoEmpresa(token: string, empresaId: string) {
  const db = await dbAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new Error("Sessão inválida. Faça login novamente.");
  const uid = data.user.id;

  const sup = await db
    .from("super_admins" as never)
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  if ((sup.data as any)?.user_id) return;

  const eu = await db
    .from("empresa_users")
    .select("user_id")
    .eq("empresa_id", empresaId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!(eu.data as any)?.user_id)
    throw new Error("Você não tem acesso a esta empresa.");
}

export type SincronizarResultado = {
  ok: boolean;
  configurada: boolean;
  atualizadas?: number;
  message?: string;
};

/**
 * Sincroniza as multas de um CNPJ junto à integração SENATRAN.
 *
 * Contrato esperado do provedor configurado em `multas_config.endpoint`
 * (GET com Basic auth): retorna JSON na forma
 * `{ autuacoes: [{ placa, renavam?, orgao_autuador?, auto_infracao?, data_infracao?,
 * descricao?, valor?, data_vencimento?, pontos? }] }`.
 * As autuações são gravadas via RPC `registrar_multas_senatran` (upsert por
 * `auto_infracao`). Enquanto nenhum provedor for configurado, retorna
 * `configurada: false` — o cadastro manual cobre o dia a dia.
 */
export const sincronizarMultasSENATRANFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as SincronizarInput)
  .handler(async ({ data }): Promise<SincronizarResultado> => {
    const db = await dbAdmin();
    await assertAcessoEmpresa(data.token, data.empresa_id);

    const cfg = await db
      .from("multas_config" as never)
      .select("endpoint,usuario,senha,ativo,ultima_sync")
      .eq("empresa_id", data.empresa_id)
      .maybeSingle();
    const c = cfg.data as any;
    if (!c?.ativo || !c?.endpoint) {
      return {
        ok: false,
        configurada: false,
        message:
          "Integração SENATRAN ainda não configurada para esta empresa. Use o cadastro manual por enquanto.",
      };
    }

    const auth =
      "Basic " + Buffer.from(`${c.usuario ?? ""}:${c.senha ?? ""}`).toString("base64");
    const res = await fetch(c.endpoint, { headers: { Authorization: auth } });
    if (!res.ok)
      throw new Error(`SENATRAN respondeu HTTP ${res.status} ${res.statusText}`);

    const payload = (await res.json()) as {
      autuacoes?: Array<Record<string, unknown>>;
      erro?: string;
    };
    if (payload.erro) throw new Error(payload.erro);
    const autuacoes = payload.autuacoes ?? [];

    let atualizadas = 0;
    if (autuacoes.length > 0) {
      const r = await (db.rpc as any)("registrar_multas_senatran", {
        p_empresa: data.empresa_id,
        p_multas: autuacoes,
      });
      if (r.error) throw new Error(r.error.message);
      atualizadas = (r.data as unknown as number) ?? 0;
    }
    return { ok: true, configurada: true, atualizadas };
  });