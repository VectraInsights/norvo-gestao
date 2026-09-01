CREATE TABLE IF NOT EXISTS public.rntrc_lista (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rntrc text NOT NULL,
  descricao text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rntrc_lista ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS rntrc_lista_empresa_rntrc_idx ON public.rntrc_lista (empresa_id, rntrc);

CREATE POLICY "rntrc_lista_empresa_select" ON public.rntrc_lista
  FOR SELECT USING (public.is_empresa_member(empresa_id, auth.uid()));

CREATE POLICY "rntrc_lista_empresa_insert" ON public.rntrc_lista
  FOR INSERT WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));

CREATE POLICY "rntrc_lista_empresa_update" ON public.rntrc_lista
  FOR UPDATE USING (public.is_empresa_member(empresa_id, auth.uid()));

CREATE POLICY "rntrc_lista_empresa_delete" ON public.rntrc_lista
  FOR DELETE USING (public.is_empresa_member(empresa_id, auth.uid()));
