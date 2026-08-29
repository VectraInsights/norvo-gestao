-- A policy de SELECT criada na 20260824210000 escondia os cargos padrão (globais).
-- Restaura a visibilidade: membros veem os cargos da empresa + os padrões.
DROP POLICY IF EXISTS "cargos_leitura" ON public.cargos;
CREATE POLICY "cargos_leitura" ON public.cargos FOR SELECT TO authenticated
  USING (
    empresa_id IS NULL
    OR public.is_empresa_member(empresa_id, auth.uid())
  );
