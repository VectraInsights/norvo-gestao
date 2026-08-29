-- Adiciona coluna JSONB para descontos detalhados (nome + valor)
-- e detalhes de INSS/IRRF (base de cálculo, alíquota).

ALTER TABLE public.folha_pagamento
  ADD COLUMN IF NOT EXISTS descontos_detalhe jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.folha_pagamento.descontos_detalhe
  IS 'Array de {nome: string, valor: number} para descontos itemizados (VT, vale refeição, etc).';
