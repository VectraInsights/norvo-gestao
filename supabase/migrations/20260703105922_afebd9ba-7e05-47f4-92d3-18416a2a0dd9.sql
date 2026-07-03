
-- Reajusta trigger de estoque (enum só tem entrada/saida/ajuste/transferencia)
CREATE OR REPLACE FUNCTION public.tg_movimentacao_atualiza_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE delta NUMERIC(15,3); prod_estoque_min NUMERIC; prod_estoque_novo NUMERIC; prod_nome TEXT;
BEGIN
  IF NEW.tipo = 'entrada' THEN
    delta := NEW.quantidade;
  ELSIF NEW.tipo = 'saida' THEN
    delta := -NEW.quantidade;
  ELSIF NEW.tipo = 'ajuste' THEN
    delta := NEW.quantidade; -- assumimos que o valor já vem com sinal
  ELSE
    delta := 0;
  END IF;

  UPDATE public.produtos
    SET estoque_atual = COALESCE(estoque_atual,0) + delta
    WHERE id = NEW.produto_id
    RETURNING estoque_minimo, estoque_atual, nome INTO prod_estoque_min, prod_estoque_novo, prod_nome;

  IF prod_estoque_novo IS NOT NULL AND prod_estoque_min > 0 AND prod_estoque_novo <= prod_estoque_min THEN
    INSERT INTO public.alertas (empresa_id, tipo, titulo, mensagem, severidade, ref_tabela, ref_id)
    VALUES (NEW.empresa_id, 'estoque_baixo', 'Estoque baixo',
      'Produto "'||prod_nome||'" está com estoque em '||prod_estoque_novo::text||' (mínimo '||prod_estoque_min::text||').',
      'warning','produtos', NEW.produto_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tg_movimentacao_atualiza_estoque() FROM PUBLIC, anon, authenticated;

-- Reajusta trigger de faturamento com colunas corretas
CREATE OR REPLACE FUNCTION public.tg_venda_faturada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  cond_parcelas INT; cond_intervalo INT;
  i INT;
  valor_parcela NUMERIC(15,2);
  data_venc DATE;
  categoria_id_receita UUID;
  nfe_serie INT;
  nfe_num INT;
BEGIN
  IF NEW.status = 'faturado' AND (OLD.status IS DISTINCT FROM 'faturado') THEN
    FOR item IN SELECT * FROM public.venda_itens WHERE venda_id = NEW.id LOOP
      INSERT INTO public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario, observacoes, venda_id)
      VALUES (NEW.empresa_id, item.produto_id, 'saida', item.quantidade, item.preco_unitario,
              'Venda #'||NEW.numero, NEW.id);
    END LOOP;

    SELECT id INTO categoria_id_receita FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'receita' ORDER BY created_at LIMIT 1;

    SELECT COALESCE(parcelas,1), COALESCE(intervalo_dias,30)
      INTO cond_parcelas, cond_intervalo
      FROM public.condicoes_pagamento WHERE id = NEW.condicao_pagamento_id;
    IF cond_parcelas IS NULL THEN cond_parcelas := 1; cond_intervalo := 30; END IF;

    valor_parcela := ROUND(NEW.total::numeric / GREATEST(cond_parcelas,1), 2);
    FOR i IN 1..cond_parcelas LOOP
      data_venc := (COALESCE(NEW.data, CURRENT_DATE) + (cond_intervalo * i))::date;
      INSERT INTO public.lancamentos_financeiros
        (empresa_id, tipo, descricao, valor, data_vencimento, status, contato_id, categoria_id)
      VALUES
        (NEW.empresa_id, 'receber',
         'Venda #'||NEW.numero||' - Parc. '||i||'/'||cond_parcelas,
         valor_parcela, data_venc, 'aberto', NEW.cliente_id, categoria_id_receita);
    END LOOP;

    SELECT COALESCE(serie,1), COALESCE(proximo_numero,1) INTO nfe_serie, nfe_num
      FROM public.nfe_config WHERE empresa_id = NEW.empresa_id;
    IF nfe_serie IS NULL THEN nfe_serie := 1; nfe_num := 1; END IF;

    INSERT INTO public.notas_fiscais (empresa_id, venda_id, contato_id, tipo, status, numero, serie, valor_total)
    VALUES (NEW.empresa_id, NEW.id, NEW.cliente_id, 'nfe', 'rascunho', nfe_num::text, nfe_serie::text, NEW.total);

    UPDATE public.nfe_config SET proximo_numero = nfe_num + 1 WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tg_venda_faturada() FROM PUBLIC, anon, authenticated;

-- Função para emitir NF (stub — vira 'autorizada' com chave fake)
CREATE OR REPLACE FUNCTION public.emitir_nota_fiscal(_nf_id UUID)
RETURNS public.notas_fiscais LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nf public.notas_fiscais;
BEGIN
  SELECT * INTO nf FROM public.notas_fiscais WHERE id = _nf_id;
  IF nf IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT public.has_empresa_role(nf.empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF nf.status = 'autorizada' THEN RETURN nf; END IF;

  UPDATE public.notas_fiscais
    SET status = 'autorizada',
        data_emissao = now(),
        chave = LPAD((FLOOR(random()*1e14))::bigint::text, 44, '0'),
        mensagem = 'Autorizada em ambiente homologação (stub)'
    WHERE id = _nf_id
    RETURNING * INTO nf;
  RETURN nf;
END; $$;
REVOKE EXECUTE ON FUNCTION public.emitir_nota_fiscal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_nota_fiscal(UUID) TO authenticated;

-- Função para cancelar NF
CREATE OR REPLACE FUNCTION public.cancelar_nota_fiscal(_nf_id UUID, _motivo TEXT)
RETURNS public.notas_fiscais LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nf public.notas_fiscais;
BEGIN
  SELECT * INTO nf FROM public.notas_fiscais WHERE id = _nf_id;
  IF nf IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT public.has_empresa_role(nf.empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.notas_fiscais SET status = 'cancelada', mensagem = _motivo WHERE id = _nf_id RETURNING * INTO nf;
  RETURN nf;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cancelar_nota_fiscal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_nota_fiscal(UUID, TEXT) TO authenticated;
