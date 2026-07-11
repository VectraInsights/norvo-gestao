
-- ENUMs
DO $$ BEGIN
  CREATE TYPE public.colaborador_status AS ENUM ('ativo','ferias','afastado','demitido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.folha_status AS ENUM ('aberta','paga','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colaboradores
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT,
  cargo TEXT,
  email TEXT,
  telefone TEXT,
  salario_base NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_admissao DATE,
  data_demissao DATE,
  status public.colaborador_status NOT NULL DEFAULT 'ativo',
  pix TEXT,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "colab_members" ON public.colaboradores FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER trg_colab_updated BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Folha de pagamento
CREATE TABLE IF NOT EXISTS public.folha_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia_mes INT NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano INT NOT NULL,
  salario NUMERIC(15,2) NOT NULL DEFAULT 0,
  horas_extras NUMERIC(15,2) NOT NULL DEFAULT 0,
  beneficios NUMERIC(15,2) NOT NULL DEFAULT 0,
  descontos NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss NUMERIC(15,2) NOT NULL DEFAULT 0,
  irrf NUMERIC(15,2) NOT NULL DEFAULT 0,
  liquido NUMERIC(15,2) NOT NULL DEFAULT 0,
  status public.folha_status NOT NULL DEFAULT 'aberta',
  data_pagamento DATE,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, competencia_mes, competencia_ano)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_pagamento TO authenticated;
GRANT ALL ON public.folha_pagamento TO service_role;

ALTER TABLE public.folha_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folha_members" ON public.folha_pagamento FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER trg_folha_updated BEFORE UPDATE ON public.folha_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Trigger: quando folha vira 'paga', cria lançamento a pagar
CREATE OR REPLACE FUNCTION public.tg_folha_paga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_id UUID;
  colab_nome TEXT;
  novo_lanc UUID;
BEGIN
  IF NEW.status = 'paga' AND (OLD.status IS DISTINCT FROM 'paga') AND NEW.lancamento_id IS NULL THEN
    SELECT id INTO cat_id FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'pagar' AND nome ILIKE '%folha%'
      ORDER BY created_at LIMIT 1;

    SELECT nome INTO colab_nome FROM public.colaboradores WHERE id = NEW.colaborador_id;

    INSERT INTO public.lancamentos_financeiros
      (empresa_id, tipo, descricao, valor, data_vencimento, data_pagamento, status, categoria_id)
    VALUES (NEW.empresa_id, 'pagar',
      'Folha ' || LPAD(NEW.competencia_mes::text,2,'0') || '/' || NEW.competencia_ano || ' - ' || COALESCE(colab_nome,'colaborador'),
      NEW.liquido,
      COALESCE(NEW.data_pagamento, CURRENT_DATE),
      COALESCE(NEW.data_pagamento, CURRENT_DATE),
      'pago', cat_id)
    RETURNING id INTO novo_lanc;

    NEW.lancamento_id := novo_lanc;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_folha_paga BEFORE UPDATE ON public.folha_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_folha_paga();
