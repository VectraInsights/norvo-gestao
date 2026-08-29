-- Cargos 100% customizáveis pela empresa:
-- 1) Remove o catálogo padrão global (empresa_id IS NULL).
DELETE FROM public.cargos WHERE empresa_id IS NULL;

-- 2) Leitura passa a ser só dos cargos da própria empresa.
DROP POLICY IF EXISTS "cargos_leitura" ON public.cargos;
CREATE POLICY "cargos_leitura" ON public.cargos FOR SELECT TO authenticated
  USING (empresa_id IS NOT NULL AND public.is_empresa_member(empresa_id, auth.uid()));

-- 3) Renomear (UPDATE) liberado para owner/admin da empresa ou super admin.
GRANT UPDATE ON public.cargos TO authenticated;
CREATE POLICY "cargos_editar_admin" ON public.cargos FOR UPDATE TO authenticated
  USING (
    empresa_id IS NOT NULL
    AND (
      public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    )
  )
  WITH CHECK (
    empresa_id IS NOT NULL
    AND (
      public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    )
  );

-- 4) Exclusão bloqueada SOMENTE quando o cargo está vinculado a algum funcionário
--    (colaboradores.cargo guarda o NOME do cargo, comparação sem acento/caixa).
CREATE OR REPLACE FUNCTION public.tg_cargo_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.colaboradores c
     WHERE c.empresa_id = OLD.empresa_id
       AND lower(btrim(c.cargo)) = lower(btrim(OLD.nome))
  ) THEN
    RAISE EXCEPTION 'Este cargo está vinculado a um ou mais funcionários e não pode ser excluído';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_cargo_guard ON public.cargos;
CREATE TRIGGER tg_cargo_guard
BEFORE DELETE ON public.cargos
FOR EACH ROW EXECUTE FUNCTION public.tg_cargo_delete_guard();
