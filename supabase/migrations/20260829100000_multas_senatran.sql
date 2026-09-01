-- Controle de multas de trânsito (integração SENATRAN + cadastro manual)
-- 1) RENAVAM no veículo (identificador usado na consulta SENATRAN)
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS renavam TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS veiculos_empresa_renavam_idx
  ON public.veiculos(empresa_id, renavam) WHERE renavam IS NOT NULL;

-- 2) Status da multa
DO $$ BEGIN
  CREATE TYPE public.multa_status AS ENUM ('aberta','paga','contestada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Multas (autos de infração)
CREATE TABLE public.multas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  placa TEXT NOT NULL,
  renavam TEXT,
  orgao_autuador TEXT,
  auto_infracao TEXT,
  data_infracao DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_vencimento DATE,
  pontos INT,
  status public.multa_status NOT NULL DEFAULT 'aberta',
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','senatran')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX multas_empresa_auto_infracao_key
  ON public.multas(empresa_id, auto_infracao) WHERE auto_infracao IS NOT NULL;
CREATE INDEX multas_empresa_status_idx ON public.multas(empresa_id, status);
CREATE INDEX multas_empresa_placa_idx ON public.multas(empresa_id, upper(placa));
CREATE INDEX multas_empresa_vencimento_idx ON public.multas(empresa_id, data_vencimento);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.multas TO authenticated;
GRANT ALL ON public.multas TO service_role;
ALTER TABLE public.multas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "multas_all_members" ON public.multas FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER touch_multas BEFORE UPDATE ON public.multas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 4) Configuração da integração SENATRAN (acesso SOMENTE via service_role; sem RLS p/ anon/authenticated)
CREATE TABLE public.multas_config (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE PRIMARY KEY,
  endpoint TEXT,
  usuario TEXT,
  senha TEXT,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_sync TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.multas_config TO service_role;
ALTER TABLE public.multas_config ENABLE ROW LEVEL SECURITY;

-- 5) RPC de gravação das autuações vindas da integração (upsert por auto de infração)
CREATE OR REPLACE FUNCTION public.registrar_multas_senatran(p_empresa UUID, p_multas JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m JSONB; n INT := 0;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(p_multas) LOOP
    INSERT INTO public.multas
      (empresa_id, placa, renavam, orgao_autuador, auto_infracao,
       data_infracao, descricao, valor, data_vencimento, pontos, origem)
    VALUES
      (p_empresa,
       upper(COALESCE(m->>'placa','')),
       NULLIF(m->>'renavam',''),
       NULLIF(m->>'orgao_autuador',''),
       NULLIF(m->>'auto_infracao',''),
       COALESCE(NULLIF(m->>'data_infracao','')::date, CURRENT_DATE),
       NULLIF(m->>'descricao',''),
       COALESCE((m->>'valor')::numeric, 0),
       NULLIF(m->>'data_vencimento','')::date,
       (m->>'pontos')::int,
       'senatran')
    ON CONFLICT (empresa_id, auto_infracao) WHERE auto_infracao IS NOT NULL
    DO UPDATE SET
      orgao_autuador = EXCLUDED.orgao_autuador,
      descricao = EXCLUDED.descricao,
      valor = EXCLUDED.valor,
      data_vencimento = EXCLUDED.data_vencimento,
      pontos = EXCLUDED.pontos,
      updated_at = now();
    n := n + 1;
  END LOOP;
  UPDATE public.multas_config SET ultima_sync = now(), updated_at = now()
    WHERE empresa_id = p_empresa;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.registrar_multas_senatran(UUID, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.registrar_multas_senatran(UUID, JSONB) FROM PUBLIC, anon, authenticated;