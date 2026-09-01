-- Novos campos para cadastro de veículo (remover KM do form, mas manter coluna para histórico)
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS proprietario TEXT,
  ADD COLUMN IF NOT EXISTS quantidade_eixos INT,
  ADD COLUMN IF NOT EXISTS categoria TEXT CHECK (categoria IN ('particular','aluguel','agregado','terceiro') OR categoria IS NULL);

-- Comentário para categoria: ALUGUEL, PARTICULAR, etc (solicitado no print)
COMMENT ON COLUMN public.veiculos.categoria IS 'Categoria do veículo: particular, aluguel, agregado, terceiro';
COMMENT ON COLUMN public.veiculos.proprietario IS 'Nome do proprietário do veículo';
