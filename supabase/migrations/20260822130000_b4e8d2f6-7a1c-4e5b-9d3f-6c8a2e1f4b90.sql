-- Transferência de estoque entre depósitos, atômica (entrada+saída numa transação).
-- O estoque global não muda (trigger ignora 'transferencia'); aqui registramos um PAR
-- entrada (depósito destino) + saida (depósito origem) para permitir saldo por depósito.
CREATE OR REPLACE FUNCTION public.transferir_estoque(
  _produto uuid,
  _quantidade numeric,
  _deposito_origem uuid,
  _deposito_destino uuid,
  _observacao text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid; atual numeric;
  nome_orig text; nome_dest text;
  d_emp uuid; d_emp2 uuid;
  ref text;
BEGIN
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser positiva';
  END IF;
  IF _deposito_origem = _deposito_destino THEN
    RAISE EXCEPTION 'Depósito de origem e destino devem ser diferentes';
  END IF;

  SELECT empresa_id, estoque_atual INTO emp, atual
    FROM public.produtos WHERE id = _produto;
  IF emp IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF NOT public.has_empresa_role(emp, auth.uid(), ARRAY['owner','admin','estoque']::app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar estoque';
  END IF;

  SELECT empresa_id, nome INTO d_emp, nome_orig
    FROM public.depositos WHERE id = _deposito_origem;
  IF d_emp IS NULL OR d_emp <> emp THEN
    RAISE EXCEPTION 'Depósito de origem inválido';
  END IF;
  SELECT empresa_id, nome INTO d_emp2, nome_dest
    FROM public.depositos WHERE id = _deposito_destino;
  IF d_emp2 IS NULL OR d_emp2 <> emp THEN
    RAISE EXCEPTION 'Depósito de destino inválido';
  END IF;

  IF COALESCE(atual, 0) < _quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente (atual %)', COALESCE(atual, 0);
  END IF;

  ref := 'Transferência ' || substr(gen_random_uuid()::text, 1, 8);

  -- ENTRADA primeiro: evita alerta falso de estoque baixo entre os dois inserts.
  INSERT INTO public.movimentacoes_estoque
    (empresa_id, produto_id, tipo, quantidade, deposito_id, observacoes)
  VALUES
    (emp, _produto, 'entrada', _quantidade, _deposito_destino,
     ref || ' — de ' || nome_orig ||
     COALESCE(' (' || NULLIF(btrim(COALESCE(_observacao, '')), '') || ')', ''));

  INSERT INTO public.movimentacoes_estoque
    (empresa_id, produto_id, tipo, quantidade, deposito_id, observacoes)
  VALUES
    (emp, _produto, 'saida', _quantidade, _deposito_origem,
     ref || ' — para ' || nome_dest ||
     COALESCE(' (' || NULLIF(btrim(COALESCE(_observacao, '')), '') || ')', ''));

  RETURN ref;
END $$;

REVOKE EXECUTE ON FUNCTION public.transferir_estoque(uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_estoque(uuid, numeric, uuid, uuid, text) TO authenticated;
