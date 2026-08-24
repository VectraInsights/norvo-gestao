-- Simplifica policies de UPDATE/DELETE em cargos para não depender de has_empresa_role()
-- (evita "permission denied" em contextos de RLS via PostgREST/pooler).

DROP POLICY IF EXISTS "cargos_editar_admin" ON public.cargos;
CREATE POLICY "cargos_editar_admin" ON public.cargos FOR UPDATE TO authenticated
  USING (
    (empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.empresa_id = cargos.empresa_id AND eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR (empresa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
  )
  WITH CHECK (
    (empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.empresa_id = cargos.empresa_id AND eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR (empresa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cargos_excluir_admin" ON public.cargos;
CREATE POLICY "cargos_excluir_admin" ON public.cargos FOR DELETE TO authenticated
  USING (
    (empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.empresa_id = cargos.empresa_id AND eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR (empresa_id IS NULL AND EXISTS (
      SELECT 1 FROM public.empresa_users eu
       WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
    ))
    OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
  );
