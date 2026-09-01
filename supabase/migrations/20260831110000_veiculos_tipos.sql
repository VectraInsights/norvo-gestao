-- Tabela de tipos de veÃ­culo (customizÃ¡vel por empresa)
CREATE TABLE IF NOT EXISTS public.veiculos_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

ALTER TABLE public.veiculos_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "is_empresa_member" ON public.veiculos_tipos
  FOR ALL USING (public.is_empresa_member(empresa_id, auth.uid()));

COMMENT ON TABLE public.veiculos_tipos IS 'Tipos de veÃ­culo customizÃ¡veis por empresa';
