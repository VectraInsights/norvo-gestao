-- Estrutura inicial para emissão de CT-e (57) e MDF-e (58)
-- Fase 1: esqueletos de tabelas + RLS. XML/assinatura/SEFAZ virão na fase 2.
-- Reaproveita certificados_digitais existente (mesmo A1) para autorização.

-- Extensões usadas (se ainda não criadas)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CT-e documentos (Conhecimento de Transporte Eletrônico, modelo 57)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cte_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Identificação
  chave_acesso TEXT UNIQUE,
  numero TEXT,
  serie TEXT DEFAULT '1',
  modelo TEXT DEFAULT '57',
  -- Status workflow: rascunho -> assinado -> autorizado -> cancelado / denegado
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','assinado','autorizado','rejeitado','cancelado','denegado')),
  -- Vinculo com viagem/frota quando houver
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  -- Tomador / remetente / destinatário (snapshot)
  tomador_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  -- Valores
  valor_carga NUMERIC(15,2) DEFAULT 0,
  valor_servico NUMERIC(15,2) DEFAULT 0,
  peso_carga NUMERIC(15,3) DEFAULT 0,
  -- XML e protocolo
  xml_assinado TEXT,
  xml_protocolo TEXT,
  protocolo_sefaz TEXT,
  motivo_rejeicao TEXT,
  -- SEFAZ
  ambiente TEXT DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  data_emissao TIMESTAMPTZ,
  data_autorizacao TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cte_empresa ON public.cte_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cte_status ON public.cte_documentos(status);
CREATE INDEX IF NOT EXISTS idx_cte_chave ON public.cte_documentos(chave_acesso);
ALTER TABLE public.cte_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cte_all_members" ON public.cte_documentos;
CREATE POLICY "cte_all_members" ON public.cte_documentos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

-- ============================================================
-- MDF-e documentos (Manifesto Eletrônico de Documentos Fiscais, modelo 58)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mdf_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  chave_acesso TEXT UNIQUE,
  numero TEXT,
  serie TEXT DEFAULT '1',
  modelo TEXT DEFAULT '58',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','assinado','autorizado','rejeitado','cancelado','encerrado')),
  -- Veículo tração + reboques / motorista
  veiculo_tracao_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  motorista_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  -- UF percurso
  uf_carregamento TEXT,
  uf_descarregamento TEXT,
  -- CT-es vinculados (array de chaves ou ids — fase 2 vira tabela filha mdf_cte_vinculos)
  qtd_cte INTEGER DEFAULT 0,
  valor_total_carga NUMERIC(15,2) DEFAULT 0,
  peso_total NUMERIC(15,3) DEFAULT 0,
  -- XML / protocolo
  xml_assinado TEXT,
  xml_protocolo TEXT,
  protocolo_sefaz TEXT,
  motivo_rejeicao TEXT,
  ambiente TEXT DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  data_emissao TIMESTAMPTZ,
  data_autorizacao TIMESTAMPTZ,
  data_encerramento TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mdf_empresa ON public.mdf_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mdf_status ON public.mdf_documentos(status);
CREATE INDEX IF NOT EXISTS idx_mdf_chave ON public.mdf_documentos(chave_acesso);
ALTER TABLE public.mdf_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mdf_all_members" ON public.mdf_documentos;
CREATE POLICY "mdf_all_members" ON public.mdf_documentos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

-- Tabela filha para vincular CT-es ao MDF-e (N:N futuro)
CREATE TABLE IF NOT EXISTS public.mdf_cte_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mdf_id UUID NOT NULL REFERENCES public.mdf_documentos(id) ON DELETE CASCADE,
  cte_id UUID REFERENCES public.cte_documentos(id) ON DELETE SET NULL,
  chave_cte TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mdf_id, chave_cte)
);
ALTER TABLE public.mdf_cte_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mdf_cte_all_members" ON public.mdf_cte_vinculos;
CREATE POLICY "mdf_cte_all_members" ON public.mdf_cte_vinculos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mdf_documentos m WHERE m.id = mdf_id AND public.is_empresa_member(m.empresa_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mdf_documentos m WHERE m.id = mdf_id AND public.is_empresa_member(m.empresa_id, auth.uid())));

-- Trigger de updated_at genérico
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS touch_cte ON public.cte_documentos;
CREATE TRIGGER touch_cte BEFORE UPDATE ON public.cte_documentos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
DROP TRIGGER IF EXISTS touch_mdf ON public.mdf_documentos;
CREATE TRIGGER touch_mdf BEFORE UPDATE ON public.mdf_documentos FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cte_documentos, public.mdf_documentos, public.mdf_cte_vinculos TO authenticated;
GRANT ALL ON public.cte_documentos, public.mdf_documentos, public.mdf_cte_vinculos TO service_role;
