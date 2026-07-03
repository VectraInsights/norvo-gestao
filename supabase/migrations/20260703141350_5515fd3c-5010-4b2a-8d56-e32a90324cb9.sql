
CREATE TABLE public.ofx_transacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_bancaria_id UUID NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE CASCADE,
  fitid TEXT NOT NULL,
  data_transacao DATE NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  tipo TEXT NOT NULL,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conta_bancaria_id, fitid)
);

CREATE INDEX ofx_transacoes_empresa_idx ON public.ofx_transacoes(empresa_id);
CREATE INDEX ofx_transacoes_conta_idx ON public.ofx_transacoes(conta_bancaria_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ofx_transacoes TO authenticated;
GRANT ALL ON public.ofx_transacoes TO service_role;

ALTER TABLE public.ofx_transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ofx_all_members" ON public.ofx_transacoes
  FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER touch_ofx BEFORE UPDATE ON public.ofx_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
