-- Geração imediata da 1ª conta de adiantamento recorrente: a UI chama
-- public.gerar_adiantamentos_recorrentes() logo após o INSERT (o pg_cron diário
-- continua como fallback para os meses seguintes).
GRANT EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() TO authenticated;
