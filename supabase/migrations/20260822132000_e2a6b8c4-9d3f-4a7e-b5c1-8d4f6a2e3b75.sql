-- Frota & Viagens (núcleo operacional da transportadora)
DO $$ BEGIN
  CREATE TYPE public.veiculo_status AS ENUM ('ativo','manutencao','inativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.viagem_status AS ENUM ('planejada','em_transito','concluida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.veiculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  placa TEXT NOT NULL,
  marca_modelo TEXT,
  tipo TEXT,
  ano INT,
  rntrc TEXT,
  km_atual NUMERIC(12,1) DEFAULT 0,
  status public.veiculo_status NOT NULL DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX veiculos_empresa_placa_idx ON public.veiculos(empresa_id, upper(placa));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculos TO authenticated;
GRANT ALL ON public.veiculos TO service_role;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veiculos_all_members" ON public.veiculos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_veiculos BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.viagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  motorista_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  origem_cidade TEXT,
  origem_uf TEXT,
  destino_cidade TEXT,
  destino_uf TEXT,
  data_saida DATE,
  data_chegada DATE,
  valor_frete NUMERIC(15,2) NOT NULL DEFAULT 0,
  km_rodado NUMERIC(12,1),
  status public.viagem_status NOT NULL DEFAULT 'planejada',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_viagens_empresa_status ON public.viagens(empresa_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagens TO authenticated;
GRANT ALL ON public.viagens TO service_role;
ALTER TABLE public.viagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viagens_all_members" ON public.viagens FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_viagens BEFORE UPDATE ON public.viagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.viagem_despesas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'outros',
  descricao TEXT,
  valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_viagem_despesas_viagem ON public.viagem_despesas(viagem_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_despesas TO authenticated;
GRANT ALL ON public.viagem_despesas TO service_role;
ALTER TABLE public.viagem_despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viagem_despesas_all_members" ON public.viagem_despesas FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

-- Despesa da viagem -> conta a pagar automática
CREATE OR REPLACE FUNCTION public.tg_viagem_despesa_pagar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  vid RECORD; cat_id UUID; lac UUID; rotulo TEXT;
BEGIN
  SELECT origem_cidade, destino_cidade INTO vid FROM public.viagens WHERE id = NEW.viagem_id;
  rotulo := COALESCE(vid.origem_cidade,'?') || '→' || COALESCE(vid.destino_cidade,'?');

  SELECT id INTO cat_id FROM public.categorias_financeiras
    WHERE empresa_id = NEW.empresa_id AND tipo = 'pagar'
      AND (nome ILIKE '%combust%' OR nome ILIKE '%frota%' OR nome ILIKE '%transporte%')
    ORDER BY created_at LIMIT 1;
  IF cat_id IS NULL THEN
    SELECT id INTO cat_id FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'pagar' ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.lancamentos_financeiros
    (empresa_id, tipo, descricao, valor, data_vencimento, status, categoria_id)
  VALUES
    (NEW.empresa_id, 'pagar',
     'Viagem ' || rotulo || ' — ' || COALESCE(NULLIF(NEW.descricao,''), NEW.tipo),
     NEW.valor, NEW.data, 'aberto', cat_id)
  RETURNING id INTO lac;

  UPDATE public.viagem_despesas SET lancamento_id = lac WHERE id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_viagem_despesa ON public.viagem_despesas;
CREATE TRIGGER trg_viagem_despesa AFTER INSERT ON public.viagem_despesas
  FOR EACH ROW WHEN (NEW.lancamento_id IS NULL)
  EXECUTE FUNCTION public.tg_viagem_despesa_pagar();
REVOKE EXECUTE ON FUNCTION public.tg_viagem_despesa_pagar() FROM PUBLIC, anon, authenticated;

-- Viagem concluída -> receita (frete) automática
CREATE OR REPLACE FUNCTION public.tg_viagem_receita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cat_id UUID;
BEGIN
  IF NEW.valor_frete > 0 THEN
    SELECT id INTO cat_id FROM public.categorias_financeiras
      WHERE empresa_id = NEW.empresa_id AND tipo = 'receber' ORDER BY created_at LIMIT 1;

    INSERT INTO public.lancamentos_financeiros
      (empresa_id, tipo, descricao, valor, data_vencimento, status, contato_id, categoria_id)
    VALUES
      (NEW.empresa_id, 'receber',
       'Frete ' || COALESCE(NEW.origem_cidade,'?') || '→' || COALESCE(NEW.destino_cidade,'?'),
       NEW.valor_frete, COALESCE(NEW.data_chegada, CURRENT_DATE), 'aberto',
       NEW.cliente_id, cat_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_viagem_concluir ON public.viagens;
CREATE TRIGGER trg_viagem_concluir AFTER UPDATE ON public.viagens
  FOR EACH ROW
  WHEN (NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida')
  EXECUTE FUNCTION public.tg_viagem_receita();
REVOKE EXECUTE ON FUNCTION public.tg_viagem_receita() FROM PUBLIC, anon, authenticated;
