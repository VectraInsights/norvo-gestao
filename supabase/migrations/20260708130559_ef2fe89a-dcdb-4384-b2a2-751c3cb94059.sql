
DO $$ BEGIN
  CREATE TYPE public.conta_financeira_tipo AS ENUM
    ('corrente','caixa','cartao_credito','investimento','poupanca','aplicacao_automatica','outras');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS tipo public.conta_financeira_tipo NOT NULL DEFAULT 'corrente',
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS padrao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conta_vinculada_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cartao_ultimos4 text,
  ADD COLUMN IF NOT EXISTS cartao_bandeira text,
  ADD COLUMN IF NOT EXISTS cartao_emissor text,
  ADD COLUMN IF NOT EXISTS cartao_conta_pagamento_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cartao_dia_fechamento int,
  ADD COLUMN IF NOT EXISTS cartao_dia_vencimento int;
