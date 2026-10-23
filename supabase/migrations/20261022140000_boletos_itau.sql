-- Enum de status de boleto (deve vir antes da tabela que o usa)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'boleto_status') THEN
    CREATE TYPE public.boleto_status AS ENUM ('pendente', 'pago', 'cancelado', 'vencido');
  END IF;
END $$;

-- Tabela de configuração de banco de cobrança por empresa
CREATE TABLE public.bancos_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  banco TEXT NOT NULL DEFAULT 'itau',
  agencia TEXT,
  conta_corrente TEXT,
  codigo_cedente TEXT,
  carteira TEXT,
  modalidade TEXT NOT NULL DEFAULT 'registrado',
  layout_cnab TEXT NOT NULL DEFAULT '240',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bancos_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bancos_config_empresa_members" ON public.bancos_config
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bancos_config TO authenticated;
GRANT ALL ON public.bancos_config TO service_role;
CREATE TRIGGER touch_bancos_config BEFORE UPDATE ON public.bancos_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Tabela de boletos emitidos
CREATE TABLE public.boletos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  cte_id UUID REFERENCES public.cte_documentos(id) ON DELETE SET NULL,
  banco TEXT NOT NULL DEFAULT 'itau',
  nosso_numero TEXT NOT NULL,
  linha_digitavel TEXT,
  codigo_barras TEXT,
  url_pdf TEXT,
  valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  vencimento DATE NOT NULL,
  status public.boleto_status NOT NULL DEFAULT 'pendente',
  id_transacao_banco TEXT,
  data_pagamento TIMESTAMPTZ,
  valor_pago NUMERIC(15,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX boletos_empresa_nosso_numero_idx ON public.boletos(empresa_id, nosso_numero);
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boletos_empresa_members" ON public.boletos
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boletos TO authenticated;
GRANT ALL ON public.boletos TO service_role;
CREATE TRIGGER touch_boletos BEFORE UPDATE ON public.boletos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

COMMENT ON TABLE public.bancos_config IS 'Configuração de banco de cobrança por empresa (Itaú, Sicoob, etc)';
COMMENT ON TABLE public.boletos IS 'Boletos bancários emitidos, vinculados a lançamentos financeiros e/ou CT-es';
