-- Grade "Mercadorias Transportadas" no CT-e: dados de mercadoria da NF-e
-- (descrição, NCM, unidade, valor da mercadoria e frete da NF-e, espécie).
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS desc_mercadoria TEXT;
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS und_med TEXT;
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS valor_merc NUMERIC;
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS valor_frete NUMERIC;
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS especificacao TEXT;
