-- Cadastro de seguradoras e apólices para CT-e
CREATE TABLE IF NOT EXISTS public.seguradoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  apolice_numero TEXT,
  averbacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, nome),
  UNIQUE(empresa_id, cnpj) 
);

CREATE INDEX IF NOT EXISTS idx_seguradoras_empresa ON public.seguradoras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_seguradoras_nome ON public.seguradoras(empresa_id, nome);

ALTER TABLE public.seguradoras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seguradoras_all_members" ON public.seguradoras;
CREATE POLICY "seguradoras_all_members" ON public.seguradoras FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

DROP TRIGGER IF EXISTS touch_seguradoras ON public.seguradoras;
CREATE TRIGGER touch_seguradoras BEFORE UPDATE ON public.seguradoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seguradoras TO authenticated;
GRANT ALL ON public.seguradoras TO service_role;
