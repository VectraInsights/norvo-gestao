-- ============================================================
-- Certificados Digitais (A1/A3) — 1 por empresa, bloqueio por CNPJ
-- ============================================================

-- 1. Bucket privado no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificados',
  'certificados',
  false,
  5242880,  -- 5 MB
  ARRAY['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- 2. Tabela de certificados
CREATE TABLE IF NOT EXISTS public.certificados_digitais (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  arquivo_path    TEXT NOT NULL,
  arquivo_nome    TEXT NOT NULL,
  senha_cript     TEXT NOT NULL,
  thumbprint      TEXT,
  validade        DATE,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um certificado por empresa (bloqueio DB-level)
CREATE UNIQUE INDEX IF NOT EXISTS certificados_digitais_empresa_unique
  ON public.certificados_digitais (empresa_id)
  WHERE ativo = true;

-- 3. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.tg_certificado_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_certificado_updated ON public.certificados_digitais;
CREATE TRIGGER trg_certificado_updated
  BEFORE UPDATE ON public.certificados_digitais
  FOR EACH ROW EXECUTE FUNCTION public.tg_certificado_updated_at();

-- 4. RLS
ALTER TABLE public.certificados_digitais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "certificados_select_members" ON public.certificados_digitais;
CREATE POLICY "certificados_select_members"
  ON public.certificados_digitais
  FOR SELECT TO authenticated
  USING (public.is_empresa_member(empresa_id));

DROP POLICY IF EXISTS "certificados_insert_admin" ON public.certificados_digitais;
CREATE POLICY "certificados_insert_admin"
  ON public.certificados_digitais
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[])
  );

DROP POLICY IF EXISTS "certificados_update_admin" ON public.certificados_digitais;
CREATE POLICY "certificados_update_admin"
  ON public.certificados_digitais
  FOR UPDATE TO authenticated
  USING (
    public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[])
  );

DROP POLICY IF EXISTS "certificados_delete_admin" ON public.certificados_digitais;
CREATE POLICY "certificados_delete_admin"
  ON public.certificados_digitais
  FOR DELETE TO authenticated
  USING (
    public.has_empresa_role(empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[])
  );

-- 5. Storage RLS — service role acessa tudo; authenticated only via Worker
DROP POLICY IF EXISTS "certificados_storage_all_service" ON storage.objects;
CREATE POLICY "certificados_storage_all_service"
  ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'certificados');

DROP POLICY IF EXISTS "certificados_storage_insert_auth" ON storage.objects;
CREATE POLICY "certificados_storage_insert_auth"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certificados');

DROP POLICY IF EXISTS "certificados_storage_select_auth" ON storage.objects;
CREATE POLICY "certificados_storage_select_auth"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'certificados');

DROP POLICY IF EXISTS "certificados_storage_delete_auth" ON storage.objects;
CREATE POLICY "certificados_storage_delete_auth"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'certificados');
