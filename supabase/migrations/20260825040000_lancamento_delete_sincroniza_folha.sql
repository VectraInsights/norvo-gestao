
-- Quando um lançamento vinculado a folha é excluído, voltar folha para "aberta"
CREATE OR REPLACE FUNCTION public.tg_lancamento_delete_sincroniza_folha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.folha_pagamento
  SET status = 'aberta', lancamento_id = NULL, data_pagamento = NULL
  WHERE lancamento_id = OLD.id AND status = 'lançada';
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_lancamento_delete_folha
  AFTER DELETE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_delete_sincroniza_folha();

REVOKE EXECUTE ON FUNCTION public.tg_lancamento_delete_sincroniza_folha() FROM PUBLIC, anon, authenticated;
