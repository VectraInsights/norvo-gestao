-- NF-es importadas para embarque via CT-e — persistencia entre F5/troca de tela + dedup global por chave
CREATE TABLE IF NOT EXISTS public.cte_nfes_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  n_nf TEXT,
  serie TEXT,
  emit_nome TEXT,
  emit_cnpj TEXT,
  emit_uf TEXT,
  emit_cmun TEXT,
  emit_xmun TEXT,
  dest_nome TEXT,
  dest_cnpj TEXT,
  dest_uf TEXT,
  dest_cmun TEXT,
  dest_xmun TEXT,
  valor NUMERIC(15,2) DEFAULT 0,
  peso NUMERIC(15,3) DEFAULT 0,
  data_emissao DATE,
  tomador_nome TEXT,
  tomador_cnpj TEXT,
  tomador_uf TEXT,
  tomador_cmun TEXT,
  tomador_xmun TEXT,
  mod_frete TEXT,
  xml_text TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','embarcada')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_cte_nfes_empresa ON public.cte_nfes_pendentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cte_nfes_chave ON public.cte_nfes_pendentes(empresa_id, chave);
CREATE INDEX IF NOT EXISTS idx_cte_nfes_status ON public.cte_nfes_pendentes(empresa_id, status);

ALTER TABLE public.cte_nfes_pendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cte_nfes_all_members" ON public.cte_nfes_pendentes;
CREATE POLICY "cte_nfes_all_members" ON public.cte_nfes_pendentes FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

DROP TRIGGER IF EXISTS touch_cte_nfes ON public.cte_nfes_pendentes;
CREATE TRIGGER touch_cte_nfes BEFORE UPDATE ON public.cte_nfes_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cte_nfes_pendentes TO authenticated;
GRANT ALL ON public.cte_nfes_pendentes TO service_role;
