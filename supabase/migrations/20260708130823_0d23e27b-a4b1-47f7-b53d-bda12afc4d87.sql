
ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS data_inicio_lancamentos date;
