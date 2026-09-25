-- Responsaveis por emissao/encerramento (telas fiscal + DAMDFE)
ALTER TABLE public.cte_documentos ADD COLUMN IF NOT EXISTS responsavel_emissao TEXT;
COMMENT ON COLUMN public.cte_documentos.responsavel_emissao IS 'Nome do responsavel pela emissao do CT-e';
ALTER TABLE public.mdf_documentos ADD COLUMN IF NOT EXISTS responsavel_emissao TEXT;
COMMENT ON COLUMN public.mdf_documentos.responsavel_emissao IS 'Nome do responsavel pela emissao do MDF-e';
ALTER TABLE public.mdf_documentos ADD COLUMN IF NOT EXISTS responsavel_encerramento TEXT;
COMMENT ON COLUMN public.mdf_documentos.responsavel_encerramento IS 'Nome do responsavel pelo encerramento do MDF-e';
