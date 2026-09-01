-- Adiciona coluna chassi Ã  tabela veiculos
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS chassi text;

COMMENT ON COLUMN public.veiculos.chassi IS 'Chassi do veÃ­culo (17 caracteres alfanumÃ©ricos)';
