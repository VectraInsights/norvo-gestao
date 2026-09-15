-- Cadastro fiscal (remetentes/destinatarios/tomadores do CT-e), isolado de public.contatos (Estoque/Vendas).
CREATE TABLE IF NOT EXISTS public.fiscal_cadastros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  documento TEXT,
  ie TEXT,
  email TEXT,
  telefone TEXT,
  logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT,
  cidade TEXT, uf TEXT, cep TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_cadastros_empresa_idx ON public.fiscal_cadastros(empresa_id);
CREATE INDEX IF NOT EXISTS fiscal_cadastros_empresa_doc_idx ON public.fiscal_cadastros(empresa_id, documento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_cadastros TO authenticated;
GRANT ALL ON public.fiscal_cadastros TO service_role;
ALTER TABLE public.fiscal_cadastros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_cadastros_all_members" ON public.fiscal_cadastros;
CREATE POLICY "fiscal_cadastros_all_members" ON public.fiscal_cadastros FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
DROP TRIGGER IF EXISTS touch_fiscal_cadastros ON public.fiscal_cadastros;
CREATE TRIGGER touch_fiscal_cadastros BEFORE UPDATE ON public.fiscal_cadastros
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Backfill: copia clientes/fornecedores atuais (1 por documento; sem doc copia todos)
INSERT INTO public.fiscal_cadastros (empresa_id, nome, documento, ie, email, telefone, logradouro, numero, complemento, bairro, cidade, uf, cep, observacoes)
SELECT DISTINCT ON (c.empresa_id, COALESCE(NULLIF(regexp_replace(COALESCE(c.documento, ''), '\D', '', 'g'), ''), c.id::text))
  c.empresa_id, c.nome, c.documento, c.ie, c.email, c.telefone, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.cep, c.observacoes
FROM public.contatos c
WHERE c.tipo IN ('cliente', 'fornecedor', 'ambos')
  AND NOT EXISTS (
    SELECT 1 FROM public.fiscal_cadastros f
    WHERE f.empresa_id = c.empresa_id
      AND COALESCE(f.documento, '') = COALESCE(c.documento, '')
      AND f.nome = c.nome
  )
ORDER BY c.empresa_id, COALESCE(NULLIF(regexp_replace(COALESCE(c.documento, ''), '\D', '', 'g'), ''), c.id::text), c.created_at;
