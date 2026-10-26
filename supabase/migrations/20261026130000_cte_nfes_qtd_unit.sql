-- Quantidade unitária da NF-e (soma de det/prod/qCom) na grade do CT-e.
ALTER TABLE public.cte_nfes_pendentes ADD COLUMN IF NOT EXISTS qtd_unit NUMERIC;
