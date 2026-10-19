-- 19/10/2026 — O dono da plataforma (super admin) sai da lista de "Usuários e acessos"
-- das empresas dos clientes, sem perder o vínculo de membro.
--
-- Contexto: quem cria a empresa vira owner dela por trigger (public.handle_new_empresa).
-- Como o super admin cria os CNPJs dos clientes pelo painel "Gerenciar empresas", ele
-- acabava aparecendo como "Dono" na lista de usuários do admin do cliente. Ele continua
-- membro (owner) — precisa criar o admin de cada CNPJ — mas a linha dele fica invisível
-- para quem logar com o e-mail do cliente e não pode ser editada/excluída por eles.
--
-- 1) SELECT: a linha de um super admin da plataforma só é visível para super admins.
-- 2) INSERT/UPDATE/DELETE: owner/admin do CNPJ continuam gerenciando os membros da
--    empresa, mas nunca mexem (nem criam) linhas de super admin da plataforma.

drop policy if exists empresa_users_select_members on public.empresa_users;
drop policy if exists empresa_users_manage_admins on public.empresa_users;

create policy empresa_users_select_members
  on public.empresa_users
  for select to authenticated
  using (
    private.is_empresa_member(empresa_id, auth.uid())
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
  );

create policy empresa_users_insert_admins
  on public.empresa_users
  for insert to authenticated
  with check (
    private.has_empresa_role(empresa_id, auth.uid(), array['owner'::app_role, 'admin'::app_role])
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
  );

create policy empresa_users_update_admins
  on public.empresa_users
  for update to authenticated
  using (
    private.has_empresa_role(empresa_id, auth.uid(), array['owner'::app_role, 'admin'::app_role])
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
  )
  with check (
    private.has_empresa_role(empresa_id, auth.uid(), array['owner'::app_role, 'admin'::app_role])
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
  );

create policy empresa_users_delete_admins
  on public.empresa_users
  for delete to authenticated
  using (
    private.has_empresa_role(empresa_id, auth.uid(), array['owner'::app_role, 'admin'::app_role])
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
  );
