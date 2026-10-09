-- Tabela NCM (Nomenclatura Comum do Mercosul): códigos de 8 dígitos vigentes.
-- Dado público de referência (sem empresa_id): leitura para autenticados, escrita via service_role.
-- Populada via scripts/seed-ncm.mjs a partir do JSON oficial do Classif/Siscomex.
CREATE TABLE IF NOT EXISTS public.ncm (
  codigo TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  ato TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ncm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ncm_read" ON public.ncm;
CREATE POLICY "ncm_read" ON public.ncm FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.ncm TO authenticated;
GRANT ALL ON public.ncm TO service_role;
