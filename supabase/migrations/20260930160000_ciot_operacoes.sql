-- CIOTs emitidos direto na ANTT cobrindo 1+ CT-es (operações ETC frota própria).
CREATE TABLE IF NOT EXISTS public.ciot_operacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ciot TEXT NOT NULL,
  ciot_verificador TEXT,
  protocolo TEXT,
  id_operacao TEXT,
  ambiente TEXT NOT NULL DEFAULT 'homologacao',
  status TEXT NOT NULL DEFAULT 'declarado',
  valor_frete NUMERIC(15,2),
  distancia_km NUMERIC,
  tipo_carga TEXT,
  eixos INTEGER,
  placa TEXT,
  tomador_cnpj TEXT,
  tomador_nome TEXT,
  emit_cnpj TEXT,
  cte_ids JSONB NOT NULL DEFAULT '[]',
  cte_chaves TEXT[] NOT NULL DEFAULT '{}',
  data_inicio DATE,
  data_fim DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ciot_ops_empresa ON public.ciot_operacoes(empresa_id);

ALTER TABLE public.ciot_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ciot_ops_all_members" ON public.ciot_operacoes;
CREATE POLICY "ciot_ops_all_members" ON public.ciot_operacoes FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

DROP TRIGGER IF EXISTS touch_ciot_ops ON public.ciot_operacoes;
CREATE TRIGGER touch_ciot_ops BEFORE UPDATE ON public.ciot_operacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ciot_operacoes TO authenticated;
GRANT ALL ON public.ciot_operacoes TO service_role;
