-- Excluir adiantamento limpa as contas a pagar NO BANCO (independe da versão da UI):
-- 1) conta vinculada manualmente (lancamento_id): removida se não estiver paga;
-- 2) recorrente: contas automáticas EM ABERTO geradas por ele são removidas
--    (identificadas por observações + descrição = nome do colaborador + mesmo valor).
-- Contas já PAGAS permanecem no histórico.
CREATE OR REPLACE FUNCTION public.tg_adiantamento_delete_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  IF OLD.lancamento_id IS NOT NULL THEN
    DELETE FROM public.lancamentos_financeiros
     WHERE id = OLD.lancamento_id AND status <> 'pago';
  END IF;

  IF OLD.recorrente AND OLD.dia_recorrente BETWEEN 1 AND 31 THEN
    SELECT nome INTO v_nome FROM public.colaboradores WHERE id = OLD.colaborador_id;
    DELETE FROM public.lancamentos_financeiros
     WHERE empresa_id = OLD.empresa_id
       AND observacoes = 'Gerado automaticamente pelo adiantamento recorrente'
       AND status <> 'pago'
       AND descricao = COALESCE(v_nome, 'Adiantamento')
       AND valor = OLD.valor;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_adiantamento_delete ON public.adiantamentos;
CREATE TRIGGER tg_adiantamento_delete
AFTER DELETE ON public.adiantamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_adiantamento_delete_cleanup();
