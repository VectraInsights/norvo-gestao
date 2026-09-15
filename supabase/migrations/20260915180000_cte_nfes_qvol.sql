-- Quantidade de volumes (transp/vol/qVol) nas NF-es pendentes do CT-e.
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS qvol NUMERIC;
