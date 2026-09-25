-- CNPJ/CPF do proprietario do veiculo (coluna DOC PROPRIETARIO do DAMDFE)
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS proprietario_doc TEXT;
COMMENT ON COLUMN public.veiculos.proprietario_doc IS 'CNPJ ou CPF do proprietario do veiculo (somente digitos)';
