-- Adiciona colunas cnpj e uf a certificados_digitais para usar como fonte
-- autoritativa do CNPJ do emitente (independente do cadastro da empresa).

ALTER TABLE public.certificados_digitais
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS uf   TEXT;
