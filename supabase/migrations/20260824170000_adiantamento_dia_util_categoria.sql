-- Adiantamentos recorrentes:
-- 1) Vencimento em sábado/domingo antecipa para o dia útil anterior (sexta).
-- 2) Descrição do lançamento = nome do colaborador (sem prefixo "Adiantamento recorrente - ").
-- 3) Categoria do lançamento = "Adiantamentos" (tipo pagar), criada por empresa se não existir.
CREATE OR REPLACE FUNCTION public.gerar_adiantamentos_recorrentes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  hoje date;
  alvo date;
  venc date;
  chave text;
  v_cat uuid;
  r record;
BEGIN
  hoje := (now() AT TIME ZONE 'america/sao_paulo')::date;
  FOR r IN
    SELECT a.*, c.nome AS colab_nome
      FROM public.adiantamentos a
      LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
     WHERE a.recorrente AND a.dia_recorrente BETWEEN 1 AND 31 AND a.status <> 'cancelado'
  LOOP
    DECLARE
      offset_mes int := CASE WHEN extract(day FROM hoje)::int > r.dia_recorrente THEN 1 ELSE 0 END;
    BEGIN
      alvo := (date_trunc('month', hoje::timestamp) + make_interval(months => offset_mes))::date;
      chave := to_char(alvo, 'YYYY-MM');

      IF r.ultimo_mes_gerado IS NULL OR r.ultimo_mes_gerado < chave THEN
        venc := (date_trunc('month', alvo::timestamp)::date + (r.dia_recorrente - 1));
        -- clamp para o último dia do mês quando dia_recorrente não existe nele (ex.: 31/fev)
        IF extract(month FROM venc)::int <> extract(month FROM alvo)::int THEN
          venc := (date_trunc('month', alvo::timestamp) + interval '1 month - 1 day')::date;
        END IF;
        -- sábado/domingo -> antecipa para sexta (dia útil anterior)
        WHILE extract(isodow FROM venc)::int > 5 LOOP
          venc := venc - 1;
        END LOOP;

        SELECT id INTO v_cat
          FROM public.categorias_financeiras
         WHERE empresa_id = r.empresa_id AND tipo = 'pagar' AND nome = 'Adiantamentos'
         LIMIT 1;
        IF v_cat IS NULL THEN
          INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo)
          VALUES (r.empresa_id, 'Adiantamentos', 'pagar')
          RETURNING id INTO v_cat;
        END IF;

        INSERT INTO public.lancamentos_financeiros
          (empresa_id, tipo, status, descricao, valor, data_emissao, data_vencimento,
           categoria_id, observacoes)
        VALUES (
          r.empresa_id, 'pagar', 'aberto',
          COALESCE(r.colab_nome, 'Adiantamento'),
          r.valor, hoje, venc,
          v_cat,
          'Gerado automaticamente pelo adiantamento recorrente'
        );

        UPDATE public.adiantamentos
           SET ultimo_mes_gerado = chave
         WHERE id = r.id;
        n := n + 1;
      END IF;
    END;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() TO service_role;
GRANT EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() TO authenticated;
