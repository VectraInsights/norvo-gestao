-- Catálogo de cargos (substitui a marcação eh_motorista por cargo = Motorista*)
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS eh_motorista;

CREATE TABLE IF NOT EXISTS public.cargos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cargos_nome_unico
  ON public.cargos(COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(nome));

INSERT INTO public.cargos (empresa_id, nome)
VALUES
  (NULL,'Motorista'),
  (NULL,'Motorista Carreteiro'),
  (NULL,'Ajudante'),
  (NULL,'Mecânico'),
  (NULL,'Estoquista'),
  (NULL,'Administrativo'),
  (NULL,'Financeiro'),
  (NULL,'Atendimento'),
  (NULL,'Comercial'),
  (NULL,'Gerente')
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.cargos TO authenticated;
GRANT INSERT, DELETE ON public.cargos TO authenticated;
GRANT ALL ON public.cargos TO service_role;
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cargos_leitura" ON public.cargos FOR SELECT TO authenticated
  USING (empresa_id IS NULL OR public.is_empresa_member(empresa_id, auth.uid()));

CREATE POLICY "cargos_criar_admin" ON public.cargos FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IS NOT NULL
    AND (
      public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    )
  );

CREATE POLICY "cargos_excluir_admin" ON public.cargos FOR DELETE TO authenticated
  USING (
    empresa_id IS NOT NULL
    AND (
      public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
      OR EXISTS (SELECT 1 FROM public.super_admins s WHERE s.user_id = auth.uid())
    )
  );
