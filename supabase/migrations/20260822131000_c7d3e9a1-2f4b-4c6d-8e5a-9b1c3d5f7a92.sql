-- Fase A: categoria de produto + dados de CNH do colaborador (transportadora)
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS categoria TEXT;

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cnh_numero TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cnh_categoria TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cnh_validade DATE;

CREATE INDEX IF NOT EXISTS idx_produtos_empresa_categoria
  ON public.produtos(empresa_id, categoria);
