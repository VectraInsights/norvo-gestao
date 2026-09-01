-- Controle de toxicológico do motorista (CTB art. 148-A: renovar a cada 2 anos e 6 meses para C/D/E)
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS toxico_exame DATE;