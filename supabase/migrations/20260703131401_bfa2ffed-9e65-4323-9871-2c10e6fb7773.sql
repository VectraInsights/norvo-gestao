CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_empresa_member(_empresa UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresa_users
    WHERE empresa_id = _empresa
      AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION private.has_empresa_role(_empresa UUID, _user UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresa_users
    WHERE empresa_id = _empresa
      AND user_id = _user
      AND role = ANY(_roles)
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_empresa_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_empresa_role(UUID, UUID, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_empresa_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_empresa_role(UUID, UUID, public.app_role[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "empresas_select_members" ON public.empresas;
CREATE POLICY "empresas_select_members" ON public.empresas FOR SELECT TO authenticated
  USING (private.is_empresa_member(id, auth.uid()));

DROP POLICY IF EXISTS "empresas_update_admins" ON public.empresas;
CREATE POLICY "empresas_update_admins" ON public.empresas FOR UPDATE TO authenticated
  USING (private.has_empresa_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "empresas_delete_owner" ON public.empresas;
CREATE POLICY "empresas_delete_owner" ON public.empresas FOR DELETE TO authenticated
  USING (private.has_empresa_role(id, auth.uid(), ARRAY['owner']::public.app_role[]));

DROP POLICY IF EXISTS "empresa_users_select_members" ON public.empresa_users;
CREATE POLICY "empresa_users_select_members" ON public.empresa_users FOR SELECT TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "empresa_users_manage_admins" ON public.empresa_users;
CREATE POLICY "empresa_users_manage_admins" ON public.empresa_users FOR ALL TO authenticated
  USING (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "cat_fin_all_members" ON public.categorias_financeiras;
CREATE POLICY "cat_fin_all_members" ON public.categorias_financeiras FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "condicoes_pagamento_select_members" ON public.condicoes_pagamento;
DROP POLICY IF EXISTS "membros veem condicoes" ON public.condicoes_pagamento;
CREATE POLICY "membros veem condicoes" ON public.condicoes_pagamento FOR SELECT TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "condicoes_pagamento_manage_admins" ON public.condicoes_pagamento;
DROP POLICY IF EXISTS "admins gerenciam condicoes" ON public.condicoes_pagamento;
CREATE POLICY "admins gerenciam condicoes" ON public.condicoes_pagamento FOR ALL TO authenticated
  USING (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','financeiro']::public.app_role[]))
  WITH CHECK (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','financeiro']::public.app_role[]));

DROP POLICY IF EXISTS "contas_bancarias_all_members" ON public.contas_bancarias;
CREATE POLICY "contas_bancarias_all_members" ON public.contas_bancarias FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "contatos_all_members" ON public.contatos;
CREATE POLICY "contatos_all_members" ON public.contatos FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "depositos_select_members" ON public.depositos;
DROP POLICY IF EXISTS "membros veem depositos" ON public.depositos;
CREATE POLICY "membros veem depositos" ON public.depositos FOR SELECT TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "depositos_manage_admins" ON public.depositos;
DROP POLICY IF EXISTS "admins gerenciam depositos" ON public.depositos;
CREATE POLICY "admins gerenciam depositos" ON public.depositos FOR ALL TO authenticated
  USING (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','estoque']::public.app_role[]))
  WITH CHECK (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','estoque']::public.app_role[]));

DROP POLICY IF EXISTS "lanc_fin_all_members" ON public.lancamentos_financeiros;
CREATE POLICY "lanc_fin_all_members" ON public.lancamentos_financeiros FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "mov_estoque_all_members" ON public.movimentacoes_estoque;
CREATE POLICY "mov_estoque_all_members" ON public.movimentacoes_estoque FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "nfe_config_select_members" ON public.nfe_config;
DROP POLICY IF EXISTS "membros veem nfe_config" ON public.nfe_config;
CREATE POLICY "membros veem nfe_config" ON public.nfe_config FOR SELECT TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "nfe_config_manage_admins" ON public.nfe_config;
DROP POLICY IF EXISTS "admins gerenciam nfe_config" ON public.nfe_config;
CREATE POLICY "admins gerenciam nfe_config" ON public.nfe_config FOR ALL TO authenticated
  USING (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[]))
  WITH CHECK (private.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[]));

DROP POLICY IF EXISTS "nf_all_members" ON public.notas_fiscais;
CREATE POLICY "nf_all_members" ON public.notas_fiscais FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "produtos_all_members" ON public.produtos;
CREATE POLICY "produtos_all_members" ON public.produtos FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "vendas_all_members" ON public.vendas;
CREATE POLICY "vendas_all_members" ON public.vendas FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

DROP POLICY IF EXISTS "venda_itens_all_members" ON public.venda_itens;
CREATE POLICY "venda_itens_all_members" ON public.venda_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND private.is_empresa_member(v.empresa_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND private.is_empresa_member(v.empresa_id, auth.uid())));

DROP POLICY IF EXISTS "alertas_all_members" ON public.alertas;
DROP POLICY IF EXISTS "membros gerenciam alertas" ON public.alertas;
CREATE POLICY "membros gerenciam alertas" ON public.alertas FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_empresa_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_empresa_role(UUID, UUID, public.app_role[]) FROM PUBLIC, anon, authenticated;