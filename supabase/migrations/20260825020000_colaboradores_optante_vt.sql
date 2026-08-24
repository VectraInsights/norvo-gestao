-- Campo vale-transporte no cadastro de colaboradores
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS optante_vt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.colaboradores.optante_vt
  IS 'Colaborador optante pelo vale-transporte (desconto de 6% sobre salário base na folha).';
