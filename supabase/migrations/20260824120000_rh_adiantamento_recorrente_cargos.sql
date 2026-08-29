-- Melhorias DP/RH solicitadas pelo dono (24/08/2026):
-- 1) Adiantamento recorrente mensal (ex.: CLT/CC todo dia 20) substitui "parcelas"
-- 2) Amarração: adiantamento fica DESCONTADO quando sua conta a pagar é quitada
--    (baixa manual ou conciliação bancária) e volta a ABERTO se o lançamento reabrir
-- 3) Automação mensal (pg_cron) gera a conta a pagar dos recorrentes no dia escolhido
-- 4) Catálogo de cargos efetivos (gerentes, supervisores, encarregados, analistas,
--    assistentes, auxiliares + operações de transportadora)

-- ============ 1) ADIANTAMENTOS RECORRENTES ============
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_recorrente smallint CHECK (dia_recorrente BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS ultimo_mes_gerado text;

-- ============ 2) SYNC STATUS <- CONTAS A PAGAR ============
CREATE OR REPLACE FUNCTION public.tg_sync_adiantamento_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo <> 'pagar' THEN RETURN NEW; END IF;
  IF NEW.status = 'pago' THEN
    UPDATE public.adiantamentos
       SET status = 'descontado'
     WHERE lancamento_id = NEW.id AND status = 'aberto';
  ELSIF NEW.status IN ('aberto','parcial','vencido') THEN
    UPDATE public.adiantamentos
       SET status = 'aberto'
     WHERE lancamento_id = NEW.id AND status = 'descontado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_sync_adiantamento ON public.lancamentos_financeiros;
CREATE TRIGGER trg_lancamento_sync_adiantamento
  AFTER UPDATE OF status ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_adiantamento_status();

-- ============ 3) GERAÇÃO MENSAL AUTOMÁTICA ============
-- Roda todo dia via pg_cron; para cada recorrente cujo dia já chegou no mês corrente
-- (ou que ainda não foi gerado no mês corrente), cria a conta a pagar uma única vez.
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

        INSERT INTO public.lancamentos_financeiros
          (empresa_id, tipo, status, descricao, valor, data_emissao, data_vencimento)
        VALUES (
          r.empresa_id, 'pagar', 'aberto',
          'Adiantamento recorrente — ' || COALESCE(r.colab_nome, 'colaborador'),
          r.valor, hoje, venc
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

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'adiantamentos-recorrentes') THEN
    PERFORM cron.unschedule('adiantamentos-recorrentes');
  END IF;
END $$;

SELECT cron.schedule(
  'adiantamentos-recorrentes',
  '15 3 * * *',
  $$SELECT public.gerar_adiantamentos_recorrentes();$$
);

GRANT EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() TO service_role;

-- ============ 4) CATÁLOGO DE CARGOS EFETIVOS ============
-- Remove os genéricos "por setor"; mantém Motorista*, Mecânico, Ajudante, Estoquista.
DELETE FROM public.cargos
 WHERE empresa_id IS NULL
   AND nome IN ('Administrativo','Financeiro','Atendimento','Comercial','Gerente');

INSERT INTO public.cargos (empresa_id, nome) VALUES
  -- Gerência
  (NULL,'Gerente Geral'),
  (NULL,'Gerente Operacional'),
  (NULL,'Gerente Administrativo'),
  (NULL,'Gerente Financeiro'),
  (NULL,'Gerente Comercial'),
  (NULL,'Gerente de Logística'),
  (NULL,'Gerente de Frota'),
  -- Supervisão
  (NULL,'Supervisor de Transportes'),
  (NULL,'Supervisor de Logística'),
  (NULL,'Supervisor de Frota'),
  (NULL,'Supervisor de Pátio'),
  (NULL,'Supervisor de Expedição'),
  (NULL,'Supervisor Comercial'),
  (NULL,'Supervisor Administrativo'),
  -- Encarregados
  (NULL,'Encarregado de Pátio'),
  (NULL,'Encarregado de Expedição'),
  (NULL,'Encarregado de Manutenção'),
  (NULL,'Encarregado de Estoque'),
  (NULL,'Encarregado de Transportes'),
  -- Analistas
  (NULL,'Analista de Transportes'),
  (NULL,'Analista de Logística'),
  (NULL,'Analista Administrativo'),
  (NULL,'Analista Financeiro'),
  (NULL,'Analista de Frotas'),
  (NULL,'Analista de Compras'),
  (NULL,'Analista de RH'),
  (NULL,'Analista Fiscal'),
  (NULL,'Analista de Crédito e Cobrança'),
  -- Assistentes
  (NULL,'Assistente Administrativo'),
  (NULL,'Assistente Financeiro'),
  (NULL,'Assistente de Logística'),
  (NULL,'Assistente de Transportes'),
  (NULL,'Assistente Comercial'),
  (NULL,'Assistente de RH'),
  (NULL,'Assistente Fiscal'),
  (NULL,'Assistente de Expedição'),
  -- Auxiliares
  (NULL,'Auxiliar de Expedição'),
  (NULL,'Auxiliar Administrativo'),
  (NULL,'Auxiliar de Logística'),
  (NULL,'Auxiliar de Estoque'),
  (NULL,'Auxiliar de Escritório'),
  (NULL,'Auxiliar de Carga e Descarga'),
  (NULL,'Auxiliar de Pátio'),
  (NULL,'Auxiliar de Manutenção'),
  -- Operação
  (NULL,'Eletricista'),
  (NULL,'Conferente de Carga'),
  (NULL,'Operador de Empilhadeira')
ON CONFLICT DO NOTHING;
