-- NF-es pendentes: dedup por (empresa_id, chave) + UNIQUE garantido.
-- O CREATE original previa UNIQUE, mas tabelas criadas antes dele ficaram sem
-- a constraint — e o app reimportava a mesma NF-e gerando linhas duplicadas.
-- Mantém a linha mais avançada (embarcada > rascunho > pendente) e, no empate, a mais antiga.
DELETE FROM public.cte_nfes_pendentes a
USING public.cte_nfes_pendentes b
WHERE a.ctid > b.ctid
  AND a.empresa_id = b.empresa_id
  AND a.chave = b.chave
  AND CASE a.status WHEN 'embarcada' THEN 3 WHEN 'rascunho' THEN 2 ELSE 1 END <=
      CASE b.status WHEN 'embarcada' THEN 3 WHEN 'rascunho' THEN 2 ELSE 1 END;
DO $$ BEGIN
  ALTER TABLE public.cte_nfes_pendentes
    ADD CONSTRAINT cte_nfes_pendentes_empresa_chave_key UNIQUE (empresa_id, chave);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
