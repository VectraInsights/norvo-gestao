-- CRM funil
CREATE TABLE IF NOT EXISTS public.crm_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  cor TEXT DEFAULT '#64748b',
  ganho BOOLEAN DEFAULT false,
  perdido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES public.crm_etapas(id) ON DELETE SET NULL,
  contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC(15,2) DEFAULT 0,
  probabilidade INT DEFAULT 50,
  data_prevista DATE,
  status TEXT NOT NULL DEFAULT 'aberta',
  ordem INT NOT NULL DEFAULT 0,
  responsavel_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_etapas TO authenticated;
GRANT ALL ON public.crm_etapas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oportunidades TO authenticated;
GRANT ALL ON public.crm_oportunidades TO service_role;

ALTER TABLE public.crm_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_etapas_membro" ON public.crm_etapas FOR ALL
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE POLICY "crm_oport_membro" ON public.crm_oportunidades FOR ALL
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE TRIGGER trg_crm_etapas_updated BEFORE UPDATE ON public.crm_etapas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_crm_oport_updated BEFORE UPDATE ON public.crm_oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_empresa_crm_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.crm_etapas (empresa_id, nome, ordem, cor, ganho, perdido) VALUES
    (NEW.id, 'Lead',        1, '#64748b', false, false),
    (NEW.id, 'Qualificado', 2, '#3b82f6', false, false),
    (NEW.id, 'Proposta',    3, '#8b5cf6', false, false),
    (NEW.id, 'Negociação',  4, '#f59e0b', false, false),
    (NEW.id, 'Ganho',       5, '#10b981', true,  false),
    (NEW.id, 'Perdido',     6, '#ef4444', false, true);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_empresa_crm_defaults ON public.empresas;
CREATE TRIGGER trg_empresa_crm_defaults AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.tg_empresa_crm_defaults();

INSERT INTO public.crm_etapas (empresa_id, nome, ordem, cor, ganho, perdido)
SELECT e.id, x.nome, x.ordem, x.cor, x.ganho, x.perdido
FROM public.empresas e
CROSS JOIN (VALUES
  ('Lead',1,'#64748b',false,false),
  ('Qualificado',2,'#3b82f6',false,false),
  ('Proposta',3,'#8b5cf6',false,false),
  ('Negociação',4,'#f59e0b',false,false),
  ('Ganho',5,'#10b981',true,false),
  ('Perdido',6,'#ef4444',false,true)
) AS x(nome,ordem,cor,ganho,perdido)
WHERE NOT EXISTS (SELECT 1 FROM public.crm_etapas c WHERE c.empresa_id = e.id);