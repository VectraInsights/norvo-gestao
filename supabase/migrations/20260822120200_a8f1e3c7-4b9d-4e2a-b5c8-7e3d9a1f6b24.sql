-- 22/08/2026 — Redesign Férias: períodos aquisitivos passam a ser DERIVADOS da
-- data_admissao do colaborador (12 meses corridos + 6 para conceder, CLT art. 134).
-- A tabela manual ferias_periodos é removida; ferias_concessoes passa a identificar
-- o ciclo aquisitivo pela coluna periodo_inicio (início do ciclo = aniversário da
-- admissão). Dados existentes na época: 1 período de teste, 0 concessões.

ALTER TABLE public.ferias_concessoes
  DROP COLUMN IF EXISTS periodo_id,
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD CONSTRAINT ferias_concessoes_ciclo_check CHECK (periodo_inicio < data_inicio_gozo);

ALTER TABLE public.ferias_concessoes
  ALTER COLUMN periodo_inicio SET NOT NULL;

DROP TABLE IF EXISTS public.ferias_periodos;

CREATE INDEX IF NOT EXISTS idx_ferias_concessoes_empresa_colab
  ON public.ferias_concessoes (empresa_id, colaborador_id);
