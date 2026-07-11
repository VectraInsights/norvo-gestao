
-- Enum de status
DO $$ BEGIN
  CREATE TYPE public.oc_status AS ENUM ('rascunho','enviada','recebida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela principal
CREATE TABLE public.ordens_compra (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero INT,
  fornecedor_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prevista DATE,
  status public.oc_status NOT NULL DEFAULT 'rascunho',
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  deposito_id UUID REFERENCES public.depositos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_compra TO authenticated;
GRANT ALL ON public.ordens_compra TO service_role;
ALTER TABLE public.ordens_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros gerenciam ordens_compra"
  ON public.ordens_compra FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER touch_ordens_compra
  BEFORE UPDATE ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Itens
CREATE TABLE public.ordens_compra_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_id UUID NOT NULL REFERENCES public.ordens_compra(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade NUMERIC(15,3) NOT NULL DEFAULT 1,
  custo_unitario NUMERIC(15,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_compra_itens TO authenticated;
GRANT ALL ON public.ordens_compra_itens TO service_role;
ALTER TABLE public.ordens_compra_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros gerenciam itens da OC"
  ON public.ordens_compra_itens FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordens_compra o
    WHERE o.id = ordem_id AND public.is_empresa_member(o.empresa_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ordens_compra o
    WHERE o.id = ordem_id AND public.is_empresa_member(o.empresa_id, auth.uid())
  ));

-- Numeração automática
CREATE OR REPLACE FUNCTION public.tg_oc_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE prox INT;
BEGIN
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(numero),0)+1 INTO prox
      FROM public.ordens_compra WHERE empresa_id = NEW.empresa_id;
    NEW.numero := prox;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER set_oc_numero BEFORE INSERT ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.tg_oc_numero();

-- Recalcular total automaticamente
CREATE OR REPLACE FUNCTION public.tg_oc_recalc_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE oid UUID;
BEGIN
  oid := COALESCE(NEW.ordem_id, OLD.ordem_id);
  UPDATE public.ordens_compra
    SET total = COALESCE((SELECT SUM(subtotal) FROM public.ordens_compra_itens WHERE ordem_id = oid),0)
    WHERE id = oid;
  RETURN NULL;
END; $$;

CREATE TRIGGER oc_itens_total
  AFTER INSERT OR UPDATE OR DELETE ON public.ordens_compra_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_oc_recalc_total();

-- Ao receber: entrada em estoque + lançamento a pagar
CREATE OR REPLACE FUNCTION public.tg_oc_recebida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item RECORD;
  cat_id UUID;
BEGIN
  IF NEW.status = 'recebida' AND (OLD.status IS DISTINCT FROM 'recebida') THEN
    FOR item IN SELECT * FROM public.ordens_compra_itens WHERE ordem_id = NEW.id LOOP
      INSERT INTO public.movimentacoes_estoque
        (empresa_id, produto_id, tipo, quantidade, custo_unitario, observacoes)
      VALUES (NEW.empresa_id, item.produto_id, 'entrada', item.quantidade, item.custo_unitario,
              'OC #'||NEW.numero);
    END LOOP;

    SELECT id INTO cat_id FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'pagar' AND nome ILIKE '%fornecedor%'
      ORDER BY created_at LIMIT 1;
    IF cat_id IS NULL THEN
      SELECT id INTO cat_id FROM public.categorias_financeiras
        WHERE empresa_id = NEW.empresa_id AND tipo = 'pagar' ORDER BY created_at LIMIT 1;
    END IF;

    INSERT INTO public.lancamentos_financeiros
      (empresa_id, tipo, descricao, valor, data_vencimento, status, contato_id, categoria_id, conta_bancaria_id)
    VALUES (NEW.empresa_id, 'pagar',
            'OC #'||NEW.numero||COALESCE(' - '||(SELECT nome FROM public.contatos WHERE id=NEW.fornecedor_id),''),
            NEW.total,
            COALESCE(NEW.data_prevista, CURRENT_DATE),
            'aberto', NEW.fornecedor_id, cat_id, NEW.conta_bancaria_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER oc_receber AFTER UPDATE ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.tg_oc_recebida();
