-- Restaura o catálogo PADRÃO (empresa_id IS NULL) que havia sido apagado,
-- mas agora EDITÁVEL/EXCLUÍVEL como qualquer outro cargo:
-- a única restrição é excluir cargo vinculado a funcionário (trigger tg_cargo_guard).

INSERT INTO public.cargos (empresa_id, nome) VALUES
  -- Gerência
  (NULL,'Gerente Geral'),
  (NULL,'Gerente Operacional'),
  (NULL,'Gerente Administrativo'),
  (NULL,'Gerente Financeiro'),
  (NULL,'Gerente Comercial'),
  (NULL,'Gerente de Logística'),
  (NULL,'Gerente de Frota'),
  -- Supervisão
  (NULL,'Supervisor de Transportes'),
  (NULL,'Supervisor de Logística'),
  (NULL,'Supervisor de Frota'),
  (NULL,'Supervisor de Pátio'),
  (NULL,'Supervisor de Expedição'),
  (NULL,'Supervisor Comercial'),
  (NULL,'Supervisor Administrativo'),
  -- Encarregados
  (NULL,'Encarregado de Pátio'),
  (NULL,'Encarregado de Expedição'),
  (NULL,'Encarregado de Manutenção'),
  (NULL,'Encarregado de Estoque'),
  (NULL,'Encarregado de Transportes'),
  -- Analistas
  (NULL,'Analista de Transportes'),
  (NULL,'Analista de Logística'),
  (NULL,'Analista Administrativo'),
  (NULL,'Analista Financeiro'),
  (NULL,'Analista de Frotas'),
  (NULL,'Analista de Compras'),
  (NULL,'Analista de RH'),
  (NULL,'Analista Fiscal'),
  (NULL,'Analista de Crédito e Cobrança'),
  -- Assistentes
  (NULL,'Assistente Administrativo'),
  (NULL,'Assistente Financeiro'),
  (NULL,'Assistente de Logística'),
  (NULL,'Assistente de Transportes'),
  (NULL,'Assistente Comercial'),
  (NULL,'Assistente de RH'),
  (NULL,'Assistente Fiscal'),
  (NULL,'Assistente de Expedição'),
  -- Auxiliares
  (NULL,'Auxiliar de Expedição'),
  (NULL,'Auxiliar Administrativo'),
  (NULL,'Auxiliar de Logística'),
  (NULL,'Auxiliar de Estoque'),
  (NULL,'Auxiliar de Escritório'),
  (NULL,'Auxiliar de Carga e Descarga'),
  (NULL,'Auxiliar de Pátio'),
  (NULL,'Auxiliar de Manutenção'),
  -- Operação
  (NULL,'Eletricista'),
  (NULL,'Conferente de Carga'),
  (NULL,'Operador de Empilhadeira'),
  -- Operacionais originais
  (NULL,'Motorista'),
  (NULL,'Motorista Carreteiro'),
  (NULL,'Mecânico'),
  (NULL,'Ajudante'),
  (NULL,'Estoquista')
ON CONFLICT DO NOTHING;

-- UPDATE/DELETE liberados para owner/admin (cargos padrão incluídos).
-- Em cargos da própria empresa exige o papel NELA; nos padrões (globais),
-- basta ser owner/admin em alguma empresa ou super admin da plataforma.
DROP POLICY IF EXISTS "cargos_editar_admin" ON public.cargos;
CREATE POLICY "cargos_editar_admin" ON public.cargos FOR UPDATE TO authenticated
  USING (
    CASE
      WHEN empresa_id IS NOT NULL THEN
        public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      ELSE
        EXISTS (
          SELECT 1 FROM public.empresa_users eu
           WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
        ) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    END
  )
  WITH CHECK (
    CASE
      WHEN empresa_id IS NOT NULL THEN
        public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      ELSE
        EXISTS (
          SELECT 1 FROM public.empresa_users eu
           WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
        ) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    END
  );

DROP POLICY IF EXISTS "cargos_excluir_admin" ON public.cargos;
CREATE POLICY "cargos_excluir_admin" ON public.cargos FOR DELETE TO authenticated
  USING (
    CASE
      WHEN empresa_id IS NOT NULL THEN
        public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      ELSE
        EXISTS (
          SELECT 1 FROM public.empresa_users eu
           WHERE eu.user_id = auth.uid() AND eu.role IN ('owner','admin')
        ) OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    END
  );

-- Guarda de exclusão: padrão (global) considera funcionários de TODAS as empresas.
CREATE OR REPLACE FUNCTION public.tg_cargo_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.empresa_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.colaboradores c
       WHERE lower(btrim(c.cargo)) = lower(btrim(OLD.nome))
    ) THEN
      RAISE EXCEPTION 'Este cargo está vinculado a um ou mais funcionários e não pode ser excluído';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.colaboradores c
       WHERE c.empresa_id = OLD.empresa_id
         AND lower(btrim(c.cargo)) = lower(btrim(OLD.nome))
    ) THEN
      RAISE EXCEPTION 'Este cargo está vinculado a um ou mais funcionários e não pode ser excluído';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
