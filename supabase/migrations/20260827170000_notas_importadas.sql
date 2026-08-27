CREATE TABLE IF NOT EXISTS public.notas_importadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  chave_acesso TEXT NOT NULL,
  emitente TEXT NOT NULL,
  cnpj_emitente TEXT NOT NULL,
  numero_nf TEXT,
  data_emissao DATE,
  valor_total NUMERIC(15,2) DEFAULT 0,
  situacao TEXT DEFAULT 'importada',
  xml_completo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, chave_acesso)
);

CREATE TABLE IF NOT EXISTS public.notas_importadas_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id UUID NOT NULL REFERENCES public.notas_importadas(id) ON DELETE CASCADE,
  codigo TEXT,
  nome TEXT NOT NULL,
  quantidade NUMERIC(15,4) DEFAULT 0,
  unidade TEXT DEFAULT 'UN',
  valor_unitario NUMERIC(15,6) DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notas_importadas_parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id UUID NOT NULL REFERENCES public.notas_importadas(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  data_vencimento DATE NOT NULL,
  valor NUMERIC(15,2) NOT NULL,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notas_importadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_importadas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_importadas_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_importadas_select" ON public.notas_importadas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "notas_importadas_insert" ON public.notas_importadas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "notas_importadas_update" ON public.notas_importadas FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "notas_importadas_delete" ON public.notas_importadas FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "notas_itens_select" ON public.notas_importadas_itens FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "notas_itens_insert" ON public.notas_importadas_itens FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "notas_itens_update" ON public.notas_importadas_itens FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "notas_itens_delete" ON public.notas_importadas_itens FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "notas_parcelas_select" ON public.notas_importadas_parcelas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "notas_parcelas_insert" ON public.notas_importadas_parcelas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "notas_parcelas_update" ON public.notas_importadas_parcelas FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "notas_parcelas_delete" ON public.notas_importadas_parcelas FOR DELETE USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_notas_importadas_empresa ON public.notas_importadas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_importadas_chave ON public.notas_importadas(empresa_id, chave_acesso);
CREATE INDEX IF NOT EXISTS idx_notas_itens_nota ON public.notas_importadas_itens(nota_id);
CREATE INDEX IF NOT EXISTS idx_notas_parcelas_nota ON public.notas_importadas_parcelas(nota_id);
