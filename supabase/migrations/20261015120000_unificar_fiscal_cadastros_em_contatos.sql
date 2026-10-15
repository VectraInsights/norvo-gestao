-- Unificação dos cadastros: fiscal_cadastros -> public.contatos (decisão do dono, 15/10/2026:
-- remetente/destinatário/consignatário/redespacho/tomador entram como tipo='transporte').
-- Idempotente: pode rodar mais de uma vez sem duplicar. O app também faz essa
-- migração sozinho na primeira abertura do Cadastro fiscal; este arquivo serve de
-- registro e aposenta a tabela antiga.
-- Normalização de documento por dígitos (mesmo padrão da migration 20260915170000).

-- 1) Traz os que ainda não existem em contatos (por empresa+documento; sem doc, por nome).
INSERT INTO public.contatos (empresa_id, nome, tipo, documento, ie, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, observacoes)
SELECT f.empresa_id, f.nome, 'transporte',
  NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), ''),
  NULLIF(f.ie, ''), NULLIF(f.email, ''), NULLIF(f.telefone, ''),
  NULLIF(f.cep, ''), NULLIF(f.logradouro, ''), NULLIF(f.numero, ''), NULLIF(f.complemento, ''),
  NULLIF(f.bairro, ''), NULLIF(f.cidade, ''), NULLIF(f.uf, ''), NULLIF(f.observacoes, '')
FROM public.fiscal_cadastros f
WHERE NOT EXISTS (
  SELECT 1 FROM public.contatos c
  WHERE c.empresa_id = f.empresa_id
    AND (
      (
        NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '') IS NOT NULL
        AND NULLIF(regexp_replace(COALESCE(c.documento, ''), '\D', '', 'g'), '')
          = NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '')
      )
      OR (
        NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '') IS NULL
        AND lower(c.nome) = lower(f.nome)
      )
    )
);

-- 2) Preenche campos vazios dos já existentes (nunca sobrescreve o que já tem valor).
UPDATE public.contatos c SET
  email = COALESCE(NULLIF(c.email, ''), NULLIF(f.email, '')),
  telefone = COALESCE(NULLIF(c.telefone, ''), NULLIF(f.telefone, '')),
  ie = COALESCE(NULLIF(c.ie, ''), NULLIF(f.ie, '')),
  cep = COALESCE(NULLIF(c.cep, ''), NULLIF(f.cep, '')),
  logradouro = COALESCE(NULLIF(c.logradouro, ''), NULLIF(f.logradouro, '')),
  numero = COALESCE(NULLIF(c.numero, ''), NULLIF(f.numero, '')),
  complemento = COALESCE(NULLIF(c.complemento, ''), NULLIF(f.complemento, '')),
  bairro = COALESCE(NULLIF(c.bairro, ''), NULLIF(f.bairro, '')),
  cidade = COALESCE(NULLIF(c.cidade, ''), NULLIF(f.cidade, '')),
  uf = COALESCE(NULLIF(c.uf, ''), NULLIF(f.uf, '')),
  observacoes = COALESCE(NULLIF(c.observacoes, ''), NULLIF(f.observacoes, ''))
FROM public.fiscal_cadastros f
WHERE c.empresa_id = f.empresa_id
  AND (
    (
      NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '') IS NOT NULL
      AND NULLIF(regexp_replace(COALESCE(c.documento, ''), '\D', '', 'g'), '')
        = NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '')
    )
    OR (
      NULLIF(regexp_replace(COALESCE(f.documento, ''), '\D', '', 'g'), '') IS NULL
      AND lower(c.nome) = lower(f.nome)
    )
  );

-- 3) Aposenta a tabela fiscal (nenhum código a usa mais).
DROP TABLE IF EXISTS public.fiscal_cadastros;
