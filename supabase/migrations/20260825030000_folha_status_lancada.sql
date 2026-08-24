
-- Adicionar 'lançada' ao enum folha_status (entre aberta e paga)
DO $$ BEGIN
  ALTER TYPE public.folha_status ADD VALUE IF NOT EXISTS 'lançada' AFTER 'aberta';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Remover trigger e função antigos (front agora cria o lançamento)
DROP TRIGGER IF EXISTS trg_folha_paga ON public.folha_pagamento;
DROP FUNCTION IF EXISTS public.tg_folha_paga();

-- Nova função: quando um lançamento vinculado a folha vira "pago", sincroniza folha para "paga"
CREATE OR REPLACE FUNCTION public.tg_lancamento_pago_sincroniza_folha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS DISTINCT FROM 'pago') THEN
    UPDATE public.folha_pagamento
    SET status = 'paga',
        data_pagamento = COALESCE(NEW.data_pagamento, CURRENT_DATE)
    WHERE lancamento_id = NEW.id AND status != 'paga';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_lancamento_pago_folha
  AFTER UPDATE OF status ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.tg_lancamento_pago_sincroniza_folha();

REVOKE EXECUTE ON FUNCTION public.tg_lancamento_pago_sincroniza_folha() FROM PUBLIC, anon, authenticated;
