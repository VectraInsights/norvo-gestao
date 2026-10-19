-- 19/10/2026 — Só o dono da plataforma pode existir como "Dono" (role = owner).
--
-- A tela de Usuários e acessos já oferece apenas "Membro" (viewer) e "Admin" (admin),
-- mas nada impedia um admin do CNPJ de criar/promover alguém como owner via chamada
-- direta à API (o que daria a essa pessoa o direito de excluir a própria empresa,
-- via policy empresas_delete_owner). Agora o papel 'owner' fica restrito ao super admin
-- da plataforma, que é o único "Dono" do sistema.

drop policy if exists empresa_users_insert_admins on public.empresa_users;
drop policy if exists empresa_users_update_admins on public.empresa_users;

create policy empresa_users_insert_admins
  on public.empresa_users
  for insert to authenticated
  with check (
    private.has_empresa_role(empresa_id, auth.uid(), array['owner'::app_role, 'admin'::app_role])
    and (private.is_super_admin(auth.uid()) or not private.is_super_admin(user_id))
    and (private.is_super_admin(auth.uid()) or role <> 'owner'::app_role)
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
    and (private.is_super_admin(auth.uid()) or role <> 'owner'::app_role)
  );
