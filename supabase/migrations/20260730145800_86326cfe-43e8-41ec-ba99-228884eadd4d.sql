CREATE TABLE IF NOT EXISTS public.centros_custo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo TEXT,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.centros_custo TO authenticated;
GRANT ALL ON public.centros_custo TO service_role;

ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centros_custo_all_members" ON public.centros_custo
  FOR ALL TO authenticated
  USING (private.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (private.is_empresa_member(empresa_id, auth.uid()));

CREATE INDEX IF NOT EXISTS centros_custo_empresa_idx ON public.centros_custo(empresa_id);

DROP TRIGGER IF EXISTS trg_centros_custo_updated ON public.centros_custo;
CREATE TRIGGER trg_centros_custo_updated BEFORE UPDATE ON public.centros_custo
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS centro_custo_id UUID REFERENCES public.centros_custo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS lanc_fin_centro_custo_idx ON public.lancamentos_financeiros(centro_custo_id);

-- created_by é sempre definido pelo servidor e imutável
CREATE OR REPLACE FUNCTION private.tg_lanc_set_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.tg_lanc_set_created_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lanc_set_created_by ON public.lancamentos_financeiros;
CREATE TRIGGER trg_lanc_set_created_by
  BEFORE INSERT OR UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION private.tg_lanc_set_created_by();

-- Perfis: colegas da mesma empresa podem ver nome/avatar
CREATE OR REPLACE FUNCTION private.shares_empresa(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_users eu1
    JOIN public.empresa_users eu2 ON eu1.empresa_id = eu2.empresa_id
    WHERE eu1.user_id = _a AND eu2.user_id = _b
  );
$$;

REVOKE ALL ON FUNCTION private.shares_empresa(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.shares_empresa(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS profiles_select_colegas ON public.profiles;
CREATE POLICY profiles_select_colegas ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.shares_empresa(auth.uid(), id));