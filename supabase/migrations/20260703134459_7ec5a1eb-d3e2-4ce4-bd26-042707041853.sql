CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.tg_normalize_empresa_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  NEW.cnpj := NULLIF(regexp_replace(COALESCE(NEW.cnpj, ''), '\D', '', 'g'), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_empresa_cnpj_before_write ON public.empresas;
CREATE TRIGGER normalize_empresa_cnpj_before_write
BEFORE INSERT OR UPDATE OF cnpj ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION private.tg_normalize_empresa_cnpj();

UPDATE public.empresas
SET cnpj = NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '')
WHERE cnpj IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '');

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY cnpj
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.empresas
  WHERE cnpj IS NOT NULL AND btrim(cnpj) <> ''
)
DELETE FROM public.empresas e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_unique_idx
ON public.empresas (cnpj)
WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '';