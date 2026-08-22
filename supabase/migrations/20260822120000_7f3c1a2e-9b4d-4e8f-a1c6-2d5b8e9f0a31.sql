-- Gestão de Férias (DP/RH)
-- Períodos aquisitivos + concessões de gozo (CLT art. 129-138).

-- ENUMs
DO $$ BEGIN
  CREATE TYPE public.ferias_concessao_status AS ENUM ('agendada','em_gozo','concluida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Período aquisitivo (12 meses) com prazo de concessão (+6 meses, CLT art. 134).
-- Status não é armazenado: deriva-se das datas (ver UI): em_aquisicao | disponivel | vencido.
CREATE TABLE IF NOT EXISTS public.ferias_periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  limite_concessao DATE NOT NULL,
  dias_direito INT NOT NULL DEFAULT 30 CHECK (dias_direito > 0 AND dias_direito <= 30),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim > data_inicio),
  CHECK (limite_concessao > data_fim)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias_periodos TO authenticated;
GRANT ALL ON public.ferias_periodos TO service_role;

ALTER TABLE public.ferias_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ferias_periodos_members" ON public.ferias_periodos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER trg_ferias_periodos_updated BEFORE UPDATE ON public.ferias_periodos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX idx_ferias_periodos_empresa ON public.ferias_periodos(empresa_id);
CREATE INDEX idx_ferias_periodos_colab ON public.ferias_periodos(colaborador_id);

-- Concessão de gozo (fracionável; abono pecuniário máx. 10 dias, CLT art. 143).
CREATE TABLE IF NOT EXISTS public.ferias_concessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  periodo_id UUID NOT NULL REFERENCES public.ferias_periodos(id) ON DELETE CASCADE,
  data_inicio_gozo DATE NOT NULL,
  data_fim_gozo DATE NOT NULL,
  dias INT GENERATED ALWAYS AS ((data_fim_gozo - data_inicio_gozo) + 1) STORED,
  abono_dias INT NOT NULL DEFAULT 0 CHECK (abono_dias BETWEEN 0 AND 10),
  adiantar_decimo BOOLEAN NOT NULL DEFAULT false,
  status public.ferias_concessao_status NOT NULL DEFAULT 'agendada',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim_gozo >= data_inicio_gozo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias_concessoes TO authenticated;
GRANT ALL ON public.ferias_concessoes TO service_role;

ALTER TABLE public.ferias_concessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ferias_concessoes_members" ON public.ferias_concessoes FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER trg_ferias_concessoes_updated BEFORE UPDATE ON public.ferias_concessoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX idx_ferias_concessoes_empresa ON public.ferias_concessoes(empresa_id);
CREATE INDEX idx_ferias_concessoes_periodo ON public.ferias_concessoes(periodo_id);
