
-- ============================================================
-- CONDIÇÕES DE PAGAMENTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.condicoes_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  parcelas INT NOT NULL DEFAULT 1 CHECK (parcelas >= 1 AND parcelas <= 36),
  intervalo_dias INT NOT NULL DEFAULT 30 CHECK (intervalo_dias >= 0),
  entrada BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condicoes_pagamento TO authenticated;
GRANT ALL ON public.condicoes_pagamento TO service_role;
ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros veem condicoes" ON public.condicoes_pagamento FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()));
CREATE POLICY "admins gerenciam condicoes" ON public.condicoes_pagamento FOR ALL TO authenticated
  USING (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','financeiro']::app_role[]))
  WITH CHECK (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','financeiro']::app_role[]));
CREATE TRIGGER trg_condicoes_pagamento_updated BEFORE UPDATE ON public.condicoes_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================
-- DEPÓSITOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.depositos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  padrao BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depositos TO authenticated;
GRANT ALL ON public.depositos TO service_role;
ALTER TABLE public.depositos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros veem depositos" ON public.depositos FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()));
CREATE POLICY "admins gerenciam depositos" ON public.depositos FOR ALL TO authenticated
  USING (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','estoque']::app_role[]))
  WITH CHECK (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','estoque']::app_role[]));
CREATE TRIGGER trg_depositos_updated BEFORE UPDATE ON public.depositos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================
-- NF-e CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfe_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  ambiente TEXT NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  serie INT NOT NULL DEFAULT 1,
  proximo_numero INT NOT NULL DEFAULT 1,
  regime_tributario TEXT NOT NULL DEFAULT 'simples',
  cnae TEXT,
  natureza_operacao TEXT DEFAULT 'Venda de mercadoria',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_config TO authenticated;
GRANT ALL ON public.nfe_config TO service_role;
ALTER TABLE public.nfe_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros veem nfe_config" ON public.nfe_config FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()));
CREATE POLICY "admins gerenciam nfe_config" ON public.nfe_config FOR ALL TO authenticated
  USING (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::app_role[]))
  WITH CHECK (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::app_role[]));
CREATE TRIGGER trg_nfe_config_updated BEFORE UPDATE ON public.nfe_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============================================================
-- ALERTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  severidade TEXT NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','warning','critical')),
  lido BOOLEAN NOT NULL DEFAULT false,
  ref_tabela TEXT,
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros gerenciam alertas" ON public.alertas FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

-- ============================================================
-- Ajustes em tabelas existentes
-- ============================================================
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS numero INT;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS condicao_pagamento_id UUID REFERENCES public.condicoes_pagamento(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_numero_empresa ON public.vendas(empresa_id, numero) WHERE numero IS NOT NULL;

ALTER TABLE public.venda_itens ADD COLUMN IF NOT EXISTS desconto_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC(15,3) NOT NULL DEFAULT 0;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_custo NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.movimentacoes_estoque ADD COLUMN IF NOT EXISTS deposito_id UUID REFERENCES public.depositos(id) ON DELETE SET NULL;

-- ============================================================
-- Numeração automática de vendas
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_venda_numero()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE prox INT;
BEGIN
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(numero),0)+1 INTO prox FROM public.vendas WHERE empresa_id = NEW.empresa_id;
    NEW.numero := prox;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_vendas_numero ON public.vendas;
CREATE TRIGGER trg_vendas_numero BEFORE INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.tg_venda_numero();

-- ============================================================
-- Atualização de estoque em movimentações
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_movimentacao_atualiza_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE delta NUMERIC(15,3); prod_estoque_min NUMERIC; prod_estoque_novo NUMERIC; prod_nome TEXT;
BEGIN
  IF NEW.tipo IN ('entrada','ajuste_positivo') THEN
    delta := NEW.quantidade;
  ELSIF NEW.tipo IN ('saida','ajuste_negativo') THEN
    delta := -NEW.quantidade;
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
DROP TRIGGER IF EXISTS trg_mov_estoque ON public.movimentacoes_estoque;
CREATE TRIGGER trg_mov_estoque AFTER INSERT ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.tg_movimentacao_atualiza_estoque();

-- ============================================================
-- Faturamento de venda: baixa estoque + gera contas a receber + cria NF pendente
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_venda_faturada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  cond RECORD;
  i INT;
  valor_parcela NUMERIC(15,2);
  data_venc DATE;
  categoria_id_receita UUID;
  nfe_serie INT;
  nfe_num INT;
BEGIN
  IF NEW.status = 'faturado' AND (OLD.status IS DISTINCT FROM 'faturado') THEN
    -- Baixa de estoque
    FOR item IN SELECT * FROM public.venda_itens WHERE venda_id = NEW.id LOOP
      INSERT INTO public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, valor_unitario, observacao, referencia_id, referencia_tipo, created_by)
      VALUES (NEW.empresa_id, item.produto_id, 'saida', item.quantidade, item.valor_unitario,
              'Venda #'||NEW.numero, NEW.id, 'venda', NEW.created_by);
    END LOOP;

    -- Categoria receita default
    SELECT id INTO categoria_id_receita FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'receita' ORDER BY created_at LIMIT 1;

    -- Parcelas
    SELECT COALESCE(parcelas,1) AS parcelas, COALESCE(intervalo_dias,30) AS intervalo_dias
    INTO cond
    FROM public.condicoes_pagamento WHERE id = NEW.condicao_pagamento_id;
    IF cond IS NULL THEN cond := ROW(1, 30); END IF;

    valor_parcela := ROUND(NEW.valor_total::numeric / GREATEST(cond.parcelas,1), 2);
    FOR i IN 1..cond.parcelas LOOP
      data_venc := (COALESCE(NEW.data_venda, CURRENT_DATE) + (cond.intervalo_dias * i))::date;
      INSERT INTO public.lancamentos_financeiros
        (empresa_id, tipo, descricao, valor, data_vencimento, status, contato_id, categoria_id, referencia_id, referencia_tipo, created_by)
      VALUES
        (NEW.empresa_id, 'receber',
         'Venda #'||NEW.numero||' - Parc. '||i||'/'||cond.parcelas,
         valor_parcela, data_venc, 'aberto', NEW.contato_id, categoria_id_receita, NEW.id, 'venda', NEW.created_by);
    END LOOP;

    -- Nota fiscal pendente
    SELECT COALESCE(serie,1), COALESCE(proximo_numero,1) INTO nfe_serie, nfe_num
      FROM public.nfe_config WHERE empresa_id = NEW.empresa_id;
    IF nfe_serie IS NULL THEN nfe_serie := 1; nfe_num := 1; END IF;

    INSERT INTO public.notas_fiscais (empresa_id, venda_id, contato_id, tipo, status, numero, serie, valor_total, natureza_operacao, created_by)
    VALUES (NEW.empresa_id, NEW.id, NEW.contato_id, 'nfe', 'pendente', nfe_num, nfe_serie, NEW.valor_total, 'Venda de mercadoria', NEW.created_by);

    UPDATE public.nfe_config SET proximo_numero = nfe_num + 1 WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_venda_faturada ON public.vendas;
CREATE TRIGGER trg_venda_faturada AFTER UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.tg_venda_faturada();

-- ============================================================
-- Setup automático para nova empresa
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_empresa_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Categorias financeiras padrão
  INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo) VALUES
    (NEW.id, 'Vendas de produtos', 'receita'),
    (NEW.id, 'Vendas de serviços', 'receita'),
    (NEW.id, 'Outras receitas', 'receita'),
    (NEW.id, 'Fornecedores', 'despesa'),
    (NEW.id, 'Folha de pagamento', 'despesa'),
    (NEW.id, 'Impostos', 'despesa'),
    (NEW.id, 'Aluguel', 'despesa'),
    (NEW.id, 'Marketing', 'despesa'),
    (NEW.id, 'Outras despesas', 'despesa')
  ON CONFLICT DO NOTHING;

  -- Condições de pagamento padrão
  INSERT INTO public.condicoes_pagamento (empresa_id, nome, parcelas, intervalo_dias) VALUES
    (NEW.id, 'À vista', 1, 0),
    (NEW.id, '30 dias', 1, 30),
    (NEW.id, '30/60 dias', 2, 30),
    (NEW.id, '30/60/90 dias', 3, 30),
    (NEW.id, '3x sem juros', 3, 30),
    (NEW.id, '6x sem juros', 6, 30),
    (NEW.id, '12x sem juros', 12, 30)
  ON CONFLICT DO NOTHING;

  -- Depósito padrão
  INSERT INTO public.depositos (empresa_id, nome, padrao) VALUES (NEW.id, 'Depósito Principal', true) ON CONFLICT DO NOTHING;

  -- Config NFe
  INSERT INTO public.nfe_config (empresa_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_empresa_defaults ON public.empresas;
CREATE TRIGGER trg_empresa_defaults AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.tg_empresa_defaults();

-- ============================================================
-- Backfill de defaults para empresas já existentes
-- ============================================================
DO $$
DECLARE emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM public.empresas LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE empresa_id = emp.id) THEN
      INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo) VALUES
        (emp.id, 'Vendas de produtos', 'receita'),
        (emp.id, 'Vendas de serviços', 'receita'),
        (emp.id, 'Outras receitas', 'receita'),
        (emp.id, 'Fornecedores', 'despesa'),
        (emp.id, 'Folha de pagamento', 'despesa'),
        (emp.id, 'Impostos', 'despesa'),
        (emp.id, 'Aluguel', 'despesa'),
        (emp.id, 'Marketing', 'despesa'),
        (emp.id, 'Outras despesas', 'despesa');
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
