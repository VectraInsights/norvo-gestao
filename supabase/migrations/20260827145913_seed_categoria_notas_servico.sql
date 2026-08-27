-- Seed: categoria financeira "Notas de serviço" para todas as empresas existentes
INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo)
SELECT e.id, 'Notas de serviço', 'pagar'
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.categorias_financeiras c
  WHERE c.empresa_id = e.id AND c.nome = 'Notas de serviço' AND c.tipo = 'pagar'
);
