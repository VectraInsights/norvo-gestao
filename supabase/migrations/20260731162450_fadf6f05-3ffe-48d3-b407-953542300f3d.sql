-- =========================
-- TRANSFERENCIAS ENTRE CONTAS
-- =========================
CREATE TABLE public.transferencias_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT current_date,
  conta_origem_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  conta_destino_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  descricao text NOT NULL DEFAULT 'Transferência entre contas',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transferencia_contas_distintas CHECK (conta_origem_id <> conta_destino_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transferencias_contas TO authenticated;
GRANT ALL ON public.transferencias_contas TO service_role;
ALTER TABLE public.transferencias_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam transferencias" ON public.transferencias_contas
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_transferencias_updated BEFORE UPDATE ON public.transferencias_contas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS transferencia_id uuid REFERENCES public.transferencias_contas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_lanc_transferencia ON public.lancamentos_financeiros(transferencia_id);

-- =========================
-- EMPRESTIMOS / FINANCIAMENTOS
-- =========================
CREATE TYPE public.emprestimo_tipo AS ENUM ('emprestimo','financiamento');
CREATE TYPE public.emprestimo_status AS ENUM ('ativo','quitado','cancelado');
CREATE TYPE public.parcela_status AS ENUM ('aberta','paga','cancelada');

CREATE TABLE public.emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.emprestimo_tipo NOT NULL DEFAULT 'emprestimo',
  descricao text NOT NULL,
  credor text,
  valor_principal numeric(14,2) NOT NULL DEFAULT 0,
  taxa_juros_mensal numeric(8,4) NOT NULL DEFAULT 0,
  parcelas int NOT NULL DEFAULT 1 CHECK (parcelas > 0),
  data_contratacao date NOT NULL DEFAULT current_date,
  primeiro_vencimento date,
  conta_credito_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  categoria_id uuid REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  status public.emprestimo_status NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimos TO authenticated;
GRANT ALL ON public.emprestimos TO service_role;
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam emprestimos" ON public.emprestimos
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_emprestimos_updated BEFORE UPDATE ON public.emprestimos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.emprestimo_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  emprestimo_id uuid NOT NULL REFERENCES public.emprestimos(id) ON DELETE CASCADE,
  numero int NOT NULL,
  data_vencimento date NOT NULL,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  valor_juros numeric(14,2) NOT NULL DEFAULT 0,
  valor_amortizacao numeric(14,2) NOT NULL DEFAULT 0,
  status public.parcela_status NOT NULL DEFAULT 'aberta',
  lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emprestimo_id, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimo_parcelas TO authenticated;
GRANT ALL ON public.emprestimo_parcelas TO service_role;
ALTER TABLE public.emprestimo_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam parcelas de emprestimos" ON public.emprestimo_parcelas
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_emprestimo_parcelas_updated BEFORE UPDATE ON public.emprestimo_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================
-- DP: COMISSOES
-- =========================
CREATE TYPE public.comissao_status AS ENUM ('prevista','aprovada','paga','cancelada');

CREATE TABLE public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  venda_id uuid REFERENCES public.vendas(id) ON DELETE SET NULL,
  competencia date NOT NULL DEFAULT date_trunc('month', current_date)::date,
  descricao text,
  base_valor numeric(14,2) NOT NULL DEFAULT 0,
  percentual numeric(8,4) NOT NULL DEFAULT 0,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  status public.comissao_status NOT NULL DEFAULT 'prevista',
  lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissoes TO authenticated;
GRANT ALL ON public.comissoes TO service_role;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam comissoes" ON public.comissoes
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_comissoes_updated BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================
-- DP: ADIANTAMENTOS
-- =========================
CREATE TYPE public.adiantamento_status AS ENUM ('aberto','descontado','cancelado');

CREATE TABLE public.adiantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT current_date,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  motivo text,
  parcelas_desconto int NOT NULL DEFAULT 1 CHECK (parcelas_desconto > 0),
  status public.adiantamento_status NOT NULL DEFAULT 'aberto',
  lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adiantamentos TO authenticated;
GRANT ALL ON public.adiantamentos TO service_role;
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam adiantamentos" ON public.adiantamentos
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_adiantamentos_updated BEFORE UPDATE ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();