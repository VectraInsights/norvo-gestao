-- Adiciona coluna last_query_at para cooldown entre consultas SEFAZ
-- Evita cStat 656 "Consumo Indevido" por consultas muito frequentes

ALTER TABLE public.nfe_config
  ADD COLUMN IF NOT EXISTS last_query_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.nfe_config.last_query_at IS 'Timestamp da última consulta SEFAZ para esta empresa (cooldown 5min)';
