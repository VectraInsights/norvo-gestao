-- Adicionar campos código do cedente e carteira na tabela boletos
ALTER TABLE public.boletos ADD COLUMN IF NOT EXISTS codigo_cedente TEXT;
ALTER TABLE public.boletos ADD COLUMN IF NOT EXISTS carteira TEXT;

COMMENT ON COLUMN public.boletos.codigo_cedente IS 'Código do cedente no banco (ex: 193933-5 no Sicoob)';
COMMENT ON COLUMN public.boletos.carteira IS 'Carteira de cobrança (ex: 29 no Sicoob)';
