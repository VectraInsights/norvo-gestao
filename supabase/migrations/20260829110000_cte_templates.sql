-- Templates de CT-e por empresa (reuso de remetente/destino/tomador + rota + CFOP)
-- Permite salvar configuracoes frequentes (ex.: mesmo tomador de ontem) e reaplicar no Dialog
CREATE TABLE IF NOT EXISTS public.cte_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  -- Tomador
  toma TEXT NOT NULL DEFAULT '3',
  cnpj_tomador TEXT,
  x_nome_tomador TEXT,
  uf_tomador TEXT,
  c_mun_tomador TEXT,
  x_mun_tomador TEXT,
  -- Fiscal / operacao
  cfop TEXT,
  rntrc TEXT,
  -- Origem / local de envio
  c_mun_env TEXT,
  x_mun_env TEXT,
  uf_env TEXT,
  -- Rota
  c_mun_ini TEXT,
  x_mun_ini TEXT,
  uf_ini TEXT,
  c_mun_fim TEXT,
  x_mun_fim TEXT,
  uf_fim TEXT,
  -- Dados completos do form (para extensibilidade sem nova migration)
  dados JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_cte_templates_empresa ON public.cte_templates(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cte_templates_nome ON public.cte_templates(empresa_id, nome);

ALTER TABLE public.cte_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cte_templates_all_members" ON public.cte_templates;
CREATE POLICY "cte_templates_all_members" ON public.cte_templates FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

DROP TRIGGER IF EXISTS touch_cte_templates ON public.cte_templates;
CREATE TRIGGER touch_cte_templates BEFORE UPDATE ON public.cte_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cte_templates TO authenticated;
GRANT ALL ON public.cte_templates TO service_role;
