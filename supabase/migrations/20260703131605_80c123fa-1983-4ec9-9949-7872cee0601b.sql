CREATE OR REPLACE FUNCTION public.emitir_nota_fiscal(_nf_id UUID)
RETURNS public.notas_fiscais
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE nf public.notas_fiscais;
BEGIN
  SELECT * INTO nf FROM public.notas_fiscais WHERE id = _nf_id;
  IF nf IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT private.has_empresa_role(nf.empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF nf.status = 'autorizada' THEN RETURN nf; END IF;

  UPDATE public.notas_fiscais
    SET status = 'autorizada',
        data_emissao = now(),
        chave = LPAD((FLOOR(random()*1e14))::bigint::text, 44, '0'),
        mensagem = 'Autorizada em ambiente homologação (stub)'
    WHERE id = _nf_id
    RETURNING * INTO nf;
  RETURN nf;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_nota_fiscal(_nf_id UUID, _motivo TEXT)
RETURNS public.notas_fiscais
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE nf public.notas_fiscais;
BEGIN
  SELECT * INTO nf FROM public.notas_fiscais WHERE id = _nf_id;
  IF nf IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT private.has_empresa_role(nf.empresa_id, auth.uid(), ARRAY['owner','admin','fiscal']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.notas_fiscais SET status = 'cancelada', mensagem = _motivo WHERE id = _nf_id RETURNING * INTO nf;
  RETURN nf;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emitir_nota_fiscal(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_nota_fiscal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_nota_fiscal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_nota_fiscal(UUID, TEXT) TO authenticated;