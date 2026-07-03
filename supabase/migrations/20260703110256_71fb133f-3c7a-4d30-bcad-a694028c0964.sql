
-- Trigger de defaults ao criar empresa
CREATE OR REPLACE FUNCTION public.tg_empresa_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo) VALUES
    (NEW.id, 'Vendas de produtos', 'receber'),
    (NEW.id, 'Vendas de serviços', 'receber'),
    (NEW.id, 'Outras receitas', 'receber'),
    (NEW.id, 'Fornecedores', 'pagar'),
    (NEW.id, 'Folha de pagamento', 'pagar'),
    (NEW.id, 'Impostos', 'pagar'),
    (NEW.id, 'Aluguel', 'pagar'),
    (NEW.id, 'Marketing', 'pagar'),
    (NEW.id, 'Outras despesas', 'pagar')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.condicoes_pagamento (empresa_id, nome, parcelas, intervalo_dias) VALUES
    (NEW.id, 'À vista', 1, 0),
    (NEW.id, '30 dias', 1, 30),
    (NEW.id, '30/60 dias', 2, 30),
    (NEW.id, '30/60/90 dias', 3, 30),
    (NEW.id, '3x sem juros', 3, 30),
    (NEW.id, '6x sem juros', 6, 30),
    (NEW.id, '12x sem juros', 12, 30)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.depositos (empresa_id, nome, padrao) VALUES (NEW.id, 'Depósito Principal', true) ON CONFLICT DO NOTHING;
  INSERT INTO public.nfe_config (empresa_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tg_empresa_defaults() FROM PUBLIC, anon, authenticated;

-- Ressemeia empresas existentes que estejam sem categorias/condições/depósito/nfe
DO $$
DECLARE emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM public.empresas LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE empresa_id = emp.id) THEN
      INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo) VALUES
        (emp.id, 'Vendas de produtos', 'receber'),
        (emp.id, 'Vendas de serviços', 'receber'),
        (emp.id, 'Outras receitas', 'receber'),
        (emp.id, 'Fornecedores', 'pagar'),
        (emp.id, 'Folha de pagamento', 'pagar'),
        (emp.id, 'Impostos', 'pagar'),
        (emp.id, 'Aluguel', 'pagar'),
        (emp.id, 'Marketing', 'pagar'),
        (emp.id, 'Outras despesas', 'pagar');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.condicoes_pagamento WHERE empresa_id = emp.id) THEN
      INSERT INTO public.condicoes_pagamento (empresa_id, nome, parcelas, intervalo_dias) VALUES
        (emp.id, 'À vista', 1, 0),
        (emp.id, '30 dias', 1, 30),
        (emp.id, '30/60 dias', 2, 30),
        (emp.id, '30/60/90 dias', 3, 30),
        (emp.id, '3x sem juros', 3, 30),
        (emp.id, '6x sem juros', 6, 30),
        (emp.id, '12x sem juros', 12, 30);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.depositos WHERE empresa_id = emp.id) THEN
      INSERT INTO public.depositos (empresa_id, nome, padrao) VALUES (emp.id, 'Depósito Principal', true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.nfe_config WHERE empresa_id = emp.id) THEN
      INSERT INTO public.nfe_config (empresa_id) VALUES (emp.id);
    END IF;
  END LOOP;
END $$;

-- Trigger de faturamento: usar tipo='receber' ao buscar categoria default
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
      WHERE empresa_id = NEW.empresa_id AND tipo = 'receber' ORDER BY created_at LIMIT 1;

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
