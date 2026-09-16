-- TAG de pedagio vinculada ao veiculo (tracao/cavalo)
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS tag_pedagio TEXT;
COMMENT ON COLUMN public.veiculos.tag_pedagio IS 'Numero da TAG de pedagio instalada no veiculo';
