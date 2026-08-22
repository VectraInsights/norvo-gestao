/* eslint-disable @typescript-eslint/no-explicit-any -- colunas novas (modulos/nome/email) ainda não estão em types.ts */
import { createServerFn } from "@tanstack/react-start";

type CriarUsuarioInput = {
  token: string;
  empresa_id: string;
  nome: string;
  email: string;
  senha: string;
  modulos: string[];
};

type ResetSenhaInput = {
  token: string;
  empresa_id: string;
  empresa_user_id: string;
  novaSenha: string;
};

async function dbAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function msgAuth(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("already been registered") || m.includes("already exists"))
    return "Já existe uma conta com este e-mail.";
  if (m.includes("valid email")) return "E-mail inválido.";
  if (m.includes("password") && (m.includes("weak") || m.includes("at least")))
    return "Senha muito fraca ou curta (mínimo de 6 caracteres).";
  return mensagem;
}

/** Valida que o chamador é super admin da plataforma OU owner/admin da empresa. */
async function assertAdminEmpresa(token: string, empresaId: string) {
  const db = await dbAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new Error("Sessão inválida. Faça login novamente.");
  const uid = data.user.id;

  const sup = await db
    .from("super_admins" as never)
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  if ((sup.data as any)?.user_id) return uid;

  const eu = await db
    .from("empresa_users")
    .select("role")
    .eq("empresa_id", empresaId)
    .eq("user_id", uid)
    .maybeSingle();
  const role = (eu.data as any)?.role as string | undefined;
  if (role !== "owner" && role !== "admin")
    throw new Error("Apenas administradores da empresa podem gerenciar usuários.");
  return uid;
}

export const souSuperAdminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { token: string })
  .handler(async ({ data }) => {
    const db = await dbAdmin();
    const { data: ud, error } = await db.auth.getUser(data.token);
    if (error || !ud?.user) return false;
    const r = await db
      .from("super_admins" as never)
      .select("user_id")
      .eq("user_id", ud.user.id)
      .maybeSingle();
    return !!(r.data as any)?.user_id;
  });

export const criarUsuarioEmpresaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as CriarUsuarioInput)
  .handler(async ({ data }) => {
    const db = await dbAdmin();
    await assertAdminEmpresa(data.token, data.empresa_id);

    const email = data.email.trim().toLowerCase();
    const criado = await db.auth.admin.createUser({
      email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (criado.error) throw new Error(msgAuth(criado.error.message));

    const uid = criado.data.user!.id;
    const ins = await (db.from("empresa_users") as any).insert({
      empresa_id: data.empresa_id,
      user_id: uid,
      role: "viewer",
      nome: data.nome,
      email,
      modulos: data.modulos,
    });
    if (ins.error) {
      // Rollback: não deixa usuário órfão no auth
      await db.auth.admin.deleteUser(uid);
      throw new Error(msgAuth(ins.error.message));
    }
    return { ok: true as const };
  });

export const resetarSenhaUsuarioFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as ResetSenhaInput)
  .handler(async ({ data }) => {
    const db = await dbAdmin();
    await assertAdminEmpresa(data.token, data.empresa_id);

    const row = await db
      .from("empresa_users")
      .select("user_id")
      .eq("id", data.empresa_user_id)
      .eq("empresa_id", data.empresa_id)
      .maybeSingle();
    const userId = (row.data as any)?.user_id as string | undefined;
    if (!userId) throw new Error("Usuário não encontrado nesta empresa.");

    const upd = await db.auth.admin.updateUserById(userId, { password: data.novaSenha });
    if (upd.error) throw new Error(msgAuth(upd.error.message));
    return { ok: true as const };
  });
