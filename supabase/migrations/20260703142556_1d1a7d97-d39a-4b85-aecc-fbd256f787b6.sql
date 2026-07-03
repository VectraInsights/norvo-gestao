
-- Torna nome opcional (usaremos banco como identificação)
ALTER TABLE public.contas_bancarias ALTER COLUMN nome DROP NOT NULL;

-- Função para recalcular saldo atual a partir de transações OFX conciliadas
CREATE OR REPLACE FUNCTION public.recalc_saldo_conta(_conta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contas_bancarias c
  SET saldo_atual = COALESCE(c.saldo_inicial,0) + COALESCE((
    SELECT SUM(valor) FROM public.ofx_transacoes
    WHERE conta_bancaria_id = _conta_id AND status = 'conciliada'
  ),0)
  WHERE c.id = _conta_id;
END; $$;

-- Trigger para recalcular saldo automaticamente
CREATE OR REPLACE FUNCTION public.tg_ofx_recalc_saldo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_saldo_conta(COALESCE(NEW.conta_bancaria_id, OLD.conta_bancaria_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ofx_recalc_saldo ON public.ofx_transacoes;
CREATE TRIGGER trg_ofx_recalc_saldo
AFTER INSERT OR UPDATE OR DELETE ON public.ofx_transacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_ofx_recalc_saldo();
