-- Impede cargos com nomes iguais (case-insensitive) para a mesma empresa.

CREATE OR REPLACE FUNCTION public.normcargo(text) RETURNS text LANGUAGE SQL IMMUTABLE AS $$
  SELECT trim(lower($1));
$$;

DO $$ BEGIN
  ALTER TABLE public.cargos DROP CONSTRAINT IF EXISTS uq_cargos_padrao_nome;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.cargos DROP CONSTRAINT IF EXISTS uq_cargos_empresa_nome;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Cargos padrão (globais): nome normalizado único onde empresa_id IS NULL
CREATE UNIQUE INDEX uq_cargos_padrao_nome
  ON public.cargos (public.normcargo(nome))
  WHERE empresa_id IS NULL;

-- Cargos de empresa: empresa_id + nome normalizado único
CREATE UNIQUE INDEX uq_cargos_empresa_nome
  ON public.cargos (empresa_id, public.normcargo(nome))
  WHERE empresa_id IS NOT NULL;
