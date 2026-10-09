-- Reforma Tributária (fases): flag por empresa + tabela cClassTrib.
-- Com fase2 desligada, a emissão mantém o comportamento de 2026 (cClassTrib 000001).
CREATE TABLE IF NOT EXISTS public.rtc_config (
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  fase2_ativo BOOLEAN NOT NULL DEFAULT false,
  cclasstrib_padrao TEXT NOT NULL DEFAULT '000001',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rtc_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rtc_config_members" ON public.rtc_config;
CREATE POLICY "rtc_config_members" ON public.rtc_config FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rtc_config TO authenticated;
GRANT ALL ON public.rtc_config TO service_role;

-- cClassTrib (IBS/CBS): subset relevante p/ transporte; tabela oficial completa na CFF/SVRS.
CREATE TABLE IF NOT EXISTS public.cclasstrib (
  codigo TEXT PRIMARY KEY,
  descricao TEXT NOT NULL
);

ALTER TABLE public.cclasstrib ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cclasstrib_read" ON public.cclasstrib;
CREATE POLICY "cclasstrib_read" ON public.cclasstrib FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.cclasstrib TO authenticated;
GRANT ALL ON public.cclasstrib TO service_role;

INSERT INTO public.cclasstrib (codigo, descricao) VALUES
  ('000001', 'Situações tributadas integralmente pelo IBS e CBS'),
  ('200002', 'Fornecimento ou importação para produtor rural não contribuinte ou TAC'),
  ('200022', 'Operação de fora da ZFM p/ contribuinte na ZFM (bem industrializado)'),
  ('200024', 'Operação de fora das ALC p/ contribuinte nas ALC'),
  ('410004', 'Exportações de bens e serviços'),
  ('410015', 'Fornecimento por transportador autônomo não contribuinte'),
  ('410029', 'Operações acobertadas somente pelo ICMS'),
  ('410031', 'Fornecimento anterior ao início de vigência de IBS/CBS'),
  ('410999', 'Operações não onerosas sem previsão de tributação'),
  ('550002', 'Regime de Trânsito'),
  ('550014', 'Zona de Processamento de Exportação'),
  ('550020', 'Áreas de livre comércio'),
  ('550026', 'Admissão temporária com suspensão total (ZFM)'),
  ('810001', 'Crédito presumido sobre fornecimentos a partir da ZFM')
ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao;
