-- Persistência compartilhada para filtros salvos e trilha de auditoria.
CREATE TABLE IF NOT EXISTS public.filtros_salvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (char_length(trim(nome)) BETWEEN 1 AND 100),
  modulo TEXT NOT NULL,
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id, modulo, nome)
);

CREATE TABLE IF NOT EXISTS public.auditoria_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id UUID,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.filtros_salvos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS filtros_salvos_empresa ON public.filtros_salvos;
CREATE POLICY filtros_salvos_empresa ON public.filtros_salvos
  FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id) AND user_id = auth.uid())
  WITH CHECK (public.is_empresa_member(empresa_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS auditoria_eventos_empresa_select ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_empresa_select ON public.auditoria_eventos
  FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id));

DROP POLICY IF EXISTS auditoria_eventos_empresa_insert ON public.auditoria_eventos;
CREATE POLICY auditoria_eventos_empresa_insert ON public.auditoria_eventos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_empresa_member(empresa_id) AND user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.filtros_salvos TO authenticated;
GRANT SELECT, INSERT ON public.auditoria_eventos TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_filtro_salvo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS filtros_salvos_updated_at ON public.filtros_salvos;
CREATE TRIGGER filtros_salvos_updated_at
  BEFORE UPDATE ON public.filtros_salvos
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_filtro_salvo_updated_at();

REVOKE EXECUTE ON FUNCTION public.atualizar_filtro_salvo_updated_at() FROM PUBLIC, anon, authenticated;
