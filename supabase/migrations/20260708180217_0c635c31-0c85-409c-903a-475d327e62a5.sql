DELETE FROM public.categorias_financeiras
WHERE nome = 'Produtos' AND tipo = 'pagar'
  AND parent_id IN (SELECT id FROM public.categorias_financeiras WHERE nome = 'Fornecedores' AND tipo = 'pagar');

DO $$
DECLARE emp RECORD; v_parent UUID;
BEGIN
  FOR emp IN SELECT id FROM public.empresas LOOP
    SELECT c.id INTO v_parent FROM public.categorias_financeiras c
      WHERE c.empresa_id = emp.id AND c.nome = 'Estoque' AND c.tipo = 'pagar' AND c.parent_id IS NULL
      LIMIT 1;
    IF v_parent IS NULL THEN
      INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo, parent_id)
      VALUES (emp.id, 'Estoque', 'pagar', NULL) RETURNING id INTO v_parent;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.categorias_financeiras c
      WHERE c.empresa_id = emp.id AND c.nome = 'Fornecedores' AND c.tipo = 'pagar' AND c.parent_id = v_parent
    ) THEN
      INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo, parent_id)
      VALUES (emp.id, 'Fornecedores', 'pagar', v_parent);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tg_empresa_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  parent_id UUID;
  cat RECORD;
  sub TEXT;
  defaults JSONB := '[
    {"tipo":"receber","nome":"Vendas","subs":["Vendas de produtos","Vendas de serviços","Vendas online","Vendas no balcão"]},
    {"tipo":"receber","nome":"Prestação de serviços","subs":["Consultoria","Manutenção","Assinaturas / Mensalidades"]},
    {"tipo":"receber","nome":"Financeiras","subs":["Rendimentos de aplicação","Juros recebidos","Descontos obtidos"]},
    {"tipo":"receber","nome":"Outras receitas","subs":["Reembolsos","Venda de ativo","Doações recebidas"]},
    {"tipo":"pagar","nome":"Estoque","subs":["Fornecedores"]},
    {"tipo":"pagar","nome":"Fornecedores","subs":["Compra de mercadorias","Matéria-prima","Insumos","Embalagens"]},
    {"tipo":"pagar","nome":"Folha de pagamento","subs":["Salários","Pró-labore","Encargos (INSS/FGTS)","Benefícios (VT/VR)","Férias e 13º"]},
    {"tipo":"pagar","nome":"Impostos e taxas","subs":["Simples Nacional","ICMS","ISS","PIS/COFINS","IRPJ/CSLL","Taxas municipais"]},
    {"tipo":"pagar","nome":"Ocupação","subs":["Aluguel","Condomínio","IPTU","Energia elétrica","Água e esgoto","Internet e telefonia"]},
    {"tipo":"pagar","nome":"Marketing e vendas","subs":["Anúncios online","Material gráfico","Comissões","Brindes e patrocínios"]},
    {"tipo":"pagar","nome":"Administrativas","subs":["Material de escritório","Software / Assinaturas","Contabilidade","Serviços jurídicos","Limpeza e conservação"]},
    {"tipo":"pagar","nome":"Logística","subs":["Frete","Combustível","Manutenção de veículos","Correios / Transportadoras"]},
    {"tipo":"pagar","nome":"Financeiras","subs":["Tarifas bancárias","Juros pagos","IOF","Empréstimos / Financiamentos"]},
    {"tipo":"pagar","nome":"Outras despesas","subs":["Viagens","Alimentação","Treinamentos","Diversos"]}
  ]'::jsonb;
BEGIN
  FOR cat IN SELECT * FROM jsonb_array_elements(defaults) LOOP
    INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo, parent_id)
    VALUES (NEW.id, cat.value->>'nome', (cat.value->>'tipo')::lancamento_tipo, NULL)
    RETURNING id INTO parent_id;

    FOR sub IN SELECT jsonb_array_elements_text(cat.value->'subs') LOOP
      INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo, parent_id)
      VALUES (NEW.id, sub, (cat.value->>'tipo')::lancamento_tipo, parent_id);
    END LOOP;
  END LOOP;

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
END;
$function$;