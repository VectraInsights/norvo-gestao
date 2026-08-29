
-- Função: atualiza status das férias automaticamente
-- agendada → em_gozo quando data_inicio_gozo <= hoje
-- em_gozo → concluida quando data_fim_gozo < hoje
CREATE OR REPLACE FUNCTION public.atualizar_status_ferias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- agendada → em_gozo
  UPDATE public.ferias_concessoes
  SET status = 'em_gozo'
  WHERE status = 'agendada' AND data_inicio_gozo <= CURRENT_DATE;

  -- em_gozo → concluida
  UPDATE public.ferias_concessoes
  SET status = 'concluida'
  WHERE status = 'em_gozo' AND data_fim_gozo < CURRENT_DATE;
END; $$;

REVOKE EXECUTE ON FUNCTION public.atualizar_status_ferias() FROM PUBLIC, anon, authenticated;

-- Criar job pg_cron (diário às 00:05 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ferias-status-automatico') THEN
    PERFORM cron.unschedule('ferias-status-automatico');
  END IF;
END $$;

SELECT cron.schedule(
  'ferias-status-automatico',
  '5 0 * * *',
  $$SELECT public.atualizar_status_ferias();$$
);
