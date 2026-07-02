
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('owner','admin','financeiro','vendas','estoque','fiscal','viewer');
CREATE TYPE public.contato_tipo AS ENUM ('cliente','fornecedor','ambos','transportadora');
CREATE TYPE public.lancamento_tipo AS ENUM ('receber','pagar');
CREATE TYPE public.lancamento_status AS ENUM ('aberto','pago','parcial','vencido','cancelado');
CREATE TYPE public.venda_status AS ENUM ('rascunho','proposta','pedido','faturado','cancelado');
CREATE TYPE public.estoque_movimento AS ENUM ('entrada','saida','ajuste','transferencia');
CREATE TYPE public.nf_tipo AS ENUM ('nfe','nfse','nfce');
CREATE TYPE public.nf_status AS ENUM ('rascunho','emitida','autorizada','cancelada','rejeitada');

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- =========================================
-- EMPRESAS + MEMBROS
-- =========================================
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT,
  ie TEXT,
  regime_tributario TEXT,
  email TEXT,
  telefone TEXT,
  logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT,
  cidade TEXT, uf TEXT, cep TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.empresa_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_users TO authenticated;
GRANT ALL ON public.empresa_users TO service_role;
ALTER TABLE public.empresa_users ENABLE ROW LEVEL SECURITY;

-- Funções de autorização (SECURITY DEFINER) para evitar recursão de RLS
CREATE OR REPLACE FUNCTION public.is_empresa_member(_empresa UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.empresa_users WHERE empresa_id = _empresa AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_empresa_role(_empresa UUID, _user UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_users
    WHERE empresa_id = _empresa AND user_id = _user AND role = ANY(_roles)
  );
$$;

CREATE POLICY "empresas_select_members" ON public.empresas FOR SELECT TO authenticated
  USING (public.is_empresa_member(id, auth.uid()));
CREATE POLICY "empresas_insert_own" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "empresas_update_admins" ON public.empresas FOR UPDATE TO authenticated
  USING (public.has_empresa_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "empresas_delete_owner" ON public.empresas FOR DELETE TO authenticated
  USING (public.has_empresa_role(id, auth.uid(), ARRAY['owner']::public.app_role[]));

CREATE POLICY "empresa_users_select_members" ON public.empresa_users FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()));
CREATE POLICY "empresa_users_manage_admins" ON public.empresa_users FOR ALL TO authenticated
  USING (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- Ao criar uma empresa, o criador vira owner automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_empresa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.empresa_users (empresa_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_empresa_created AFTER INSERT ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.handle_new_empresa();

-- Auto-criar profile ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, avatar_url)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper de updated_at
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_empresas BEFORE UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================
-- CONTATOS (clientes/fornecedores)
-- =========================================
CREATE TABLE public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.contato_tipo NOT NULL DEFAULT 'cliente',
  nome TEXT NOT NULL,
  documento TEXT,           -- CPF/CNPJ
  email TEXT,
  telefone TEXT,
  logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT,
  cidade TEXT, uf TEXT, cep TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contatos(empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;
GRANT ALL ON public.contatos TO service_role;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contatos_all_members" ON public.contatos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_contatos BEFORE UPDATE ON public.contatos
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================
-- PRODUTOS
-- =========================================
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo TEXT,
  nome TEXT NOT NULL,
  descricao TEXT,
  unidade TEXT DEFAULT 'UN',
  preco_venda NUMERIC(14,2) DEFAULT 0,
  preco_custo NUMERIC(14,2) DEFAULT 0,
  estoque_atual NUMERIC(14,3) DEFAULT 0,
  estoque_minimo NUMERIC(14,3) DEFAULT 0,
  ncm TEXT,
  cfop TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.produtos(empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_all_members" ON public.produtos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_produtos BEFORE UPDATE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================
-- FINANCEIRO: contas bancárias, categorias, lançamentos
-- =========================================
CREATE TABLE public.contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_atual NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contas_bancarias(empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_bancarias TO authenticated;
GRANT ALL ON public.contas_bancarias TO service_role;
ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contas_bancarias_all_members" ON public.contas_bancarias FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_contas_bancarias BEFORE UPDATE ON public.contas_bancarias
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.categorias_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo public.lancamento_tipo NOT NULL,
  cor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.categorias_financeiras(empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_financeiras TO authenticated;
GRANT ALL ON public.categorias_financeiras TO service_role;
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_fin_all_members" ON public.categorias_financeiras FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TABLE public.lancamentos_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.lancamento_tipo NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL,
  valor_pago NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status public.lancamento_status NOT NULL DEFAULT 'aberto',
  contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  categoria_id UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  conta_bancaria_id UUID REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  documento TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.lancamentos_financeiros(empresa_id, data_vencimento);
CREATE INDEX ON public.lancamentos_financeiros(empresa_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos_financeiros TO authenticated;
GRANT ALL ON public.lancamentos_financeiros TO service_role;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lanc_fin_all_members" ON public.lancamentos_financeiros FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_lanc_fin BEFORE UPDATE ON public.lancamentos_financeiros
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =========================================
-- VENDAS
-- =========================================
CREATE TABLE public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero SERIAL,
  cliente_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  status public.venda_status NOT NULL DEFAULT 'rascunho',
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  data_validade DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
  frete NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  vendedor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vendas(empresa_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendas_all_members" ON public.vendas FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_vendas BEFORE UPDATE ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.venda_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(14,3) NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.venda_itens(venda_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_itens TO authenticated;
GRANT ALL ON public.venda_itens TO service_role;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venda_itens_all_members" ON public.venda_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND public.is_empresa_member(v.empresa_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND public.is_empresa_member(v.empresa_id, auth.uid())));

-- =========================================
-- ESTOQUE (movimentações)
-- =========================================
CREATE TABLE public.movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo public.estoque_movimento NOT NULL,
  quantidade NUMERIC(14,3) NOT NULL,
  custo_unitario NUMERIC(14,2),
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacoes TEXT,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.movimentacoes_estoque(empresa_id, produto_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_estoque TO authenticated;
GRANT ALL ON public.movimentacoes_estoque TO service_role;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_estoque_all_members" ON public.movimentacoes_estoque FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

-- =========================================
-- NOTAS FISCAIS
-- =========================================
CREATE TABLE public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.nf_tipo NOT NULL DEFAULT 'nfe',
  numero TEXT,
  serie TEXT,
  chave TEXT,
  status public.nf_status NOT NULL DEFAULT 'rascunho',
  contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  data_emissao TIMESTAMPTZ,
  valor_total NUMERIC(14,2) DEFAULT 0,
  xml_url TEXT,
  pdf_url TEXT,
  mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notas_fiscais(empresa_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_fiscais TO authenticated;
GRANT ALL ON public.notas_fiscais TO service_role;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nf_all_members" ON public.notas_fiscais FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_nf BEFORE UPDATE ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
