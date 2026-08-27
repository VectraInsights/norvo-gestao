-- Deduplica categorias_financeiras e cria índice único para evitar futuras duplicidades
-- Causa raiz: rh.folha.tsx buscava ilike "%sal%C3%A1rio%" (URL-encoded) que nunca casava,
-- gerando INSERT de "Salário" a cada lançamento de folha. Sem constraint no banco, duplicava.

-- 1. Habilita unaccent para comparação sem acento (se disponível)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper imutável necessário para usar unaccent em índice (unaccent nativo não é IMMUTABLE)
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT public.unaccent($1) $$;

-- 2. Deduplica: mantém o registro mais antigo por (empresa_id, tipo, nome normalizado)
--    Normaliza com lower(trim(immutable_unaccent(nome))) para pegar Salário/salario/SALÁRIO etc.
WITH ranked AS (
  SELECT
    id,
    empresa_id,
    tipo,
    lower(public.immutable_unaccent(trim(nome))) AS norm,
    ROW_NUMBER() OVER (PARTITION BY empresa_id, tipo, lower(public.immutable_unaccent(trim(nome))) ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY empresa_id, tipo, lower(public.immutable_unaccent(trim(nome))) ORDER BY created_at ASC, id ASC) AS keeper_id
  FROM public.categorias_financeiras
),
to_delete AS (
  SELECT id, keeper_id FROM ranked WHERE rn > 1
),
-- Reaponta lançamentos que usavam a categoria duplicada para a que será mantida
upd_lanc AS (
  UPDATE public.lancamentos_financeiros l
  SET categoria_id = td.keeper_id
  FROM to_delete td
  WHERE l.categoria_id = td.id
  RETURNING 1
),
-- Reaponta filhos (subcategorias) que tinham parent_id apontando para duplicata
upd_parent AS (
  UPDATE public.categorias_financeiras c
  SET parent_id = td.keeper_id
  FROM to_delete td
  WHERE c.parent_id = td.id
  RETURNING 1
)
DELETE FROM public.categorias_financeiras
WHERE id IN (SELECT id FROM to_delete);

-- 3. Cria índices únicos insensível a caixa e acento por empresa+tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_empresa_tipo_nome_unaccent
  ON public.categorias_financeiras (empresa_id, tipo, lower(public.immutable_unaccent(trim(nome))));
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_empresa_tipo_nome_lower
  ON public.categorias_financeiras (empresa_id, tipo, lower(trim(nome)));

-- 4. Índice adicional sem considerar tipo (evita "Salário" pagar vs receber duplicado se for o caso)
--    Mantido como comentário: descomente se quiser bloquear nome repetido independente do tipo
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_empresa_nome_unaccent
--   ON public.categorias_financeiras (empresa_id, lower(unaccent(trim(nome))));
